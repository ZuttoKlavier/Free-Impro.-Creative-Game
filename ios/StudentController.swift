import UIKit
import WebKit
import AVFAudio

final class StudentController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    private var web: WKWebView!
    private var localOrigin: StudentPolicy?
    private let classroom = ClassroomConnection()
    private lazy var socialAuth = StudentSocialAuth(classroom: classroom, presenter: self)
    private let audio = StudentAudio()
    private var files: LocalFiles?
    private var filePicker: ControlledFilePicker?
    private var boot = 0
    private var connectionFailed = false
    private var failurePullReady = false
    private var loadingLocalDocument = false
    private let status = UILabel()
    private let launchCover = UIView()

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .landscape : .allButUpsideDown
    }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
        UIDevice.current.userInterfaceIdiom == .pad ? .landscapeRight : .portrait
    }

    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .white; overrideUserInterfaceStyle = .light
        navigationController?.setNavigationBarHidden(true, animated: false)
        let config = WKWebViewConfiguration(); config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "FreeImproStudent/1 iOS"
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "localFiles")
        if let path = Bundle.main.url(forResource: "Bridge", withExtension: "js"), let js = try? String(contentsOf: path, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self; web.uiDelegate = self; web.isInspectable = false; web.isOpaque = false; web.backgroundColor = .white
        audio.onPlaybackEnded = { [weak self] id in self?.audioEvent("freeimpro-audio-ended", id: id) }
        audio.onRecordingEnded = { [weak self] id in self?.audioEvent("freeimpro-recording-ended", id: id) }
        classroom.onDisconnect = { [weak self] in self?.socialAuth.cancel(message: "课堂连接已关闭，请重新登录。") }
        web.scrollView.pinchGestureRecognizer?.isEnabled = false
        web.scrollView.alwaysBounceVertical = true
        web.scrollView.panGestureRecognizer.addTarget(self, action: #selector(failurePull(_:)))
        web.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(web)
        launchCover.backgroundColor = .white; launchCover.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(launchCover)
        launchCover.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(failurePull(_:))))
        let logo = UIImageView(image: UIImage(named: "LaunchLogo")); logo.contentMode = .scaleAspectFit; logo.translatesAutoresizingMaskIntoConstraints = false; logo.isAccessibilityElement = true; logo.accessibilityLabel = "声音课堂"; launchCover.addSubview(logo)
        status.numberOfLines = 0; status.textAlignment = .center; status.font = .preferredFont(forTextStyle: .footnote); status.textColor = .darkGray; status.translatesAutoresizingMaskIntoConstraints = false; launchCover.addSubview(status)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor), web.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            launchCover.topAnchor.constraint(equalTo: view.topAnchor), launchCover.leadingAnchor.constraint(equalTo: view.leadingAnchor), launchCover.trailingAnchor.constraint(equalTo: view.trailingAnchor), launchCover.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            logo.centerXAnchor.constraint(equalTo: launchCover.centerXAnchor), logo.centerYAnchor.constraint(equalTo: launchCover.centerYAnchor), logo.widthAnchor.constraint(equalToConstant: 104), logo.heightAnchor.constraint(equalToConstant: 104),
            status.topAnchor.constraint(equalTo: logo.bottomAnchor, constant: 28), status.leadingAnchor.constraint(equalTo: launchCover.leadingAnchor, constant: 28), status.trailingAnchor.constraint(equalTo: launchCover.trailingAnchor, constant: -28)
        ])
        do { let storage = try LocalFiles(); files = storage; filePicker = ControlledFilePicker(presenter: self, files: storage) } catch { /* File operations report a local error when requested. */ }
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification, object: nil)
        // Preserve the previous offline storage origin. Its legacy address is
        // never used for classroom requests, which always use the public service.
        #if targetEnvironment(simulator)
        let previousOrigin = bundledAddress
        #else
        let previousOrigin = UserDefaults.standard.string(forKey: "classroom") ?? bundledAddress
        #endif
        localOrigin = StudentPolicy.preservedLocalOrigin(in: .standard, legacyAddress: previousOrigin)
        classroom.configure()
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
    private func loadLocalApp() {
        boot += 1; let ticket = boot
        socialAuth.cancel()
        audio.reset()
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
        socialAuth.cancel(message: "登录已暂停，请回到应用后重新登录。")
        audio.reset()
        web?.evaluateJavaScript("window.dispatchEvent(new Event('freeimpro-background'))", completionHandler: nil)
        web?.setAllMediaPlaybackSuspended(true); web?.setMicrophoneCaptureState(.none); web?.setCameraCaptureState(.none); files?.schedule { $0.cancelAll() }
    }
    @objc private func foreground() { web?.setAllMediaPlaybackSuspended(false) }
    private func audioEvent(_ name: String, id: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["id": id]), let detail = String(data: data, encoding: .utf8) else { return }
        web?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('\(name)', { detail: \(detail) }))", completionHandler: nil)
    }
    private func prepareAudioSession(_ type: String) throws {
        let session = AVAudioSession.sharedInstance()
        switch type {
        case "play-and-record":
            guard UIApplication.shared.applicationState == .active else {
                throw NSError(domain: "FreeImpro", code: 2, userInfo: [NSLocalizedDescriptionKey: "请回到应用后重新录音。"])
            }
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
        case "playback":
            try session.setCategory(.playback, mode: .default)
        default:
            throw NSError(domain: "FreeImpro", code: 3, userInfo: [NSLocalizedDescriptionKey: "音频模式无效。"])
        }
        // Background cleanup may restore the category, but must not reactivate
        // audio after the app has stopped its media and microphone capture.
        if UIApplication.shared.applicationState == .active { try session.setActive(true) }
    }
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
        let origin = message.frameInfo.securityOrigin
        guard message.webView === web, message.frameInfo.isMainFrame,
              origin.protocol == "https", origin.host == localOrigin?.origin.host,
              (origin.port == 0 ? 443 : origin.port) == (localOrigin?.origin.port ?? 443),
              let url = message.frameInfo.request.url, localOrigin?.navigation(url) == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "应用接口不可用。"); return }
        switch action {
        case "student-social-login":
            socialAuth.signIn(provider: body["provider"] as? String ?? "", mode: body["mode"] as? String ?? "", reply: replyHandler); return
        case "audio-record-start": audio.start(id: body["id"] as? String ?? "", completion: replyHandler); return
        case "audio-record-level":
            let level = audio.level()
            replyHandler(level["id"] as? String == body["id"] as? String ? level : ["active": false], nil); return
        case "audio-record-stop":
            do { replyHandler(try audio.stop(id: body["id"] as? String ?? "") ?? NSNull(), nil) }
            catch { replyHandler(nil, error.localizedDescription) }; return
        case "audio-record-cancel": audio.cancel(id: body["id"] as? String ?? ""); replyHandler(true, nil); return
        case "audio-play":
            do { replyHandler(try audio.play(id: body["id"] as? String ?? "", encoded: body["encoded"] as? String ?? "", mime: body["mime"] as? String ?? ""), nil) }
            catch { replyHandler(nil, error.localizedDescription) }; return
        case "audio-play-stop": audio.stopPlayback(id: body["id"] as? String ?? ""); replyHandler(true, nil); return
        case "audio-rhythm-play":
            do { replyHandler(try audio.playRhythm(id: body["id"] as? String ?? "", encoded: body["encoded"] as? String ?? "", bars: body["bars"] as? Int ?? 0, bpm: body["bpm"] as? Double ?? 0, revision: body["revision"] as? Int ?? 0), nil) }
            catch { replyHandler(nil, error.localizedDescription) }; return
        case "audio-rhythm-queue":
            do { replyHandler(try audio.queueRhythm(id: body["id"] as? String ?? "", encoded: body["encoded"] as? String ?? "", bars: body["bars"] as? Int ?? 0, bpm: body["bpm"] as? Double ?? 0, revision: body["revision"] as? Int ?? 0), nil) }
            catch { replyHandler(nil, error.localizedDescription) }; return
        case "audio-rhythm-state": replyHandler(audio.rhythmState(id: body["id"] as? String ?? ""), nil); return
        case "audio-diagnostics": replyHandler(audio.diagnostics(), nil); return
        case "audio-session":
            do { try prepareAudioSession(body["type"] as? String ?? ""); replyHandler(true, nil) }
            catch { replyHandler(nil, "音频暂时无法使用：\(error.localizedDescription)") }
            return
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
