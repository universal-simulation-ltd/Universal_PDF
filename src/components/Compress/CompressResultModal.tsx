import { useRef, useState } from 'react'
import {
  compressPdf,
  downloadPdfBytes,
  type CompressQuality,
  type CompressResult
} from '../../lib/export'

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

interface Props {
  /** Original (uncompressed) PDF bytes — used to re-compress at other qualities. */
  sourceBytes: ArrayBuffer
  /** Original input file name. */
  fileName: string
  initialResult: CompressResult
  onClose: () => void
  discardLabel?: string
}

export default function CompressResultModal({
  sourceBytes,
  fileName,
  initialResult,
  onClose,
  discardLabel = 'Discard'
}: Props) {
  const [result, setResult] = useState<CompressResult>(initialResult)
  const [quality, setQuality] = useState<CompressQuality>(initialResult.quality)
  const [busy, setBusy] = useState(false)
  const reqId = useRef(0)

  const saved = result.originalSize - result.compressedSize
  const pct = result.originalSize > 0 ? (saved / result.originalSize) * 100 : 0
  const didShrink = saved > 0

  // What the bottom strip says when nothing was saved. "Try a stronger quality"
  // is only true advice for the lossless pass — on a text PDF the rasterising
  // qualities are what made it bigger, and compressPdf has already fallen back
  // to the lossless bytes rather than hand over the bloated ones.
  const noGainNote = result.fellBackToLossless
    ? 'Kept the lossless version — turning these pages into images would have made the file bigger.'
    : quality === 'light'
      ? 'Already optimised — try Balanced or Maximum for image-heavy PDFs.'
      : 'Already optimised — this PDF is as small as it goes.'

  async function changeQuality(q: CompressQuality) {
    if (q === quality || busy) return
    setQuality(q)
    const id = ++reqId.current
    setBusy(true)
    try {
      // Slice so pdfjs can safely detach without consuming our kept-around copy.
      const r = await compressPdf(sourceBytes.slice(0), fileName, q)
      if (id === reqId.current) setResult(r)
    } catch (err) {
      console.error(err)
      if (id === reqId.current) alert('Compression failed: ' + (err as Error).message)
    } finally {
      if (id === reqId.current) setBusy(false)
    }
  }

  function download() {
    downloadPdfBytes(result.bytes, result.fileName)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Compression result</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Quality selector — re-compresses live */}
        <div className="mb-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1.5">
            Quality
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

        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-slate-200">
            <div className="p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">Original</div>
              <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                {formatSize(result.originalSize)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">Compressed</div>
              <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                {busy ? '…' : formatSize(result.compressedSize)}
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
              ? 'Compressing…'
              : didShrink
                ? `Saved ${formatSize(saved)} (${pct.toFixed(1)}%)`
                : noGainNote}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500 truncate" title={result.fileName}>
          Output: <span className="font-mono">{result.fileName}</span>
        </div>

        <div className="mt-5 flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700"
          >
            {discardLabel}
          </button>
          <button
            onClick={download}
            disabled={busy}
            className="px-4 py-2 bg-orange-700 hover:bg-orange-800 text-white rounded text-sm font-medium disabled:opacity-60 disabled:cursor-wait"
          >
            ⬇ Download
          </button>
        </div>
      </div>
    </div>
  )
}
