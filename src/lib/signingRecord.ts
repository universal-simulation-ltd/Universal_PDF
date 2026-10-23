// The "Signing record" page (James, 2026-10-23): when a signature that came
// from the UNI·SIM Hub phone app (Scan to sign, step 2) is on the document,
// the saved or shared copy ends with a page saying who sent it — "Signed by
// <email> via Universal ID · <UTC>", the check URL and a QR to it. Nothing is
// added otherwise, so every other export is byte-for-byte what it was.
//
// The drawing is lib/phoneAttestPdf.ts (Node-tested by `npm run test:attest`);
// this file is the app's side: which attestations are on the document right
// now (phoneAttestStore, in memory), the words in the app's language, and the
// QR. Callers pass `signingRecordsFor(annotations)` to buildAnnotatedPdfBytes,
// which only loads this when there is something to print.

import type { PDFDocument } from 'pdf-lib'
import { useMemo } from 'react'
import type { Annotation } from '../types/annotations'
import { usePhoneAttestStore } from '../stores/phoneAttestStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { attestedOnDocument, type AttestedSignature } from './phoneAttest'

/** The attested signatures on these annotations: empty means no record page. */
export function signingRecordsFor(annotations: readonly Annotation[]): AttestedSignature[] {
  return attestedOnDocument(annotations, usePhoneAttestStore.getState().byEntry)
}

/** Whether the open document's export will end with a Signing record page. */
export function useSigningRecordAhead(annotations?: readonly Annotation[]): boolean {
  const byEntry = usePhoneAttestStore((s) => s.byEntry)
  const open = useAnnotationStore((s) => s.annotations)
  const list = annotations ?? open
  return useMemo(() => attestedOnDocument(list, byEntry).length > 0, [list, byEntry])
}

/** Draw the record pages onto `pdf` (export.ts calls this before saving). */
export async function appendSigningRecord(pdf: PDFDocument, records: readonly AttestedSignature[]): Promise<number> {
  if (!records.length) return 0
  const [{ appendSigningRecordPages }, { getT }, { en }, { renderQrPng }, { DEFAULT_DESIGN }] = await Promise.all([
    import('./phoneAttestPdf'),
    import('../i18n'),
    import('../i18n/en'),
    import('./qr/render'),
    import('@unisim/qr'),
  ])
  const t = getT()
  return appendSigningRecordPages(pdf, records, {
    page: { title: t('sign.record_title'), intro: t('sign.record_intro'), image: t('sign.record_image'), limits: t('sign.record_limits') },
    englishPage: { title: en.sign.record_title, intro: en.sign.record_intro, image: en.sign.record_image, limits: en.sign.record_limits },
    texts: (vars) => ({ heading: t('sign.attest_heading'), line: t('sign.attest_line', vars) }),
    english: { heading: en.sign.attest_heading, line: en.sign.attest_line },
    // A plain black-on-white code, so it scans off a printed page.
    qrPngFor: (url) => renderQrPng({ ...DEFAULT_DESIGN, name: 'check', data: url, fgColor: '#000000', bgColor: '#ffffff', bgTransparent: false, useGradient: false, matchCornerColor: true }, 360),
  })
}
