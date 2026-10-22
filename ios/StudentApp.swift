import UIKit

@main
final class StudentApp: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Student", sessionRole: session.role)
        config.delegateClass = StudentScene.self; return config
    }
}

final class StudentScene: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = StudentNavigationController(rootViewController: StudentController())
        window.makeKeyAndVisible(); self.window = window
    }
    func sceneDidBecomeActive(_ scene: UIScene) {
        guard let scene = scene as? UIWindowScene else { return }
        requestLandscape(in: scene)
    }
    func windowScene(_ windowScene: UIWindowScene, didUpdate previousCoordinateSpace: UICoordinateSpace, interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation, traitCollection previousTraitCollection: UITraitCollection) {
        requestLandscape(in: windowScene)
    }
    private func requestLandscape(in scene: UIWindowScene) {
        guard scene.traitCollection.userInterfaceIdiom == .pad, !scene.interfaceOrientation.isLandscape else { return }
        // Keep the same controller and WebView when the system resizes or
        // restores the scene, preserving the student's work and connection.
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscape)) { _ in }
    }
}

final class StudentNavigationController: UINavigationController {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .landscape : .allButUpsideDown
    }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
        UIDevice.current.userInterfaceIdiom == .pad ? .landscapeRight : .portrait
    }
    @available(iOS 26.0, *)
    override var prefersInterfaceOrientationLocked: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }
}
