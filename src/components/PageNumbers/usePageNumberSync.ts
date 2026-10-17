import { useEffect } from 'react'
import { useAnnotationStore } from '../../stores/annotationStore'
import { usePdfStore } from '../../stores/pdfStore'
import { pageNumberFixes } from '../../lib/pageNumbers'
import { textBoxSize } from '../../lib/textLayout'

/**
 * Keeps page numbers saying the right thing: after a page is moved, deleted,
 * or merged in, each number is rewritten for the page it is now on and the
 * new count — not as an undo step (see the store's `quietUpdateMany`). A
 * number someone retyped is left alone (lib/pageNumbers `pageNumberFixes`).
 * Pages added later get no number until the dialog is used again.
 */
export function usePageNumberSync() {
  const numPages = usePdfStore((s) => s.numPages)
  const annotations = useAnnotationStore((s) => s.annotations)
  const quietUpdateMany = useAnnotationStore((s) => s.quietUpdateMany)
  useEffect(() => {
    if (!numPages) return
    const fixes = pageNumberFixes(annotations, numPages, (a) => textBoxSize(a).width)
    if (fixes.length) quietUpdateMany(fixes)
  }, [annotations, numPages, quietUpdateMany])
}
