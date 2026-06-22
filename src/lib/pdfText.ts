import { pdfjsLib } from './pdfjs'
import type { PDFDocumentProxy, PDFPageProxy } from './pdfjs'

// A single text run from pdf.js, positioned in "annotation space" — the
// scale-1 viewport (PDF points, top-left origin, y-down). That's the same
// space annotations are stored in (pointer / liveScale) and the space export
// bakes redactions in (EXPORT_SCALE = 1), so a box from here can be used
// verbatim both to draw a highlight (×liveScale) and to create a redaction.
export interface ExtractedItem {
  // Character offset of this run's first char within the page's `text`.
  start: number
  len: number
  x: number
  y: number
  w: number
  h: number
}

export interface PageText {
  pageIndex: number
  // Raw concatenation of every run's string (plus a newline after runs that end
  // a visual line). Offsets in `items` index into this. `lower` is the same
  // string lower-cased for case-insensitive search — lower-casing preserves
  // length so offsets stay valid.
  text: string
  lower: string
  items: ExtractedItem[]
}

// An axis-aligned box in annotation space. A single match can produce several
// (one per text run / line it spans).
export interface MatchRect {
  x: number
  y: number
  w: number
  h: number
}

export interface SearchMatch {
  pageIndex: number
  start: number
  end: number
  rects: MatchRect[]
}

export async function extractPageText(page: PDFPageProxy, pageIndex: number): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const items: ExtractedItem[] = []
  let text = ''

  for (const raw of content.items) {
    // Skip TextMarkedContent entries (begin/end markers) — only TextItems have a
    // string and a transform.
    if (!('str' in raw)) continue
    const it = raw as { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }
    const tx = pdfjsLib.Util.transform(viewport.transform, it.transform)
    // Vertical extent of the run = magnitude of the matrix's vertical basis.
    const h = Math.hypot(tx[2], tx[3]) || it.height || 0
    const x = tx[4]
    const y = tx[5] - h // baseline → top-left
    const start = text.length
    items.push({ start, len: it.str.length, x, y, w: it.width, h })
    text += it.str
    // Keep visual lines apart so two stacked lines can't form a false match
    // across the gap. The newline maps to no run, so it never lands in a rect.
    if (it.hasEOL) text += '\n'
  }

  return { pageIndex, text, lower: text.toLowerCase(), items }
}

export async function extractDocText(doc: PDFDocumentProxy): Promise<PageText[]> {
  const out: PageText[] = []
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1)
    out.push(await extractPageText(page, i))
  }
  return out
}

// Map a character range [s, e) within a page to the boxes covering it. A run is
// split proportionally by character so a match that starts/ends mid-run still
// gets a tight box; a match spanning several runs yields one rect each.
function rectsForRange(pt: PageText, s: number, e: number): MatchRect[] {
  const rects: MatchRect[] = []
  for (const it of pt.items) {
    const a = Math.max(s, it.start)
    const b = Math.min(e, it.start + it.len)
    if (a >= b) continue
    const charW = it.len > 0 ? it.w / it.len : 0
    rects.push({
      x: it.x + (a - it.start) * charW,
      y: it.y,
      w: (b - a) * charW,
      h: it.h
    })
  }
  return rects
}

export function findInPage(pt: PageText, needleLower: string): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (!needleLower) return matches
  let idx = pt.lower.indexOf(needleLower)
  while (idx !== -1) {
    const end = idx + needleLower.length
    matches.push({ pageIndex: pt.pageIndex, start: idx, end, rects: rectsForRange(pt, idx, end) })
    idx = pt.lower.indexOf(needleLower, end)
  }
  return matches
}

// All matches across the document, in reading order (page, then position).
export function findInDoc(pages: PageText[], query: string): SearchMatch[] {
  const needle = query.toLowerCase()
  if (!needle.trim()) return []
  const out: SearchMatch[] = []
  for (const pt of pages) out.push(...findInPage(pt, needle))
  return out
}
