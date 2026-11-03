import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from '../lib/pdfjs'
import { openPdf } from '../lib/pdfjs'
import { usePdfStore } from '../stores/pdfStore'
import { useAnnotationStore } from '../stores/annotationStore'
import { useFormStore } from '../stores/formStore'

// The Pages list's Refresh (James, 2026-11-03: "have a refresh button on the
// pages tab to update the thumbnails with new annotations").
//
// Thumbnails are drawn from the PDF itself, and annotations are not in it until
// export — they live in the editor's own layer — so the list never showed them.
// Refresh builds the annotated file the way Export does (form answers in, no
// signing-record pages, so the page count matches) and hands it to
// `usePageThumbnails` in place of the open document. Swapping the document is
// what makes that hook throw its thumbnails away and draw them again.
//
// ⚠️ On demand, never on every edit: building the file is a full pdf-lib pass,
// seconds on a long document. Once asked for, it stays on for this document:
// when the pages themselves change (a delete, a reorder, a turn) the annotated
// copy is rebuilt for the new pages, so the list doesn't quietly go back to
// plain thumbnails. A new document starts plain again.
export function useAnnotatedThumbDoc(doc: PDFDocumentProxy | null, numPages: number) {
  const [thumbDoc, setThumbDoc] = useState<PDFDocumentProxy | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const run = useRef(0)
  const wanted = useRef(false)
  const lastDoc = useRef<PDFDocumentProxy | null>(null)
  // A page edit swaps the document but keeps its name; opening another file
  // (or another tab) changes it.
  const lastName = useRef<string | null>(null)

  // The previous annotated copy is freed when it is replaced, and on unmount.
  useEffect(() => {
    return () => {
      void thumbDoc?.destroy()
    }
  }, [thumbDoc])

  async function refresh() {
    const { sourceBytes, isXfa } = usePdfStore.getState()
    if (!sourceBytes || isXfa || !doc) return
    wanted.current = true
    const my = ++run.current
    setRefreshing(true)
    try {
      // Lazily: pdf-lib stays out of the start-up bundle (e2e/lazy-pdf-lib).
      const { buildAnnotatedPdfBytes } = await import('../lib/export')
      const bytes = await buildAnnotatedPdfBytes(
        sourceBytes.slice(0),
        useAnnotationStore.getState().annotations,
        1.0,
        useFormStore.getState().values
      )
      if (my !== run.current) return
      const next = await openPdf(bytes).promise
      if (my !== run.current || next.numPages !== numPages) {
        void next.destroy()
        return
      }
      setThumbDoc(next)
    } finally {
      if (my === run.current) setRefreshing(false)
    }
  }

  // The pages changed under us: drop the stale copy, and rebuild it if the
  // reader had asked for annotated thumbnails on this document.
  useEffect(() => {
    if (doc === lastDoc.current) return
    const name = usePdfStore.getState().fileName
    const sameDocument = lastDoc.current !== null && doc !== null && name !== null && name === lastName.current
    lastDoc.current = doc
    lastName.current = name
    run.current++
    setThumbDoc(null)
    setRefreshing(false)
    if (!sameDocument) wanted.current = false
    if (wanted.current && doc) void refresh().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, numPages])

  return { thumbDoc, refresh, refreshing }
}
