// Where a shape dropped by a single TAP lands, rather than one swept out by a
// drag: a default-sized box centred on the tap, nudged back onto the page so a
// tap near an edge doesn't leave half of it hanging off.
//
// Pure (no canvas, no store), so it is unit-tested directly — see
// scripts/tapPlacement.test.mjs. Coordinates are page units, the annotation
// store's native space.

export type TapBox = { x: number; y: number; width: number; height: number }

/**
 * A `width` x `height` box centred on (x, y), shifted just enough to lie wholly
 * on a `pageW` x `pageH` page — flush with an edge the tap was near, never
 * pushed further in than that. A box bigger than the page pins to its origin.
 */
export function centreOnTap(
  x: number,
  y: number,
  width: number,
  height: number,
  pageW: number,
  pageH: number
): TapBox {
  const clamp = (v: number, size: number, page: number) =>
    Math.min(Math.max(v - size / 2, 0), Math.max(page - size, 0))
  return { x: clamp(x, width, pageW), y: clamp(y, height, pageH), width, height }
}

// The redaction a tap drops (James, 2026-09-14: "Tap drops a box"), in page
// POINTS — unlike the Box and Circle defaults, which are display pixels so they
// look the same at any zoom. A redaction exists to cover the document's own
// text, and that text is sized in points: a display-pixel default would cover a
// word at 100% and half a paragraph zoomed out. 16pt is one line of 11–12pt body
// text with its leading; 72pt (an inch) is a word or two. It lands selected, so
// stretching it over the rest of a name is one drag of a handle.
//
// Not sized from the word under the tap: the page's text is only extracted
// while Select text is the tool (and asynchronously), so there is nothing to
// read synchronously when the Redact tool's finger lifts.
export const TAP_REDACT_SIZE_PT = { width: 72, height: 16 }

export function tapRedactBox(x: number, y: number, pageW: number, pageH: number): TapBox {
  const width = Math.min(TAP_REDACT_SIZE_PT.width, pageW)
  const height = Math.min(TAP_REDACT_SIZE_PT.height, pageH)
  return centreOnTap(x, y, width, height, pageW, pageH)
}
