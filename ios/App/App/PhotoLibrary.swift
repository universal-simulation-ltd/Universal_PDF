import Foundation
import Capacitor
import Photos
import UIKit

/// "Save to Photos" for "Turn the pages into pictures" (2026-10-25): each
/// page's picture goes straight into the photo library, in page order, rather
/// than into one ZIP file (`src/lib/photoLibrary.ts`).
///
/// ADD-ONLY access (`PHAccessLevel.addOnly`, iOS 14+): the app can put photos
/// in the library and can never see what is already there. The prompt is
/// `NSPhotoLibraryAddUsageDescription` (Info.plist, translated in each
/// lproj/InfoPlist.strings); `npm run check:ios-launch` fails a build that
/// reaches PHPhotoLibrary without it — iOS kills the app on first use if it
/// is missing. No album: making one needs full library access, which this
/// deliberately does not ask for.
///
/// Nothing leaves the phone. Registered by `MainViewController`.
@objc(PhotoLibraryPlugin)
public class PhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoLibraryPlugin"
    public let jsName = "PhotoLibrary"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    /// "granted" or "denied" (refused, or restricted by Screen Time / a profile).
    @objc func requestAccess(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            switch status {
            case .authorized, .limited: call.resolve(["access": "granted"])
            default: call.resolve(["access": "denied"])
            }
        }
    }

    /// One picture, base64 `data`, kept under `name` as its original filename.
    @objc func saveImage(_ call: CAPPluginCall) {
        guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else {
            return call.reject("No picture to save")
        }
        let name = call.getString("name")
        PHPhotoLibrary.shared().performChanges({
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = name
            PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: options)
        }) { ok, err in
            if ok { call.resolve() }
            else if PHPhotoLibrary.authorizationStatus(for: .addOnly) == .denied { call.reject("Access refused", "DENIED") }
            else { call.reject(err?.localizedDescription ?? "Could not save the picture") }
        }
    }

    /// This app's page in Settings, where photo access can be turned back on.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }
}
