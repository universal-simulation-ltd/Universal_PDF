import { PDFDocument, degrees } from 'pdf-lib'
import { getT } from '../i18n'

// Rebuild the PDF so its pages appear in `newOrder`. Each entry is the
// original page index that should occupy that slot — omitting an index
// drops that page. The page objects themselves are kept intact, so
// annotations, form widgets and resources move with their page.
//
// `turns` (original page index → quarter turns clockwise) turns pages as
// well: the page's own /Rotate, so every reader shows it turned and nothing
// on it is redrawn (the phone's Pages page, 2026-10-25).
export async function applyPageOrderToPdf(
  sourceBytes: ArrayBuffer,
  newOrder: number[],
  turns: Record<number, number> = {}
): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.load(sourceBytes, { updateMetadata: false })
  const originalPages = pdf.getPages()
  const count = originalPages.length

  for (const idx of newOrder) {
    if (idx < 0 || idx >= count) {
      throw new Error(`Invalid page index ${idx} (document has ${count} pages)`)
    }
  }
  if (newOrder.length === 0) {
    throw new Error(getT()('lib.pages_keep_one'))
  }

  // Strip the catalog's page tree (highest index first to keep indices stable),
  // then re-add the pages we want in the requested order. removePage doesn't
  // invalidate the PDFPage objects we captured above, so they can be re-inserted.
  for (let i = count - 1; i >= 0; i--) {
    pdf.removePage(i)
  }
  for (const idx of newOrder) {
    const page = originalPages[idx]
    const q = (((turns[idx] ?? 0) % 4) + 4) % 4
    if (q) page.setRotation(degrees((((page.getRotation().angle + q * 90) % 360) + 360) % 360))
    pdf.addPage(page)
  }

  const out = await pdf.save()
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
}

// Map old page indices to new ones for `newOrder`. Pages dropped from the
// document do not appear in the map — callers should treat those as "remove".
export function buildPageIndexMap(newOrder: number[]): Map<number, number> {
  const m = new Map<number, number>()
  for (let i = 0; i < newOrder.length; i++) {
    m.set(newOrder[i], i)
  }
  return m
}
