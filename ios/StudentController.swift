import UIKit
import WebKit
import Security
import CryptoKit

final class StudentController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    private var web: WKWebView!
    private var localOrigin: StudentPolicy?
    private let classroom = ClassroomConnection()
    private var files: LocalFiles?
    private var filePicker: ControlledFilePicker?
    private var boot = 0
    private var connectionFailed = false
    private var failurePullReady = false
    private var loadingLocalDocument = false
    private let status = UILabel()
    private let launchCover = UIView()
    private let credential: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "org.freeimpro.student.admin", kSecAttrAccount as String: "manager"]

    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .white; overrideUserInterfaceStyle = .light
        navigationController?.setNavigationBarHidden(true, animated: false)
        let config = WKWebViewConfiguration(); config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "FreeImproStudent/1 iOS"
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "localFiles")
        if let path = Bundle.main.url(forResource: "Bridge", withExtension: "js"), let js = try? String(contentsOf: path, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self; web.uiDelegate = self; web.isInspectable = false; web.isOpaque = false; web.backgroundColor = .white
        web.scrollView.pinchGestureRecognizer?.isEnabled = false
        web.scrollView.alwaysBounceVertical = true
        web.scrollView.panGestureRecognizer.addTarget(self, action: #selector(failurePull(_:)))
        web.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(web)
        launchCover.backgroundColor = .white; launchCover.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(launchCover)
        launchCover.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(failurePull(_:))))
        let logo = UIImageView(image: UIImage(named: "LaunchLogo")); logo.contentMode = .scaleAspectFit; logo.translatesAutoresizingMaskIntoConstraints = false; logo.isAccessibilityElement = true; logo.accessibilityLabel = "声音课堂"; launchCover.addSubview(logo)
        status.numberOfLines = 0; status.textAlignment = .center; status.font = .preferredFont(forTextStyle: .footnote); status.textColor = .darkGray; status.translatesAutoresizingMaskIntoConstraints = false; launchCover.addSubview(status)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor), web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            launchCover.topAnchor.constraint(equalTo: view.topAnchor), launchCover.leadingAnchor.constraint(equalTo: view.leadingAnchor), launchCover.trailingAnchor.constraint(equalTo: view.trailingAnchor), launchCover.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            logo.centerXAnchor.constraint(equalTo: launchCover.centerXAnchor), logo.centerYAnchor.constraint(equalTo: launchCover.centerYAnchor), logo.widthAnchor.constraint(equalToConstant: 104), logo.heightAnchor.constraint(equalToConstant: 104),
            status.topAnchor.constraint(equalTo: logo.bottomAnchor, constant: 28), status.leadingAnchor.constraint(equalTo: launchCover.leadingAnchor, constant: 28), status.trailingAnchor.constraint(equalTo: launchCover.trailingAnchor, constant: -28)
        ])
        do { let storage = try LocalFiles(); files = storage; filePicker = ControlledFilePicker(presenter: self, files: storage) } catch { /* File operations report a local error when requested. */ }
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification, object: nil)
        // Pin local storage to the previous app origin once; service settings
        // never move the sound library. No request is sent to this origin.
        #if targetEnvironment(simulator)
        let previousOrigin = bundledAddress
        #else
        let previousOrigin = UserDefaults.standard.string(forKey: "classroom") ?? bundledAddress
        #endif
        let address = UserDefaults.standard.string(forKey: "localOrigin") ?? previousOrigin ?? "https://localhost:8443/"
        localOrigin = StudentPolicy(address)
        UserDefaults.standard.set(localOrigin?.origin.absoluteString, forKey: "localOrigin")
        classroom.configure(UserDefaults.standard.string(forKey: "classroom") ?? bundledAddress)
        if UserDefaults.standard.bool(forKey: "offlineShellPrepared") { loadLocalApp() }
        else {
            // Retire the old downloaded shell without touching IndexedDB works
            // or cookies. A legacy worker must not update over the network.
            web.configuration.websiteDataStore.removeData(ofTypes: [WKWebsiteDataTypeServiceWorkerRegistrations, WKWebsiteDataTypeFetchCache], modifiedSince: .distantPast) { [weak self] in
                UserDefaults.standard.set(true, forKey: "offlineShellPrepared"); self?.loadLocalApp()
            }
        }
    }
    private var bundledAddress: String? {
        #if targetEnvironment(simulator)
        return "https://localhost:8443/"
        #else
        return Bundle.main.url(forResource: "classroom", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] }?["url"]
        #endif
    }
    private func storedCode() -> String? {
        var query = credential; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    private func hash(_ code: String, salt: String) -> String { SHA256.hash(data: Data((salt + ":" + code).utf8)).map { String(format: "%02x", $0) }.joined() }
    private func storeCode(_ code: String) -> OSStatus {
        let salt = UUID().uuidString, data = Data((salt + ":" + hash(code, salt: salt)).utf8)
        var values = credential; values[kSecValueData as String] = data; values[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        return SecItemAdd(values as CFDictionary, nil)
    }
    @objc private func settings() {
        if UserDefaults.standard.double(forKey: "lockedUntil") > Date().timeIntervalSince1970 { message("管理码尝试过多，请一分钟后重试。"); return }
        if let saved = storedCode() {
            let alert = UIAlertController(title: "教师管理码", message: "修改连接前需验证管理码。", preferredStyle: .alert)
            alert.addTextField { $0.isSecureTextEntry = true; $0.keyboardType = .numberPad }
            alert.addAction(UIAlertAction(title: "取消", style: .cancel))
            alert.addAction(UIAlertAction(title: "验证", style: .default) { [weak self, weak alert] _ in
                guard let self, let code = alert?.textFields?.first?.text else { return }
                let fields = saved.split(separator: ":").map(String.init)
                if fields.count == 2 && self.hash(code, salt: fields[0]) == fields[1] {
                    UserDefaults.standard.set(0, forKey: "attempts"); self.configure(first: false)
                } else {
                    let count = UserDefaults.standard.integer(forKey: "attempts") + 1
                    UserDefaults.standard.set(count >= 5 ? 0 : count, forKey: "attempts")
                    if count >= 5 { UserDefaults.standard.set(Date().timeIntervalSince1970 + 60, forKey: "lockedUntil") }
                    self.message("管理码不正确。")
                }
            }); present(alert, animated: true)
        } else { configure(first: true) }
    }
    private func configure(first: Bool) {
        let alert = UIAlertController(title: "课堂连接", message: "设置教师电脑 HTTPS 地址。学生加入课堂时才连接，本地作品不受地址修改影响。", preferredStyle: .alert)
        let defaultURL = Bundle.main.url(forResource: "classroom", withExtension: "json").flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] }?["url"] ?? ""
        alert.addTextField { $0.text = UserDefaults.standard.string(forKey: "classroom") ?? defaultURL; $0.keyboardType = .URL; $0.autocapitalizationType = .none }
        if first { for placeholder in ["设置 6–12 位数字管理码", "再次输入管理码"] { alert.addTextField { $0.placeholder = placeholder; $0.isSecureTextEntry = true; $0.keyboardType = .numberPad } } }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "连接", style: .default) { [weak self, weak alert] _ in
            guard let self, let fields = alert?.textFields, let text = fields.first?.text, let selected = StudentPolicy(text) else { self?.message("请填写有效 HTTPS 地址，例如 https://192.168.1.20:8443/"); return }
            if first {
                let code = fields[1].text ?? ""
                guard code.range(of: "^[0-9]{6,12}$", options: .regularExpression) != nil else { self.message("管理码必须是 6–12 位数字。"); return }
                guard code == fields[2].text else { self.message("两次输入的管理码不一致，请重新输入。"); return }
                let result = self.storeCode(code)
                guard result == errSecSuccess else {
                    if result == errSecMissingEntitlement { self.message("应用缺少钥匙串签名权限，请安装通过 Xcode 正常签名构建的版本。你的管理码输入没有问题。") }
                    else { self.message("管理码无法保存到系统钥匙串（错误 \(result)），请保留此错误码以便排查。") }
                    return
                }
            }
            UserDefaults.standard.set(selected.origin.absoluteString, forKey: "classroom"); self.classroom.configure(selected.origin.absoluteString)
            self.web.evaluateJavaScript("window.FreeImproClassroom.connected = false; window.FreeImproClassroom.generation++; window.dispatchEvent(new Event('freeimpro-classroom-disconnected'))", completionHandler: nil)
        }); present(alert, animated: true)
    }
    private func loadLocalApp() {
        boot += 1; let ticket = boot
        filePicker?.resetForDocument(); files?.schedule { $0.resetForDocument() }
        web.stopLoading(); connectionFailed = false; failurePullReady = false; status.text = nil; launchCover.isHidden = false
        let rulesJSON = "[{\"trigger\":{\"url-filter\":\"^https?://\"},\"action\":{\"type\":\"block\"}}]"
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "student-offline-only", encodedContentRuleList: rulesJSON) { [weak self] rules, _ in
            guard let self, ticket == self.boot else { return }
            guard let rules, let origin = self.localOrigin?.origin,
                  let file = Bundle.main.url(forResource: "student", withExtension: "html"), let html = try? String(contentsOf: file, encoding: .utf8) else { self.showLocalError(); return }
            self.web.configuration.userContentController.removeAllContentRuleLists(); self.web.configuration.userContentController.add(rules)
            // Apple's simulated response loads bundled HTML at a stable storage
            // origin without sending the request, preserving legacy local works.
            self.loadingLocalDocument = true; self.web.loadSimulatedRequest(URLRequest(url: origin), responseHTML: html)
        }
    }
    // When no document loaded, the web gesture handler is unavailable.
    @objc private func failurePull(_ gesture: UIPanGestureRecognizer) {
        guard connectionFailed else { return }
        let offset = gesture.translation(in: web).y
        if gesture.state == .changed {
            failurePullReady = offset >= 80 && web.scrollView.contentOffset.y <= 0
            if failurePullReady { status.text = "下拉刷新 · 松开刷新" }
        } else if gesture.state == .ended {
            let refresh = failurePullReady; failurePullReady = false
            if refresh { reconnect() }
        } else if gesture.state == .cancelled || gesture.state == .failed { failurePullReady = false }
    }
    @objc private func reconnect() { loadLocalApp() }
    @objc private func background() {
        web?.evaluateJavaScript("window.dispatchEvent(new Event('freeimpro-background'))", completionHandler: nil)
        web?.setAllMediaPlaybackSuspended(true); web?.setMicrophoneCaptureState(.none); web?.setCameraCaptureState(.none); files?.schedule { $0.cancelAll() }
    }
    @objc private func foreground() { web?.setAllMediaPlaybackSuspended(false) }
    private func message(_ text: String) { let alert = UIAlertController(title: "声音课堂", message: text, preferredStyle: .alert); alert.addAction(UIAlertAction(title: "知道了", style: .default)); present(alert, animated: true) }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard loadingLocalDocument, action.navigationType == .other, action.targetFrame?.isMainFrame == true, let url = action.request.url, localOrigin?.navigation(url) == true else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingLocalDocument = false
        checkPageReady(ticket: boot, attempts: 50)
        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        for name in ["WebKit", "Cookies"] { var url = library.appendingPathComponent(name); var values = URLResourceValues(); values.isExcludedFromBackup = true; try? url.setResourceValues(values) }
    }
    private func checkPageReady(ticket: Int, attempts: Int) {
        // A cached HTML document can finish navigating before its module has created the UI.
        web.evaluateJavaScript("document.documentElement.dataset.studentReady === 'true'") { [weak self] ready, _ in
            guard let self, ticket == self.boot else { return }
            if ready as? Bool == true {
                self.connectionFailed = false; self.status.text = nil; self.launchCover.isHidden = true; self.navigationController?.setNavigationBarHidden(true, animated: false)
            } else if attempts > 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in self?.checkPageReady(ticket: ticket, attempts: attempts - 1) }
            } else {
                self.showLocalError()
            }
        }
    }
    private func showConnectionError(_ error: Error) {
        let code = (error as NSError).code
        // stopLoading and replacing a navigation intentionally cancel the old request.
        guard code != NSURLErrorCancelled else { return }
        showLocalError()
    }
    private func showLocalError() {
        connectionFailed = true; launchCover.isHidden = false
        status.text = "应用暂时无法打开，请下拉刷新。"
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showConnectionError(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showConnectionError(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { reconnect() }
    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let allowed = frame.isMainFrame && origin.protocol == "https" && origin.host == localOrigin?.origin.host && (origin.port == 0 ? 443 : origin.port) == (localOrigin?.origin.port ?? 443) && UIApplication.shared.applicationState == .active
        decisionHandler(allowed ? .prompt : .deny)
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) { completionHandler(nil) }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage text: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "声音课堂", message: text, preferredStyle: .alert); alert.addAction(UIAlertAction(title: "知道了", style: .default) { _ in completionHandler() }); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage text: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "声音课堂", message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) }); alert.addAction(UIAlertAction(title: "确认", style: .default) { _ in completionHandler(true) }); present(alert, animated: true)
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, let url = message.frameInfo.request.url, localOrigin?.navigation(url) == true, let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "应用接口不可用。"); return }
        switch action {
        case "settings": settings(); replyHandler(true, nil); return
        case "reconnect": reconnect(); replyHandler(true, nil); return
        case "classroom-request": classroom.request(body, cookieStore: web.configuration.websiteDataStore.httpCookieStore, reply: replyHandler); return
        case "cancel-request": if let id = body["id"] as? String { classroom.cancel(id) }; replyHandler(true, nil); return
        case "disconnect": classroom.logout(); replyHandler(true, nil); return
        default: break
        }
        guard let files else { replyHandler(nil, "本地文件接口不可用。"); return }
        if action == "choose" {
            guard let kind = LocalImportKind(rawValue: body["kind"] as? String ?? ""), let filePicker else { replyHandler(nil, "文件类型无效。"); return }
            filePicker.choose(kind: kind, reply: replyHandler); return
        }
        let ticket = boot
        files.perform({ files -> Any? in
            switch action {
            case "begin": return try files.begin(name: body["name"] as? String ?? "", mime: body["mime"] as? String ?? "")
            case "append": return try files.append(id: body["id"] as? String ?? "", encoded: body["encoded"] as? String ?? "")
            case "finish": return try files.finish(body["id"] as? String ?? "")
            case "cancel": files.cancel(body["id"] as? String ?? ""); return true
            case "read": return try files.readImport(id: body["id"] as? String ?? "", offset: body["offset"] as? Int ?? -1)
            case "release": files.releaseImport(body["id"] as? String ?? ""); return true
            default: throw NSError(domain: "FreeImpro", code: 1, userInfo: [NSLocalizedDescriptionKey: "不支持的文件操作。"])
            }
        }) { [weak self] result in
            guard let self, self.boot == ticket else { replyHandler(NSNull(), nil); return }
            switch result {
            case .failure(let error): replyHandler(nil, error.localizedDescription)
            case .success(let value):
                if action == "finish", let url = value as? URL {
                    guard let filePicker = self.filePicker else { replyHandler(nil, "文件选择服务不可用。"); return }
                    filePicker.export(url, reply: replyHandler)
                } else { replyHandler(value, nil) }
            }
        }
    }
}
