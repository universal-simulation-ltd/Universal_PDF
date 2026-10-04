// ⚠️ VENDORED COPY — swap to the @unisim/sdk export after the next SDK release.
//
// Copied verbatim (2026-10-04) from Universal QR's `src/lib/scanResult.ts` at
// commit c824ba4, where it decides whether a scanned code's link is safe to
// open. The same classifier is being moved into `@unisim/sdk` so every suite
// app judges a link the same way; that release is not published yet, so this
// copy keeps Universal PDF self-contained until it is. When the SDK ships it:
// delete this file, import `classifyScan` / `urlWarnings` from '@unisim/sdk'
// in `lib/links.ts`, and run `npm run test:link-safety`.
//
// Edit nothing below this block: a change belongs in the SDK, so the two
// copies cannot drift apart before the swap.
// ─────────────────────────────────────────────────────────────────────────────

// What did the camera just read, and is it safe to act on?
//
// A QR code is an instruction from a stranger. Printed on a poster, stuck over
// a parking meter's real one, or sent in a phishing email, it can carry an
// address dressed up to look like somewhere else. The Scan tab used to show
// the raw text and, for anything starting `http`, an "Open link" button — so
// `https://paypal.com@evil.example` opened evil.example with one tap and the
// only clue was buried in the middle of a monospace string.
//
// This module answers two questions, offline and without a network call:
//
//   1. What KIND of thing is this? A web link, a Wi-Fi join, a phone number,
//      an email address, a text message, or just text.
//   2. For a web link: what should a careful person notice before opening it?
//
// ⚠️ This file imports NOTHING, so scripts/scanResult.test.mjs can load it
// under Node's type-stripping (same rule as linkCheck.ts).

/** Things worth saying about a web link before somebody taps it. */
export type UrlWarning =
  /** `http://` — not encrypted. */
  | 'insecure'
  /** The host has an IDN (punycode) label: letters from another alphabet that
   *  can impersonate a familiar name (`раураl.com`, Cyrillic). */
  | 'lookalike'
  /** `https://trusted.com@evil.example` — everything before `@` is a user name,
   *  and the link really goes to the host after it. */
  | 'credentials'
  /** A bare IP address rather than a name. */
  | 'ip'
  /** A link shortener: the real destination is hidden until it is opened. */
  | 'shortener'

export type ScanContent =
  /** A web address we will offer to open. `host` is what the browser's address
   *  bar will show — punycode for an IDN host, which is the point. */
  | { kind: 'web'; href: string; host: string; warnings: UrlWarning[] }
  /** A scheme that runs code or reaches into the device (`javascript:`,
   *  `data:`, `file:`…). Shown as text; never offered as a link. */
  | { kind: 'blocked'; scheme: string }
  /** `WIFI:T:WPA;S:name;P:secret;;` — the format every phone camera reads. */
  | { kind: 'wifi'; ssid: string; password: string; security: string; hidden: boolean }
  | { kind: 'tel'; href: string; number: string }
  | { kind: 'email'; href: string; address: string }
  | { kind: 'sms'; href: string; number: string }
  /** Plain text, a vCard, a product barcode number — nothing to open. */
  | { kind: 'text' }

/** Schemes that execute script, read local files or launch other apps with
 *  arbitrary arguments. Matched case-insensitively and after stripping the
 *  whitespace and control characters browsers themselves ignore, so
 *  `JaVa\tScRiPt:` is caught the same way the browser would run it. */
const BLOCKED_SCHEMES = [
  'javascript', 'vbscript', 'data', 'file', 'blob', 'intent', 'about',
  'chrome', 'chrome-extension', 'content', 'ms-msdt', 'search-ms', 'filesystem',
]

/** The common public shorteners. Not exhaustive and not meant to be: the
 *  warning is "you can't see where this goes", which is true of these, and
 *  missing one costs a missing hint, never a wrong one. */
const SHORTENERS = new Set([
  'bit.ly', 'bitly.com', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'tiny.cc', 'rb.gy',
  't.ly', 'v.gd', 'bl.ink', 'short.io', 's.id', 'qrco.de', 'lnkd.in',
])

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/** `WIFI:` field values escape `\ ; , : "` with a backslash. */
function wifiFields(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  let key = ''
  let value = ''
  let inValue = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\' && i + 1 < body.length) {
      if (inValue) value += body[i + 1]
      else key += body[i + 1]
      i++
      continue
    }
    if (!inValue && ch === ':') {
      inValue = true
      continue
    }
    if (ch === ';') {
      if (key) out[key.trim().toUpperCase()] = value
      key = ''
      value = ''
      inValue = false
      continue
    }
    if (inValue) value += ch
    else key += ch
  }
  if (key) out[key.trim().toUpperCase()] = value
  return out
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Warnings for a parsed http(s) URL. Exported for the tests. */
export function urlWarnings(url: URL): UrlWarning[] {
  const warnings: UrlWarning[] = []
  const host = url.hostname.toLowerCase()
  if (url.protocol === 'http:') warnings.push('insecure')
  if (url.username || url.password) warnings.push('credentials')
  if (host.split('.').some((label) => label.startsWith('xn--'))) warnings.push('lookalike')
  if (IPV4.test(host) || host.startsWith('[')) warnings.push('ip')
  if (SHORTENERS.has(host.replace(/^www\./, ''))) warnings.push('shortener')
  return warnings
}

export function classifyScan(raw: string): ScanContent {
  const text = raw.trim()
  if (!text) return { kind: 'text' }

  // Browsers strip ASCII tab/newline anywhere in a URL and leading C0 controls
  // and spaces before reading the scheme, so do the same before judging it.
  const squashed = text.replace(/[\u0000- ]/g, '').toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(squashed)?.[1]
  if (scheme && BLOCKED_SCHEMES.includes(scheme)) return { kind: 'blocked', scheme }

  const lower = text.toLowerCase()

  if (lower.startsWith('wifi:')) {
    const f = wifiFields(text.slice(5))
    if (f.S !== undefined) {
      return {
        kind: 'wifi',
        ssid: f.S,
        password: f.P ?? '',
        security: (f.T ?? '').toUpperCase(),
        hidden: (f.H ?? '').toLowerCase() === 'true',
      }
    }
    return { kind: 'text' }
  }

  if (lower.startsWith('tel:')) {
    const number = safeDecode(text.slice(4)).trim()
    if (number) return { kind: 'tel', href: `tel:${number.replace(/\s+/g, '')}`, number }
    return { kind: 'text' }
  }

  if (lower.startsWith('mailto:')) {
    const address = safeDecode(text.slice(7).split('?')[0]).trim()
    if (address) return { kind: 'email', href: text, address }
    return { kind: 'text' }
  }

  // `SMSTO:+447700900123:message` (the QR convention) and `sms:+447700900123`.
  if (lower.startsWith('smsto:') || lower.startsWith('sms:')) {
    const rest = text.slice(lower.startsWith('smsto:') ? 6 : 4)
    const number = safeDecode(rest.split(/[:?]/)[0]).trim()
    if (number) return { kind: 'sms', href: `sms:${number.replace(/\s+/g, '')}`, number }
    return { kind: 'text' }
  }

  // A web link is one token with an http(s) scheme. A sentence that merely
  // CONTAINS a URL is text: offering to open "the link" in it would mean
  // guessing which part the author meant.
  if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      const url = new URL(text)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return { kind: 'web', href: url.href, host: url.host, warnings: urlWarnings(url) }
      }
    } catch {
      /* not a parseable URL — fall through to text */
    }
  }

  return { kind: 'text' }
}
