// Turning a drawn shape (box or circle) into a redaction of that same shape —
// the one place it is decided, for every way in:
//
//   • the floating "Redact this area" button on a selected shape,
//   • "Redact instead" in the warning the bucket raises on a box/circle,
//   • a tap with the Redact tool on (or inside) a shape, like a fill bucket.
//
// A circle redacts its INSIDE, the area a Fill would paint, not the square
// round it (James, 2026-10-12; and 2026-10-13, when "Redact instead" and the
// Redact tool still gave him a square). A box redacts its bounds.
//
// Pure (no canvas, no store). Coordinates are page units.

import type { Annotation, EllipseAnnotation, RectAnnotation, RedactAnnotation } from '../types/annotations'

export type RedactableShape = RectAnnotation | EllipseAnnotation

export function isRedactableShape(a: Annotation | undefined | null): a is RedactableShape {
  return !!a && (a.type === 'rect' || a.type === 'ellipse')
}

/**
 * The redaction that replaces `shape`: same page, same box, and for a circle /
 * ellipse `shape: 'ellipse'` so only the inscribed ellipse is redacted.
 * `fill` is the block's colour; left out, it bakes black (the privacy default).
 *
 * ⚠️ A redaction has no rotation, so a ROTATED box or ellipse redacts its
 * unrotated box. A rotated circle is unaffected (it looks the same).
 */
export function redactionFromShape(shape: RedactableShape, id: string, fill?: string): RedactAnnotation {
  return {
    id,
    pageIndex: shape.pageIndex,
    type: 'redact',
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    ...(shape.type === 'ellipse' ? { shape: 'ellipse' as const } : {}),
    ...(fill ? { fill } : {})
  }
}

/**
 * Whether page point (px, py) is on or inside `shape` — the inside counts even
 * for an unfilled outline. `slop`
 * widens the shape by that much on every side so a tap on the stroke itself
 * still counts. Rotation is honoured the way the shapes are drawn: a box turns
 * about its top-left corner, an ellipse about its centre.
 */
export function shapeContainsPoint(shape: RedactableShape, px: number, py: number, slop = 0): boolean {
  const rad = (-(shape.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  if (shape.type === 'rect') {
    const dx = px - shape.x
    const dy = py - shape.y
    const lx = dx * cos - dy * sin
    const ly = dx * sin + dy * cos
    return lx >= -slop && lx <= shape.width + slop && ly >= -slop && ly <= shape.height + slop
  }
  const rx = shape.width / 2 + slop
  const ry = shape.height / 2 + slop
  if (rx <= 0 || ry <= 0) return false
  const dx = px - (shape.x + shape.width / 2)
  const dy = py - (shape.y + shape.height / 2)
  const lx = dx * cos - dy * sin
  const ly = dx * sin + dy * cos
  return (lx / rx) ** 2 + (ly / ry) ** 2 <= 1
}

/**
 * The topmost box/circle on `pageIndex` that (px, py) falls on or inside, with
 * its index in `annotations` (the drawing order — later is on top), or null.
 */
export function topShapeAt(
  annotations: Annotation[],
  pageIndex: number,
  px: number,
  py: number,
  slop = 0
): { shape: RedactableShape; index: number } | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i]
    if (a.pageIndex !== pageIndex || !isRedactableShape(a)) continue
    if (shapeContainsPoint(a, px, py, slop)) return { shape: a, index: i }
  }
  return null
}
