// How much canvas the viewer is allowed to hold, and the zoom ceiling that
// falls out of it.
//
// The viewer holds EVERY page of the open document, and each page can carry
// three full-size canvases:
//
//   • the PDF bitmap (`PdfPage`), drawn at `devicePixelRatio` for sharpness;
//   • Konva's scene canvas for the annotation layer, same again;
//   • Konva's hit canvas, which sits beside the scene canvas and is always at
//     CSS resolution.
//
// ⚠️ SINCE 2026-09-01 NONE OF THE THREE IS PER-DOCUMENT-PAGE: all three exist
// only for the band of pages around the reader (`PdfPage`'s `active`), and a
// page leaving that band drops its bitmap. So the document's whole cost is
// bounded by `MAX_RETAINED_PAGES`, however long it is, and that — not the page
// count — is what every budget below divides by. See `budgetedPageCount`.
//
// ⚠️ What that replaced, because the symptom was subtle and will be misread if
// it comes back: dividing by the page count meant a 251-page document gave each
// page 637k pixels when one page at reading size needs 652k merely to be 1:1,
// so `layerPixelRatio` fell to 1 and every page was drawn at HALF the linear
// resolution of the same page in a 6-page document. Measured on a retina Mac,
// page 1 of a 6-page PDF: 1190 backing pixels across 595 CSS. The same page of
// a 251-page PDF: 595. Nobody had asked for a blurrier document; it fell out of
// an allowance shared with 250 pages nobody was looking at.
//
// Every one of them costs 4 bytes a pixel, and their area grows with the SQUARE
// of the zoom. A three-page A4 document on a phone is ~30 MB of canvas at 100%
// and ~1.9 GB at 400% with a 3× screen — which is why pinching all the way in
// used to take the WKWebView out and reload the document from scratch
// (2026-08-26 bug report). The zoom therefore has to be capped by what the
// device can actually hold, not by a constant.
//
// Two levers, applied in this order, because losing retina sharpness on an
// already-magnified page is a far smaller loss than losing the ability to zoom:
//
//   1. `layerPixelRatio` spends whatever budget a page has left on drawing its
//      canvases above CSS resolution, and gives that up first — down to 1×,
//      never below, so a page is never rendered blurrier than it is displayed.
//   2. `maxZoomForDocument` is where even 1× stops fitting. That is the ceiling
//      the pinch, the wheel and the +/− buttons clamp to.

// A single canvas above ~16 M pixels is refused (or crashes the tab) on iOS
// Safari, whatever the budget says.
const MAX_CANVAS_PIXELS = 16_000_000

// The three canvases above, counted at CSS resolution — the floor a page costs
// once `layerPixelRatio` has given up everything it can.
const LAYERS_PER_PAGE = 3

// Total canvas the whole document may hold, in device pixels. ×4 for bytes:
// 256 MB on a handheld, 640 MB on a desktop. Handhelds get the smaller share
// because their per-tab ceiling is the hard kind — the web view is killed and
// the document reloads rather than swapping. 256 MB leaves a good 6× margin on
// the ~1.7 GB the reported crash was reaching, and still clears a three-page
// document at ~280% on a phone.
const HANDHELD_BUDGET_PIXELS = 64_000_000
const DESKTOP_BUDGET_PIXELS = 160_000_000

// Below this a "maximum zoom" stops being a limit and starts being a refusal to
// zoom, so a very long document keeps 100% however far over budget it is. Such
// a document is already over budget the moment it opens — the fix for that is
// to stop rasterizing pages that are nowhere near the viewport, not to take
// zooming away. (Half done: the interactive layers are now windowed, the PDF
// bitmaps are not — they are merely rendered in a sensible order. See
// `renderQueue`.)
const MIN_MAX_ZOOM = 1

// How many pages may hold canvases at once — the band `PdfViewer` keeps around
// the reader, which is what every budget here is divided by.
//
// ⚠️ This number and `PdfViewer`'s active band are ONE decision, so the viewer
// derives its `MAX_ACTIVE_RADIUS` from this rather than carrying its own: a
// band wider than this would quietly spend more canvas than the budget allows,
// and the failure mode of that is a killed web view, not a warning.
export const MAX_RETAINED_PAGES = 25

/**
 * The number of pages the budgets below should be shared between: the document
 * length for a short document, and the retained band for anything longer. A
 * document of 25 pages or fewer is budgeted EXACTLY as it always was.
 */
export function budgetedPageCount(numPages: number): number {
  return Math.min(Math.max(1, numPages), MAX_RETAINED_PAGES)
}

function isHandheld(): boolean {
  if (typeof window === 'undefined') return false
  // Touch-first AND small: a touchscreen laptop is not a phone, and neither is
  // a desktop browser with its window dragged narrow.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const touch = (navigator.maxTouchPoints ?? 0) > 0
  const small = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0) <= 820
  return (coarse || touch) && small
}

// Device memory, where the browser will say (Chromium only), as a multiplier on
// the budgets above. It can only ever tighten them: what kills a tab is the
// per-tab canvas ceiling rather than the amount of RAM in the machine, so a
// phone reporting 8 GB gets no more rope than one reporting 4 — while a 2 GB
// device gets less. Floored at 0.5 so a small answer cannot take zooming away
// entirely (the reading is coarse and clamped by the spec anyway).
function memoryScale(): number {
  const gb = (navigator as { deviceMemory?: number }).deviceMemory
  if (!gb) return 1
  return Math.max(0.5, Math.min(1, gb / 4))
}

/**
 * Total canvas this device may hold across the whole document, in pixels.
 *
 * Worked out once and remembered: it is read on every page render and every
 * annotation render, and neither the device's memory nor the size of its screen
 * changes while the tab is open.
 */
let budget: number | null = null
export function documentPixelBudget(): number {
  if (budget === null) {
    budget = (isHandheld() ? HANDHELD_BUDGET_PIXELS : DESKTOP_BUDGET_PIXELS) * memoryScale()
  }
  return budget
}

/**
 * The share of that budget one page gets.
 *
 * ⚠️ `pageCount` is the number of pages HELD AT ONCE, not the length of the
 * document — pass `budgetedPageCount(numPages)`. Passing the raw length is the
 * bug described at the top of this file.
 */
export function pagePixelBudget(pageCount: number): number {
  return documentPixelBudget() / Math.max(1, pageCount)
}

/**
 * The resolution multiplier for one page's canvases: `devicePixelRatio` when
 * there is room for it, stepping down towards 1 as the page's own budget runs
 * out. Capped at 2 — no perceptible sharpness gain above 2× for a PDF bitmap —
 * and at whatever keeps a single canvas under `MAX_CANVAS_PIXELS`.
 *
 * `cssWidth`/`cssHeight` are the page's displayed size at the current zoom;
 * `budget` is `pagePixelBudget(numPages)`.
 */
export function layerPixelRatio(cssWidth: number, cssHeight: number, budget: number): number {
  const area = Math.max(1, cssWidth * cssHeight)
  const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  // What is left of the page's budget once all three canvases are paid for at
  // CSS resolution, split between the two that can be drawn above it:
  //   area × (ratio² + ratio² + 1) ≤ budget  ⟺  ratio² ≤ (budget/area − 1) / 2
  const affordable = Math.sqrt(Math.max(1, (budget / area - 1) / 2))
  return Math.max(1, Math.min(raw, 2, affordable, Math.sqrt(MAX_CANVAS_PIXELS / area)))
}

/**
 * The highest zoom this document can be rendered at and still fit the budget —
 * the point where even CSS-resolution canvases stop fitting.
 *
 * `pageWidth`/`pageHeight` are one page's CSS size at 100% zoom; `hardMax` is
 * the viewer's own ceiling, which this never exceeds.
 *
 * ⚠️ `pageCount` is pages held at once — `budgetedPageCount(numPages)`. Before
 * the band was bounded this took the document's length, which is why a long
 * document could not be zoomed past 100% at all: the ceiling fell to
 * `MIN_MAX_ZOOM` on page count alone, whatever the device could actually hold.
 */
export function maxZoomForDocument(
  pageWidth: number,
  pageHeight: number,
  pageCount: number,
  hardMax: number
): number {
  const areaAtHundred = Math.max(1, pageWidth * pageHeight)
  const affordableArea = Math.min(
    pagePixelBudget(pageCount) / LAYERS_PER_PAGE,
    MAX_CANVAS_PIXELS
  )
  // Area grows with zoom², so the zoom that fits is the square root of the ratio.
  const zoom = Math.sqrt(affordableArea / areaAtHundred)
  // Down to a 5% step, so the readout lands on a round number and the ceiling
  // is under the budget rather than exactly on it.
  const stepped = Math.floor(zoom * 20) / 20
  return Math.max(MIN_MAX_ZOOM, Math.min(hardMax, stepped))
}
