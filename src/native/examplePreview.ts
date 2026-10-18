// The picture on the empty desk's "Open the example PDF" card: the example's
// real first page, rendered small, so it can never drift from the PDF the card
// opens (James, 2026-10-18: "maybe the icon could be a preview of what the
// example looks like").
//
// Made once per language and kept for the session: the example is generated in
// the app's language, so a French phone shows the French page. A failure is not
// kept, so the next visit to the desk tries again; until then the card shows
// the plain paper thumbnail every other desk entry has.
//
// ⚠️ It boots pdf.js (and pdf-lib) — only when the desk is empty, which is the
// first run or a cleared desk, and after the desk has painted.

const cache = new Map<string, Promise<string | null>>()

/** A PNG data URL of page 1, `width` CSS pixels wide at the screen's density. */
export function examplePreview(lang: string, width: number): Promise<string | null> {
  let p = cache.get(lang)
  if (!p) {
    p = render(width).catch((err) => {
      console.warn('example preview', err)
      cache.delete(lang)
      return null
    })
    cache.set(lang, p)
  }
  return p
}

async function render(width: number): Promise<string | null> {
  const [{ createExamplePdfBytes }, { openPdf }] = await Promise.all([import('../lib/examplePdf'), import('../lib/pdfjs')])
  const bytes = await createExamplePdfBytes()
  const doc = await openPdf(bytes).promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const px = Math.ceil(width * Math.min(3, Math.max(2, window.devicePixelRatio || 1)))
    const viewport = page.getViewport({ scale: px / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/png')
  } finally {
    void doc.destroy()
  }
}
