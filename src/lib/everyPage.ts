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

/** The every-page set `a` belongs to: the mark the copies were made from. */
function setOf(a: ImageAnnotation): string {
  return a.everyPageOf ?? a.id
}

/**
 * Is `b` in that set — the original or one of its copies, wherever it has
 * been moved to since (James, 2026-10-22)?
 */
function inSet(b: Annotation, set: string): boolean {
  return b.type === 'image' && (b.id === set || b.everyPageOf === set)
}

/** Is `b` the copy of a picture with this `src` that would sit at (x, y) on `pageIndex`? */
function isCopyAt(b: Annotation, src: string, pageIndex: number, x: number, y: number): boolean {
  return b.type === 'image' && b.pageIndex === pageIndex && b.src === src && Math.abs(b.x - x) < 1 && Math.abs(b.y - y) < 1
}

/**
 * Copies of `a` for every other page, skipping a page that already has one of
 * its set (moved or not), or the same picture in the same place (a copy made
 * before copies were marked), so a second tap adds nothing. Empty means `a` is
 * already on every page — its button then offers to take the copies off
 * instead (`copiesOnOtherPages`).
 */
export function copiesForEveryPage(
  a: ImageAnnotation,
  sizes: PageSize[],
  existing: Annotation[],
  makeId: () => string
): ImageAnnotation[] {
  const from = sizes[a.pageIndex]
  if (!from) return []
  const set = setOf(a)
  const out: ImageAnnotation[] = []
  sizes.forEach((to, pageIndex) => {
    if (pageIndex === a.pageIndex) return
    const { x, y } = placeOnPage(a, from, to)
    const there = existing.some((b) => b.pageIndex === pageIndex && (inSet(b, set) || isCopyAt(b, a.src, pageIndex, x, y)))
    if (!there) out.push({ ...a, id: makeId(), pageIndex, x, y, everyPageOf: set })
  })
  return out
}

/**
 * The ids of `a`'s copies on the OTHER pages, for "Take off the other pages"
 * (James, 2026-10-19: "turn the button to the no-go symbol on top to show you
 * can then remove it off all (bar the selected one)"). `a` itself always
 * stays. A copy is any mark of its set, wherever it has been moved (2026-10-22),
 * or, for copies made before they were marked, the same picture where "Put on
 * every page" puts it.
 */
export function copiesOnOtherPages(a: ImageAnnotation, sizes: PageSize[], existing: Annotation[]): string[] {
  const from = sizes[a.pageIndex]
  if (!from) return []
  const set = setOf(a)
  const ids = new Set<string>()
  sizes.forEach((to, pageIndex) => {
    if (pageIndex === a.pageIndex) return
    const { x, y } = placeOnPage(a, from, to)
    for (const b of existing) {
      if (b.id !== a.id && b.pageIndex === pageIndex && (inSet(b, set) || isCopyAt(b, a.src, pageIndex, x, y))) ids.add(b.id)
    }
  })
  return [...ids]
}
