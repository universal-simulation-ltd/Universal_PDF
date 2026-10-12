import Foundation
import Capacitor
import LocalAuthentication
import Security

/// "Lock saved signatures with Face ID" (2026-10-12): keeps the key the web
/// layer encrypts saved signatures with (`src/lib/signatureVault.ts`) in the
/// Keychain, readable only after Face ID, Touch ID or the device passcode.
///
/// The key is 32 random bytes, stored with `.userPresence` and
/// `WhenPasscodeSetThisDeviceOnly`: never synced, never in a backup, gone if
/// the passcode is removed. `.userPresence` rather than `.biometryCurrentSet`
/// on purpose — re-enrolling a face must not make someone's own signatures
/// unreadable; the passcode stays a way in.
///
/// Nothing leaves the phone. Registered by `MainViewController`.
@objc(SignatureVaultPlugin)
public class SignatureVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SignatureVaultPlugin"
    public let jsName = "SignatureVault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteKey", returnType: CAPPluginReturnPromise),
    ]

    private let service = "uk.co.unisim.pdf.signature-vault"
    private let account = "signatures-key"

    @objc func isAvailable(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var error: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        let kind: String
        switch ctx.biometryType {
        case .faceID: kind = "faceID"
        case .touchID: kind = "touchID"
        default: kind = ok ? "passcode" : "none"
        }
        call.resolve(["available": ok, "biometry": kind])
    }

    /// Makes a new key (replacing any old one) after the person proves it is
    /// them, and returns it so the web layer can seal what is already saved.
    @objc func createKey(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Lock your saved signatures"
        LAContext().evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, err in
            guard ok else { return call.reject(err?.localizedDescription ?? "cancelled", "CANCELLED") }
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
                return call.reject("Could not make a key")
            }
            guard let access = SecAccessControlCreateWithFlags(
                nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, nil)
            else { return call.reject("Could not protect the key") }
            SecItemDelete(self.query() as CFDictionary)
            var add = self.query()
            add[kSecValueData as String] = Data(bytes)
            add[kSecAttrAccessControl as String] = access
            let status = SecItemAdd(add as CFDictionary, nil)
            guard status == errSecSuccess else { return call.reject("Keychain error \(status)") }
            call.resolve(["key": Data(bytes).base64EncodedString()])
        }
    }

    /// Reads the key, which shows the Face ID / Touch ID / passcode prompt.
    @objc func getKey(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Unlock your saved signatures"
        DispatchQueue.global(qos: .userInitiated).async {
            let ctx = LAContext()
            ctx.localizedReason = reason
            var q = self.query()
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            q[kSecUseAuthenticationContext as String] = ctx
            var item: CFTypeRef?
            let status = SecItemCopyMatching(q as CFDictionary, &item)
            switch status {
            case errSecSuccess:
                guard let data = item as? Data else { return call.reject("No key") }
                call.resolve(["key": data.base64EncodedString()])
            case errSecUserCanceled, errSecAuthFailed:
                call.reject("cancelled", "CANCELLED")
            case errSecItemNotFound:
                call.reject("No key", "NO_KEY")
            default:
                call.reject("Keychain error \(status)")
            }
        }
    }

    @objc func deleteKey(_ call: CAPPluginCall) {
        SecItemDelete(query() as CFDictionary)
        call.resolve()
    }

    private func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
