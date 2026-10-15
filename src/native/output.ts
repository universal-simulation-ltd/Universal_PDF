// The finished file, for the Share page and the two moments: the open document
// with its annotations, form answers and redactions baked in, optionally with
// the answers set in ink, made smaller and locked. The same pipeline the
// website's Export dialog runs (`useExportBuild`), as plain functions, because
// the phone asks its questions on a page rather than in a dialog.
//
// pdf-lib comes with `lib/export`, so everything here is imported on demand.

import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { useFormStore } from '../stores/formStore'
import type { CompressQuality, CompressResult } from '../lib/export'

/** The open document with everything on it baked in. */
export async function buildAnnotated(): Promise<Uint8Array> {
  const { sourceBytes, doc, isXfa } = usePdfStore.getState()
  // XFA forms keep their answers in the XFA datasets, which only pdf.js can
  // write back — the same split the Export dialog makes.
  if (isXfa && doc) return doc.saveDocument()
  if (!sourceBytes) throw new Error('No document is open')
  const { buildAnnotatedPdfBytes } = await import('../lib/export')
  return buildAnnotatedPdfBytes(
    sourceBytes.slice(0),
    useAnnotationStore.getState().annotations,
    1.0,
    useFormStore.getState().values
  )
}

/**
 * "Set the answers in ink": the form's fields become part of the page, so
 * nobody can change an answer once it is sent. A document with no form comes
 * back as it was.
 */
export async function inkTheAnswers(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  const form = pdf.getForm()
  if (form.getFields().length === 0) return bytes
  form.flatten()
  return pdf.save()
}

export async function lockWithPassword(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const { encryptPdf } = await import('../lib/pdfEncrypt')
  return (await encryptPdf(bytes, password)).bytes
}

export async function makeSmaller(
  bytes: Uint8Array,
  fileName: string,
  quality: CompressQuality,
  onProgress?: (fraction: number) => void
): Promise<CompressResult> {
  const { compressPdf } = await import('../lib/export')
  return compressPdf(bytes.slice().buffer as ArrayBuffer, fileName, quality, onProgress)
}

/** Hand the file to the phone: the share sheet, which carries Save to Files too. */
export async function handOver(bytes: Uint8Array, fileName: string): Promise<void> {
  const { downloadPdfBytes } = await import('../lib/download')
  const { markSaved } = await import('../lib/unsavedChanges')
  downloadPdfBytes(bytes, /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`)
  markSaved()
}

/** The file name without `.pdf`, for the "call it…" line. */
export function baseName(fileName: string | null): string {
  return (fileName ?? 'document.pdf').replace(/\.pdf$/i, '')
}
