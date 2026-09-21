import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    /// Hands every scene to `SceneDelegate`.
    ///
    /// ⚠️ This method, and the `UIApplicationSceneManifest` in Info.plist, are
    /// what make this app launch at all on a current iOS: an app built against
    /// this SDK that has not adopted the scene life cycle is terminated
    /// immediately. Both halves are required — a manifest alone does not
    /// satisfy it, because the runtime checks that the app delegate answers
    /// this call. See `SceneDelegate.swift`.
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // ⚠️ THE FIVE METHODS BELOW ARE NEVER CALLED under the scene life cycle —
    // iOS sends the equivalents to the scene delegate instead. They are kept
    // only because they are Capacitor's template and their absence would read
    // as a deletion. All five are empty; put nothing in them. Anything that
    // needs to run on resign/background/foreground/active belongs in
    // `SceneDelegate`, or on the matching `UIApplication` notification (which
    // is what `@capacitor/app` uses, and why its `pause`/`resume` events keep
    // working).

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    // ⚠️ Also never called under the scene life cycle. `SceneDelegate` takes
    // the two that matter — a document handed over, and a Universal Link — and
    // routes the first through `forwardOpenedURL` below. Kept as the
    // pre-scene fallback, and so there is one place that describes the rule.

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return Self.forwardOpenedURL(url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    /// Hands a URL iOS opened us with to Capacitor — after making sure it is
    /// one the web layer can actually read.
    ///
    /// A document opened IN PLACE (Files → Open With) arrives as a
    /// security-scoped URL outside our container. Hand that straight to the
    /// web layer and Capacitor's Filesystem plugin cannot read it: the
    /// permission belongs to this call and is gone by the time the WebView
    /// asks. Copy it in first and forward the copy, so everything above this
    /// line only ever sees an ordinary readable file:// path.
    ///
    /// Shared by the scene path (`SceneDelegate`) and the app-delegate one, so
    /// the guarantee cannot hold on one route and not the other.
    @discardableResult
    static func forwardOpenedURL(_ url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) -> Bool {
        let forwarded = localCopyOfInPlaceDocument(url, options: options) ?? url
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: forwarded, options: options)
    }

    /// Copies a security-scoped, opened-in-place document into our own
    /// container and returns the copy. Returns nil when there is nothing to do
    /// — a non-file URL, or a document iOS already copied into our Inbox —
    /// in which case the original URL is forwarded unchanged.
    ///
    /// ⚠️ The access has to be released on every path, including the throwing
    /// one; `startAccessingSecurityScopedResource` takes a real lock and
    /// leaking it eventually stops further documents opening at all.
    private static func localCopyOfInPlaceDocument(
        _ url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any]
    ) -> URL? {
        guard url.isFileURL, options[.openInPlace] as? Bool == true else { return nil }

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
}
