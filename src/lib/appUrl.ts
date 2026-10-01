// Where a link to this app has to point when somebody ELSE is going to open it
// — a signing link in an email, the QR a phone scans, a certificate page.
//
// ⚠️ NOT `window.location.origin` everywhere. That is right in a browser, and
// wrong in every other shell this app ships in, each in its own way:
//   • Electron — `file://`, which nobody else's machine can open.
//   • Android (Capacitor) — `https://localhost`, which LOOKS like a web
//     address, so the sign-request function accepted it and emailed the
//     recipient a link to their own phone, after the PDF was uploaded and a
//     token spent.
//   • iOS (Capacitor) — `capacitor://localhost`, which the server refused.
//   • The browser extension — `chrome-extension://…`.
// The desktop and both phone builds are all `--mode desktop` (see
// `build:mobile`), and the extension is the only other non-http(s) page, so
// those two tests between them catch every shell.
//
// ⚠️ The public address is the portal path, not `pdf.unisim.co.uk`, which an
// earlier version of the phone-signing QR used: that host does not resolve
// (checked 2026-10-01), so desktop QR codes opened nothing at all.

export const PUBLIC_APP_URL = 'https://opensource.unisim.co.uk/pdf/'

function isShellBuild(): boolean {
  return import.meta.env.MODE === 'desktop' || !/^https?:$/.test(window.location.protocol)
}

/** This app's address as somebody on another device can open it, ending in `/`. */
export function publicAppBase(): string {
  // In a browser, the page's own address keeps the link on whichever host is
  // serving it — the portal, a preview deploy, or local dev.
  return isShellBuild() ? PUBLIC_APP_URL : `${window.location.origin}${import.meta.env.BASE_URL}`
}
