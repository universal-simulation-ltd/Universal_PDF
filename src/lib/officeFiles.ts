// The cheap half of opening a Word or OpenDocument file: what the pickers
// accept, which names are ours to convert, and the one call every "open a
// document" path makes. The conversion itself (`officeToPdf.ts`, and
// `@unisim/doc` behind it) is only loaded when a file actually needs it — a PDF
// never does, and most people never open anything else.
import { getT } from '../i18n'

export class OfficeImportError extends Error {}

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

/** The older formats `toViewablePdf` answers with advice, not a generic refusal. */
export const ADVISED_NAME = /\.(doc|rtf|pages)$/i

/**
 * True for a name `toViewablePdf` does something with OTHER than open it as a
 * PDF: the formats it converts, and the ones it answers with advice. A file the
 * OS hands over arrives as bytes and a name, and this is what decides whether
 * it is typed as a PDF or left to be judged by that name.
 *
 * ⚠️ `electron/main.cjs` keeps its own copy of this list (`OPENABLE_DOCUMENT`),
 * because it decides which paths Windows hands over reach the page at all.
 */
export function isConvertibleName(name: string): boolean {
  return isOfficeFileName(name) || ADVISED_NAME.test(name)
}

export function isOfficeFile(file: File): boolean {
  return isOfficeFileName(file.name) || file.type === DOCX_MIME || file.type === ODT_MIME
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/**
 * What every "open a document" path calls — see `toViewablePdf` in
 * `officeToPdf.ts`, which this loads only for a file that isn't a PDF.
 */
export async function toViewablePdf(file: File): Promise<{ file: File; notice?: string }> {
  if (isPdfFile(file)) return { file }
  if (!isOfficeFile(file) && !ADVISED_NAME.test(file.name)) {
    throw new OfficeImportError(getT()('lib.import_wrong_type'))
  }
  return (await import('./officeToPdf')).toViewablePdf(file)
}
