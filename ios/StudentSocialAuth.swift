import Foundation
import Security
import CryptoKit

struct StudentSocialAuthProof {
    let verifier: String
    var challenge: String { Self.challenge(for: verifier) }
    init?() {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return nil }
        verifier = Self.base64URL(Data(bytes))
    }
    static func challenge(for verifier: String) -> String { base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }
    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

#if canImport(UIKit)
import UIKit
import AuthenticationServices

// The system authorization browser has its own cookies. The server returns
// only a short-lived ticket; native code exchanges it with a private proof.
final class StudentSocialAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let classroom: ClassroomConnection
    private weak var presenter: UIViewController?
    private var browser: ASWebAuthenticationSession?
    private var run: UUID?
    private var proof: StudentSocialAuthProof?
    private var handoff: ClassroomConnection.NativeHandoff?
    private var reply: ((Any?, String?) -> Void)?

    init(classroom: ClassroomConnection, presenter: UIViewController) {
        self.classroom = classroom; self.presenter = presenter
    }
    func signIn(provider: String, mode: String, reply: @escaping (Any?, String?) -> Void) {
        guard run == nil else { reply(nil, "登录正在进行，请稍候。"); return }
        guard ["wechat", "apple"].contains(provider), ["login", "link"].contains(mode),
              UIApplication.shared.applicationState == .active, presenter?.viewIfLoaded?.window != nil else { reply(nil, "请回到应用后重新登录。"); return }
        guard let proof = StudentSocialAuthProof() else { reply(nil, "暂时无法安全启动登录，请重试。"); return }
        let run = UUID(); self.run = run; self.proof = proof; self.reply = reply
        classroom.startSocial(provider: provider, mode: mode, challenge: proof.challenge) { [weak self] result in
            guard let self else { return }
            guard self.run == run else {
                if case .success(let handoff) = result { self.classroom.cancelSocial(handoff: handoff, verifier: proof.verifier) }
                return
            }
            switch result {
            case .failure(let error): self.finish(nil, error.localizedDescription)
            case .success(let handoff):
                self.handoff = handoff
                guard UIApplication.shared.applicationState == .active, self.presenter?.viewIfLoaded?.window != nil else { self.cancel(); return }
                let browser = ASWebAuthenticationSession(url: handoff.browserURL, callbackURLScheme: "freeimprostudent") { [weak self] url, error in
                    DispatchQueue.main.async { self?.returned(url: url, error: error, run: run) }
                }
                browser.presentationContextProvider = self
                browser.prefersEphemeralWebBrowserSession = true
                self.browser = browser
                if !browser.start() { self.cancel(message: "无法打开登录授权，请稍后重试。") }
            }
        }
    }
    private func returned(url: URL?, error: Error?, run: UUID) {
        guard self.run == run, let proof else { return }
        // An OS callback can arrive just before didBecomeActive. The run is
        // invalidated by didEnterBackground, document reload or disconnection.
        guard UIApplication.shared.applicationState != .background,
              error == nil, let url, let ticket = ClassroomConnection.nativeCallbackTicket(url) else {
            cancel(message: error == nil && url != nil ? "登录回调无效，请重新登录。" : "已取消登录。"); return
        }
        browser = nil
        classroom.consumeSocial(ticket: ticket, verifier: proof.verifier) { [weak self] result in
            guard let self, self.run == run else { return }
            switch result {
            case .failure(let error): self.cancel(message: error.localizedDescription)
            case .success(let user): self.finish(user, nil)
            }
        }
    }
    func cancel(message: String = "已取消登录。") {
        guard run != nil else { return }
        classroom.invalidateSocial()
        if let handoff, let proof { classroom.cancelSocial(handoff: handoff, verifier: proof.verifier) }
        let browser = self.browser
        finish(nil, message)
        browser?.cancel()
    }
    private func finish(_ result: Any?, _ error: String?) {
        let reply = self.reply
        run = nil; proof = nil; handoff = nil; browser = nil; self.reply = nil
        reply?(result, error)
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        presenter?.viewIfLoaded?.window ?? ASPresentationAnchor()
    }
}
#endif
