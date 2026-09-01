import { useEffect, useRef, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useFormStore } from '../../stores/formStore'
import {
  buildAnnotatedPdfBytes,
  compressPdf,
  estimateRasterSizes,
  hasRasterImages,
  type CompressQuality,
  type CompressResult,
  type RasterEstimate
} from '../../lib/export'

// Everything BOTH export dialogs have to do before either can offer a button:
// bake the annotations in, work out whether there is anything to compress, and
// (when asked) run the compression pass.
//
// ⚠️ EXTRACTED 2026-09-01, when flatten and lock moved out of the export dialog
// into Actions ▸ Advanced ▸ Advanced export. The two dialogs now ask different
// questions of the same document — "how big is it and give me the file" versus
// "turn the pages into pictures and seal it" — but the pipeline underneath is
// identical, and it is the part with the cancellation tokens, the XFA special
// case and the ordering that is easy to get subtly wrong. One copy.
//
// Annotations are stored in PDF-point space (the editor divides the on-screen
// pointer position by the render scale before saving), so the export maps them
// 1:1 into the page — no extra scaling. A value other than 1 shifts and
// shrinks every annotation toward the page's bottom-left corner. (The redaction
// rasteriser's DPI is a separate `renderScale` inside export.ts.)
const EXPORT_SCALE = 1.0

export interface ExportBuild {
  /** The source with annotations, redactions and form values baked in. */
  annotated: Uint8Array | null
  /** The compression pass's result, or null when `quality` was null. */
  compressed: CompressResult | null
  /** null = not worked out yet. Whether compression has anything to bite on. */
  hasImages: boolean | null
  /** What the two rasterising levels would produce, from one sampled page. */
  rasterEstimate: RasterEstimate | null
  building: boolean
  compressing: boolean
  /** 0–1, for the bar during a rasterising pass. */
  compressPct: number
  error: string | null
  /** Both passes are done and there is something to hand over. */
  ready: boolean
}

/**
 * Build the export for an open dialog.
 *
 * `quality` is the compression to run, or **null for none** — the advanced
 * dialog skips the pass entirely while its flatten box is unticked, because a
 * rasterising pass over a long document is minutes of work and nothing on
 * screen is waiting for it.
 */
export function useExportBuild(open: boolean, quality: CompressQuality | null): ExportBuild {
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const fileName = usePdfStore((s) => s.fileName)
  const doc = usePdfStore((s) => s.doc)
  const isXfa = usePdfStore((s) => s.isXfa)
  const annotations = useAnnotationStore((s) => s.annotations)
  const formValues = useFormStore((s) => s.values)

  const [annotated, setAnnotated] = useState<Uint8Array | null>(null)
  const [compressed, setCompressed] = useState<CompressResult | null>(null)
  const [hasImages, setHasImages] = useState<boolean | null>(null)
  const [rasterEstimate, setRasterEstimate] = useState<RasterEstimate | null>(null)
  const [building, setBuilding] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [compressPct, setCompressPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const buildIdRef = useRef(0)
  const compressIdRef = useRef(0)

  useEffect(() => {
    if (!open || !sourceBytes) return
    const myId = ++buildIdRef.current
    setAnnotated(null)
    setCompressed(null)
    setHasImages(null)
    setRasterEstimate(null)
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
        // Asked of the ANNOTATED bytes, not the source: a placed signature or
        // pasted picture is a raster image the source did not have, and it is
        // as compressible as any other.
        try {
          const probe = await PDFDocument.load(annot.slice(0))
          if (myId !== buildIdRef.current) return
          setHasImages(hasRasterImages(probe))
        } catch {
          if (myId === buildIdRef.current) setHasImages(true)
        }
        // Runs alongside the compression the other effect is doing, so by the
        // time the dialog is `ready` both answers are usually in and the level
        // buttons settle before they were ever usable.
        try {
          const est = await estimateRasterSizes(annot.slice(0).buffer as ArrayBuffer)
          if (myId === buildIdRef.current) setRasterEstimate(est)
        } catch {
          // Unknown stays unknown — offeredQualities shows everything.
        }
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
    if (!open || isXfa || !annotated || quality === null) return
    const myId = ++compressIdRef.current
    setCompressed(null)
    setCompressing(true)
    setCompressPct(0)
    ;(async () => {
      try {
        const annotBuf = annotated.slice().buffer
        // ⚠️ The 5th argument is what makes the flatten checkbox honest. By
        // default `compressPdf` hands back the lossless bytes whenever
        // rasterising inflated the file — right when the ask is "make this
        // smaller", and exactly wrong when the ask is "make this
        // uneditable", which is what any rasterising quality means.
        // Without it, ticking the box on a text document quietly returns a
        // file whose text is still selectable.
        const comp = await compressPdf(
          annotBuf,
          fileName ?? 'document.pdf',
          quality,
          (f) => {
            if (myId === compressIdRef.current) setCompressPct(f)
          },
          quality !== 'light'
        )
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

  // ⚠️ Dropped the moment the compression is switched OFF, not left lying
  // around. Stale bytes from the last time flatten was ticked are the wrong
  // file, and `download` picking them up would hand over a rasterised copy of
  // a document whose checkbox now says otherwise.
  useEffect(() => {
    if (quality !== null) return
    compressIdRef.current++
    setCompressed(null)
    setCompressing(false)
  }, [quality])

  const ready = Boolean(
    !building && !compressing && annotated && (quality === null || isXfa || compressed)
  )

  return {
    annotated,
    compressed,
    hasImages,
    rasterEstimate,
    building,
    compressing,
    compressPct,
    error,
    ready
  }
}
