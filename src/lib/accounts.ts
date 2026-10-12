import { isNativeShell } from './nativeOpen'

// Where Universal PDF has accounts at all (James, 2026-10-12).
//
// The phone apps, the desktop app and the browser extension have NO sign-in:
// signing, sending for signature and everything else works with no account and
// uploads nothing. `@unisim/sdk`'s `noAccounts` is set for them (src/main.tsx),
// which also keeps them signed out of any suite session the device holds.
//
// Only the website keeps an optional Universal ID, for the two things that
// need one: the "Certified signature" route (the PDF is stored, the signer is
// emailed a link, and a certificate and audit trail are kept), and the main
// signature saved in your Universal ID.
//
// Which build is which:
//   • `--mode desktop` is the desktop app, both phone apps (build:mobile) and
//     the extension (build:extension);
//   • `window.desktop` is Electron, including a dev run against the dev server;
//   • `isNativeShell()` is Capacitor, including live reload;
//   • a page that is not http(s) is a shell of some kind (the extension's
//     chrome-extension://, Electron's file://).

/** True in the phone, desktop and extension builds: no sign-in, no uploads. */
export function accountsOff(): boolean {
  if (import.meta.env.MODE === 'desktop') return true
  if (typeof window === 'undefined') return false
  if (window.desktop) return true
  if (isNativeShell()) return true
  return !/^https?:$/.test(window.location.protocol)
}

/**
 * The certified-signature route (upload, emailed link, certificate) is offered
 * on the website only. The desktop app may point to it with a link that opens
 * the website in the browser; the phone apps do not mention it at all (App
 * Store 4.3: no link out to the website).
 */
export function certifiedSignatureHere(): boolean {
  return !accountsOff()
}

/** The desktop app (Electron), where a link to the website opens in the browser. */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!window.desktop
}
