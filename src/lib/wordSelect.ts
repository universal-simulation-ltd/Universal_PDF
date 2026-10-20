// Double-click a word with the Select tool → switch to Select text and
// highlight that word.
//
// The two halves of that live in different components: the Konva annotation
// Stage sees the double-click (the text layer is inert and EMPTY while any
// other tool is active), but only TextSelectLayer knows when the page's
// transparent text spans finally exist to be selected. So the click parks a
// request here, flips the tool, and the layer for that page picks it up once
// its spans are on screen.
//
// ⚠️ The request is per PAGE: turning the tool on builds the text layer for
// every on-screen page, and whichever finishes first would otherwise consume
// the request and hit-test against spans that are not there yet.

import type { Tool } from '../types/annotations'
import type { PDFDocumentProxy } from './pdfjs'
import { extractPageText, type PageText } from './pdfText'

export type WordSelectRequest = {
  pageIndex: number
  clientX: number
  clientY: number
  // The tool to go back to when the double-click turns out to have landed on
  // blank page rather than on a word: switching tools is the user's decision,
  // and blank space shouldn't quietly make it for them.
  fromTool: Tool
  at: number
}

let pending: WordSelectRequest | null = null

// Where a finger's word selection hands back to. On a touch screen Select text
// is never picked by hand (the phone has no button for it): a press-and-hold
// or a double-tap on a word switches to it, and letting go of the selection
// (a tap off it, or Copy) switches back — see TextCopyPill. Null while Select
// text was chosen from the toolbar, which stays chosen.
let returnTo: Tool | null = null
export const wordSelectReturnTo = () => returnTo
export const clearWordSelectReturn = () => { returnTo = null }

export function requestWordSelect(
  pageIndex: number,
  clientX: number,
  clientY: number,
  fromTool: Tool
) {
  pending = { pageIndex, clientX, clientY, fromTool, at: Date.now() }
  returnTo = fromTool
}

export function clearWordSelect() {
  pending = null
}

// How long a parked request stays good. Extracting a page's text is fast, but
// if it never arrives (extraction failed, page scrolled out) the request must
// not sit around and fire on some unrelated later switch to Select text.
const STALE_MS = 3000

export function takeWordSelect(pageIndex: number): WordSelectRequest | null {
  if (!pending || pending.pageIndex !== pageIndex) return null
  const req = pending
  pending = null
  return Date.now() - req.at > STALE_MS ? null : req
}

type CaretHit = { node: Node; offset: number }

// Chrome/Safari have caretRangeFromPoint (deprecated but present); Firefox has
// the standard caretPositionFromPoint. Both are needed to cover the browsers
// the app ships to.
function caretFromPoint(clientX: number, clientY: number): CaretHit | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(clientX, clientY)
    if (range) return { node: range.startContainer, offset: range.startOffset }
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(clientX, clientY)
    if (pos) return { node: pos.offsetNode, offset: pos.offset }
  }
  return null
}

// Letters, digits and underscore make a word. Apostrophes join one ("don't",
// "James’s") but never start or end it — a quoted ‘word’ selects as the word.
const WORD = /[\p{L}\p{N}_]/u
const JOINER = /['’]/

/**
 * Select the word under a viewport point, the way a native double-click would.
 * Returns the selected text, or null if the point wasn't on a word.
 */
export function selectWordAtPoint(clientX: number, clientY: number): string | null {
  const hit = caretFromPoint(clientX, clientY)
  if (!hit || hit.node.nodeType !== Node.TEXT_NODE) return null
  const text = hit.node.nodeValue ?? ''
  const isWordish = (i: number) => {
    const ch = text[i]
    return ch !== undefined && (WORD.test(ch) || JOINER.test(ch))
  }

  // ⚠️ caretRangeFromPoint answers for a point ANYWHERE over the text layer:
  // blank space halfway down the page resolves to the nearest character up in
  // the text, which would select a word nowhere near the double-click. So the
  // character it names has to actually be under the pointer.
  //
  // The caret lands BETWEEN characters, so a click on the right-hand half of a
  // letter reports the offset past it — both sides of the caret are candidates,
  // and the one whose own box contains the point wins.
  const charRect = (i: number) => {
    const r = document.createRange()
    r.setStart(hit.node, i)
    r.setEnd(hit.node, i + 1)
    return r.getBoundingClientRect()
  }
  const covers = (i: number) => {
    const b = charRect(i)
    if (!b.width && !b.height) return false
    const pad = 1
    return (
      clientX >= b.left - pad &&
      clientX <= b.right + pad &&
      clientY >= b.top - pad &&
      clientY <= b.bottom + pad
    )
  }

  let start = -1
  for (const candidate of [Math.min(hit.offset, text.length - 1), hit.offset - 1]) {
    if (candidate < 0 || candidate >= text.length) continue
    if (covers(candidate)) {
      start = candidate
      break
    }
  }
  if (start < 0 || !isWordish(start)) return null

  let end = start + 1
  while (start > 0 && isWordish(start - 1)) start -= 1
  while (end < text.length && isWordish(end)) end += 1
  // Trim joiners that ended up on the outside.
  while (start < end && JOINER.test(text[start])) start += 1
  while (end > start && JOINER.test(text[end - 1])) end -= 1
  if (start >= end) return null

  const selection = window.getSelection()
  if (!selection) return null
  const range = document.createRange()
  range.setStart(hit.node, start)
  range.setEnd(hit.node, end)
  selection.removeAllRanges()
  selection.addRange(range)
  return text.slice(start, end)
}

// ── Is there text under a finger? ─────────────────────────────────────────
// A press-and-hold on a phone means two things: on a word, select it (James,
// 2026-10-20: "tap and hold doesn't consistently highlight text"); on empty
// page, start the box that selects several marks. The text layer is empty
// until Select text is on, so the hold asks the page's text runs instead —
// fetched when the finger lands, well before the hold is up.

const pageTexts = new WeakMap<PDFDocumentProxy, Map<number, Promise<PageText | null>>>()
const settledTexts = new WeakMap<PDFDocumentProxy, Map<number, PageText | null>>()

/** The page's text runs, extracted once per document. Null when there are none to be had. */
export function pageTextFor(doc: PDFDocumentProxy, pageIndex: number): Promise<PageText | null> {
  let docs = pageTexts.get(doc)
  if (!docs) pageTexts.set(doc, (docs = new Map()))
  let p = docs.get(pageIndex)
  if (!p) {
    p = doc
      .getPage(pageIndex + 1)
      .then((page) => extractPageText(page, pageIndex))
      .catch(() => null)
      .then((t) => {
        let done = settledTexts.get(doc)
        if (!done) settledTexts.set(doc, (done = new Map()))
        done.set(pageIndex, t)
        return t
      })
    docs.set(pageIndex, p)
  }
  return p
}

/**
 * Whether a run of the page's own text lies under page point (x, y), in PDF
 * points. Undefined while the page's text is still being fetched.
 */
export function textUnder(doc: PDFDocumentProxy, pageIndex: number, x: number, y: number): boolean | undefined {
  const done = settledTexts.get(doc)
  if (!done || !done.has(pageIndex)) return undefined
  const t = done.get(pageIndex)
  if (!t) return false
  // A fingertip is not a pointer: a little grace round each run.
  const pad = 2
  return t.items.some(
    (it) =>
      x >= it.x - pad && x <= it.x + it.w + pad && y >= it.y - pad && y <= it.y + it.h + pad &&
      t.text.slice(it.start, it.start + it.len).trim() !== ''
  )
}

/**
 * Drag on from a word a hold selected: the selection runs from that word to
 * the character under the finger, either way, as iOS's own does. Does nothing
 * until the word is selected, or over a point with no text.
 */
export function extendWordSelectionTo(clientX: number, clientY: number) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  if (!word) {
    const r = selection.getRangeAt(0)
    if (r.collapsed || !(r.startContainer.parentElement?.closest('.textLayer'))) return
    word = r.cloneRange()
  }
  const hit = caretFromPoint(clientX, clientY)
  if (!hit || hit.node.nodeType !== Node.TEXT_NODE || !hit.node.parentElement?.closest('.textLayer')) return
  const side = word.comparePoint(hit.node, hit.offset)
  if (side < 0) {
    selection.setBaseAndExtent(word.endContainer, word.endOffset, hit.node, hit.offset)
  } else if (side > 0) {
    selection.setBaseAndExtent(word.startContainer, word.startOffset, hit.node, hit.offset)
  } else {
    selection.removeAllRanges()
    selection.addRange(word)
  }
}
// The word the hold selected, which a drag extends from. Forgotten on lift.
let word: Range | null = null
export function endWordSelectionDrag() {
  word = null
}
