// PDF → Word, the first step: read each page's words with pdf.js, in the
// reader's view of the page (y down, rotation applied), with each word's size
// and whether its font is bold or italic. A page with no text to speak of — a
// scan — is drawn to a PNG instead, so it comes across as a picture. Then
// layout.ts makes paragraphs of it and docx.ts writes the files, zipped here.
//
// Everything runs on the device; nothing is uploaded.

import { zipBytes } from '@unisim/media'
import { openPdf, pdfjsLib } from '../pdfjs'
import type { PDFPageProxy } from '../pdfjs'
import { buildDocx, type PageRead, type TextBit } from './layout'
import { docxEntries } from './docx'

const BOLD = /bold|black|heavy|semibold|demi/i
const ITALIC = /italic|oblique/i

/** What a font says about itself once pdf.js has loaded it. */
type LoadedFont = { name?: string; bold?: boolean; italic?: boolean; black?: boolean }

async function readPage(page: PDFPageProxy): Promise<PageRead> {
  const viewport = page.getViewport({ scale: 1 })
  // The operator list loads the page's fonts into commonObjs, which is the
  // only place their real names ("ABCDEF+Helvetica-Bold") can be read.
  await page.getOperatorList()
  const content = await page.getTextContent()
  const fontOf = (id: string | undefined): LoadedFont | null => {
    if (!id) return null
    try {
      return page.commonObjs.has(id) ? (page.commonObjs.get(id) as LoadedFont) : null
    } catch {
      return null
    }
  }
  const bits: TextBit[] = []
  for (const raw of content.items) {
    if (!('str' in raw)) continue
    const it = raw as { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean; fontName?: string }
    const tx = pdfjsLib.Util.transform(viewport.transform, it.transform)
    const font = fontOf(it.fontName)
    const name = font?.name ?? ''
    bits.push({
      str: it.str,
      x: tx[4],
      y: tx[5],
      width: it.width,
      size: Math.hypot(tx[2], tx[3]) || it.height || 0,
      bold: !!(font?.bold || font?.black) || BOLD.test(name),
      italic: !!font?.italic || ITALIC.test(name),
      eol: !!it.hasEOL
    })
  }
  const read: PageRead = { width: viewport.width, height: viewport.height, bits }
  const chars = bits.reduce((n, b) => n + b.str.trim().length, 0)
  if (chars < 3) read.picture = await pagePicture(page)
  return read
}

/** The page as a PNG, at twice its size in points so it prints cleanly. */
async function pagePicture(page: PDFPageProxy): Promise<Uint8Array | undefined> {
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  canvas.width = canvas.height = 0
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}

export interface WordExport {
  bytes: Uint8Array
  pages: number
  /** Pages that came across as pictures (no text on them). */
  pictures: number
}

/** A PDF's text as a Word document (.docx), read page by page. */
export async function pdfToDocx(pdfBytes: Uint8Array, onPage?: (n: number, total: number) => void): Promise<WordExport> {
  const doc = await openPdf(pdfBytes).promise
  try {
    const pages: PageRead[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      onPage?.(i, doc.numPages)
      pages.push(await readPage(await doc.getPage(i)))
    }
    const built = buildDocx(pages)
    return {
      bytes: zipBytes(docxEntries(built)),
      pages: pages.length,
      pictures: built.blocks.filter((b) => b.kind === 'picture').length
    }
  } finally {
    void doc.destroy()
  }
}
