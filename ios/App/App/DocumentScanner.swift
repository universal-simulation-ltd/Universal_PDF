import UIKit
import Capacitor
import VisionKit

/// The bridge view controller, subclassed for one reason: to register the
/// plugins that live in THIS project rather than in an npm package.
/// `npx cap sync` only knows about packages, so a plugin written here is
/// invisible to the JavaScript side until something calls
/// `registerPluginInstance` — and `capacitorDidLoad` is the hook Capacitor
/// gives for exactly that. `SceneDelegate` builds this instead of a plain
/// `CAPBridgeViewController`.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DocumentScannerPlugin())
    }
}

/// "Scan a document": the system document camera (VisionKit), which finds the
/// page, flattens it, takes as many pages as you like and lets you retake one.
/// It runs on the phone; nothing here sends anything anywhere.
///
/// Each page is written as a JPEG to `tmp/scans/` and the web layer gets their
/// file URLs (`src/lib/documentScanner.ts`), reads them through Capacitor's
/// file server and calls `cleanup` to delete them straight after.
///
/// The camera prompt uses `NSCameraUsageDescription`, which Info.plist already
/// carries for the web layer's image pickers (`npm run check:ios-launch`).
@objc(DocumentScannerPlugin)
public class DocumentScannerPlugin: CAPPlugin, CAPBridgedPlugin, VNDocumentCameraViewControllerDelegate {
    public let identifier = "DocumentScannerPlugin"
    public let jsName = "DocumentScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cleanup", returnType: CAPPluginReturnPromise),
    ]

    /// The call waiting on the camera. One scan at a time: a second `scan`
    /// while the camera is up is refused rather than queued.
    private var pendingCall: CAPPluginCall?

    // JPEG at 0.85, the same quality the web side encodes scans at.
    private static let jpegQuality: CGFloat = 0.85

    private static var scanDirectory: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("scans", isDirectory: true)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        // False on a device with no camera, and in the Simulator.
        call.resolve(["available": VNDocumentCameraViewController.isSupported])
    }

    @objc func scan(_ call: CAPPluginCall) {
        guard VNDocumentCameraViewController.isSupported else {
            call.reject("This device cannot scan documents", "UNAVAILABLE")
            return
        }
        guard pendingCall == nil else {
            call.reject("A scan is already in progress", "BUSY")
            return
        }
        pendingCall = call
        DispatchQueue.main.async {
            let camera = VNDocumentCameraViewController()
            camera.delegate = self
            self.bridge?.viewController?.present(camera, animated: true)
        }
    }

    /// Delete the page files named in `pages`. Only files inside our own
    /// `tmp/scans/` are touched, whatever the caller passes.
    @objc func cleanup(_ call: CAPPluginCall) {
        let root = Self.scanDirectory.standardizedFileURL.path
        for case let string as String in call.getArray("pages") ?? [] {
            guard let url = URL(string: string), url.isFileURL,
                  url.standardizedFileURL.path.hasPrefix(root + "/") else { continue }
            try? FileManager.default.removeItem(at: url)
        }
        call.resolve()
    }

    // MARK: VNDocumentCameraViewControllerDelegate

    public func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFinishWith scan: VNDocumentCameraScan
    ) {
        controller.dismiss(animated: true)
        guard let call = pendingCall else { return }
        pendingCall = nil

        // Off the main thread: encoding a dozen full-resolution pages is
        // seconds of work, and the camera's dismiss animation is running.
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let dir = Self.scanDirectory
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let batch = UUID().uuidString
                var pages: [String] = []
                for i in 0..<scan.pageCount {
                    guard let data = scan.imageOfPage(at: i).jpegData(compressionQuality: Self.jpegQuality) else {
                        throw NSError(domain: "DocumentScanner", code: 1,
                                      userInfo: [NSLocalizedDescriptionKey: "Could not encode page \(i + 1)"])
                    }
                    let url = dir.appendingPathComponent("\(batch)-\(i + 1).jpg")
                    try data.write(to: url, options: .atomic)
                    pages.append(url.absoluteString)
                }
                call.resolve(["pages": pages, "cancelled": false])
            } catch {
                call.reject(error.localizedDescription, "WRITE_FAILED", error)
            }
        }
    }

    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        pendingCall?.resolve(["pages": [String](), "cancelled": true])
        pendingCall = nil
    }

    public func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFailWithError error: Error
    ) {
        controller.dismiss(animated: true)
        pendingCall?.reject(error.localizedDescription, "SCAN_FAILED", error)
        pendingCall = nil
    }
}
