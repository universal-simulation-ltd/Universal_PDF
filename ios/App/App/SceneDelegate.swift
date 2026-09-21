import UIKit
import Capacitor

/// The window's owner under the **UIScene life cycle**, which iOS now requires.
///
/// ⚠️ WHY THIS FILE EXISTS. An app built against the current iOS SDK that still
/// uses the old `UIApplicationDelegate` window life cycle — a `window` property
/// on the app delegate and no scene manifest — is **killed the moment it
/// launches**, with `UIScene life cycle is required for apps built with this
/// SDK` in the device log. There is no in-app symptom to debug: the process is
/// gone before any of our code, or the web view, runs. That is what App Review
/// reported on 1.0.3 ("the app crashed after the initial launch"), and it is
/// why the crash never showed up here — a build made against an older SDK, or
/// run on an older OS, launches perfectly well.
///
/// Capacitor adopted scenes in 8.5; this app is on Capacitor 7, so the adoption
/// is written out by hand here. It mirrors Capacitor's own `SceneDelegate`
/// template, with the one difference that Capacitor 8's `SceneDelegateProxy`
/// does not exist in 7 — the launch payload is forwarded to
/// `ApplicationDelegateProxy` instead, which is what `@capacitor/app`'s
/// `getLaunchUrl()` and `appUrlOpen` read on this version.
///
/// ⚠️ Under the scene life cycle iOS stops calling `AppDelegate`'s
/// `application(_:open:options:)`, `application(_:continue:…)` and the four
/// `applicationDid…`/`applicationWill…` activity methods. The first two are
/// what hand this app a PDF, so they are re-implemented below; the activity
/// methods were empty and nothing was lost. **Do not put new logic in those
/// AppDelegate methods — it will never run.**
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let root = CAPBridgeViewController()
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = root
        window?.makeKeyAndVisible()

        // ⚠️ Load-bearing, and the reason this is not just the template.
        //
        // A cold start that was STARTED BY a document (Files → Open With, the
        // share sheet) delivers it in `connectionOptions`, not through
        // `scene(_:openURLContexts:)`. Forwarding it before the bridge exists
        // would drop it on the floor: the notifications the Capacitor plugins
        // listen for are posted to nobody until `CapacitorBridge` has
        // registered them, which happens inside the view controller's
        // `loadView()`. `loadViewIfNeeded()` makes that ordering explicit
        // rather than a side effect of `makeKeyAndVisible()`.
        //
        // Once registered, `@capacitor/app` retains `appUrlOpen` until the web
        // layer subscribes (`retainUntilConsumed`), so the web view still
        // booting is not a problem — see `src/lib/nativeOpen.ts`.
        root.loadViewIfNeeded()

        if !connectionOptions.urlContexts.isEmpty {
            self.scene(scene, openURLContexts: connectionOptions.urlContexts)
        }
        for userActivity in connectionOptions.userActivities {
            self.scene(scene, continue: userActivity)
        }
    }

    /// A document or a `unisim-pdf://` link handed over while the app is
    /// already running.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            AppDelegate.forwardOpenedURL(context.url, options: Self.openURLOptions(from: context.options))
        }
    }

    /// A Universal Link.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    /// `UIScene.OpenURLOptions` and `UIApplication.OpenURLOptionsKey` carry the
    /// same three values under different types. Capacitor 7 only speaks the
    /// application form, and `openInPlace` in particular is the flag
    /// `AppDelegate.localCopyOfInPlaceDocument` keys off, so it has to survive
    /// the translation.
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
