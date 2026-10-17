// "Put on every page" for a placed signature, stamp or picture (James,
// 2026-10-18: "on signatures and stamps give the option to place them on every
// page (they could pick a draft stamp etc)").
//
// Each copy is an ordinary, separate annotation: it can be moved or deleted on
// its own page afterwards. Imports nothing, so the unit test runs it under
// Node's type-stripping (scripts/everyPage.test.mjs).

import type { Annotation, ImageAnnotation } from '../types/annotations'

/** A page's size as the reader sees it, in the annotations' space (points). */
export type PageSize = { w: number; h: number }

/**
 * Where `a` goes on a page of `to`'s size, given it sits on a page of `from`'s
 * size: the same distance from the NEAREST edges, so a signature at the bottom
 * of a Letter page is at the bottom of an A4 one, not hanging in the middle —
 * then pulled back onto the page if that page is smaller.
 */
export function placeOnPage(a: Pick<ImageAnnotation, 'x' | 'y' | 'width' | 'height'>, from: PageSize, to: PageSize): { x: number; y: number } {
  const across = a.x + a.width / 2 <= from.w / 2 ? a.x : to.w - (from.w - a.x)
  const down = a.y + a.height / 2 <= from.h / 2 ? a.y : to.h - (from.h - a.y)
  const clamp = (v: number, size: number, room: number) => Math.max(0, Math.min(v, room - size))
  return { x: clamp(across, a.width, to.w), y: clamp(down, a.height, to.h) }
}

/**
 * Copies of `a` for every other page, skipping a page that already has the
 * same picture in the same place (so a second tap adds nothing).
 */
export function copiesForEveryPage(
  a: ImageAnnotation,
  sizes: PageSize[],
  existing: Annotation[],
  makeId: () => string
): ImageAnnotation[] {
  const from = sizes[a.pageIndex]
  if (!from) return []
  const out: ImageAnnotation[] = []
  sizes.forEach((to, pageIndex) => {
    if (pageIndex === a.pageIndex) return
    const { x, y } = placeOnPage(a, from, to)
    const already = existing.some(
      (b) => b.type === 'image' && b.pageIndex === pageIndex && b.src === a.src && Math.abs(b.x - x) < 1 && Math.abs(b.y - y) < 1
    )
    if (!already) out.push({ ...a, id: makeId(), pageIndex, x, y })
  })
  return out
}
