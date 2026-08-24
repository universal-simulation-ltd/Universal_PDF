import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        //
        // A document opened IN PLACE (Files → Open With) arrives as a
        // security-scoped URL outside our container. Hand that straight to the
        // web layer and Capacitor's Filesystem plugin cannot read it: the
        // permission belongs to this delegate call and is gone by the time the
        // WebView asks. Copy it in first and forward the copy, so everything
        // above this line only ever sees an ordinary readable file:// path.
        let forwarded = Self.localCopyOfInPlaceDocument(url, options: options) ?? url
        return ApplicationDelegateProxy.shared.application(app, open: forwarded, options: options)
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

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
