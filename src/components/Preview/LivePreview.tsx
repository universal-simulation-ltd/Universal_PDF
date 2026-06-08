import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { buildAnnotatedPdfBytes, downloadPdfBytes } from '../../lib/export'
import { pdfjsLib, type PDFDocumentProxy } from '../../lib/pdfjs'

// 1:1 with the editor's PDF-point coordinate space — see ExportModal.tsx.
const EXPORT_SCALE = 1.0
const PREVIEW_SCALE = 1.2

export default function LivePreview() {
  const open = usePdfStore((s) => s.previewOpen)
  const setOpen = usePdfStore((s) => s.setPreviewOpen)
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const fileName = usePdfStore((s) => s.fileName)
  const annotations = useAnnotationStore((s) => s.annotations)

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
        const out = await buildAnnotatedPdfBytes(copy, annotations, EXPORT_SCALE)
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
  }, [open, sourceBytes, annotations])

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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 text-white border-b border-slate-700">
        <div className="font-semibold tracking-tight">Preview</div>
        <span className="text-xs text-slate-400 hidden sm:inline">
          {building ? 'Updating…' : 'How the exported PDF will look'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onDownload}
            disabled={!bytes}
            className="px-4 h-9 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
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

      <div className="flex-1 min-h-0 overflow-auto bg-slate-200">
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
              <PreviewPage key={i} doc={doc} pageIndex={i} scale={PREVIEW_SCALE} />
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
  scale
}: {
  doc: PDFDocumentProxy
  pageIndex: number
  scale: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    async function render() {
      const page = await doc.getPage(pageIndex + 1)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = viewport.width
      canvas.height = viewport.height
      setSize({ width: viewport.width, height: viewport.height })

      renderTask = page.render({ canvasContext: ctx, viewport })
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
  }, [doc, pageIndex, scale])

  return (
    <div
      className="relative shadow-lg mx-auto bg-white"
      style={size ? { width: size.width, height: size.height } : undefined}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
