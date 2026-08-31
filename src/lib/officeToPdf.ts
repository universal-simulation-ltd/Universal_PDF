// Turn a Word or OpenDocument file into a PDF, on-device, so it can be opened
// in the viewer like any other document.
//
// The reading and the layout both come from `@unisim/doc` now. What is left
// here is the part that is this app's own: deciding what it will accept, saying
// something useful about what it will not, sniffing the package so a
// mislabelled file still works, and naming the result.
//
// The result is a *re-typeset* document, not a facsimile of the original's page
// layout, and callers are expected to say so (see `IMPORT_NOTICE`).
//
// ✅ THE STACK NO LONGER EXISTS TWICE. It did until 2026-08-20: Universal
// Converter's Files tab shipped its own readers and a dependency-free PDF
// writer on 2026-08-13, the same afternoon as this side, from a parallel
// session neither could see — a ZIP reader, XML helpers, OOXML/ODF walkers and
// a layout engine, all overlapping, with a header on each file saying "a fix
// here is a fix to neither". Both now use `@unisim/doc`, which is Converter's
// version plus this side's `pagesetup`.
//
// ⚠️ One consequence worth knowing: the package READS `.doc` and `.rtf`, which
// this app still refuses by name below. That refusal is now a product choice
// rather than a limitation, and turning it into support is a few lines. It was
// deliberately NOT changed in the same commit as the extraction, so the
// refactor stayed behaviour-preserving and the existing suite could prove it.

import { DEFAULT_PDF_SETTINGS, ZipArchive, docToPdf, readDocx, readOdt } from '@unisim/doc'
import { loadFallbackFont } from './fallbackFont'

export type OfficeFormat = 'docx' | 'odt'

export interface OfficeConversion {
  /** The converted PDF, named after the original. */
  file: File
  /** The original file's name, for the notice and for error messages. */
  sourceName: string
  format: OfficeFormat
  /**
   * Distinct characters the PDF writer could not spell, already replaced with
   * '?' in `file`. Empty for the overwhelming majority of documents — see
   * `droppedSentence` for why it is surfaced at all.
   */
  dropped: string[]
}

/** Thrown for anything the user needs told about. The message is written to be read. */
export class OfficeImportError extends Error {}

/** Shown once a converted document is open, so nobody mistakes it for a copy. */
export const IMPORT_NOTICE =
  'Converted from Word — text and structure are preserved, but the original page layout may differ.'

export const IMPORT_NOTICE_ODT =
  'Converted from OpenDocument — text and structure are preserved, but the original page layout may differ.'

/** File extensions the open/drop paths accept alongside PDFs. */
export const OFFICE_EXTENSIONS = ['.docx', '.odt'] as const

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT_MIME = 'application/vnd.oasis.opendocument.text'

/** `accept` for a picker that takes PDFs and the office formats alike. */
export const PDF_OR_OFFICE_ACCEPT = `application/pdf,.pdf,.docx,.odt,${DOCX_MIME},${ODT_MIME}`

/** True for a name this module will have a go at converting. */
export function isOfficeFileName(name: string): boolean {
  return /\.(docx|odt)$/i.test(name)
}

export function isOfficeFile(file: File): boolean {
  return isOfficeFileName(file.name) || file.type === DOCX_MIME || file.type === ODT_MIME
}

/**
 * The formats that get a *useful* refusal rather than a generic one. Both are
 * routinely called "Word files", so "please choose a PDF" would be a bad answer
 * to a question the user asked reasonably.
 */
function legacyFormatMessage(name: string, header: Uint8Array): string | null {
  const isOle2 =
    header.length >= 8 &&
    header[0] === 0xd0 && header[1] === 0xcf && header[2] === 0x11 && header[3] === 0xe0 &&
    header[4] === 0xa1 && header[5] === 0xb1 && header[6] === 0x1a && header[7] === 0xe1
  if (isOle2 || /\.doc$/i.test(name)) {
    return 'Word 97–2003 files (.doc) can’t be converted here. Open it in Word or LibreOffice, save it as .docx, and try again.'
  }
  const isRtf =
    header.length >= 5 &&
    String.fromCharCode(header[0], header[1], header[2], header[3], header[4]) === '{\\rtf'
  if (isRtf || /\.rtf$/i.test(name)) {
    return 'Rich Text files (.rtf) can’t be converted here. Save it as .docx and try again.'
  }
  if (/\.pages$/i.test(name)) {
    return 'Pages documents can’t be converted here. Export it as Word (.docx) or PDF and try again.'
  }
  return null
}

/** Strip the extension so the PDF is named after the document, not the format. */
function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '')
}

export async function convertOfficeFile(file: File): Promise<OfficeConversion> {
  const data = await file.arrayBuffer()
  const header = new Uint8Array(data.slice(0, 8))

  const legacy = legacyFormatMessage(file.name, header)
  if (legacy) throw new OfficeImportError(legacy)

  // Both formats are ZIPs. Anything else that reached here is not one of them,
  // whatever it was called.
  if (!(header[0] === 0x50 && header[1] === 0x4b)) {
    throw new OfficeImportError('That file isn’t a Word (.docx) or OpenDocument (.odt) document.')
  }

  try {
    // Sniff the package rather than trusting the extension: a .docx renamed
    // .odt (or saved by a tool that guessed) is otherwise a confusing failure.
    const zip = await ZipArchive.open(data)
    const format: OfficeFormat = zip.has('word/document.xml')
      ? 'docx'
      : zip.has('content.xml')
        ? 'odt'
        : (() => {
            throw new OfficeImportError(
              'That file isn’t a Word (.docx) or OpenDocument (.odt) document.'
            )
          })()

    // Read through the format we SNIFFED, not the one the name claims — which
    // is why these are called directly rather than through the package's
    // `convertDocument`, whose reader is chosen by extension.
    const doc = format === 'docx' ? await readDocx(file) : await readOdt(file)

    if (doc.blocks.length === 0) {
      throw new OfficeImportError('That document appears to be empty — there was no text to convert.')
    }

    // The PDF's /Title comes off the document model, not the settings — so a
    // file whose own metadata has no title gets one from its filename rather
    // than an empty property.
    const result = await docToPdf(
      { ...doc, title: doc.title || baseName(file.name) },
      DEFAULT_PDF_SETTINGS,
      // The Cyrillic/Greek/Hebrew fallback face — see `fallbackFont.ts`. Called
      // only when the document holds something the base-14 fonts cannot spell,
      // so an English document never fetches it, and every way it can fail
      // lands back on the '?' behaviour `droppedSentence` already explains.
      loadFallbackFont,
    )
    // Named from the *file*, not the document's own title: someone who converts
    // "Site survey.docx" is looking for "Site survey.pdf" afterwards.
    const pdfName = `${safeFilename(baseName(file.name))}.pdf`
    return {
      file: new File([result.blob], pdfName, { type: 'application/pdf' }),
      sourceName: file.name,
      format,
      dropped: result.dropped
    }
  } catch (err) {
    if (err instanceof OfficeImportError) throw err
    // The readers write messages meant for the user (a .doc renamed .docx says
    // so in as many words); anything else is a genuine surprise and should not
    // be dressed up as advice.
    if (err instanceof Error && /\bisn’t\b|\bdamaged\b|\bmalformed\b|\bempty\b/.test(err.message)) {
      throw new OfficeImportError(err.message)
    }
    console.error('Office import failed', err)
    throw new OfficeImportError(
      `Could not convert ${file.name}. It may be password-protected or damaged.`
    )
  }
}

/**
 * Trim an arbitrary title down to something safe to use as a file name.
 *
 * Stays in the app rather than moving to `@unisim/doc` with everything else:
 * naming is deliberately not the package's business (its `convertDocument`
 * returns an extension, not a filename), and this app's rules are its own.
 */
function safeFilename(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  return (cleaned || 'document').slice(0, 80)
}

/**
 * The characters clause of the notice, or '' when nothing was lost.
 *
 * ⚠️ This is NOT decoration. `@unisim/doc` writes the base-14 PDF fonts with
 * /WinAnsiEncoding and embeds no font, so anything outside Latin-1 — arrows in
 * a diagram, box-drawing, curly bullets, any non-Latin script — is written as a
 * literal '?'. The package has always reported which ones (`PdfResult.dropped`,
 * "for an honest warning"); this app used to take `.blob` and throw the report
 * away, so a document came back quietly corrupted and the user found out on
 * page four, or never.
 *
 * Name the characters rather than counting them: "→ and ↓ are missing" tells
 * someone where to look, "2 characters are missing" starts a hunt.
 */
function droppedSentence(dropped: string[]): string {
  if (dropped.length === 0) return ''
  // A document in a script this PDF can't write at all (Greek, Cyrillic, CJK)
  // drops hundreds of distinct characters, and listing them would be a wall of
  // '?' — the very thing being warned about. Past a handful, count instead.
  const LIST_LIMIT = 8
  if (dropped.length > LIST_LIMIT) {
    return ` ${dropped.length} characters this PDF's fonts can't write were replaced with “?”.`
  }
  const shown = dropped.join(' ')
  const plural = dropped.length > 1 ? 's' : ''
  return ` The character${plural} ${shown} couldn't be written and ${dropped.length > 1 ? 'appear' : 'appears'} as “?”.`
}

/** The notice to show once a converted document is on screen. */
export function importNoticeFor(conversion: OfficeConversion): string {
  const base = conversion.format === 'docx' ? IMPORT_NOTICE : IMPORT_NOTICE_ODT
  return base + droppedSentence(conversion.dropped)
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/**
 * What every "open a document" path calls. A PDF passes straight through; a
 * Word or OpenDocument file is converted here first and the notice comes back
 * with it. Everything else is refused — but a `.doc`, `.rtf` or `.pages` is
 * refused by `convertOfficeFile` with an answer the user can act on, which is
 * why they are let this far rather than filtered out above.
 */
export async function toViewablePdf(file: File): Promise<{ file: File; notice?: string }> {
  if (isPdfFile(file)) return { file }
  if (!isOfficeFile(file) && !/\.(doc|rtf|pages)$/i.test(file.name)) {
    throw new OfficeImportError('Please choose a PDF, Word (.docx) or OpenDocument (.odt) file.')
  }
  const conversion = await convertOfficeFile(file)
  return { file: conversion.file, notice: importNoticeFor(conversion) }
}
