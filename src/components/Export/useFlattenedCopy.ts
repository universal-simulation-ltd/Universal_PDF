import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { compressPdf, type CompressResult, type RasterEstimate } from '../../lib/export'
import { FLATTEN_BAR, worthOffering } from './worthOffering'

// The Export dialog's third copy: every page turned into a picture, offered
// purely because it is SMALLER. (Flattening so nobody can copy the text is a
// different question, asked in Advanced export whatever the size.)
//
// ⚠️ The full pass runs only when the one-page estimate says it will clear
// FLATTEN_BAR. Rasterising a long document is minutes of work, and on a text
// document it only ever makes the file bigger — so the estimate is the gate,
// and the real, measured size is what decides whether the tab stays.

export interface FlattenedCopy {
  /** The rasterised copy, once the pass is done. */
  flattened: CompressResult | null
  /** The estimate says it is worth making, so the tab is on its way. */
  promising: boolean
  flattening: boolean
  /** 0–1, for the bar while pages are being drawn. */
  flattenPct: number
}

/**
 * `against` is the size flattening has to beat — the compressed copy when one
 * is offered, otherwise the file as it is — or null until that is known.
 */
export function useFlattenedCopy(
  open: boolean,
  annotated: Uint8Array | null,
  against: number | null,
  estimate: RasterEstimate | null
): FlattenedCopy {
  const fileName = usePdfStore((s) => s.fileName)
  const [flattened, setFlattened] = useState<CompressResult | null>(null)
  const [flattening, setFlattening] = useState(false)
  const [flattenPct, setFlattenPct] = useState(0)
  const runRef = useRef(0)

  const promising = !!annotated && against !== null && !!estimate && worthOffering(estimate.balanced, against, FLATTEN_BAR)

  useEffect(() => {
    const myId = ++runRef.current
    setFlattened(null)
    setFlattenPct(0)
    if (!open || !annotated || !promising) {
      setFlattening(false)
      return
    }
    setFlattening(true)
    ;(async () => {
      try {
        // Without `keepRasterEvenIfBigger`: a flattened copy that came out
        // bigger is handed back as the lossless bytes with `fellBackToLossless`,
        // and the caller drops the tab.
        const result = await compressPdf(annotated.slice().buffer, fileName ?? 'document.pdf', 'balanced', (f) => {
          if (myId === runRef.current) setFlattenPct(f)
        })
        if (myId === runRef.current) setFlattened(result)
      } catch {
        // A failed flatten is a copy we do not offer, not an export that failed.
      } finally {
        if (myId === runRef.current) setFlattening(false)
      }
    })()
  }, [open, annotated, promising, fileName])

  return { flattened, promising, flattening, flattenPct }
}
