import Foundation
import WebKit
import Security

// The bundled page cannot make web requests. Only this student API bridge can
// connect, after an explicit classroom login. Cookies never cross into JS.
final class ClassroomConnection: NSObject, URLSessionDelegate, URLSessionTaskDelegate {
    private(set) var policy: StudentPolicy?
    private var joined = false
    private var generation = 0
    private var tasks: [String: URLSessionDataTask] = [:]
    private var logoutTask: URLSessionDataTask?
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieAcceptPolicy = .always
        return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    }()

    func configure(_ text: String?) {
        disconnect()
        policy = text.flatMap(StudentPolicy.init)
    }
    func disconnect() { generation += 1; joined = false; tasks.values.forEach { $0.cancel() }; tasks.removeAll(); logoutTask?.cancel(); logoutTask = nil }
    func cancel(_ id: String) { tasks.removeValue(forKey: id)?.cancel() }
    func logout() {
        let revoke = joined
        let origin = policy?.origin
        let cookies = origin.flatMap { session.configuration.httpCookieStorage?.cookies(for: $0) }?.filter { $0.name == "fi_session_student" } ?? []
        disconnect()
        cookies.forEach { session.configuration.httpCookieStorage?.deleteCookie($0) }
        // Stop locally at once, and revoke the session when the service is
        // reachable. An unavailable teacher computer cannot trap offline users.
        guard revoke, let origin, let url = URL(string: "/api/student/logout", relativeTo: origin) else { return }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = Data("{}".utf8); request.timeoutInterval = 3
        request.setValue(String(origin.absoluteString.dropLast()), forHTTPHeaderField: "Origin")
        request.setValue("FreeImproStudent/1 iOS", forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        HTTPCookie.requestHeaderFields(with: cookies).forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        logoutTask = session.dataTask(with: request) { _, _, _ in }; logoutTask?.resume()
    }
    private func allowed(_ path: String, _ method: String) -> Bool {
        if method == "GET" && ["/api/student/me", "/api/student/classrooms", "/api/student/image-status", "/api/student/image-jobs", "/api/student/image-profile/avatar"].contains(path) { return true }
        if method == "POST" && ["/api/student/enter-classroom", "/api/student/join", "/api/student/logout", "/api/student/characters", "/api/student/image-jobs", "/api/student/image-profile/register"].contains(path) { return true }
        let id = "[A-Za-z0-9-]{1,100}"
        let pattern = method == "GET" ? "^/api/student/(classrooms/\(id)|submissions/\(id)/(audio|image)|image-jobs/\(id)/result)$" : "^/api/student/classrooms/\(id)/(submit|rhythm-request)$"
        return ["GET", "POST"].contains(method) && path.range(of: pattern, options: .regularExpression) != nil
    }
    func request(_ body: [String: Any], cookieStore: WKHTTPCookieStore, reply: @escaping (Any?, String?) -> Void) {
        guard let id = body["id"] as? String, UUID(uuidString: id) != nil,
              let path = body["path"] as? String, let method = body["method"] as? String,
              allowed(path, method), tasks[id] == nil, tasks.count < 8 else { reply(nil, "不支持的课堂操作。"); return }
        let entry = method == "POST" && path == "/api/student/enter-classroom"
        guard entry || joined else { reply(nil, "请先在“我的”填写姓名和课堂码。"); return }
        guard let policy, let url = URL(string: path, relativeTo: policy.origin)?.absoluteURL, policy.sameOrigin(url) else { reply(nil, "请教师在连接设置中配置课堂服务。"); return }
        let data = (body["body"] as? String).map { Data($0.utf8) }
        guard (data?.count ?? 0) <= 2_000_000 else { reply(nil, "作品过大，请重新选择。"); return }
        if entry {
            guard let data, let fields = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let name = fields["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 30,
                  let code = fields["code"] as? String, code.range(of: "^[0-9]{6}$", options: .regularExpression) != nil else { reply(nil, "请填写姓名和 6 位课堂码。"); return }
        }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = data; request.timeoutInterval = path == "/api/student/characters" ? 250 : 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("FreeImproStudent/1 iOS", forHTTPHeaderField: "User-Agent")
        // The native client authenticates against the configured HTTPS origin.
        request.setValue(String(policy.origin.absoluteString.dropLast()), forHTTPHeaderField: "Origin")
        let ticket = generation
        let task = session.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { reply(nil, "课堂连接已关闭。"); return }
            self.tasks.removeValue(forKey: id)
            guard ticket == self.generation else { reply(nil, "课堂连接已关闭。"); return }
            if let error {
                let code = (error as NSError).code
                let hint: String
                switch code {
                case NSURLErrorCancelled: hint = "已取消课堂连接。"
                case NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid, NSURLErrorSecureConnectionFailed: hint = "课堂连接无法验证，请教师检查连接设置。"
                default: hint = "暂时无法连接课堂，可继续离线创作。请确认与教师使用同一 Wi-Fi 后重试。"
                }
                reply(nil, hint); return
            }
            guard let response = response as? HTTPURLResponse, let data, data.count <= 18_000_000 else { reply(nil, "课堂响应异常，请稍后重试。"); return }
            if entry && response.statusCode == 200 { self.joined = true }
            if path == "/api/student/logout" && response.statusCode == 200 { self.disconnect() }
            reply(["status": response.statusCode, "type": response.value(forHTTPHeaderField: "Content-Type") ?? "application/json", "encoded": data.base64EncodedString()], nil)
        }
        tasks[id] = task
        // Transfer a legacy WebKit student session once, preserving its identity
        // when upgrading. This reads local cookies and performs no web request.
        if entry && session.configuration.httpCookieStorage?.cookies(for: policy.origin)?.contains(where: { $0.name == "fi_session_student" }) != true {
            cookieStore.getAllCookies { [weak self] cookies in
                guard let self, self.tasks[id] != nil else { return }
                for cookie in cookies where cookie.name == "fi_session_student" && cookie.domain == policy.origin.host {
                    self.session.configuration.httpCookieStorage?.setCookie(cookie)
                    cookieStore.delete(cookie)
                }
                task.resume()
            }
        } else { task.resume() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              challenge.protectionSpace.host == policy?.origin.host, challenge.protectionSpace.port == (policy?.origin.port ?? 443),
              let trust = challenge.protectionSpace.serverTrust,
              let url = Bundle.main.url(forResource: "classroom-ca", withExtension: "der"), let data = try? Data(contentsOf: url), let ca = SecCertificateCreateWithData(nil, data as CFData) else { completionHandler(.cancelAuthenticationChallenge, nil); return }
        SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, challenge.protectionSpace.host as CFString))
        SecTrustSetAnchorCertificates(trust, [ca] as CFArray); SecTrustSetAnchorCertificatesOnly(trust, true)
        if SecTrustEvaluateWithError(trust, nil) { completionHandler(.useCredential, URLCredential(trust: trust)) }
        else { completionHandler(.cancelAuthenticationChallenge, nil) }
    }
}
