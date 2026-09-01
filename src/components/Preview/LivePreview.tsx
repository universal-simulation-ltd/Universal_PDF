import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useFormStore } from '../../stores/formStore'
import { buildAnnotatedPdfBytes, downloadPdfBytes } from '../../lib/export'
import { pdfjsLib, type PDFDocumentProxy } from '../../lib/pdfjs'
import { layerPixelRatio, pagePixelBudget } from '../../lib/renderBudget'

// 1:1 with the editor's PDF-point coordinate space — see ExportModal.tsx.
const EXPORT_SCALE = 1.0
// ⚠️ CSS pixels per PDF point — the DISPLAYED size only. It is not the
// rendering resolution: the canvas behind it is drawn at `scale × ratio`, where
// ratio comes from `layerPixelRatio`. Until 2026-09-01 there was no ratio, so
// the backing store was 1.2 device pixels per point on a screen showing 2.4 —
// every preview was a half-resolution bitmap stretched to twice its size, which
// is what "the preview looks worse than the export" was. The exported file was
// never affected; only the picture of it on screen.
const PREVIEW_SCALE = 1.2

export default function LivePreview() {
  const open = usePdfStore((s) => s.previewOpen)
  const setOpen = usePdfStore((s) => s.setPreviewOpen)
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const fileName = usePdfStore((s) => s.fileName)
  const annotations = useAnnotationStore((s) => s.annotations)
  // ⚠️ The export bakes typed form values into the page content streams, and
  // for two months this preview did not pass them — so a filled form previewed
  // BLANK and the dialog's "How the exported PDF will look" was a false
  // statement about the one document type where it mattered most.
  const formValues = useFormStore((s) => s.values)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const buildIdRef = useRef(0)

  useEffect(() => {
    if (!open || !sourceBytes) return
    const myId = ++buildIdRef.current
    setBuilding(true)
    setError(null)

    // Debounce so rapid edits don't thrash pdf-lib + pdfjs.
    const timer = window.setTimeout(async () => {
      try {
        const copy = sourceBytes.slice(0)
        const out = await buildAnnotatedPdfBytes(copy, annotations, EXPORT_SCALE, formValues)
        if (myId !== buildIdRef.current) return
        // pdfjs consumes the buffer; hand it a copy so we keep `out` intact
        // for the Download button.
        const renderCopy = out.slice().buffer
        const nextDoc = await pdfjsLib.getDocument({ data: renderCopy }).promise
        if (myId !== buildIdRef.current) {
          nextDoc.destroy()
          return
        }
        setDoc((prev) => {
          prev?.destroy()
          return nextDoc
        })
        setBytes(out)
      } catch (e) {
        if (myId !== buildIdRef.current) return
        console.error(e)
        setError((e as Error).message || 'Preview failed')
      } finally {
        if (myId === buildIdRef.current) setBuilding(false)
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [open, sourceBytes, annotations, formValues])

  // Tear down the rendered doc when the modal closes so we don't hold memory.
  useEffect(() => {
    if (open) return
    setDoc((prev) => {
      prev?.destroy()
      return null
    })
    setBytes(null)
    setError(null)
    buildIdRef.current++
  }, [open])

  // Close on Escape, matches the rest of the modal-style UX in the app.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  function onDownload() {
    if (!bytes || !fileName) return
    // pdf-lib's Uint8Array shares a single underlying buffer that the Blob
    // will detach on some browsers, so hand it a fresh copy.
    downloadPdfBytes(bytes.slice(), fileName)
  }

  return (
    // ⚠️ A `fixed inset-0` overlay is positioned against the VIEWPORT, so it
    // escapes the safe-area padding App.tsx puts on the app root — it has to
    // handle the insets itself. Without this the header below sits under the
    // iOS status bar and Dynamic Island, which on a phone puts Download and
    // Close somewhere unclickable: the preview cannot be dismissed, and the
    // whole app reads as frozen behind it. Reported from a real iPhone.
    // The horizontal insets matter in landscape, where the island moves to a
    // side. All resolve to 0 in a browser.
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm"
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-2 bg-slate-900 text-white border-b border-slate-700"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      >
        <div className="font-semibold tracking-tight">Preview</div>
        <span className="text-xs text-slate-400 hidden sm:inline">
          {building ? 'Updating…' : 'How the exported PDF will look'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onDownload}
            disabled={!bytes}
            className="px-4 h-9 rounded bg-orange-700 hover:bg-orange-800 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
          >
            Download
          </button>
          <button
            onClick={() => setOpen(false)}
            className="px-3 h-9 rounded bg-slate-700 hover:bg-slate-600 text-sm"
            aria-label="Close preview"
          >
            Close
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-auto bg-slate-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {error ? (
          <div className="h-full flex items-center justify-center text-red-600 px-4 text-center">
            Preview failed: {error}
          </div>
        ) : !doc ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            {building ? 'Building preview…' : 'Loading…'}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 py-6 px-4">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PreviewPage
                key={i}
                doc={doc}
                pageIndex={i}
                scale={PREVIEW_SCALE}
                // ⚠️ THE RAW PAGE COUNT, and `renderBudget.ts` tells you not
                // to — read the rest of this before "fixing" it. Its
                // `budgetedPageCount` caps the divisor at `MAX_RETAINED_PAGES`
                // because the VIEWER only ever holds canvases for the band of
                // pages around the reader. This preview is not windowed: the
                // map below mounts a canvas for every page of the document at
                // once, with the viewer still mounted behind it. Capping the
                // divisor here would hand a 251-page preview a 25-page
                // allowance — ten times the budget, which is a killed web view
                // on a phone rather than a blurry page.
                budget={pagePixelBudget(doc.numPages)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewPage({
  doc,
  pageIndex,
  scale,
  budget
}: {
  doc: PDFDocumentProxy
  pageIndex: number
  scale: number
  /** This page's share of the canvas budget — see lib/renderBudget.ts. */
  budget: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    async function render() {
      const page = await doc.getPage(pageIndex + 1)
      if (cancelled) return
      // TWO viewports, and the difference between them is the fix. `css` is
      // the box on screen; `bitmap` is what gets drawn into it, at whatever
      // multiple of that the device and the budget allow.
      const css = page.getViewport({ scale })
      const ratio = layerPixelRatio(css.width, css.height, budget)
      const bitmap = ratio === 1 ? css : page.getViewport({ scale: scale * ratio })
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // ⚠️ Backing store in DEVICE pixels, CSS size in the `style` below —
      // setting only `width`/`height` (as this did) makes the canvas its own
      // display size, which is exactly the blur being fixed. The two must be
      // set together or the page renders at the wrong size instead.
      canvas.width = Math.round(bitmap.width)
      canvas.height = Math.round(bitmap.height)
      canvas.style.width = `${css.width}px`
      canvas.style.height = `${css.height}px`
      setSize({ width: css.width, height: css.height })

      renderTask = page.render({ canvasContext: ctx, viewport: bitmap })
      try {
        await renderTask.promise
      } catch {
        // cancelled
      }
    }

    render()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
    // ⚠️ `budget` is a plain number, so this re-renders only when the page
    // count changes — not on every parent render, which would restart the
    // render task in a loop.
  }, [doc, pageIndex, scale, budget])

  return (
    <div
      className="relative shadow-lg mx-auto bg-white"
      style={size ? { width: size.width, height: size.height } : undefined}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
