// Page numbers (James, 2026-10-18), at the foot of every page: left, centre or
// right, as "1" or "Page 1 of 3". They are ordinary text marks carrying a
// `pageNumber` record (types/annotations `PageNumberMark`). Imports only
// types, so scripts/pageNumbers.test.mjs runs it under Node's type-stripping;
// the width of the words comes in as `measure`, which the app answers with the
// canvas layout every other text mark uses.

import type { Annotation, PageNumberMark, TextAnnotation } from '../types/annotations'
import type { PageSize } from './everyPage'

export type PageNumberAlign = PageNumberMark['align']

/** Type size and distance from the page edges, in points. */
export const PAGE_NUMBER_SIZE = 10
export const PAGE_NUMBER_MARGIN = 36
/** Slate 700: reads as the document's own ink rather than a marker's. */
export const PAGE_NUMBER_INK = '#334155'

export function pageNumberText(template: string, n: number, total: number): string {
  return template.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total))
}

export function isPageNumber(a: Annotation): a is TextAnnotation & { pageNumber: PageNumberMark } {
  return a.type === 'text' && !!a.pageNumber
}

/** Where a number of width `w` starts, set `align` from `anchorX`. */
function startX(mark: PageNumberMark, w: number): number {
  if (mark.align === 'left') return mark.anchorX
  if (mark.align === 'right') return mark.anchorX - w
  return mark.anchorX - w / 2
}

/**
 * A number for every page. `lineHeight` is the text layout's line height (a
 * text mark's y is the top of its line box), so the words sit
 * PAGE_NUMBER_MARGIN above the foot of the page.
 */
export function buildPageNumbers(
  sizes: PageSize[],
  template: string,
  align: PageNumberAlign,
  measure: (a: TextAnnotation) => number,
  makeId: () => string,
  lineHeight: number
): TextAnnotation[] {
  return sizes.map((size, pageIndex) => {
    const anchorX = align === 'left' ? PAGE_NUMBER_MARGIN : align === 'right' ? size.w - PAGE_NUMBER_MARGIN : size.w / 2
    const mark: PageNumberMark = { template, align, anchorX }
    const a: TextAnnotation = {
      id: makeId(),
      type: 'text',
      pageIndex,
      x: 0,
      y: size.h - PAGE_NUMBER_MARGIN - PAGE_NUMBER_SIZE * lineHeight,
      text: pageNumberText(template, pageIndex + 1, sizes.length),
      color: PAGE_NUMBER_INK,
      fontSize: PAGE_NUMBER_SIZE,
      fontFamily: 'sans',
      pageNumber: mark
    }
    return { ...a, x: startX(mark, measure(a)) }
  })
}

/**
 * The page numbers that no longer say the right thing — after a page was
 * moved, added or deleted — with the words (and, centred or right, the start)
 * that put them right. A number someone retyped by hand is theirs: only a
 * mark whose words still read as SOME page of its template is touched.
 */
export function pageNumberFixes(
  annotations: Annotation[],
  numPages: number,
  measure: (a: TextAnnotation) => number
): { id: string; patch: Partial<TextAnnotation> }[] {
  const out: { id: string; patch: Partial<TextAnnotation> }[] = []
  for (const a of annotations) {
    if (!isPageNumber(a) || a.runs?.length) continue
    const want = pageNumberText(a.pageNumber.template, a.pageIndex + 1, numPages)
    if (a.text === want) continue
    const pattern = new RegExp('^' + a.pageNumber.template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{n\\?\}|\\?\{total\\?\}/g, '\\d+') + '$')
    if (!pattern.test(a.text)) continue
    const next = { ...a, text: want }
    out.push({ id: a.id, patch: { text: want, x: startX(a.pageNumber, measure(next)) } })
  }
  return out
}
