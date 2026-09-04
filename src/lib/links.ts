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
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
