// Turn a Word or OpenDocument file into a PDF, on-device, so it can be opened
// in the viewer like any other document.
//
// This is the front door for both importers: it works out which format is
// actually in hand, hands the archive to the right parser, and lays the result
// out with the same engine `markdownToPdf.ts` uses. The parsers are imported
// dynamically — someone who only ever opens PDFs never downloads either.
//
// The result is a *re-typeset* document, not a facsimile of the original's page
// layout, and callers are expected to say so (see `IMPORT_NOTICE`).
//
// ⚠️ THIS STACK EXISTS TWICE IN THE SUITE. Universal Converter's Files tab
// shipped its own document readers and a dependency-free PDF writer —
// `src/lib/doc/*` and `src/lib/pdfcore.ts` — on 2026-08-13, the same afternoon
// as this, from a parallel session neither could see. The ZIP reader, the XML
// helpers, the OOXML/ODF walkers and the layout engine all overlap.
//
// They are not identical: that side also reads .doc, .rtf, .csv, .json, .txt,
// .md and .html, embeds images, and writes without pdf-lib; this side refuses
// .doc and .rtf. Consolidating them into @unisim/sdk is an open backlog item
// ("Universal Converter" in backlog-unisim.md). Until it is done, A FIX HERE IS
// A FIX TO NEITHER — check the twin.

import { blocksToPdf, safeFilename } from './blockPdf'
import { openZip, ZipError } from './unzip'
import { OfficeParseError } from './officeXml'

export type OfficeFormat = 'docx' | 'odt'

export interface OfficeConversion {
  /** The converted PDF, named after the original. */
  file: File
  /** The original file's name, for the notice and for error messages. */
  sourceName: string
  format: OfficeFormat
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
    const zip = await openZip(data)
    // Sniff the package rather than trusting the extension: a .docx renamed
    // .odt (or saved by a tool that guessed) is otherwise a confusing failure.
    const format: OfficeFormat = zip.has('word/document.xml')
      ? 'docx'
      : zip.has('content.xml')
        ? 'odt'
        : (() => {
            throw new OfficeImportError(
              'That file isn’t a Word (.docx) or OpenDocument (.odt) document.'
            )
          })()

    const { blocks, title } =
      format === 'docx'
        ? await (await import('./docxToBlocks')).docxToBlocks(zip)
        : await (await import('./odtToBlocks')).odtToBlocks(zip)

    if (blocks.length === 0) {
      throw new OfficeImportError('That document appears to be empty — there was no text to convert.')
    }

    const docTitle = title || baseName(file.name)
    const bytes = await blocksToPdf(blocks, { title: docTitle })
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
    // Named from the *file*, not the document's own title: someone who converts
    // "Site survey.docx" is looking for "Site survey.pdf" afterwards.
    const pdfName = `${safeFilename(baseName(file.name))}.pdf`
    return {
      file: new File([blob], pdfName, { type: 'application/pdf' }),
      sourceName: file.name,
      format
    }
  } catch (err) {
    if (err instanceof OfficeImportError) throw err
    // The ZIP reader and XML parser both write messages meant for the user;
    // anything else is a genuine surprise and shouldn't be dressed up as advice.
    if (err instanceof ZipError || err instanceof OfficeParseError) {
      throw new OfficeImportError(err.message)
    }
    console.error('Office import failed', err)
    throw new OfficeImportError(
      `Could not convert ${file.name}. It may be password-protected or damaged.`
    )
  }
}

/** The notice to show once a converted document is on screen. */
export function importNoticeFor(conversion: OfficeConversion): string {
  return conversion.format === 'docx' ? IMPORT_NOTICE : IMPORT_NOTICE_ODT
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
