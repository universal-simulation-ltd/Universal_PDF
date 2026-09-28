import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    // ⚠️ Capacitor's template also carries application(_:open:options:),
    // application(_:continue:restorationHandler:) and the four
    // applicationDid…/applicationWill… activity methods. Under the scene life
    // cycle iOS never calls any of them, so they are not here: a document, a
    // link and a Universal Link all arrive at `SceneDelegate`, which is where
    // this app copies an opened-in-place document in. Put nothing that must
    // run on a URL or a foreground change in this file.

    func applicationWillTerminate(_ application: UIApplication) {
    }

    /// Hands every scene to `SceneDelegate` — Capacitor 8.5's template.
    ///
    /// ⚠️ This and the `UIApplicationSceneManifest` in Info.plist are both
    /// required: the runtime asks the app delegate rather than trusting the
    /// plist alone. `npm run check:ios-launch` fails the build if either goes.
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {

        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

}
