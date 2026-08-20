// Markdown → PDF, for the "Transform text into a PDF" panel.
//
// The parser and the layout engine both live in `@unisim/doc` now; what is left
// here is this app's own entry point — guessing a title from the text, and
// naming the file. See `officeToPdf.ts` for why the stack moved.
//
// ⚠️ `readMarkdown` takes a `File`, because every reader in that package does —
// it is built for a converter, where a document arrives as a file. This panel
// has a string, so it wraps one. That is a real (small) cost of sharing one
// stack, and it is a great deal cheaper than a second Markdown parser.

import {
  DEFAULT_PDF_SETTINGS,
  docToPdf,
  readMarkdown,
  type Orientation,
  type PaperSize,
} from '@unisim/doc'

export type { Orientation, PaperSize }

export interface BuildOptions {
  title?: string
  paperSize?: PaperSize
  /**
   * Which way round the paper starts. Defaults to portrait.
   *
   * Only the STARTING orientation — a document that carries its own page setup
   * (anything imported from Word or ODF) overrides it, because that file
   * already knows which of its pages are landscape and this setting does not.
   */
  orientation?: Orientation
  showPageNumbers?: boolean
}

export async function markdownToPdf(text: string, options: BuildOptions = {}): Promise<Blob> {
  const doc = await readMarkdown(new File([text], 'document.md', { type: 'text/markdown' }))
  const result = await docToPdf(
    { ...doc, title: options.title || doc.title },
    {
      ...DEFAULT_PDF_SETTINGS,
      paper: options.paperSize ?? DEFAULT_PDF_SETTINGS.paper,
      orientation: options.orientation ?? 'portrait',
      pageNumbers: options.showPageNumbers !== false,
    },
  )
  return result.blob
}

export async function markdownToPdfFile(text: string, options: BuildOptions = {}): Promise<File> {
  const title = options.title || guessTitle(text) || 'document'
  const blob = await markdownToPdf(text, { ...options, title })
  return new File([blob], `${safeFilename(title)}.pdf`, { type: 'application/pdf' })
}

/** The document's own first heading, or its first line, as a title. */
function guessTitle(text: string): string {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = /^#{1,3}\s+(.+)$/.exec(line)
    if (m) return m[1].replace(/[*_`]+/g, '').trim()
  }
  const first = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  return (first ?? '').slice(0, 60)
}

/**
 * Trim an arbitrary title down to something safe to use as a file name.
 *
 * Stays in the app rather than moving to `@unisim/doc`: naming is deliberately
 * not that package's business — its `convertDocument` returns an extension, not
 * a filename — and this app's rules are its own.
 */
function safeFilename(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  return (cleaned || 'document').slice(0, 80)
}
