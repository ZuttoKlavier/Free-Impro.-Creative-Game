import Foundation
import WebKit
import Security

// The bundled page cannot make web requests. Only this student API bridge can
// connect, after an explicit classroom login. Cookies never cross into JS.
final class ClassroomConnection: NSObject, URLSessionDelegate, URLSessionTaskDelegate {
    struct NativeHandoff { let id: String; let browserURL: URL }
    private(set) var policy: StudentPolicy?
    private var joined = false
    private var generation = 0
    private var socialGeneration = 0
    private var socialTasks: Set<String> = []
    private var tasks: [String: URLSessionDataTask] = [:]
    private var logoutTask: URLSessionDataTask?
    var onDisconnect: (() -> Void)?
    private var sessionConfiguration: URLSessionConfiguration = .default
    private lazy var session: URLSession = {
        let configuration = sessionConfiguration
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieAcceptPolicy = .always
        return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    }()
    convenience init(configuration: URLSessionConfiguration) { self.init(); sessionConfiguration = configuration }

    func configure() {
        disconnect()
        policy = StudentPolicy(StudentPolicy.publicClassroomURL)
    }
    func disconnect() { generation += 1; invalidateSocial(); joined = false; tasks.values.forEach { $0.cancel() }; tasks.removeAll(); logoutTask?.cancel(); logoutTask = nil; onDisconnect?() }
    func cancel(_ id: String) { tasks.removeValue(forKey: id)?.cancel() }
    func invalidateSocial() {
        socialGeneration += 1
        socialTasks.forEach { tasks.removeValue(forKey: $0)?.cancel() }; socialTasks.removeAll()
    }
    private static func isStudentCookie(_ cookie: HTTPCookie) -> Bool {
        let name = cookie.name.hasPrefix("__Secure-") ? String(cookie.name.dropFirst(9)) : cookie.name
        return name == "fi_session_student" || name.hasPrefix("fi_student_auth.")
    }
    static func studentCookies(in storage: HTTPCookieStorage?, for origin: URL) -> [HTTPCookie] {
        // Student sessions have Path=/api/student; looking up the root URL
        // misses them and could import an older WebKit identity over a login.
        guard let endpoint = URL(string: "/api/student/me", relativeTo: origin)?.absoluteURL else { return [] }
        return storage?.cookies(for: endpoint)?.filter(isStudentCookie) ?? []
    }
    static func removeStudentCookies(in storage: HTTPCookieStorage?, for origin: URL) -> [HTTPCookie] {
        let cookies = studentCookies(in: storage, for: origin)
        cookies.forEach { storage?.deleteCookie($0) }
        return cookies
    }
    static func transferableStudentCookies(_ cookies: [HTTPCookie], for origin: URL) -> [HTTPCookie] {
        cookies.filter { isStudentCookie($0) && $0.domain == origin.host }
    }
    static func nativeHandoff(_ fields: [String: Any], for policy: StudentPolicy) -> NativeHandoff? {
        guard policy.usesSystemTrust, let id = fields["handoffId"] as? String,
              id.range(of: "\\A[a-f0-9]{64}\\z", options: .regularExpression) != nil,
              let text = fields["browserURL"] as? String,
              text == String(policy.origin.absoluteString.dropLast()) + "/api/student/account/native/open?handoffId=" + id,
              let url = URL(string: text), policy.sameOrigin(url) else { return nil }
        return NativeHandoff(id: id, browserURL: url)
    }
    static func nativeCallbackTicket(_ url: URL) -> String? {
        let prefix = "freeimprostudent://auth/callback?ticket="
        let text = url.absoluteString
        guard text.hasPrefix(prefix) else { return nil }
        let ticket = String(text.dropFirst(prefix.count))
        return ticket.range(of: "\\A[a-f0-9]{64}\\z", options: .regularExpression) != nil ? ticket : nil
    }
    private static func authError(_ message: String) -> Error {
        NSError(domain: "FreeImproStudentAuth", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
    // These endpoints are native-only: neither the proof nor the handoff is
    // accepted through classroom-request or exposed to the bundled document.
    func startSocial(provider: String, mode: String, challenge: String, completion: @escaping (Result<NativeHandoff, Error>) -> Void) {
        guard ["wechat", "apple"].contains(provider), ["login", "link"].contains(mode),
              challenge.range(of: "\\A[A-Za-z0-9_-]{43}\\z", options: .regularExpression) != nil,
              mode != "link" || joined else { completion(.failure(Self.authError("请先登录账号后再关联。"))); return }
        guard let policy, policy.usesSystemTrust else { completion(.failure(Self.authError("微信和 Apple 登录暂时不可用，请重新打开应用后重试。"))); return }
        nativeJSON("start", fields: ["provider": provider, "mode": mode, "codeChallenge": challenge], policy: policy) { result in
            switch result {
            case .failure(let error): completion(.failure(error))
            case .success(let (fields, _)):
                guard let handoff = Self.nativeHandoff(fields, for: policy) else { completion(.failure(Self.authError("登录授权地址无效，请稍后重试。"))); return }
                completion(.success(handoff))
            }
        }
    }
    func consumeSocial(ticket: String, verifier: String, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard ticket.range(of: "\\A[a-f0-9]{64}\\z", options: .regularExpression) != nil,
              verifier.range(of: "\\A[A-Za-z0-9_-]{43}\\z", options: .regularExpression) != nil,
              let policy, policy.usesSystemTrust else { completion(.failure(Self.authError("登录回调无效，请重新登录。"))); return }
        nativeJSON("consume", fields: ["ticket": ticket, "codeVerifier": verifier], policy: policy) { [weak self] result in
            guard let self else { completion(.failure(Self.authError("登录已结束。"))); return }
            switch result {
            case .failure(let error): completion(.failure(error))
            case .success(let (fields, response)):
                guard let user = fields["user"] as? [String: Any], let id = user["id"] as? String, !id.isEmpty,
                      user["role"] as? String == "student" else { completion(.failure(Self.authError("登录响应无效，请重新登录。"))); return }
                let headers = response.allHeaderFields.reduce(into: [String: String]()) { result, entry in
                    if let name = entry.key as? String, let value = entry.value as? String { result[name] = value }
                }
                let cookies = Self.transferableStudentCookies(HTTPCookie.cookies(withResponseHeaderFields: headers, for: response.url ?? policy.origin), for: policy.origin)
                    .filter { $0.isSecure && $0.path == "/api/student" }
                let names = Set(cookies.map { $0.name.hasPrefix("__Secure-") ? String($0.name.dropFirst(9)) : $0.name })
                guard names.contains("fi_session_student"), names.contains("fi_student_auth.session_token") else { completion(.failure(Self.authError("登录会话不完整，请重新登录。"))); return }
                cookies.forEach { self.session.configuration.httpCookieStorage?.setCookie($0) }
                self.joined = true
                completion(.success(["user": user]))
            }
        }
    }
    func cancelSocial(handoff: NativeHandoff, verifier: String) {
        guard let origin = URLComponents(url: handoff.browserURL, resolvingAgainstBaseURL: false).flatMap({ parts -> URL? in
            var parts = parts; parts.path = "/"; parts.query = nil; return parts.url
        }), let policy = StudentPolicy(origin.absoluteString), policy.usesSystemTrust,
              Self.nativeHandoff(["handoffId": handoff.id, "browserURL": handoff.browserURL.absoluteString], for: policy) != nil,
              verifier.range(of: "\\A[A-Za-z0-9_-]{43}\\z", options: .regularExpression) != nil else { return }
        nativeJSON("cancel", fields: ["handoffId": handoff.id, "codeVerifier": verifier], policy: policy) { _ in }
    }
    private func nativeJSON(_ operation: String, fields: [String: String], policy: StudentPolicy, completion: @escaping (Result<([String: Any], HTTPURLResponse), Error>) -> Void) {
        guard ["start", "consume", "cancel"].contains(operation), policy.usesSystemTrust,
              let url = URL(string: "/api/student/account/native/" + operation, relativeTo: policy.origin)?.absoluteURL,
              policy.sameOrigin(url), let data = try? JSONSerialization.data(withJSONObject: fields), tasks.count < 8 else { completion(.failure(Self.authError("登录暂时不可用，请稍后重试。"))); return }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = data; request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("FreeImproStudent/1 iOS", forHTTPHeaderField: "User-Agent")
        request.setValue(String(policy.origin.absoluteString.dropLast()), forHTTPHeaderField: "Origin")
        // An old consume response must never write cookies after cancellation.
        // Install its cookies explicitly only after the generation check.
        request.httpShouldHandleCookies = false
        HTTPCookie.requestHeaderFields(with: Self.studentCookies(in: session.configuration.httpCookieStorage, for: policy.origin)).forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        let id = UUID().uuidString, ticket = generation, socialTicket = socialGeneration
        let task = session.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { completion(.failure(Self.authError("登录已结束。"))); return }
            self.tasks.removeValue(forKey: id)
            self.socialTasks.remove(id)
            guard ticket == self.generation, operation == "cancel" || (socialTicket == self.socialGeneration && self.policy?.origin == policy.origin) else { completion(.failure(Self.authError("课堂连接已关闭，请重新登录。"))); return }
            if error != nil { completion(.failure(Self.authError("暂时无法完成登录，可继续离线创作后重试。"))); return }
            guard let response = response as? HTTPURLResponse, let responseURL = response.url, policy.sameOrigin(responseURL),
                  let data, data.count <= 64_000, let fields = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { completion(.failure(Self.authError("登录响应异常，请稍后重试。"))); return }
            guard (200..<300).contains(response.statusCode) else {
                let hint = (fields["error"] as? String).flatMap { $0.count <= 200 ? $0 : nil } ?? "登录未完成，请重新登录。"
                completion(.failure(Self.authError(hint))); return
            }
            completion(.success((fields, response)))
        }
        tasks[id] = task
        if operation != "cancel" { socialTasks.insert(id) }
        task.resume()
    }
    func logout() {
        let revoke = joined
        let origin = policy?.origin
        let cookies = origin.map { Self.removeStudentCookies(in: session.configuration.httpCookieStorage, for: $0) } ?? []
        disconnect()
        // Stop locally at once, and revoke the session when the service is
        // reachable. An unavailable service cannot trap offline users.
        guard revoke, let origin, let url = URL(string: "/api/student/logout", relativeTo: origin) else { return }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = Data("{}".utf8); request.timeoutInterval = 3
        request.setValue(String(origin.absoluteString.dropLast()), forHTTPHeaderField: "Origin")
        request.setValue("FreeImproStudent/1 iOS", forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        HTTPCookie.requestHeaderFields(with: cookies).forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        logoutTask = session.dataTask(with: request) { _, _, _ in }; logoutTask?.resume()
    }
    private func accountEntry(_ path: String, _ method: String) -> Bool {
        method == "POST" && ["/api/student/account/register", "/api/student/account/login", "/api/student/account/phone/verify"].contains(path)
    }
    private func accountSetup(_ path: String, _ method: String) -> Bool {
        (method == "GET" && path == "/api/student/account/options") || (method == "POST" && path == "/api/student/account/phone/send")
    }
    private func allowed(_ path: String, _ method: String) -> Bool {
        if accountEntry(path, method) || accountSetup(path, method) { return true }
        if method == "GET" && ["/api/student/me", "/api/student/classrooms", "/api/student/image-status", "/api/student/image-jobs", "/api/student/image-profile/avatar", "/api/student/ui-design"].contains(path) { return true }
        if method == "POST" && ["/api/student/enter-classroom", "/api/student/join", "/api/student/logout", "/api/student/characters", "/api/student/image-jobs", "/api/student/image-profile/register"].contains(path) { return true }
        let id = "[A-Za-z0-9-]{1,100}"
        let pattern = method == "GET" ? "^/api/student/(classrooms/\(id)(/stage(/\(id)/(audio|image))?)?|submissions/\(id)/(audio|image)|image-jobs/\(id)/result)$" : "^/api/student/classrooms/\(id)/(submit|rhythm-request)$"
        return ["GET", "POST"].contains(method) && path.range(of: pattern, options: .regularExpression) != nil
    }
    func request(_ body: [String: Any], cookieStore: WKHTTPCookieStore, reply: @escaping (Any?, String?) -> Void) {
        guard let id = body["id"] as? String, UUID(uuidString: id) != nil,
              let path = body["path"] as? String, let method = body["method"] as? String,
              allowed(path, method), tasks[id] == nil, tasks.count < 8 else { reply(nil, "不支持的课堂操作。"); return }
        let entry = method == "POST" && path == "/api/student/enter-classroom"
        let login = accountEntry(path, method)
        guard entry || login || accountSetup(path, method) || joined else { reply(nil, "请先在“我的”登录账号或填写姓名和课堂码。"); return }
        guard let policy, let url = URL(string: path, relativeTo: policy.origin)?.absoluteURL, policy.sameOrigin(url) else { reply(nil, "课堂服务暂时不可用，请重新打开应用后重试。"); return }
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
                case NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid, NSURLErrorSecureConnectionFailed: hint = "课堂安全连接无法验证，请检查设备日期与网络后重试。"
                default: hint = "暂时无法连接课堂，可继续离线创作。请检查网络连接后重试。"
                }
                reply(nil, hint); return
            }
            guard let response = response as? HTTPURLResponse, let data, data.count <= 18_000_000 else { reply(nil, "课堂响应异常，请稍后重试。"); return }
            if (entry || login) && (200..<300).contains(response.statusCode) { self.joined = true }
            if path == "/api/student/logout" && response.statusCode == 200 { self.disconnect() }
            reply(["status": response.statusCode, "type": response.value(forHTTPHeaderField: "Content-Type") ?? "application/json", "encoded": data.base64EncodedString()], nil)
        }
        tasks[id] = task
        // Transfer a WebKit student session once, preserving its identity
        // when upgrading. This reads local cookies and performs no web request.
        if (entry || login) && Self.studentCookies(in: session.configuration.httpCookieStorage, for: policy.origin).isEmpty {
            cookieStore.getAllCookies { [weak self] cookies in
                guard let self, self.tasks[id] != nil else { return }
                for cookie in Self.transferableStudentCookies(cookies, for: policy.origin) {
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
              let trust = challenge.protectionSpace.serverTrust else { completionHandler(.cancelAuthenticationChallenge, nil); return }
        if policy?.usesSystemTrust == true {
            // Default handling validates the public chain, expiry and hostname.
            // Never accept a classroom/self-signed certificate for this domain.
            completionHandler(.performDefaultHandling, nil); return
        }
        guard
              let url = Bundle.main.url(forResource: "classroom-ca", withExtension: "der"), let data = try? Data(contentsOf: url), let ca = SecCertificateCreateWithData(nil, data as CFData) else { completionHandler(.cancelAuthenticationChallenge, nil); return }
        SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, challenge.protectionSpace.host as CFString))
        SecTrustSetAnchorCertificates(trust, [ca] as CFArray); SecTrustSetAnchorCertificatesOnly(trust, true)
        if SecTrustEvaluateWithError(trust, nil) { completionHandler(.useCredential, URLCredential(trust: trust)) }
        else { completionHandler(.cancelAuthenticationChallenge, nil) }
    }
}
