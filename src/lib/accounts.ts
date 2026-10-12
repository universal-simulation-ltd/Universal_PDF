import { isNativeShell } from './nativeOpen'

// Where Universal PDF has accounts at all (James, 2026-10-12).
//
// The PHONE apps and the browser EXTENSION have NO sign-in: signing, sending
// for signature and everything else works with no account and uploads nothing.
// `@unisim/sdk`'s `noAccounts` is set for them (src/main.tsx), which also
// keeps them signed out of any suite session the device holds.
//
// The WEBSITE and the DESKTOP app keep an optional Universal ID, for the two
// things that need one: the "Certified signature" route (the PDF is stored,
// the signer is emailed a link, and a certificate and audit trail are kept),
// and the main signature saved in your Universal ID. On desktop, sign-in is
// the SDK's in-app dialog, and hub pages open signed in through
// `installHubHandoff` (electron/main.cjs, `npm run test:handoff`).
//
// Which build is which:
//   • `--mode desktop` is the desktop app, both phone apps (build:mobile) and
//     the extension (build:extension), so the mode alone cannot tell them apart;
//   • `window.desktop` is Electron, including a dev run against the dev server;
//   • `isNativeShell()` is Capacitor, including live reload;
//   • any other `--mode desktop` page, or one that is not http(s), is the
//     extension (chrome-extension://).

/** True in the phone and extension builds: no sign-in, no uploads. */
export function accountsOff(): boolean {
  if (typeof window === 'undefined') return false
  if (window.desktop) return false
  if (isNativeShell()) return true
  if (import.meta.env.MODE === 'desktop') return true
  return !/^https?:$/.test(window.location.protocol)
}

/**
 * The certified-signature route (upload, emailed link, certificate) is offered
 * on the website and in the desktop app, wherever there is a sign-in. The phone
 * apps do not mention it at all (App Store 4.3: no link out to the website).
 */
export function certifiedSignatureHere(): boolean {
  return !accountsOff()
}

/** The desktop app (Electron), where a PDF is saved through a Save dialog. */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!window.desktop
}
