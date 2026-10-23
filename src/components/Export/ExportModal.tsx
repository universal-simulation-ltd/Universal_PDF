import { useEffect, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { downloadPdfBytes } from '../../lib/download'
import { nextExportName, previewExportName } from '../../lib/exportName'
import { countRedactions, isRedactConfirmed, REDACT_CONFIRM_WORD } from '../../lib/redactGate'
import { markSaved } from '../../lib/unsavedChanges'
import { RedactIcon } from '../icons/RedactIcon'
import { useExportBuild } from './useExportBuild'
import { SigningRecordNote } from './SigningRecordNote'
import { useFlattenedCopy } from './useFlattenedCopy'
import { FLATTEN_BAR, LOSSLESS_BAR, worthOffering } from './worthOffering'
import { useT } from '../../i18n'
import { formatNumber, formatSize } from './formatSize'
import LockedOriginNote from '../Lock/LockedOriginNote'

// The plain export: here is your document, here is what it weighs, take it.
//
// Up to three copies, as tabs (James, 2026-10-22: "show default, compressed
// and flatten images — hide if the difference is too small"): the file as it
// is, the lossless re-save, and every page turned into a picture. A copy is a
// tab only when it is meaningfully smaller than the one before it — the bars
// are in `worthOffering.ts` — so on most text documents there is one file and
// no tab strip at all.
//
// ⚠️ The Flattened tab is a SIZE choice and only ever appears when it saves a
// lot. Flattening so the text cannot be copied, whatever the size, and locking
// stay in Actions ▸ Advanced ▸ Advanced export (`AdvancedExportDialog`). Do
// not add a checkbox for either here: the Download button honours the tab
// that is selected and nothing else, and a second control that could also
// change the file is how the two would come to disagree.
type Variant = 'original' | 'compressed' | 'flattened'

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
  const fileName = usePdfStore((s) => s.fileName)
  const isXfa = usePdfStore((s) => s.isXfa)
  const setPreviewOpen = usePdfStore((s) => s.setPreviewOpen)
  const setAdvancedExportOpen = usePdfStore((s) => s.setAdvancedExportOpen)
  const annotations = useAnnotationStore((s) => s.annotations)
  const t = useT()

  // ⚠️ 'light' and nothing else. It is the LOSSLESS re-save — an object-stream
  // rebuild that keeps the text layer — so this dialog can offer a smaller copy
  // without ever asking the user to give something up for it. The rasterising
  // levels live in the advanced dialog, behind a checkbox that says what they
  // cost.
  const { annotated, compressed, hasImages, rasterEstimate, building, compressing, compressPct, error, ready } =
    useExportBuild(open, 'light')

  const origSize = annotated?.byteLength ?? 0
  const compSize = compressed?.compressedSize ?? 0
  const saved = origSize - compSize
  const pct = origSize > 0 ? (saved / origSize) * 100 : 0
  // A saving too small to name is not a choice worth offering — a tab
  // promising "−1%" is just a second button that does nothing.
  const didShrink = ready && worthOffering(compSize, origSize, LOSSLESS_BAR)

  // Flattening has to beat the best copy that keeps the text, not the file as
  // it is: a tab that is only smaller than the original, and no smaller than
  // Compressed, costs the text layer for nothing.
  const bestLossless = didShrink ? compSize : origSize
  const { flattened, promising, flattening, flattenPct } = useFlattenedCopy(
    open && !isXfa && hasImages !== false,
    ready ? annotated : null,
    ready ? bestLossless : null,
    rasterEstimate
  )
  const flatSize = flattened?.compressedSize ?? 0
  const flatSaved = origSize - flatSize
  const flatPct = origSize > 0 ? (flatSaved / origSize) * 100 : 0
  // On screen while the pass runs (the estimate said it will be worth it), and
  // kept only if the measured size bears that out.
  const offerFlattened =
    promising &&
    (flattening || (!!flattened && !flattened.fellBackToLossless && worthOffering(flatSize, bestLossless, FLATTEN_BAR)))

  const [tab, setTab] = useState<Variant>('compressed')

  // Export is the point of no return for redactions: until now they're just
  // movable black-box markup, but the rasterise-and-rebuild pass removes the
  // underlying text for good. Gate the destructive actions behind a typed
  // "REDACT" confirmation when the document has any.
  // ⚠️ The rule itself lives in lib/redactGate.ts, shared with the exit
  // guard's "Save and exit" — the other way a redaction can be baked in.
  const redactCount = countRedactions(annotations)
  const needsRedactConfirm = !isXfa && redactCount > 0
  const [redactConfirm, setRedactConfirm] = useState('')
  const redactConfirmed = !needsRedactConfirm || isRedactConfirmed(redactConfirm)

  useEffect(() => {
    if (!open) return
    setTab('compressed')
    setRedactConfirm('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Nothing worth saving, so there is only one file to download and the tab
  // strip has nothing to offer — hidden, not a greyed-out "no savings" tab
  // (James, 2026-10-07: "Don't show the compressed tab if there's no
  // compression"). Why it could not shrink is said under the size instead.
  const compressionPointless = ready && !didShrink && !offerFlattened
  // ⚠️ Only once the answer is in: shown while building, the strip would
  // appear and then vanish under the cursor whenever there was nothing saved.
  const showVariantTabs = ready && (didShrink || offerFlattened)
  // A tab that is no longer offered hands its selection to the next copy
  // down: Flattened to Compressed, Compressed to the file as it is.
  const effectiveTab: Variant = !ready
    ? tab
    : tab === 'flattened' && !offerFlattened
      ? didShrink ? 'compressed' : 'original'
      : tab === 'compressed' && !didShrink
        ? 'original'
        : tab

  // Why there is no smaller copy. With no images, it is as small as it goes;
  // with images, neither the re-save nor turning the pages into pictures
  // would change it enough to be worth a second file.
  const noGainNote = hasImages === false
    ? t('tools.export.no_images')
    : t('tools.export.already_small')

  // ⚠️ The name is claimed at DOWNLOAD time, not here. `nextExportName`
  // increments a per-document counter, so working it out during render would
  // burn a version on every re-render — hence `previewExportName` for the
  // label and `nextExportName` for the actual save.
  const previewName = previewExportName(fileName)

  function download(which: Variant) {
    if (!annotated) return
    const source = which === 'original' ? annotated : which === 'flattened' ? flattened?.bytes : compressed?.bytes
    if (!source) return
    const name = nextExportName(fileName)
    downloadPdfBytes(source.slice(), name)
    // The amendments are now in a file, so the exit guard has nothing left to
    // offer to save. Every route out of a document reads this.
    markSaved()
    onClose()
  }

  function openPrintPreview() {
    setPreviewOpen(true)
    onClose()
  }

  function openAdvanced() {
    setAdvancedExportOpen(true)
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
          <h2 className="text-lg font-semibold text-slate-900">{t('tools.export.title')}</h2>
          <button
            onClick={onClose}
            aria-label={t('tools.common.close')}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5">
        {/* Locking lives in Advanced, so that is where "Lock it again" goes.
            XFA documents cannot be locked here at all — see xfa_body. */}
        <LockedOriginNote kind="save" onRelock={isXfa ? undefined : openAdvanced} className="mb-3" />
        {error ? (
          <div className="text-sm text-red-600">{t('tools.export.failed', { message: error })}</div>
        ) : isXfa ? (
          <>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">{t('tools.export.xfa_title')}</div>
              <p className="mt-1 text-xs text-slate-500">
                {t('tools.export.xfa_body')}
              </p>
              <div className="mt-3 text-2xl font-semibold text-slate-900 tabular-nums">
                {annotated ? formatSize(t, annotated.byteLength) : t('tools.export.building_short')}
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
                <DownloadGlyph />
                {t('tools.export.download_filled_form')}
              </button>
              <button
                onClick={doPrint}
                disabled={!annotated}
                className="px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-2"
              >
                <PrintGlyph />
                {t('tools.export.print')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              {/* Tabs are a choice. With every smaller copy ruled out there is
                  only one file to download, so a tab strip with permanently
                  disabled tabs is chrome that asks a question it already knows
                  the answer to. */}
              {showVariantTabs && (
              <div className="flex bg-slate-50 border-b border-slate-200" role="tablist">
                <VariantTab selected={effectiveTab === 'original'} onSelect={() => setTab('original')} label={t('tools.compress.original')}>
                  <span className="text-[11px] text-slate-400 tabular-nums font-normal">{formatSize(t, origSize)}</span>
                </VariantTab>
                {didShrink && (
                  <VariantTab selected={effectiveTab === 'compressed'} onSelect={() => setTab('compressed')} label={t('tools.compress.compressed')}>
                    <span className="text-[11px] font-medium tabular-nums text-emerald-700">
                      {t('tools.export.percent_less', { pct: formatNumber(t, pct, 0) })}
                    </span>
                  </VariantTab>
                )}
                {offerFlattened && (
                  <VariantTab selected={effectiveTab === 'flattened'} onSelect={() => setTab('flattened')} label={t('tools.export.flattened')}>
                    {flattened && (
                      <span className="text-[11px] font-medium tabular-nums text-emerald-700">
                        {t('tools.export.percent_less', { pct: formatNumber(t, flatPct, 0) })}
                      </span>
                    )}
                  </VariantTab>
                )}
              </div>
              )}

              <div className="p-4">
                {!ready ? (
                  <>
                    <div className="text-sm text-slate-500">
                      {building ? t('tools.export.building') : t('tools.export.compressing')}
                    </div>
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
                        {formatSize(t, origSize)}
                      </div>
                      <div className="text-xs text-slate-500">{t('tools.export.annotations_baked_in')}</div>
                    </div>
                    {compressionPointless && (
                      <div className="mt-1 text-[11px] text-slate-400">
                        {noGainNote}
                      </div>
                    )}
                  </>
                ) : effectiveTab === 'flattened' ? (
                  !flattened ? (
                    <>
                      <div className="text-sm text-slate-500">{t('tools.advanced.flattening')}</div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-orange-600 transition-[width] duration-200"
                          style={{ width: `${Math.round(flattenPct * 100)}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                          {formatSize(t, flatSize)}
                        </div>
                        <div className="text-xs font-medium text-emerald-700">
                          {t('tools.compress.saved', { size: formatSize(t, flatSaved), pct: formatNumber(t, flatPct, 1) })}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t('tools.export.flattened_note')}</div>
                    </>
                  )
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                        {formatSize(t, compSize)}
                      </div>
                      <div className="text-xs font-medium text-emerald-700">
                        {t('tools.compress.saved', { size: formatSize(t, saved), pct: formatNumber(t, pct, 1) })}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{t('tools.export.object_stream')}</div>
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
                      {t('tools.export.redact_title')}
                    </div>
                    <p className="mt-1 text-xs text-red-700">
                      {t.plural('tools.export.redact_body', redactCount)}
                    </p>
                    <input
                      value={redactConfirm}
                      onChange={(e) => setRedactConfirm(e.target.value)}
                      placeholder={t('tools.export.redact_confirm', { word: REDACT_CONFIRM_WORD })}
                      aria-label={t('tools.export.redact_confirm', { word: REDACT_CONFIRM_WORD })}
                      autoCapitalize="characters"
                      spellCheck={false}
                      className="mt-2.5 w-full rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder:text-red-300"
                    />
                  </div>
                </div>
              </div>
            )}

            <SigningRecordNote />

            {/* The name, before the button is pressed. It is the point of the
                change and it is not otherwise guessable — a second export from
                the same document goes to v2, not v1. */}
            <p className="mt-4 text-xs text-slate-500">
              {t.rich('tools.export.saves_as', {
                name: <span className="font-medium text-slate-700">{previewName}</span>
              })}
            </p>

            <div className="mt-2 grid grid-cols-2 sm:grid-cols-[1fr_auto_auto] gap-2">
              {/* Download | ⚙ — one split button (James, 2026-10-07). The ⚙ half
                  is Advanced export (flatten, lock and the rest), which until
                  then was a sentence of link text under the row. ⚠️ Still a
                  SIGNPOST, not a second set of controls: it closes this dialog
                  and opens that one, never both on screen. */}
              <div className="col-span-2 sm:col-span-1 flex min-w-0">
              <button
                onClick={() => download(effectiveTab)}
                disabled={!ready || !redactConfirmed || (effectiveTab === 'flattened' && !flattened)}
                className="flex-1 min-w-0 px-4 py-2.5 bg-orange-700 hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-l-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <DownloadGlyph />
                {/* Never "Download Original": the uncompressed copy still
                    carries the user's edits, so "original" reads as though
                    their changes would be thrown away. */}
                {showVariantTabs && effectiveTab === 'compressed'
                  ? t('tools.export.download_compressed')
                  : showVariantTabs && effectiveTab === 'flattened'
                    ? t('tools.export.download_flattened')
                    : t('tools.export.download')}
              </button>
              <button
                type="button"
                onClick={openAdvanced}
                title={t('tools.export.need_advanced')}
                aria-label={t('tools.advanced.title')}
                className="px-3 py-2.5 bg-orange-700 hover:bg-orange-800 text-white rounded-r-lg border-l border-white/30 flex items-center justify-center"
              >
                <AdvancedGlyph />
              </button>
              </div>
              <button
                onClick={openPrintPreview}
                disabled={!ready || !redactConfirmed}
                className="px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-2"
              >
                <PreviewGlyph />
                {t('tools.export.preview')}
              </button>
              <button
                onClick={doPrint}
                disabled={!ready || !redactConfirmed}
                className="px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-2"
              >
                <PrintGlyph />
                {t('tools.export.print')}
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
            {t('tools.common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

// One copy in the tab strip. The size or saving sits under the label, so three
// tabs still fit a phone-width dialog without the labels being cut off.
function VariantTab({
  selected,
  onSelect,
  label,
  children
}: {
  selected: boolean
  onSelect: () => void
  label: string
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={[
        'flex-1 min-w-0 px-2 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex flex-col items-center leading-tight',
        selected ? 'border-orange-600 text-slate-900 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'
      ].join(' ')}
    >
      {label}
      {children}
    </button>
  )
}

// The action row's icons. One stroke weight and size so Download, Preview and
// Print read as a set — they were ⬇, ◎ and 🖨 until 2026-10-07: three
// different fonts, one of them a colour emoji. aria-hidden, so each button's
// name stays exactly its label (the e2e specs find them by it).
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  )
}

function DownloadGlyph() {
  return (
    <Glyph>
      <path d="M12 4v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </Glyph>
  )
}

function PreviewGlyph() {
  return (
    <Glyph>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  )
}

function PrintGlyph() {
  return (
    <Glyph>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v7H6z" />
    </Glyph>
  )
}

// Advanced export: sliders, the usual "more options" mark.
function AdvancedGlyph() {
  return (
    <Glyph>
      <path d="M4 6h10" />
      <path d="M18 6h2" />
      <circle cx="16" cy="6" r="2" />
      <path d="M4 12h2" />
      <path d="M10 12h10" />
      <circle cx="8" cy="12" r="2" />
      <path d="M4 18h10" />
      <path d="M18 18h2" />
      <circle cx="16" cy="18" r="2" />
    </Glyph>
  )
}
