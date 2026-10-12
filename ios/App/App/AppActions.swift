import Foundation
import Capacitor
import AppIntents

/// Shortcuts, Siri and Spotlight actions for Universal PDF (2026-10-12): "Scan
/// to PDF", "Make a PDF Smaller" and "Sign a PDF". Each one opens the app and
/// queues an action here; the web layer collects it through the `AppActions`
/// plugin (`src/lib/appActions.ts`) and runs it (`ShortcutRunner.tsx`).
///
/// Why a queue: an intent can run before the WebView exists (a cold start from
/// Siri). The action waits in `AppActionsCenter` until JavaScript asks for it
/// with `getPending()`, or is pushed as an `action` event when JavaScript is
/// already listening.
///
/// A PDF handed to an intent (from Files, Mail, another shortcut) is copied to
/// `tmp/shortcuts/` and passed on as a `file://` URL, which the web layer
/// reads exactly like a PDF opened from the share sheet.
///
/// Registered by `MainViewController` (DocumentScanner.swift), like the scanner:
/// `npx cap sync` doesn't know about plugins that live in this project.
final class AppActionsCenter {
    static let shared = AppActionsCenter()
    static let queued = Notification.Name("UniversalPdfAppActionQueued")

    private var pending: [[String: String]] = []
    private let lock = NSLock()

    func enqueue(_ action: [String: String]) {
        lock.lock()
        pending.append(action)
        lock.unlock()
        NotificationCenter.default.post(name: Self.queued, object: nil)
    }

    func drain() -> [[String: String]] {
        lock.lock()
        defer { lock.unlock() }
        let all = pending
        pending = []
        return all
    }

    /// Copies an intent's PDF somewhere the web layer can read it.
    @available(iOS 16.0, *)
    static func store(_ file: IntentFile) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("shortcuts", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var name = file.filename.isEmpty ? "document.pdf" : file.filename
        if !name.lowercased().hasSuffix(".pdf") { name += ".pdf" }
        let url = dir.appendingPathComponent("\(UUID().uuidString.prefix(8))-\(name)")
        try file.data.write(to: url, options: .atomic)
        return url
    }
}

@objc(AppActionsPlugin)
public class AppActionsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppActionsPlugin"
    public let jsName = "AppActions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPending", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(onQueued), name: AppActionsCenter.queued, object: nil)
    }

    /// Pushed only while JavaScript listens; otherwise the action stays queued
    /// for `getPending`, so a launch never loses it.
    @objc private func onQueued() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.hasListeners("action") else { return }
            for action in AppActionsCenter.shared.drain() {
                self.notifyListeners("action", data: action)
            }
        }
    }

    @objc func getPending(_ call: CAPPluginCall) {
        call.resolve(["actions": AppActionsCenter.shared.drain()])
    }
}

// MARK: - The intents

@available(iOS 16.0, *)
struct ScanToPdfIntent: AppIntent {
    static var title: LocalizedStringResource = "Scan to PDF"
    static var description = IntentDescription("Scan paper with the camera and turn it into a PDF.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppActionsCenter.shared.enqueue(["type": "scan"])
        return .result()
    }
}

@available(iOS 16.0, *)
struct MakePdfSmallerIntent: AppIntent {
    static var title: LocalizedStringResource = "Make a PDF Smaller"
    static var description = IntentDescription("Opens a PDF ready to save a smaller copy.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "PDF", supportedTypeIdentifiers: ["com.adobe.pdf"])
    var file: IntentFile

    @MainActor
    func perform() async throws -> some IntentResult {
        let url = try AppActionsCenter.store(file)
        AppActionsCenter.shared.enqueue(["type": "compress", "file": url.absoluteString])
        return .result()
    }
}

@available(iOS 16.0, *)
struct SignPdfIntent: AppIntent {
    static var title: LocalizedStringResource = "Sign a PDF"
    static var description = IntentDescription("Opens a PDF ready to sign.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "PDF", supportedTypeIdentifiers: ["com.adobe.pdf"])
    var file: IntentFile

    @MainActor
    func perform() async throws -> some IntentResult {
        let url = try AppActionsCenter.store(file)
        AppActionsCenter.shared.enqueue(["type": "sign", "file": url.absoluteString])
        return .result()
    }
}

/// What Shortcuts, Siri and Spotlight offer without the user building anything.
/// Phrases and titles are translated in `<lang>.lproj/AppShortcuts.strings`
/// and `Localizable.strings` (all eight suite languages).
@available(iOS 16.0, *)
struct UniversalPdfShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ScanToPdfIntent(),
            phrases: [
                "Scan to PDF with \(.applicationName)",
                "Scan a document with \(.applicationName)",
            ],
            shortTitle: "Scan to PDF",
            systemImageName: "doc.viewfinder"
        )
        AppShortcut(
            intent: MakePdfSmallerIntent(),
            phrases: ["Make a PDF smaller with \(.applicationName)"],
            shortTitle: "Make Smaller",
            systemImageName: "arrow.down.right.and.arrow.up.left"
        )
        AppShortcut(
            intent: SignPdfIntent(),
            phrases: ["Sign a PDF with \(.applicationName)"],
            shortTitle: "Sign a PDF",
            systemImageName: "signature"
        )
    }
}
