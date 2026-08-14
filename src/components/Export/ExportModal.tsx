import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useFormStore } from '../../stores/formStore'
import {
  buildAnnotatedPdfBytes,
  compressPdf,
  downloadPdfBytes,
  type CompressQuality,
  type CompressResult
} from '../../lib/export'
import { nextExportName, previewExportName } from '../../lib/exportName'
import { RedactIcon } from '../icons/RedactIcon'

// Annotations are stored in PDF-point space (the editor divides the on-screen
// pointer position by the render scale before saving), so the export maps them
// 1:1 into the page — no extra scaling. A value other than 1 shifts and
// shrinks every annotation toward the page's bottom-left corner. (The redaction
// rasteriser's DPI is a separate `renderScale` inside export.ts.)
const EXPORT_SCALE = 1.0

type Variant = 'original' | 'compressed'

// The same three strengths the Compress dialogs offer, worded for this one.
// 'light' stays the default here and nowhere else: an export is an annotated —
// often signed — document, and rasterising it trades away the text layer of a
// file someone is about to send on. That trade is worth offering, but not worth
// making on their behalf.
const QUALITY_OPTIONS: { value: CompressQuality; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Lossless re-save · text stays selectable' },
  { value: 'balanced', label: 'Balanced', hint: 'Pages become images · big saving on scans' },
  { value: 'strong', label: 'Maximum', hint: 'Smallest · most visible loss' }
]

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
  const [compressed, setCompressed] = useState<CompressResult | null>(null)
  const [building, setBuilding] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [compressPct, setCompressPct] = useState(0)
  const [quality, setQuality] = useState<CompressQuality>('light')
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Variant>('compressed')
  const buildIdRef = useRef(0)
  const compressIdRef = useRef(0)

  // Export is the point of no return for redactions: until now they're just
  // movable black-box markup, but the rasterise-and-rebuild pass below removes
  // the underlying text for good. Gate the destructive actions behind a typed
  // "REDACT" confirmation when the document has any.
  const redactCount = annotations.filter((a) => a.type === 'redact').length
  const needsRedactConfirm = !isXfa && redactCount > 0
  const [redactConfirm, setRedactConfirm] = useState('')
  const redactConfirmed = !needsRedactConfirm || redactConfirm.trim().toLowerCase() === 'redact'

  useEffect(() => {
    if (!open) return
    setTab('compressed')
    setQuality('light')
    setRedactConfirm('')
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
      } catch (e) {
        if (myId !== buildIdRef.current) return
        setError((e as Error).message || 'Export failed')
      } finally {
        if (myId === buildIdRef.current) setBuilding(false)
      }
    })()
  }, [open, sourceBytes, annotations, formValues, isXfa, doc])

  // Compression is its own pass so that changing the quality re-compresses the
  // annotated bytes we already have, instead of re-baking every annotation and
  // re-rasterising every redaction to arrive at the identical input again.
  useEffect(() => {
    if (!open || isXfa || !annotated) return
    const myId = ++compressIdRef.current
    setCompressed(null)
    setCompressing(true)
    setCompressPct(0)
    ;(async () => {
      try {
        const annotBuf = annotated.slice().buffer
        const comp = await compressPdf(annotBuf, fileName ?? 'document.pdf', quality, (f) => {
          if (myId === compressIdRef.current) setCompressPct(f)
        })
        if (myId !== compressIdRef.current) return
        setCompressed(comp)
      } catch (e) {
        if (myId !== compressIdRef.current) return
        setError((e as Error).message || 'Compression failed')
      } finally {
        if (myId === compressIdRef.current) setCompressing(false)
      }
    })()
  }, [open, annotated, quality, fileName, isXfa])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const ready = !building && !compressing && annotated && compressed
  const origSize = annotated?.byteLength ?? 0
  const compSize = compressed?.compressedSize ?? 0
  const saved = origSize - compSize
  const pct = origSize > 0 ? (saved / origSize) * 100 : 0
  const didShrink = saved > 0
  const effectiveTab: Variant = ready && tab === 'compressed' && !didShrink ? 'original' : tab

  // Why the Compressed tab has nothing to offer. On the lossless pass that is
  // usually a scan whose bulk is images — exactly what Balanced is for — so say
  // so rather than leaving a dead tab with no way forward. Where rasterising
  // itself would have bloated the file, compressPdf already kept the lossless
  // bytes and says so.
  const noGainNote = compressed?.fellBackToLossless
    ? 'Kept the lossless version — turning these pages into images would have made the file bigger.'
    : quality === 'light'
      ? 'Already optimised — try Balanced or Maximum for image-heavy PDFs.'
      : 'Already optimised — this PDF is as small as it goes.'

  // ⚠️ The name is claimed at DOWNLOAD time, not here. `nextExportName`
  // increments a per-document counter, so working it out during render would
  // burn a version on every re-render — hence `previewExportName` for the
  // label and `nextExportName` for the actual save.
  const previewName = previewExportName(fileName)

  function download(which: 'original' | 'compressed') {
    if (!annotated || !compressed) return
    // One name for either variant: the modal closes after a download, so only
    // one of the two ever leaves per opening, and which variant it was is not
    // something the file needs to carry.
    const name = nextExportName(fileName)
    downloadPdfBytes((which === 'original' ? annotated : compressed.bytes).slice(), name)
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
                  downloadPdfBytes(annotated.slice(), nextExportName(fileName))
                  onClose()
                }}
                disabled={!annotated}
                className="px-4 py-2.5 bg-orange-700 hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
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
            {/* Compression strength — re-compresses the annotated bytes live */}
            <div className="mb-3">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1.5">
                Compression
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {QUALITY_OPTIONS.map((opt) => {
                  const active = opt.value === quality
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setQuality(opt.value)}
                      disabled={building || compressing}
                      aria-pressed={active}
                      className={[
                        'rounded-md px-2 py-1.5 text-sm font-medium transition-colors disabled:cursor-wait',
                        active
                          ? 'bg-white text-orange-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <div className="mt-1.5 text-xs text-slate-500">
                {QUALITY_OPTIONS.find((o) => o.value === quality)?.hint}
              </div>
              {quality !== 'light' && (
                <div className="mt-1.5 text-xs text-amber-700">
                  Every page becomes a picture: the text in the compressed copy can no
                  longer be selected, searched or read aloud. The Original tab is unaffected.
                </div>
              )}
            </div>

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
                  title={ready && !didShrink ? noGainNote : undefined}
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
                  <>
                    <div className="text-sm text-slate-500">
                      {building ? 'Building export…' : 'Compressing…'}
                    </div>
                    {/* A rasterising pass over a long document is minutes of
                        work. Without a bar it reads as a hung dialog, which is
                        how people learn to kill the tab mid-export. */}
                    {compressing && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-orange-600 transition-[width] duration-200"
                          style={{ width: `${Math.round(compressPct * 100)}%` }}
                        />
                      </div>
                    )}
                  </>
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
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {compressed?.fellBackToLossless || quality === 'light'
                        ? 'object-stream re-save'
                        : 'pages rasterised to JPEG'}
                    </div>
                  </>
                )}
              </div>
            </div>

            {needsRedactConfirm && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="text-red-600 mt-0.5 shrink-0">
                    <RedactIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-red-900">
                      Permanent redaction
                    </div>
                    <p className="mt-1 text-xs text-red-700">
                      Exporting flattens {redactCount} redaction box{redactCount === 1 ? '' : 'es'} and
                      removes the text underneath for good. This can't be undone.
                    </p>
                    <input
                      value={redactConfirm}
                      onChange={(e) => setRedactConfirm(e.target.value)}
                      placeholder="Type REDACT to confirm"
                      aria-label="Type REDACT to confirm"
                      autoCapitalize="characters"
                      spellCheck={false}
                      className="mt-2.5 w-full rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder:text-red-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* The name, before the button is pressed. It is the point of the
                change and it is not otherwise guessable — a second export from
                the same document goes to v2, not v1. */}
            <p className="mt-4 text-xs text-slate-500">
              Saves as <span className="font-medium text-slate-700">{previewName}</span>
            </p>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <button
                onClick={() => download(effectiveTab)}
                disabled={!ready || !redactConfirmed}
                className="px-4 py-2.5 bg-orange-700 hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">⬇</span>
                Download {effectiveTab === 'original' ? 'Original' : 'Compressed'}
              </button>
              <button
                onClick={openPrintPreview}
                disabled={!ready || !redactConfirmed}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-1.5"
              >
                <span aria-hidden="true">◎</span>
                Preview
              </button>
              <button
                onClick={doPrint}
                disabled={!ready || !redactConfirmed}
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
