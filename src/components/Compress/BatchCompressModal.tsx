import { useRef, useState } from 'react'
import {
  compressPdf,
  downloadPdfBytes,
  type CompressQuality,
  type CompressResult
} from '../../lib/export'
import { downloadZip } from '../../lib/zip'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const QUALITY_OPTIONS: { value: CompressQuality; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Lossless · keeps text' },
  { value: 'balanced', label: 'Balanced', hint: 'Smaller · pages become images' },
  { value: 'strong', label: 'Maximum', hint: 'Smallest · lower quality' }
]

export interface BatchSource {
  /** Original (uncompressed) PDF bytes — kept so we can re-compress at other qualities. */
  sourceBytes: ArrayBuffer
  /** Original input file name. */
  fileName: string
}

interface Props {
  files: BatchSource[]
  /** One result per file, in the same order, compressed at `initialQuality`. */
  initialResults: CompressResult[]
  initialQuality: CompressQuality
  onClose: () => void
}

export default function BatchCompressModal({
  files,
  initialResults,
  initialQuality,
  onClose
}: Props) {
  const [results, setResults] = useState<CompressResult[]>(initialResults)
  const [quality, setQuality] = useState<CompressQuality>(initialQuality)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [filePct, setFilePct] = useState(0)
  const reqId = useRef(0)

  const totalOriginal = results.reduce((n, r) => n + r.originalSize, 0)
  const totalCompressed = results.reduce((n, r) => n + r.compressedSize, 0)
  const totalSaved = totalOriginal - totalCompressed
  const pct = totalOriginal > 0 ? (totalSaved / totalOriginal) * 100 : 0
  const didShrink = totalSaved > 0
  // Same honesty rule as the single-file modal: "try a stronger quality" is
  // only true for the lossless pass. Where rasterising would have bloated a
  // file, compressPdf kept the lossless bytes and says so here.
  const someFellBack = results.some((r) => r.fellBackToLossless)
  const noGainNote = someFellBack
    ? 'Kept the lossless version where turning pages into images would have made the file bigger.'
    : quality === 'light'
      ? 'Already optimised — try Balanced or Maximum for image-heavy PDFs.'
      : 'Already optimised — these PDFs are as small as they go.'

  async function changeQuality(q: CompressQuality) {
    if (q === quality || busy) return
    setQuality(q)
    const id = ++reqId.current
    setBusy(true)
    setProgress(0)
    setFilePct(0)
    try {
      const next: CompressResult[] = []
      for (let i = 0; i < files.length; i++) {
        setFilePct(0)
        // Slice so pdfjs can detach without consuming our kept-around copy.
        const r = await compressPdf(files[i].sourceBytes.slice(0), files[i].fileName, q, (f) => {
          if (id === reqId.current) setFilePct(f)
        })
        if (id !== reqId.current) return
        next.push(r)
        setProgress(i + 1)
      }
      if (id === reqId.current) setResults(next)
    } catch (err) {
      console.error(err)
      if (id === reqId.current) alert('Compression failed: ' + (err as Error).message)
    } finally {
      if (id === reqId.current) setBusy(false)
    }
  }

  function downloadAll() {
    downloadZip(
      results.map((r) => ({ name: r.fileName, data: r.bytes })),
      'compressed-pdfs.zip'
    )
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Compress {files.length} files
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Quality selector — re-compresses every file */}
        <div className="mb-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1.5">
            Quality — applied to all files
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            {QUALITY_OPTIONS.map((opt) => {
              const active = opt.value === quality
              return (
                <button
                  key={opt.value}
                  onClick={() => changeQuality(opt.value)}
                  disabled={busy}
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
        </div>

        {/* Total original vs compressed */}
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-slate-200">
            <div className="p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                Total original
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                {formatSize(totalOriginal)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                Total compressed
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                {busy ? '…' : formatSize(totalCompressed)}
              </div>
            </div>
          </div>
          <div
            className={[
              'px-4 py-2.5 text-sm font-medium border-t border-slate-200',
              busy
                ? 'bg-slate-50 text-slate-600'
                : didShrink
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-50 text-slate-600'
            ].join(' ')}
          >
            {busy
              ? `Compressing ${Math.min(progress + 1, files.length)}/${files.length} — ${Math.round(filePct * 100)}%`
              : didShrink
                ? `Saved ${formatSize(totalSaved)} (${pct.toFixed(1)}%) across ${files.length} files`
                : noGainNote}
          </div>
        </div>

        {/* Per-file breakdown */}
        <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {results.map((r, i) => {
            const saved = r.originalSize - r.compressedSize
            const rowPct = r.originalSize > 0 ? (saved / r.originalSize) * 100 : 0
            return (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800" title={files[i].fileName}>
                    {files[i].fileName}
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {formatSize(r.originalSize)} → {busy ? '…' : formatSize(r.compressedSize)}
                    {!busy && saved > 0 && (
                      <span className="text-emerald-600"> · −{rowPct.toFixed(0)}%</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => downloadPdfBytes(r.bytes, r.fileName)}
                  disabled={busy}
                  className="shrink-0 text-xs font-medium text-orange-700 hover:text-orange-900 disabled:opacity-50 disabled:cursor-wait"
                >
                  ⬇ Save
                </button>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700"
          >
            Discard
          </button>
          <button
            onClick={downloadAll}
            disabled={busy}
            className="px-4 py-2 bg-orange-700 hover:bg-orange-800 text-white rounded text-sm font-medium disabled:opacity-60 disabled:cursor-wait"
          >
            ⬇ Download all ({files.length}) as ZIP
          </button>
        </div>
      </div>
    </div>
  )
}
