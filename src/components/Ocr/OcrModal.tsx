import { useCallback, useEffect, useRef, useState } from 'react'
import { makeSearchablePdf, type OcrProgress, type OcrResult } from '../../lib/ocr'
import { downloadPdfBytes } from '../../lib/export'

interface Props {
  /** Original PDF bytes to make searchable. Kept intact (a copy is OCR'd). */
  sourceBytes: ArrayBuffer
  fileName: string
  onClose: () => void
  /**
   * Called when the user chooses to open the searchable result in the viewer —
   * the parent loads it so Find / copy / redact-by-search light up immediately.
   * Omit to hide the "Open" action (download-only).
   */
  onOpen?: (file: File) => void
}

type Phase = 'running' | 'done' | 'error'

export default function OcrModal({ sourceBytes, fileName, onClose, onOpen }: Props) {
  const [phase, setPhase] = useState<Phase>('running')
  const [progress, setProgress] = useState<OcrProgress>({
    phase: 'load',
    fraction: 0,
    message: 'Preparing OCR engine…',
  })
  const [result, setResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Which mode the current/last run used. 'auto' skips pages pdf.js can already
  // read; 'all' forces OCR on every page (the "Run OCR anyway" escape hatch for
  // scans that carry a thin or junk text layer auto-detection mistakes for real text).
  const [mode, setMode] = useState<'auto' | 'all'>('auto')
  // Ignore async results if the modal was closed mid-run (BatchCompress pattern).
  const liveRef = useRef(true)

  const run = useCallback(
    (m: 'auto' | 'all') => {
      liveRef.current = true
      setMode(m)
      setResult(null)
      setError(null)
      setProgress({ phase: 'load', fraction: 0, message: 'Preparing OCR engine…' })
      setPhase('running')
      // Fresh copy per run — pdf.js detaches the ArrayBuffer it's handed.
      makeSearchablePdf(sourceBytes.slice(0), fileName, (p) => {
        if (liveRef.current) setProgress(p)
      }, { mode: m })
        .then((r) => {
          if (!liveRef.current) return
          setResult(r)
          setPhase('done')
        })
        .catch((err) => {
          console.error(err)
          if (!liveRef.current) return
          setError((err as Error).message || 'OCR failed')
          setPhase('error')
        })
    },
    [sourceBytes, fileName],
  )

  useEffect(() => {
    run('auto')
    return () => {
      liveRef.current = false
    }
    // Run once on mount — the source + name don't change for a given modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pct = Math.round(progress.fraction * 100)
  const alreadySearchable = phase === 'done' && result?.pagesOcred === 0

  function openResult() {
    if (!result) return
    const file = new File([result.bytes as BlobPart], result.fileName, { type: 'application/pdf' })
    onOpen?.(file)
    onClose()
  }

  function download() {
    if (!result) return
    downloadPdfBytes(result.bytes, result.fileName)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        // Only dismiss by backdrop once the work is finished — a mid-run click
        // shouldn't discard the OCR pass the user is waiting on.
        if (e.target === e.currentTarget && phase !== 'running') onClose()
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <span aria-hidden="true">🔎</span>
            Make searchable (OCR)
          </h2>
          {phase !== 'running' && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            >
              ×
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Runs entirely on your device — nothing is uploaded. The first run
          downloads the OCR model (~15&nbsp;MB) once, then works offline.
        </p>

        {phase === 'running' && (
          <div className="py-2">
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-600">{progress.message}</span>
              <span className="text-slate-400 tabular-nums">{pct}%</span>
            </div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="py-1">
            <div
              className={[
                'rounded-lg px-4 py-3 text-sm font-medium',
                alreadySearchable ? 'bg-slate-50 text-slate-600' : 'bg-emerald-50 text-emerald-700',
              ].join(' ')}
            >
              {alreadySearchable
                ? 'Every page already looks like it has selectable text, so nothing was added.'
                : `Added a searchable text layer to ${result.pagesOcred} page${
                    result.pagesOcred === 1 ? '' : 's'
                  }.`}
              {alreadySearchable && (
                <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                  If this is a scan whose text you still can’t select, run OCR on every page anyway.
                </span>
              )}
              {!alreadySearchable && result.pagesSkipped > 0 && (
                <span className="block text-[11px] font-normal text-emerald-600 mt-0.5">
                  {result.pagesSkipped} page{result.pagesSkipped === 1 ? '' : 's'} already had text and{' '}
                  {result.pagesSkipped === 1 ? 'was' : 'were'} left unchanged.
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700"
              >
                {alreadySearchable ? 'Close' : 'Done'}
              </button>
              {alreadySearchable && mode === 'auto' && (
                <button
                  onClick={() => run('all')}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-medium"
                >
                  Run OCR anyway
                </button>
              )}
              {!alreadySearchable && (
                <button
                  onClick={download}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700"
                >
                  ⬇ Download
                </button>
              )}
              {!alreadySearchable && onOpen && (
                <button
                  onClick={openResult}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-medium"
                >
                  Open searchable PDF
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-1">
            <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">
              OCR failed: {error}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
