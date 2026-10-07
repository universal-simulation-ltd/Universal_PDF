import { dangerousScheme, linkReasons, type LinkReason } from '@unisim/sdk/link-safety'
import { readPageScroll } from './pageScroll'

// Following a link out of a PDF.
//
// A PDF's link annotations carry a URI straight out of the file, so the file
// decides where the click goes. PDF.js already refuses the obvious abuses when
// it fills in `url` (it leaves the raw string in `unsafeUrl` instead), but this
// is the gate the viewer actually opens, so it does its own check rather than
// inheriting one: anything that isn't a scheme a document could plausibly want
// is dropped. `javascript:` and `data:` are the ones that matter — both would
// run in the app's own origin, where the user's document is.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/** Why a followable link asks first — the SDK's link-safety reasons, less
 *  `dangerous-scheme` (a link with one of those is `blocked`, never followed). */
export type UrlWarning = Exclude<LinkReason, 'dangerous-scheme'>

/**
 * What clicking a PDF's link should do.
 *
 * • `follow` — open `href`. `warnings` is empty for an ordinary link; anything
 *   in it means the click asks first, showing `host` (what the address bar will
 *   really say — punycode for an IDN host, the part AFTER the `@` for a
 *   `trusted.com@evil.example` link).
 * • `blocked` — a `javascript:`, `data:`, `file:`… address. Never followed;
 *   the click says why instead of silently doing nothing.
 */
export type PdfLinkVerdict =
  | { kind: 'follow'; href: string; host: string | null; warnings: UrlWarning[] }
  | { kind: 'blocked'; scheme: string }

/**
 * Judge a link annotation's URI. Null for one there is nothing to do with (a
 * relative address, an unknown scheme) — the viewer drops those.
 *
 * ⚠️ The blocked-scheme test runs FIRST and on the raw string, using
 * `@unisim/sdk/link-safety`'s normalisation (`JaVa\tScRiPt:` is caught the way
 * a browser would run it), so nothing below can be talked into following one.
 * The warnings are the same module's `linkReasons`, so a PDF's link is judged
 * the way every suite app judges one.
 */
export function judgePdfLink(raw: unknown): PdfLinkVerdict | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const scheme = dangerousScheme(raw)
  if (scheme) return { kind: 'blocked', scheme }
  const href = safeLinkUrl(raw.trim())
  if (!href) return null
  const url = new URL(href)
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return { kind: 'follow', href, host: url.host, warnings: linkReasons(url) as UrlWarning[] }
  }
  // mailto: / tel: — the OS opens Mail or the dialler; nothing to warn about.
  return { kind: 'follow', href, host: null, warnings: [] }
}

/**
 * The href to hand an <a>, or null if we won't follow it.
 *
 * ⚠️ Takes an ABSOLUTE url only — a relative one has no protocol to check, and
 * would resolve against the app's own origin. PDF.js's `url` field is already
 * absolute (it applies the document's /Base); nothing else should reach here.
 */
export function safeLinkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : null
}

/**
 * What someone TYPED into "Link URL", as the href to store — or null if it
 * isn't something a link can point at.
 *
 * People type `example.com`, not `https://example.com`, and that used to be
 * stored as it stood: a RELATIVE href, which in the editor resolved against the
 * app's own origin and in the exported PDF became a /URI no reader could
 * follow. A bare address gets `https://`, a bare email address `mailto:`.
 * Anything with a scheme goes through `safeLinkUrl`, so `javascript:` and
 * `data:` can't be typed (or pasted) into a document's links either.
 */
export function userLinkHref(input: string): string | null {
  const raw = input.trim()
  if (!raw || /\s/.test(raw)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // `localhost:3000` reads as a scheme to URL — treat host:port as an address.
    if (/^[\w.-]+:\d+(\/|$)/.test(raw)) return safeLinkUrl(`https://${raw}`)
    return safeLinkUrl(raw)
  }
  if (/^[^@/]+@[^@/]+\.[^@/]+$/.test(raw)) return safeLinkUrl(`mailto:${raw}`)
  if (raw.startsWith('//')) return safeLinkUrl(`https:${raw}`)
  // A host needs a dot (example.com, www.gov.uk) — "hello" is not an address.
  const host = raw.split(/[/?#]/)[0]
  if (!/^[\w-]+(\.[\w-]+)+(:\d+)?$/.test(host)) return null
  return safeLinkUrl(`https://${raw}`)
}

/**
 * The address to actually open once the reader has said "Open anyway".
 *
 * A `trusted.com@evil.example` link opens WITHOUT its user-info: the reader has
 * been shown that the host is evil.example, so that is where they go, and the
 * disguise is not sent along as a login. Chromium refuses to `window.open` a
 * URL with embedded credentials at all, so leaving it on would make "Open
 * anyway" silently do nothing.
 */
export function hrefToOpen(href: string): string {
  try {
    const url = new URL(href)
    if (!url.username && !url.password) return href
    url.username = ''
    url.password = ''
    return url.href
  } catch {
    return href
  }
}

/** A url short enough to sit in a tooltip without filling the screen. */
export function linkLabel(url: string): string {
  return url.length > 80 ? `${url.slice(0, 77)}…` : url
}

/**
 * Scroll a page of the open document into view — how an internal link (a /GoTo
 * destination) lands. Same mechanism the page navigator uses: every page keeps
 * its layout box whether or not it currently holds pixels, so a page far down a
 * long document can be scrolled to before it has rendered.
 */
export function scrollToPage(pageIndex: number): void {
  document
    .querySelector(`[data-page-index="${pageIndex}"]`)
    ?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      // Along a row, to the middle of the screen, where the row centres its
      // pages (page 1 opens there) — see lib/pageScroll.
      inline: readPageScroll() === 'horizontal' ? 'center' : 'nearest',
    })
}
