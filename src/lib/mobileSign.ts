// Sign-on-phone handoff protocol, mirroring Ergo Assess: the desktop shows a
// QR (one-time token in the URL) plus a 6-digit PIN; the phone page draws a
// signature and broadcasts it back over a Supabase Realtime channel; the
// desktop only accepts the payload if the PIN matches. Broadcast messages are
// ephemeral — no DB rows are written.

export function randomToken(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '')
}

export function randomPin(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

export function mobileSignChannel(token: string): string {
  return `mobile-sig:${token}`
}

/**
 * URL the phone opens. The packaged desktop app runs over file:// which a
 * phone can't reach — point it at the hosted web app instead. In the browser
 * the current origin+path keeps it working on every host that serves the app
 * (pdf.unisim.co.uk and opensource.unisim.co.uk/pdf).
 */
export function mobileSignUrl(token: string): string {
  const base =
    import.meta.env.MODE === 'desktop' || window.location.protocol === 'file:'
      ? 'https://pdf.unisim.co.uk/'
      : `${window.location.origin}${window.location.pathname}`
  return `${base}?sign=${token}`
}

export interface MobileSignPayload {
  pin?: string
  /** Base64 PNG (no data: prefix), white background, drawn on the phone. */
  signature?: string
}
