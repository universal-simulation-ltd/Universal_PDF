import UIKit
import Capacitor

/// The window's owner under the **UIScene life cycle**, which iOS requires of
/// an app built against the iOS 27 SDK: without it the process is killed at
/// launch ("UIScene life cycle is required for apps built with this SDK"),
/// before any of our code or the web view runs.
///
/// This is Capacitor 8.5's own `SceneDelegate` template — the window and
/// `CAPBridgeViewController` built in code, and every callback handed to
/// Capacitor's `SceneDelegateProxy`, which posts what `@capacitor/app`'s
/// `appUrlOpen` and `getLaunchUrl()` read, and holds a cold-start URL back
/// until the bridge's plugins are listening. It differs from the template in
/// ONE way, below: a document opened in place is copied in first.
///
/// ⚠️ Under the scene life cycle iOS never calls `AppDelegate`'s
/// `application(_:open:options:)`, `application(_:continue:…)` or the
/// `applicationDid…`/`applicationWill…` activity methods. Anything that has
/// to happen on a URL, a Universal Link or a foreground change belongs here.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // `MainViewController` (DocumentScanner.swift), not a bare
        // `CAPBridgeViewController`: it registers this project's own plugins.
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        guard connectionOptions.urlContexts.contains(where: Self.isInPlaceDocument) else {
            SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
            return
        }

        // ⚠️ A cold start BY an in-place document can't go through the proxy:
        // it would forward the raw security-scoped URL, which the web layer
        // cannot read, and neither the proxy nor `ConnectionOptions` can be
        // subclassed or rebuilt to swap the copy in. So this does what
        // `SceneDelegateProxy.scene(_:willConnectTo:options:)` does — post the
        // connect notification, then wait for the bridge's first
        // `viewDidAppear` (its plugins are registered by then; before it, the
        // notifications reach nobody) — and delivers through the method below,
        // which does the copy.
        NotificationCenter.default.post(name: .capacitorSceneWillConnect, object: scene)
        var token: NSObjectProtocol?
        token = NotificationCenter.default.addObserver(
            forName: .capacitorViewDidAppear, object: nil, queue: .main
        ) { [weak self] _ in
            if let token { NotificationCenter.default.removeObserver(token) }
            self?.scene(scene, openURLContexts: connectionOptions.urlContexts)
            for userActivity in connectionOptions.userActivities {
                self?.scene(scene, continue: userActivity)
            }
        }
    }

    /// A document or a link handed over while the app is running (and, via the
    /// branch above, a cold start by an in-place document).
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        let inPlace = URLContexts.filter(Self.isInPlaceDocument)
        let rest = URLContexts.subtracting(inPlace)
        if !rest.isEmpty {
            SceneDelegateProxy.shared.scene(scene, openURLContexts: rest)
        }

        // What the proxy would post for these, with the copy's URL in place of
        // the security-scoped one. `ApplicationDelegateProxy` posts
        // `.capacitorOpenURL` (what `@capacitor/app` listens to) and sets the
        // `lastURL` that `getLaunchUrl()` returns.
        for context in inPlace {
            let options = Self.openURLOptions(from: context.options)
            let url = Self.localCopyOfInPlaceDocument(context.url) ?? context.url
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: options)
            NotificationCenter.default.post(name: .capacitorSceneOpenURL, object: scene, userInfo: [
                "url": url,
                "options": options
            ])
        }
    }

    /// A Universal Link.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // MARK: - Documents opened in place

    /// A document opened IN PLACE (Files → Open With) arrives as a
    /// security-scoped URL outside our container. Handed straight to the web
    /// layer, Capacitor's Filesystem plugin cannot read it: nothing on that
    /// side holds the scope. A document iOS already copied into our Inbox is an
    /// ordinary file URL with `openInPlace` false, and goes through the proxy.
    private static func isInPlaceDocument(_ context: UIOpenURLContext) -> Bool {
        context.url.isFileURL && context.options.openInPlace
    }

    /// Copies the document into our own container and returns the copy, or nil
    /// if it could not be copied (the original is then forwarded unchanged).
    ///
    /// ⚠️ The access has to be released on every path, including the throwing
    /// one; `startAccessingSecurityScopedResource` takes a real lock and
    /// leaking it eventually stops further documents opening at all.
    private static func localCopyOfInPlaceDocument(_ url: URL) -> URL? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        // A fresh subdirectory per open: two documents of the same name opened
        // in one session must not collide, and copyItem refuses to overwrite.
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("opened-in-place/\(UUID().uuidString)", isDirectory: true)
        let dest = dir.appendingPathComponent(url.lastPathComponent)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: dest)
            return dest
        } catch {
            NSLog("Universal PDF: could not copy an in-place document: \(error)")
            return nil
        }
    }

    /// `UIScene.OpenURLOptions` in the application-level form the
    /// `.capacitorOpenURL` payload carries — as `SceneDelegateProxy` builds it
    /// (its own helper is private).
    private static func openURLOptions(
        from sceneOptions: UIScene.OpenURLOptions
    ) -> [UIApplication.OpenURLOptionsKey: Any] {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let sourceApplication = sceneOptions.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        if let annotation = sceneOptions.annotation {
            options[.annotation] = annotation
        }
        options[.openInPlace] = sceneOptions.openInPlace
        return options
    }
}
