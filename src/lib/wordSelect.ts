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

export function requestWordSelect(
  pageIndex: number,
  clientX: number,
  clientY: number,
  fromTool: Tool
) {
  pending = { pageIndex, clientX, clientY, fromTool, at: Date.now() }
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
