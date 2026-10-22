import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '@unisim/sdk'
import { documentLanguage, makeSearchablePdf, type OcrProgress, type OcrResult } from '../../lib/ocr'
import { defaultOcrLanguage } from '../../lib/ocrLanguages'
import { getT, useT } from '../../i18n'

// The searchable-text pass, shared by the website's dialog (OcrModal) and the
// phone's page (src/native/OcrScreen): pick the language, run, and the result.

// 'choose' first: OCR reads ONE language per model, and reading a Japanese scan
// with the English model gives confident nonsense — so the language is picked
// (defaulting to the document's, then the app's) before anything downloads.
export type OcrPhase = 'choose' | 'running' | 'done' | 'error'

export function useOcr(sourceBytes: ArrayBuffer, fileName: string) {
  const t = useT()
  const { language: uiLanguage } = useLanguage()
  const [phase, setPhase] = useState<OcrPhase>('choose')
  const [lang, setLang] = useState(() => defaultOcrLanguage(null, uiLanguage))
  // Once the reader has picked, the document's own /Lang arriving late must
  // not change it under them.
  const pickedRef = useRef(false)
  const [progress, setProgress] = useState<OcrProgress>({
    phase: 'load',
    fraction: 0,
    message: t('tools.ocr.preparing'),
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
    (m: 'auto' | 'all', model: string) => {
      liveRef.current = true
      setMode(m)
      setResult(null)
      setError(null)
      setProgress({ phase: 'load', fraction: 0, message: getT()('tools.ocr.preparing') })
      setPhase('running')
      // Fresh copy per run — pdf.js detaches the ArrayBuffer it's handed.
      makeSearchablePdf(sourceBytes.slice(0), fileName, (p) => {
        if (liveRef.current) setProgress(p)
      }, { mode: m, lang: model })
        .then((r) => {
          if (!liveRef.current) return
          setResult(r)
          setPhase('done')
        })
        .catch((err) => {
          console.error(err)
          if (!liveRef.current) return
          setError((err as Error).message || getT()('tools.ocr.failed_fallback'))
          setPhase('error')
        })
    },
    [sourceBytes, fileName],
  )

  useEffect(() => {
    liveRef.current = true
    // Start on the document's own language when it names one.
    void documentLanguage(sourceBytes).then((docLang) => {
      if (!liveRef.current || pickedRef.current || !docLang) return
      setLang(defaultOcrLanguage(docLang, uiLanguage))
    })
    return () => {
      liveRef.current = false
    }
    // Once per modal — the source doesn't change for a given modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pct = Math.round(progress.fraction * 100)
  const alreadySearchable = phase === 'done' && result?.pagesOcred === 0

  return { phase, lang, setLang, pickedRef, progress, result, error, mode, run, pct, alreadySearchable }
}
