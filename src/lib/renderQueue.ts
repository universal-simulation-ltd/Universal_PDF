// Which page gets rasterized next.
//
// ⚠️ The viewer mounts a `PdfPage` for EVERY page of the document at once —
// there is no windowing (see `renderBudget.ts`, which sizes the memory budget
// around exactly that). Every one of those pages then asked pdf.js to
// rasterize it in the same tick, and the result was measured on a 400-page
// document: the document reached the store in **0.09 s** and page 1 did not
// appear until **7.68 s** — at the same instant as page 400. Nothing was slow
// in itself; page 1 was simply queued behind 399 pages of work nobody was
// looking at, so the viewer sat blank for the whole eight seconds and then
// filled in all at once.
//
// This is the gate that fixes the ORDER. Pages still all render, and the total
// work is unchanged — but a small number rasterize at a time, nearest the
// reader first, so the first screenful lands immediately and the rest arrive
// behind it.
//
// ⚠️ It gates RASTERIZATION only. `doc.getPage()` and the page's size are left
// ungated on purpose: the box each page occupies is what gives the document its
// scroll height, and holding that back would leave the scrollbar wrong and
// "go to page 300" with nowhere to go.

// How many pages may rasterize at once. Each one costs a pdf.js worker task and
// a full-size offscreen canvas on the main thread, so this is the knob that
// trades "page 1 appears sooner" against "the whole document finishes sooner".
// 3 keeps the worker busy without letting the first screenful be crowded out.
const CONCURRENCY = 3

// The page the reader is nearest. Priority is distance from here, so opening a
// document renders 1, 2, 3… and jumping to page 300 renders 300 outwards rather
// than making it wait behind 299 pages it has already scrolled past.
let anchorPage = 0

interface Waiter {
  pageIndex: number
  wake: (go: boolean) => void
}

const waiting = new Set<Waiter>()
let running = 0

export interface RenderSlot {
  /**
   * Resolves `true` when this page may rasterize, or `false` if the slot was
   * released while still queued (the page unmounted, or the zoom moved on).
   * ⚠️ Resolves rather than rejects — a rejection here would be an unhandled
   * one every time a document is closed mid-load.
   */
  readonly granted: Promise<boolean>
  /** Give the slot back, or leave the queue if it was never granted. */
  release(): void
}

function pump(): void {
  while (running < CONCURRENCY && waiting.size > 0) {
    let best: Waiter | null = null
    let bestKey = Infinity
    for (const w of waiting) {
      // Distance from the reader, then document order for the tie — which is
      // what makes a fresh document render 1, 2, 3… rather than 1, 3, 2.
      const key = Math.abs(w.pageIndex - anchorPage) * 2 + (w.pageIndex < anchorPage ? 1 : 0)
      if (key < bestKey) {
        bestKey = key
        best = w
      }
    }
    if (!best) return
    waiting.delete(best)
    running++
    best.wake(true)
  }
}

/** Tell the queue which page the reader is looking at. */
export function setAnchorPage(pageIndex: number): void {
  if (!Number.isFinite(pageIndex) || pageIndex === anchorPage) return
  anchorPage = pageIndex
  // Nothing to pump — a change of anchor only reorders what is already queued,
  // and the next release picks from the new order.
}

/** Ask for permission to rasterize `pageIndex`. */
export function requestRenderSlot(pageIndex: number): RenderSlot {
  let waiter: Waiter | null = null
  let settled = false
  let holdsSlot = false

  const granted = new Promise<boolean>((resolve) => {
    waiter = {
      pageIndex,
      wake: (go: boolean) => {
        settled = true
        holdsSlot = go
        resolve(go)
      }
    }
    waiting.add(waiter)
    pump()
  })

  return {
    granted,
    release() {
      if (!settled) {
        // Never got a slot — just leave the queue.
        if (waiter) waiting.delete(waiter)
        waiter?.wake(false)
        return
      }
      if (holdsSlot) {
        holdsSlot = false
        running--
        pump()
      }
    }
  }
}

/** Test seam: the queue is module state, and specs need a clean one. */
export function __resetRenderQueue(): void {
  for (const w of waiting) w.wake(false)
  waiting.clear()
  running = 0
  anchorPage = 0
}

/** Test seam. */
export function __renderQueueState(): { running: number; waiting: number; anchorPage: number } {
  return { running, waiting: waiting.size, anchorPage }
}

export const RENDER_CONCURRENCY = CONCURRENCY
