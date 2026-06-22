import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useFormStore } from '../../stores/formStore'
import { buildAnnotatedPdfBytes, compressPdf, downloadPdfBytes } from '../../lib/export'

// Annotations are stored in PDF-point space (the editor divides the on-screen
// pointer position by the render scale before saving), so the export maps them
// 1:1 into the page — no extra scaling. A value other than 1 shifts and
// shrinks every annotation toward the page's bottom-left corner. (The redaction
// rasteriser's DPI is a separate `renderScale` inside export.ts.)
const EXPORT_SCALE = 1.0

type Variant = 'original' | 'compressed'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function printBytes(bytes: Uint8Array) {
  const blob = new Blob([bytes.slice() as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.src = url
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch (err) {
        console.error(err)
        window.open(url, '_blank')
      }
    }, 50)
  }
  document.body.appendChild(iframe)
  setTimeout(() => {
    URL.revokeObjectURL(url)
    iframe.remove()
  }, 60_000)
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function ExportModal({ open, onClose }: Props) {
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const fileName = usePdfStore((s) => s.fileName)
  const doc = usePdfStore((s) => s.doc)
  const isXfa = usePdfStore((s) => s.isXfa)
  const setPreviewOpen = usePdfStore((s) => s.setPreviewOpen)
  const annotations = useAnnotationStore((s) => s.annotations)
  const formValues = useFormStore((s) => s.values)

  const [annotated, setAnnotated] = useState<Uint8Array | null>(null)
  const [compressed, setCompressed] = useState<Uint8Array | null>(null)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Variant>('compressed')
  const buildIdRef = useRef(0)

  useEffect(() => {
    if (!open) return
    setTab('compressed')
  }, [open])

  useEffect(() => {
    if (!open || !sourceBytes) return
    const myId = ++buildIdRef.current
    setAnnotated(null)
    setCompressed(null)
    setError(null)
    setBuilding(true)
    ;(async () => {
      try {
        // XFA forms: the pdf-lib annotate/rasterize pipeline can't see XFA field
        // values (they live in the XFA datasets, not AcroForm widgets). PDF.js's
        // saveDocument() serializes the values the user typed into the live form
        // (held in doc.annotationStorage) back into the PDF. No compressed
        // variant — the rasterizer would only capture Adobe's placeholder page.
        if (isXfa && doc) {
          const saved = await doc.saveDocument()
          if (myId !== buildIdRef.current) return
          setAnnotated(saved)
          setCompressed(null)
          return
        }
        const copy = sourceBytes.slice(0)
        const annot = await buildAnnotatedPdfBytes(copy, annotations, EXPORT_SCALE, formValues)
        if (myId !== buildIdRef.current) return
        setAnnotated(annot)
        const annotBuf = annot.slice().buffer
        const comp = await compressPdf(annotBuf, fileName ?? 'document.pdf')
        if (myId !== buildIdRef.current) return
        setCompressed(comp.bytes)
      } catch (e) {
        if (myId !== buildIdRef.current) return
        setError((e as Error).message || 'Export failed')
      } finally {
        if (myId === buildIdRef.current) setBuilding(false)
      }
    })()
  }, [open, sourceBytes, annotations, formValues, fileName, isXfa, doc])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const ready = !building && annotated && compressed
  const origSize = annotated?.byteLength ?? 0
  const compSize = compressed?.byteLength ?? 0
  const saved = origSize - compSize
  const pct = origSize > 0 ? (saved / origSize) * 100 : 0
  const didShrink = saved > 0
  const effectiveTab: Variant = ready && tab === 'compressed' && !didShrink ? 'original' : tab

  const outNameBase = (fileName ?? 'document.pdf').replace(/\.pdf$/i, '')
  const originalName = `${outNameBase}-annotated.pdf`
  const compressedName = `${outNameBase}-annotated-compressed.pdf`

  function download(which: 'original' | 'compressed') {
    if (!annotated || !compressed) return
    if (which === 'original') {
      downloadPdfBytes(annotated.slice(), originalName)
    } else {
      downloadPdfBytes(compressed.slice(), compressedName)
    }
    onClose()
  }

  function openPrintPreview() {
    setPreviewOpen(true)
    onClose()
  }

  function doPrint() {
    if (!annotated) return
    printBytes(annotated)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Export PDF</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {error ? (
          <div className="text-sm text-red-600">Export failed: {error}</div>
        ) : isXfa ? (
          <>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Filled XFA form</div>
              <p className="mt-1 text-xs text-slate-500">
                Your entries are saved into the form. Compression and baked-in
                annotations aren't available for XFA documents.
              </p>
              <div className="mt-3 text-2xl font-semibold text-slate-900 tabular-nums">
                {annotated ? formatSize(annotated.byteLength) : 'Building…'}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <button
                onClick={() => {
                  if (!annotated) return
                  downloadPdfBytes(annotated.slice(), `${outNameBase}-filled.pdf`)
                  onClose()
                }}
                disabled={!annotated}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">⬇</span>
                Download filled form
              </button>
              <button
                onClick={doPrint}
                disabled={!annotated}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-1.5"
              >
                <span aria-hidden="true">🖨</span>
                Print
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="flex bg-slate-50 border-b border-slate-200" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveTab === 'original'}
                  onClick={() => setTab('original')}
                  className={[
                    'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                    effectiveTab === 'original'
                      ? 'border-orange-600 text-slate-900 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  ].join(' ')}
                >
                  Original
                  {ready && (
                    <span className="ml-2 text-[11px] text-slate-400 tabular-nums font-normal">
                      {formatSize(origSize)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveTab === 'compressed'}
                  onClick={() => setTab('compressed')}
                  disabled={ready ? !didShrink : false}
                  title={ready && !didShrink ? 'Already optimised — same size as Original' : undefined}
                  className={[
                    'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors disabled:cursor-not-allowed',
                    effectiveTab === 'compressed'
                      ? 'border-orange-600 text-slate-900 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-700 disabled:text-slate-300 disabled:hover:text-slate-300'
                  ].join(' ')}
                >
                  Compressed
                  {ready && didShrink && (
                    <span className="ml-2 text-[11px] font-medium tabular-nums text-emerald-700">
                      −{pct.toFixed(0)}%
                    </span>
                  )}
                  {ready && !didShrink && (
                    <span className="ml-2 text-[11px] font-normal text-slate-400">no savings</span>
                  )}
                </button>
              </div>

              <div className="p-4">
                {!ready ? (
                  <div className="text-sm text-slate-500">Building export…</div>
                ) : effectiveTab === 'original' ? (
                  <>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                        {formatSize(origSize)}
                      </div>
                      <div className="text-xs text-slate-500">annotations baked in</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                        {formatSize(compSize)}
                      </div>
                      <div className="text-xs font-medium text-emerald-700">
                        Saved {formatSize(saved)} ({pct.toFixed(1)}%)
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">object-stream re-save</div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <button
                onClick={() => download(effectiveTab)}
                disabled={!ready}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">⬇</span>
                Download {effectiveTab === 'original' ? 'Original' : 'Compressed'}
              </button>
              <button
                onClick={openPrintPreview}
                disabled={!ready}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-1.5"
              >
                <span aria-hidden="true">◎</span>
                Preview
              </button>
              <button
                onClick={doPrint}
                disabled={!ready}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-1.5"
              >
                <span aria-hidden="true">🖨</span>
                Print
              </button>
            </div>
          </>
        )}

        <div className="mt-5 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
