import { downloadPdfBytes } from './export'
import { nextExportName, previewExportName } from './exportName'
import { currentPdfBytes } from './hostedStore'
import { usePdfStore } from '../stores/pdfStore'
import { markSaved } from './unsavedChanges'

export type SaveOutcome = 'saved' | 'cancelled'

/**
 * Write the open document — annotations, form values and redactions baked in —
 * out as a file, with no dialog of its own.
 *
 * This is the Export dialog's download in one call, for the exit guard's "Save
 * and exit": someone who is leaving has already decided, and making them pick a
 * compression level on the way out is a question about the wrong thing. The
 * bytes are the uncompressed ("original") variant, which is what the Export
 * dialog defaults to whenever compression has nothing to offer.
 *
 * ⚠️ Redactions are baked in here exactly as they are on export, i.e.
 * permanently. The typed confirmation that gates that lives in the caller —
 * `lib/redactGate.ts` is shared by both dialogs so the rule cannot drift.
 *
 * Desktop gets a real Save dialog and a real file. The web build downloads,
 * which is the only "save as" a browser has.
 */
export async function saveCurrentPdf(): Promise<SaveOutcome> {
  const { doc, isXfa, sourceBytes, fileName } = usePdfStore.getState()
  if (!sourceBytes && !doc) throw new Error('No PDF is open.')

  // XFA (Adobe LiveCycle) forms: the pdf-lib pipeline cannot see values that
  // live in the XFA datasets, so pdf.js serialises the live form instead —
  // the same split the Export dialog makes.
  const bytes = isXfa && doc ? await doc.saveDocument() : (await currentPdfBytes()).bytes

  const savePdf = window.desktop?.savePdf
  if (savePdf) {
    // ⚠️ `previewExportName` here and `nextExportName` after, not the other way
    // round: the counter must not advance for a save the user backed out of, or
    // a cancelled Save dialog silently skips a version number.
    const result = await savePdf(previewExportName(fileName), bytes)
    if (!result.ok) {
      if (result.cancelled) return 'cancelled'
      throw new Error(result.error || 'The PDF could not be saved.')
    }
    nextExportName(fileName)
  } else {
    downloadPdfBytes(bytes, nextExportName(fileName))
  }

  markSaved()
  return 'saved'
}
