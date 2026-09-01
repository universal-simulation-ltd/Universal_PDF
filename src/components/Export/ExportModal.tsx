import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useFormStore } from '../../stores/formStore'
import { PDFDocument } from 'pdf-lib'
import {
  buildAnnotatedPdfBytes,
  compressPdf,
  downloadPdfBytes,
  estimateRasterSizes,
  hasRasterImages,
  type CompressQuality,
  type CompressResult,
  type RasterEstimate
} from '../../lib/export'
import { nextExportName, previewExportName } from '../../lib/exportName'
import { countRedactions, isRedactConfirmed } from '../../lib/redactGate'
import { encryptPdf } from '../../lib/pdfEncrypt'
import LockFields, { EMPTY_LOCK, lockIncomplete, lockPasswordOf, type LockState } from '../Lock/LockFields'
import { markSaved } from '../../lib/unsavedChanges'
import { RedactIcon } from '../icons/RedactIcon'

// Annotations are stored in PDF-point space (the editor divides the on-screen
// pointer position by the render scale before saving), so the export maps them
// 1:1 into the page — no extra scaling. A value other than 1 shifts and
// shrinks every annotation toward the page's bottom-left corner. (The redaction
// rasteriser's DPI is a separate `renderScale` inside export.ts.)
const EXPORT_SCALE = 1.0

type Variant = 'original' | 'compressed'

// ⚠️ TWO ORTHOGONAL QUESTIONS, and until 2026-08-31 this file asked them as
// one. `CompressQuality` is a single scale — light / balanced / strong — but
// 'light' differs from the other two in KIND, not in degree: it is a lossless
// re-save, while both the others turn every page into a picture. Presenting
// them as one row of three made "do I keep my text layer?" look like a
// compression setting, and gated it behind whether flattening would save
// enough bytes to be worth offering.
//
// It is not a size question. The reason to want a flattened PDF is "nobody can
// reflow, copy or edit what I signed", which is true of a 40 KB letter exactly
// as it is of a 40 MB scan — and a 40 KB letter never cleared the ≥20% AND
// ≥100 KB bar in `worthOffering`, so on every text document (every Word file
// this app converts, for one) the mode was present, functional and completely
// unreachable.
//
// So the two questions are now two controls: a FLATTEN checkbox, always
// available, and — only once flattening is on — a strength choice between the
// two rasterising levels. 'light' is no longer a button; it IS the unchecked
// box, which is the default here and nowhere else, because an export is an
// annotated and often signed document and giving away its text layer is not a
// thing to do on somebody's behalf.
const FLATTEN_OPTIONS: { value: CompressQuality; label: string; hint: string }[] = [
  { value: 'balanced', label: 'Balanced', hint: 'Good quality · big saving on scans' },
  { value: 'strong', label: 'Maximum', hint: 'Smallest · most visible loss' }
]

/** The quality used when the flatten box is ticked, before any strength is picked. */
const DEFAULT_FLATTEN: CompressQuality = 'balanced'

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
  // null = not worked out yet. Whether the rasterising qualities have anything
  // to bite on; see `canCompressAtAll` below for what it is used for.
  const [hasImages, setHasImages] = useState<boolean | null>(null)
  // What the two rasterising levels would produce, measured from one sampled
  // page. null until known; see `offeredQualities`.
  const [rasterEstimate, setRasterEstimate] = useState<RasterEstimate | null>(null)
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
  // ⚠️ The rule itself lives in lib/redactGate.ts, shared with the exit
  // guard's "Save and exit" — the other way a redaction can be baked in.
  const redactCount = countRedactions(annotations)
  const needsRedactConfirm = !isXfa && redactCount > 0
  const [redactConfirm, setRedactConfirm] = useState('')
  const redactConfirmed = !needsRedactConfirm || isRedactConfirmed(redactConfirm)

  // Locking runs at DOWNLOAD time, not while the dialog is open: it is the
  // last step over the finished bytes, and re-running it on every keystroke of
  // a password would be both pointless and slow (Algorithm 2.B is designed to
  // be slow). `locking` exists because that step is the one part of an export
  // that can take a visible moment.
  const [lock, setLock] = useState<LockState>(EMPTY_LOCK)
  const [locking, setLocking] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTab('compressed')
    setQuality('light')
    setRedactConfirm('')
    // ⚠️ Cleared every time the dialog opens. A password left in state from a
    // previous export would silently lock the NEXT document with it — a file
    // the user never meant to protect, sealed with something they have already
    // forgotten they typed.
    setLock(EMPTY_LOCK)
    setLockError(null)
  }, [open])

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
        // Runs alongside the light compression the other effect is doing, so
        // by the time the dialog is `ready` both answers are usually in and the
        // level buttons settle before they were ever usable.
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
    if (!open || isXfa || !annotated) return
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
        // uneditable", which is what any rasterising quality means HERE.
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
  // A saving too small to name is not a choice worth offering. Under half a
  // percent AND under 20 KB rounds to "the same size" in the panel below, so a
  // tab promising "−0%" is just a second button that does nothing.
  const didShrink = saved > 0 && (pct >= 0.5 || saved >= 20 * 1024)

  // Is the user asking for a flattened file? This is the whole of the flatten
  // state — there is no second boolean to keep in step with `quality`, and so
  // no way for the checkbox and the compressor to disagree about what is being
  // produced.
  const flatten = quality !== 'light'

  // Whether to show the SIZE-driven compression controls at all.
  //
  // Two different "no gain" cases, and only one of them means they are useless:
  //
  //  - Light found nothing, but the document HAS images. Flattening may still
  //    shrink it enormously — that is the whole point of it on a scan — so the
  //    controls stay and the hint says to try it.
  //  - The document has no images at all. Then nothing can win on SIZE: the
  //    rasterising levels have nothing to re-encode and would only inflate it
  //    (see `fellBackToLossless`), and Light has already had its go.
  //
  // ⚠️ `&& !flatten`. Somebody who has ticked the box is not asking for a
  // smaller file — they are asking for one nobody can edit — so "there is
  // nothing to gain here" is no longer a reason to take the controls away.
  // Without this clause the text-only document, which is exactly the case the
  // checkbox exists for, hides the result of its own setting.
  //
  // `hasImages === null` means the probe has not finished (or failed, in which
  // case it reports true). Keep the controls until we know better — appearing
  // late is worse than a control that turns out not to help.
  const compressionPointless = ready && !didShrink && hasImages === false && !flatten

  // Which strength buttons are worth putting on screen.
  //
  // 'light' is always offered — it is the lossless one and the default.
  // 'balanced' and 'strong' turn every page into a picture, which costs the
  // document its text layer: it can no longer be selected, searched or read
  // aloud. That is a real trade, so it is only worth OFFERING for a real
  // saving. A level that would shave 3% off does not earn the question.
  //
  // Measured against the lossless result, not the original, because Light is
  // what the user gets for free without giving anything up.
  const RASTER_WORTH_IT = 0.2 // ≥20% smaller...
  const RASTER_MIN_BYTES = 100 * 1024 // ...and ≥100 KB, so tiny files don't qualify on ratio alone
  const losslessSize = compressed && !compressed.fellBackToLossless && quality === 'light'
    ? compressed.compressedSize
    : origSize
  function worthOffering(estimated: number, against: number): boolean {
    const savedVs = against - estimated
    return savedVs >= against * RASTER_WORTH_IT && savedVs >= RASTER_MIN_BYTES
  }
  // ⚠️ `worthOffering` NO LONGER DECIDES WHETHER FLATTENING IS REACHABLE — that
  // is the whole point of the checkbox, and it is available on every document.
  // What it still decides is whether MAXIMUM is worth putting beside Balanced:
  // if the two land in the same place, the extra visible damage buys nothing
  // and one button is not a choice.
  const offeredQualities = FLATTEN_OPTIONS.filter((opt) => {
    if (opt.value === 'balanced') return true
    // Not measured yet (or the estimate failed): show it rather than hide a
    // level that might have been the useful one.
    if (!rasterEstimate) return true
    // Never hide the level currently in use — a button vanishing from under
    // the user's own selection is worse than one that turns out not to help.
    if (opt.value === quality) return true
    return worthOffering(rasterEstimate.strong, rasterEstimate.balanced)
  })

  // How much smaller flattening would make it, for the line under the checkbox.
  // Null when unknown, and — deliberately — also when it would make the file
  // BIGGER: a text document rasterises to something larger almost every time,
  // and "· 240 KB bigger" beside a checkbox reads as a warning against ticking
  // it when size is not what it is for. `fellBackToLossless` says the same
  // thing afterwards, in the place where it matters.
  const flattenSaving =
    rasterEstimate && losslessSize - rasterEstimate.balanced >= RASTER_MIN_BYTES
      ? losslessSize - rasterEstimate.balanced
      : null
  // ⚠️ Two SEPARATE questions, and conflating them drops a real choice:
  //
  //  - showStrength: is there more than one compression level worth picking?
  //    One button is not a choice, so the strength row goes.
  //  - showVariantTabs: is there a compressed file worth choosing INSTEAD of
  //    the original? A document where Light saves 40% but rasterising is not
  //    worth offering has only one strength — and still very much has two
  //    files. Hiding the tabs with the strength row would have stranded the
  //    user on whichever variant happened to be selected.
  const showVariantTabs = !compressionPointless
  // ⚠️ Only ever a choice BETWEEN the two rasterising levels, so it needs
  // flattening to be on. When the box is unticked there is exactly one
  // possible output and a strength row would be a control over nothing.
  const showStrength = showVariantTabs && flatten && offeredQualities.length > 1
  // ⚠️ `&& !flatten`. This bounce exists so nobody downloads a "compressed"
  // file that is the same size as the original — but a deliberately flattened
  // file is wanted whatever it weighs, and bouncing the user back to Original
  // would silently hand them the very text layer they asked to destroy.
  const effectiveTab: Variant =
    ready && tab === 'compressed' && !didShrink && !flatten ? 'original' : tab

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

  async function download(which: 'original' | 'compressed') {
    if (!annotated || !compressed) return
    // Widened to plain `Uint8Array` because the locked bytes come back over a
    // buffer TypeScript will not narrow to ArrayBuffer; both are the same
    // thing at runtime.
    let bytes: Uint8Array = (which === 'original' ? annotated : compressed.bytes).slice()

    if (lock.enabled) {
      const password = lockPasswordOf(lock)
      // ⚠️ Bail, never fall through. If the fields are incomplete the button
      // is already disabled, but the one unacceptable outcome here is handing
      // someone an UNLOCKED file because their confirm box was a character
      // out — so the null case stops the export rather than skipping the lock.
      if (!password) return
      setLockError(null)
      setLocking(true)
      try {
        bytes = (await encryptPdf(bytes, password)).bytes
      } catch (e) {
        setLockError((e as Error).message || 'Could not lock this PDF.')
        return
      } finally {
        setLocking(false)
      }
    }

    // ⚠️ Claimed only now that the bytes exist. `nextExportName` increments a
    // per-document counter, so calling it before a lock that then failed would
    // burn v1 on a file that was never written.
    //
    // One name for either variant: the modal closes after a download, so only
    // one of the two ever leaves per opening, and which variant it was is not
    // something the file needs to carry.
    const name = nextExportName(fileName)
    downloadPdfBytes(bytes, name)
    // The amendments are now in a file, so the exit guard has nothing left to
    // offer to save. Every route out of a document reads this.
    markSaved()
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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* ⚠️ A flex COLUMN capped at the viewport, not one box that grows past
          it. `max-h-[min(100%,100dvh)]`: 100% is this overlay's content box
          (the viewport less its padding) and 100dvh shrinks with iOS's browser
          chrome, so min() takes whichever is actually visible — a `vh` cap
          does not, because `vh` is the LARGE viewport on iOS. The title row
          and the Cancel row sit OUTSIDE the scrolling middle, so neither can
          be scrolled off a 390x844 screen. */}
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-lg flex max-h-[min(100%,100dvh)] flex-col">
        <div className="flex shrink-0 items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Export PDF</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5">
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
                  markSaved()
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
            {/* ⚠️ ALWAYS OFFERED, on every document, and that is the change.
                This used to be two of three buttons in a "Compression" row that
                only appeared when rasterising would save ≥20% AND ≥100 KB — so
                on a text document it was unreachable, which is precisely the
                document somebody wants flattened. The reason to want it is
                "nobody can reflow, copy or edit what I signed"; that has
                nothing to do with file size, so size no longer gates it. */}
            <div className="mb-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flatten}
                  onChange={(e) => setQuality(e.target.checked ? DEFAULT_FLATTEN : 'light')}
                  disabled={building || compressing}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-orange-700 disabled:cursor-wait"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">
                    Flatten pages to images
                    {flattenSaving !== null && (
                      <span className="ml-1.5 text-xs font-medium tabular-nums text-emerald-700">
                        ≈ {formatSize(flattenSaving)} smaller
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Every page becomes a picture, so nobody can select, copy, search or edit
                    the text — useful for a document you have signed.
                  </span>
                </span>
              </label>

              {/* Only a choice between the two rasterising levels, so it lives
                  inside the checkbox it belongs to and appears with it. */}
              {showStrength && (
                <div className="mt-2.5 pl-6.5">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1.5">
                    Image quality
                  </div>
                  <div
                    className="grid gap-1 p-1 bg-slate-100 rounded-lg"
                    style={{ gridTemplateColumns: `repeat(${offeredQualities.length}, minmax(0, 1fr))` }}
                  >
                    {offeredQualities.map((opt) => {
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
                    {FLATTEN_OPTIONS.find((o) => o.value === quality)?.hint}
                  </div>
                </div>
              )}

              {flatten && (
                <div className="mt-2 text-xs text-amber-700">
                  The Original tab is unaffected — it keeps its text layer, so download that
                  one if you need the text back.
                </div>
              )}
            </div>

            {/* ⚠️ Below flattening, and that ordering is the point. The two
                look like neighbours — both are "stop someone doing something
                with this file" — but only one of them is real. Flattening
                removes the text layer; locking encrypts the document. Putting
                a lock beside a PDF "no printing / no copying" permissions
                checkbox is what most PDF apps do, and it is why users believe
                those flags protect anything. There is no such checkbox here on
                purpose — see the note at the top of lib/pdfCrypto.ts. */}
            <LockFields value={lock} onChange={setLock} disabled={building || compressing || locking} />

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              {/* Two tabs are a choice. With compression ruled out there is only
                  one file to download, so a tab strip with a permanently
                  disabled half is chrome that asks a question it already knows
                  the answer to. */}
              {showVariantTabs && (
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
                  // ⚠️ `|| flatten`. Disabling this tab is how the modal stops
                  // somebody downloading a "compressed" copy that saved
                  // nothing — but once flattening is ticked the second file is
                  // wanted for what it IS, not for what it weighs, and a
                  // disabled tab would make the checkbox unusable on exactly
                  // the documents it was added for.
                  disabled={ready ? !didShrink && !flatten : false}
                  title={ready && !didShrink && !flatten ? noGainNote : undefined}
                  className={[
                    'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors disabled:cursor-not-allowed',
                    effectiveTab === 'compressed'
                      ? 'border-orange-600 text-slate-900 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-700 disabled:text-slate-300 disabled:hover:text-slate-300'
                  ].join(' ')}
                >
                  {/* Named for what it holds. "Compressed" is a claim about
                      size, and a deliberately flattened file may well be
                      bigger — calling that tab Compressed would be wrong in
                      the one case the user asked for it. */}
                  {flatten ? 'Flattened' : 'Compressed'}
                  {ready && didShrink && (
                    <span className="ml-2 text-[11px] font-medium tabular-nums text-emerald-700">
                      −{pct.toFixed(0)}%
                    </span>
                  )}
                  {ready && !didShrink && !flatten && (
                    <span className="ml-2 text-[11px] font-normal text-slate-400">no savings</span>
                  )}
                  {ready && !didShrink && flatten && (
                    <span className="ml-2 text-[11px] font-normal tabular-nums text-slate-400">
                      {saved < 0 ? `+${formatSize(-saved)}` : 'same size'}
                    </span>
                  )}
                </button>
              </div>
              )}

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
                    {compressionPointless && (
                      <div className="mt-1 text-[11px] text-slate-400">
                        Already as small as it goes — there are no images here to compress.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                        {formatSize(compSize)}
                      </div>
                      {/* ⚠️ Three outcomes, not one. Flattening a text document
                          routinely produces a BIGGER file, and the old single
                          line rendered that as "Saved -240 KB (-12.0%)" in
                          green — a saving of a negative number, which is not a
                          sentence anybody should have to parse. */}
                      {saved > 0 ? (
                        <div className="text-xs font-medium text-emerald-700">
                          Saved {formatSize(saved)} ({pct.toFixed(1)}%)
                        </div>
                      ) : saved < 0 ? (
                        <div className="text-xs font-medium text-amber-700">
                          {formatSize(-saved)} bigger ({(-pct).toFixed(1)}%)
                        </div>
                      ) : (
                        <div className="text-xs font-medium text-slate-500">Same size</div>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {compressed?.fellBackToLossless || quality === 'light'
                        ? 'object-stream re-save'
                        : 'pages rasterised to JPEG'}
                    </div>
                    {/* ⓘ No "these pages were not flattened" warning here, and
                        that is not an omission. It was written first, then
                        deleted once `compressPdf` gained
                        `keepRasterEvenIfBigger`: with the export dialog passing
                        that for every rasterising quality, `fellBackToLossless`
                        can no longer come back true on this path, so the
                        warning was unreachable UI describing a state that
                        cannot happen. The fallback is still right for the
                        Compress dialogs, which ARE asking for a smaller file. */}
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

            {/* A disabled button with no stated reason is the same as a broken
                one. `lockIncomplete` is the only condition here that the user
                can fix by typing, so it is the only one that says so. */}
            {lockIncomplete(lock) && !lockError && (
              <p className="mt-1 text-xs text-amber-700">
                Finish the {lock.mode === 'pin' ? 'PIN' : 'password'} fields above to download.
              </p>
            )}
            {lockError && <p className="mt-1 text-xs text-red-600">{lockError}</p>}

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <button
                onClick={() => { void download(effectiveTab) }}
                disabled={!ready || !redactConfirmed || lockIncomplete(lock) || locking}
                className="px-4 py-2.5 bg-orange-700 hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">{lock.enabled ? '🔒' : '⬇'}</span>
                {/* "Download Original" only means something next to a
                    "Download Compressed". On its own it reads as though there
                    were another, better copy being withheld. */}
                {locking
                  ? 'Locking…'
                  : `Download${!showVariantTabs ? '' : effectiveTab === 'original' ? ' Original' : flatten ? ' Flattened' : ' Compressed'}`}
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
        </div>

        <div className="mt-5 flex shrink-0 items-center justify-end">
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
