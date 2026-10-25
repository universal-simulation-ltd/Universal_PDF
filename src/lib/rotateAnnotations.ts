import type { Annotation } from '../types/annotations'

// A page turned a quarter (or two, or three) clockwise carries its marks with
// it, so each stays on the words it was put on (the phone's Pages page,
// James, 2026-10-25: "rotate … must really rotate the page in the saved PDF").
//
// Marks are kept in the reader's view of the page at scale 1 — the CropBox
// turned by the page's /Rotate, y running down (lib/export, `pageFrame`) — so
// turning the page changes that view: a W×H page becomes H×W, and a point
// (x, y) on it goes to (H − y, x) for each quarter clockwise.
//
// How each kind of mark goes with it:
//   • drawn lines (points): every point moves.
//   • the boxes that turn (text, image, rectangle, tick, cross): their anchor
//     moves and they turn with the page, about the same point the canvas and
//     the export turn them about — the top-left, or the middle for an ellipse.
//   • black-out boxes (never turned): the box is redrawn around the area it
//     covered, so it still covers exactly that.
//   • "Sign here" boxes and page numbers stay upright: a box to sign in, or a
//     number to read, on its side is no use. The box keeps its middle on the
//     same spot; a page number keeps its place at the foot of the turned page.
//
// Pure, no DOM, so scripts/rotateAnnotations.test.mjs can pin it.

/** The size of a page as the reader sees it, at scale 1. */
export interface ViewSize {
  w: number
  h: number
}

/** A quarter turn clockwise of the point (x, y) on a page `size` big. */
function turnPoint(x: number, y: number, size: ViewSize): [number, number] {
  return [size.h - y, x]
}

/** One quarter turn clockwise; `size` is the page BEFORE the turn. */
function turnOnce(a: Annotation, size: ViewSize): Annotation {
  const after: ViewSize = { w: size.h, h: size.w }
  switch (a.type) {
    case 'draw': {
      const points = a.points.slice()
      for (let i = 0; i + 1 < points.length; i += 2) {
        const [x, y] = turnPoint(points[i], points[i + 1], size)
        points[i] = x
        points[i + 1] = y
      }
      return { ...a, points }
    }
    case 'redact': {
      // The box that covered (x, y, w, h) now covers the same area turned.
      const out = { ...a, x: size.h - (a.y + a.height), y: a.x, width: a.height, height: a.width }
      if (a.points) {
        const points = a.points.slice()
        for (let i = 0; i + 1 < points.length; i += 2) {
          const [x, y] = turnPoint(points[i], points[i + 1], size)
          points[i] = x
          points[i + 1] = y
        }
        out.points = points
      }
      return out
    }
    case 'sigfield': {
      const cx = a.x + a.width / 2
      const cy = a.y + a.height / 2
      const [nx, ny] = turnPoint(cx, cy, size)
      return { ...a, x: nx - a.width / 2, y: ny - a.height / 2 }
    }
    case 'ellipse': {
      const cx = a.x + a.width / 2
      const cy = a.y + a.height / 2
      const [nx, ny] = turnPoint(cx, cy, size)
      return { ...a, x: nx - a.width / 2, y: ny - a.height / 2, rotation: turn(a.rotation) }
    }
    case 'text': {
      if (a.pageNumber) {
        // Upright, at the foot of the turned page, the same way along it.
        const m = a.pageNumber
        const anchorX = m.align === 'left' ? m.anchorX : m.align === 'right' ? after.w - (size.w - m.anchorX) : after.w / 2
        return {
          ...a,
          x: a.x + (anchorX - m.anchorX),
          y: after.h - (size.h - a.y),
          pageNumber: { ...m, anchorX },
        }
      }
      const [x, y] = turnPoint(a.x, a.y, size)
      return { ...a, x, y, rotation: turn(a.rotation) }
    }
    case 'rect':
    case 'image':
    case 'tick':
    case 'cross': {
      const [x, y] = turnPoint(a.x, a.y, size)
      return { ...a, x, y, rotation: turn(a.rotation) } as Annotation
    }
  }
  return a
}

function turn(rotation: number | undefined): number {
  return ((rotation ?? 0) + 90) % 360
}

/**
 * The marks of a page turned `quarters` quarter turns clockwise (any whole
 * number; 4 is no turn at all). `size` is the page as it stood before.
 */
export function turnAnnotations(annotations: Annotation[], quarters: number, size: ViewSize): Annotation[] {
  const q = ((quarters % 4) + 4) % 4
  if (!q) return annotations
  return annotations.map((a) => {
    let out = a
    let s = size
    for (let i = 0; i < q; i++) {
      out = turnOnce(out, s)
      s = { w: s.h, h: s.w }
    }
    return out
  })
}
