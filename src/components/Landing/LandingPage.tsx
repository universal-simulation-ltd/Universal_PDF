import { useRef, useState } from 'react'
import { DropAnywhere, DropRing, useFileDrop } from '@unisim/sdk'
import { usePdfStore } from '../../stores/pdfStore'
import { createExamplePdfFile } from '../../lib/examplePdf'
import { compressPdf, type CompressQuality, type CompressResult } from '../../lib/export'
import {
  isPdfFile,
  OfficeImportError,
  PDF_OR_OFFICE_ACCEPT,
  toViewablePdf
} from '../../lib/officeToPdf'
import CompressResultModal from '../Compress/CompressResultModal'
import BatchCompressModal, { type BatchSource } from '../Compress/BatchCompressModal'
import MergeDialog from '../Convert/MergeDialog'
import ConvertDialog, { type ConvertMode } from '../Convert/ConvertDialog'
import RecentFilesList from '../RecentFiles/RecentFilesList'
import OcrModal from '../Ocr/OcrModal'
import TransformPanel from '../Transform/TransformPanel'
import PdfIllustration from './PdfIllustration'
import DownloadRow from './DownloadRow'
import DropRingWatermark from './DropRingWatermark'
import PrivacyNote from './PrivacyNote'
import { DefaultAppPill } from '../Onboarding/DefaultAppOffer'
import { useDefaultPdfApp } from '../../hooks/useDefaultPdfApp'
import { PreviewPanePill } from '../Onboarding/PreviewPaneOffer'
import { usePreviewPane } from '../../hooks/usePreviewPane'
import { CONTAINER } from '../../lib/layout'

// Balanced is the default when compressing — 'light' is lossless but usually
// barely shrinks, so people expect the "1 Click Compress" default to actually
// make the file smaller. Stronger/lighter are still one tap away in the modal.
const DEFAULT_COMPRESS_QUALITY: CompressQuality = 'balanced'

export default function LandingPage() {
  // The default-app offer, now surfaced only as the "System options" pill —
  // the top-of-page bar it used to share this with is gone (2026-08-27).
  const defaultApp = useDefaultPdfApp()
  const previewPane = usePreviewPane()
  const compressInputRef = useRef<HTMLInputElement>(null)
  const ocrInputRef = useRef<HTMLInputElement>(null)
  const loadFile = usePdfStore((s) => s.loadFile)
  const hasRecents = usePdfStore((s) => s.recents.length > 0)
  const [opening, setOpening] = useState(false)
  const [converting, setConverting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [compressProgress, setCompressProgress] = useState('')
  const [compressJob, setCompressJob] = useState<{
    sourceBytes: ArrayBuffer
    fileName: string
    result: CompressResult
  } | null>(null)
  const [batchJob, setBatchJob] = useState<{
    files: BatchSource[]
    results: CompressResult[]
  } | null>(null)
  const [dragOverCompress, setDragOverCompress] = useState(false)
  const [transformOpen, setTransformOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [convertMode, setConvertMode] = useState<ConvertMode | null>(null)
  const [ocrJob, setOcrJob] = useState<{ bytes: ArrayBuffer; name: string } | null>(null)

  // The suite's shared drop mechanics — drag depth, the hidden input, click and
  // Enter and Space, resetting the value so the same file can be picked twice.
  // `openFiles` is a hoisted declaration, so referring to it here is fine.
  //
  // `pageWide`: the circle is where to aim, not where you have to land. A PDF let
  // go two pixels outside the ring used to be handed to the browser, which
  // navigates away from the tab — on this page that costs nothing, but the same
  // gesture over the compress pill or the recents list is a plain miss and the
  // app should just take the file. It replaces the `window` listener App.tsx used
  // to keep for this, and with it the stopPropagation wrappers this zone needed
  // to stop that listener loading the same file a second time: the hook skips any
  // drop that landed inside a `data-unisim-dropzone`, which this is.
  //
  // Not while one of this page's own dialogs is up: every one of them is either
  // showing a result for a file already chosen or asking for a different file of
  // its own, and swapping the document out from behind it would leave the dialog
  // describing something that is no longer there.
  const modalOpen =
    !!compressJob || !!batchJob || transformOpen || mergeOpen || !!convertMode || !!ocrJob
  const drop = useFileDrop({
    onFiles: openFiles,
    accept: PDF_OR_OFFICE_ACCEPT,
    multiple: false,
    pageWide: true,
    disabled: modalOpen,
    label: 'Drop a PDF, Word or OpenDocument file here, or click to browse',
  })
  // ⚠️ `over`/`pageOver` go true for a page drag whether or not the zone is
  // disabled — the hook lights every page-wide zone and only checks `disabled`
  // when deciding who TAKES the file. Lighting a ring that will not take
  // anything is a lie, so gate the visuals on the same condition. The compress
  // pill below is the other case: it is its own drop target with its own
  // meaning, so the "drop anywhere to open" hint has no business over it.
  const over = drop.over && !modalOpen
  const showDropHint = drop.pageOver && !modalOpen && !dragOverCompress

  async function runCompress(fileList: File[] | FileList) {
    const files = Array.from(fileList).filter(
      (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    )
    if (files.length === 0) {
      alert('Please choose one or more PDF files.')
      return
    }
    setCompressing(true)
    setCompressProgress('')
    try {
      if (files.length === 1) {
        const buf = await files[0].arrayBuffer()
        // Slice so the kept-around source survives pdfjs detaching its copy.
        // The percentage is the page counter: rasterising a long scan is
        // minutes of work, and a pill that just says "Compressing…" for all of
        // it is indistinguishable from one that has crashed.
        const result = await compressPdf(
          buf.slice(0),
          files[0].name,
          DEFAULT_COMPRESS_QUALITY,
          (f) => setCompressProgress(`Compressing… ${Math.round(f * 100)}%`)
        )
        setCompressJob({ sourceBytes: buf, fileName: files[0].name, result })
        return
      }
      // Batch: compress each at the default quality (re-tunable in the modal).
      const sources: BatchSource[] = []
      const results: CompressResult[] = []
      for (let i = 0; i < files.length; i++) {
        setCompressProgress(`Compressing ${i + 1}/${files.length}…`)
        const buf = await files[i].arrayBuffer()
        const result = await compressPdf(
          buf.slice(0),
          files[i].name,
          DEFAULT_COMPRESS_QUALITY,
          (f) => setCompressProgress(`Compressing ${i + 1}/${files.length} — ${Math.round(f * 100)}%`)
        )
        sources.push({ sourceBytes: buf, fileName: files[i].name })
        results.push(result)
      }
      setBatchJob({ files: sources, results })
    } catch (err) {
      console.error(err)
      alert('Compression failed: ' + (err as Error).message)
    } finally {
      setCompressing(false)
      setCompressProgress('')
    }
  }

  // Shared by the circle's picker and its drop. The picker is filtered by
  // `accept`, a drop is not — so the check has to live here.
  //
  // A Word or OpenDocument file is converted first, on this device, and the
  // PDF that comes out is what gets opened. `convertOfficeFile` throws a
  // message written to be read, so anything it says is shown as-is — including
  // its "save it as .docx first" answer for a legacy .doc, which is the whole
  // point of not simply rejecting everything that isn't a PDF here.
  async function openFiles(files: File[]) {
    const file = files[0]
    if (!file) return
    setConverting(!isPdfFile(file))
    try {
      const { file: pdf, notice } = await toViewablePdf(file)
      await loadFile(pdf, { notice })
    } catch (err) {
      console.error(err)
      alert(err instanceof OfficeImportError ? err.message : 'Failed to load PDF')
    } finally {
      setConverting(false)
    }
  }

  async function openExample() {
    if (opening) return
    setOpening(true)
    try {
      const file = await createExamplePdfFile()
      await loadFile(file)
    } catch (err) {
      console.error(err)
      alert('Failed to open example: ' + ((err as Error).message || err))
    } finally {
      setOpening(false)
    }
  }

  async function onCompressFile(e: React.ChangeEvent<HTMLInputElement>) {
    // ⚠️ `input.files` is a LIVE FileList, not a snapshot. Clearing `value` (so
    // the same file can be re-picked) empties the very list you are holding —
    // so reading `files.length` afterwards gave 0 and "1 Click Compress" did
    // nothing at all when you picked a file through the browser (dropping one
    // still worked, which is why it went unnoticed). Materialise first.
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) await runCompress(files)
  }

  async function onOcrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      alert('Please choose a PDF file.')
      return
    }
    setOcrJob({ bytes: await file.arrayBuffer(), name: file.name })
  }

  // Universal Images' front door is a stack of full-width centred pills with an
  // "or" between them, and this box now speaks the same language. The old rows
  // here were chunky cards — 48px icon tile, title, subtitle, trailing arrow —
  // which made every option shout as loudly as the drop circle above them.
  const PILL =
    'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors'
  const PILL_IDLE =
    'border-slate-300 hover:border-orange-400 hover:bg-orange-50/40 text-slate-700'

  const exampleButton = (
    <button
      type="button"
      onClick={openExample}
      disabled={opening}
      className={`${PILL} ${PILL_IDLE} disabled:opacity-60 disabled:cursor-wait`}
    >
      <span aria-hidden="true">👁</span>
      {opening ? 'Opening example…' : 'Try with example PDF'}
    </button>
  )

  return (
    <div className="min-h-full flex items-center">
      <div className={`${CONTAINER} py-8 lg:py-14`}>
        {/* No top banners for now (James, 2026-08-27): the default-app bar
            kept showing after the answer was given, so the offer lives only
            in "System options" below until the detection is trustworthy. */}
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left: animated PDF illustration */}
          {/* Desktop keeps the illustration as its own column. On a phone it
              moves BEHIND the drop circle instead (see below): as a stacked
              block it was a full screen-height of scrolling before the primary
              action, which is what stopped the landing page fitting on one
              screen. */}
          <div className="hidden lg:flex flex-col items-center lg:items-start gap-4 order-2 lg:order-1 min-w-0">
            <PdfIllustration />
          </div>

          {/* ⚠️ min-w-0 is load-bearing, not tidying. A grid item defaults to
              `min-width: auto`, so its MIN-CONTENT width becomes a floor the
              track cannot go below — and `truncate` further down does not
              reduce that contribution, it only clips once a width is settled.
              One recent file with a long unbreakable name (no spaces to wrap
              at) therefore set the width of this whole column, and the h1, the
              lead and the card were all laid out wider than the phone: the
              heading was cut off mid-word with nothing on screen to explain
              why. Reported from an iPhone; the recents list has to be OPEN to
              see it, which is why it survived earlier mobile passes.
              Right: open / create cards */}
          <div className="order-1 lg:order-2 min-w-0">
            {/* One line on a phone, deliberately. "Universal PDFs that just
                work." wrapped to two lines on every phone width, and the app's
                name is already in the navbar directly above it — so the word
                was costing a whole line to repeat something on screen. */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900">
              PDFs that <span className="text-orange-600">just work</span>.
            </h1>
            <p className="mt-3 text-slate-600 max-w-md">
              View, annotate, sign and export — all of it inside this page.
            </p>

            {/* One box, read top to bottom: upload → recent → compress →
                more options. Compress and the power-user tools used to sit in
                a second card below this one, which read as a separate, lesser
                panel — Universal Images keeps everything in a single card and
                this now matches it. */}
            <div className="mt-7 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
              {/* Open existing — primary action, wearing the suite's shared
                  drop circle (`DropRing` + `useFileDrop` from @unisim/sdk)
                  rather than a copy, so it is the same front door Universal
                  Compress and the Converter's All tab open on. It replaced a
                  dashed rectangle: one look for "drop a file here" across the
                  suite. Always `idle` — nothing runs on this page, and a busy
                  chase on an empty page reads as "still loading".

                  The drag handlers used to stop the event so App.tsx's own
                  `window` listener would not put the same file through
                  `loadFile` twice. That listener is gone — this zone is
                  `pageWide` now, and the hook recognises its own zones by the
                  `data-unisim-dropzone` marker it spreads on, so a drop that
                  lands here is never picked up a second time. */}
              <div className="flex flex-col items-center">
                <div
                  {...drop.dropzoneProps}
                  className={`relative w-full max-w-[260px] cursor-pointer rounded-full transition-transform focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600 ${
                    over ? 'scale-[1.02]' : ''
                  }`}
                >
                  <DropRing size="100%" over={over} motion="idle" watermark={<DropRingWatermark />}>
                    <svg
                      viewBox="0 0 24 24"
                      className={`mb-1 h-9 w-9 ${over ? 'text-orange-500' : 'text-slate-400'}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {/* A page with its corner turned — the thing you drop,
                          not an upload tray. Nothing is uploaded. */}
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                      <path d="M14 3v5h5" />
                      <path d="M9 13h6" />
                      <path d="M9 17h4" />
                    </svg>
                    <span className="text-[15px] font-bold text-slate-900">
                      {converting ? 'Converting…' : over ? 'Drop to open' : 'Drop a PDF here'}
                    </span>
                    {/* Word and OpenDocument files are converted here rather
                        than turned away, so the circle has to say so — nobody
                        drops a .docx on a thing labelled "PDF" to find out. */}
                    <span className="mt-1 text-[11px] text-slate-400">
                      or click to browse — .pdf, .docx, .odt
                    </span>
                  </DropRing>
                </div>
                <input {...drop.inputProps} className="hidden" />
              </div>

              {/* Directly under the circle, before any of the actions: this is
                  the moment someone decides whether to hand a document to a
                  web page, so it is where the answer belongs. */}
              <PrivacyNote className="mt-5" />

              {/* This slot is the same pill either way — it says "Recent files"
                  and opens the list once you have some, and "Try with example
                  PDF" until then. A first-time visitor has nothing to be recent,
                  so offering an empty list would be a dead end; someone with
                  history rarely wants the sample again, so it moves inside. */}
              {hasRecents ? (
                <details className="group mt-5">
                  <summary className={`${PILL} ${PILL_IDLE} cursor-pointer select-none list-none`}>
                    <span aria-hidden="true">🕘</span>
                    Recent files
                    <span
                      className="text-base text-slate-400 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    >
                      ⌄
                    </span>
                  </summary>
                  <div className="mt-3">
                    <RecentFilesList className="" />
                    <div className="mt-3">{exampleButton}</div>
                  </div>
                </details>
              ) : (
                <div className="mt-5">{exampleButton}</div>
              )}

              <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                <span>or</span>
                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              </div>

              {/* Compress. `data-unisim-dropzone` says out loud what this
                  already is: a drop target with its own meaning, sitting on a
                  page whose circle is page-wide. It is how the hook recognises
                  a drop another target has claimed.

                  It is belt-and-braces TODAY — measured, not assumed: strip the
                  marker at runtime and a file dropped here still compresses,
                  because `onDrop` below stops the event and React's synthetic
                  stopPropagation reaches the native event before it gets past
                  the root container to the hook's `window` listener. The marker
                  is what keeps that true if the stopPropagation is ever tidied
                  away as redundant — which, on its own, it would then not be. */}
              <button
                type="button"
                data-unisim-dropzone=""
                onClick={() => compressInputRef.current?.click()}
                disabled={compressing}
                onDragEnter={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDragOverCompress(true)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!dragOverCompress) setDragOverCompress(true)
                }}
                onDragLeave={(e) => {
                  e.stopPropagation()
                  setDragOverCompress(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDragOverCompress(false)
                  const files = e.dataTransfer.files
                  if (files && files.length > 0) runCompress(files)
                }}
                className={[
                  PILL,
                  'mt-3 disabled:opacity-60 disabled:cursor-wait',
                  // Dashed + amber while a file is over it — the one bit of the
                  // old card worth keeping, because this pill is a drop target
                  // as well as a button and nothing else in the box is.
                  dragOverCompress
                    ? 'border-amber-500 border-dashed bg-amber-50 text-amber-900'
                    : PILL_IDLE
                ].join(' ')}
              >
                <span aria-hidden="true">⬇</span>
                {compressing
                  ? compressProgress || 'Compressing…'
                  : dragOverCompress
                    ? 'Drop to compress'
                    : '1 Click Compress — drop one or many'}
              </button>
              <input
                ref={compressInputRef}
                type="file"
                accept="application/pdf"
                multiple
                hidden
                onChange={onCompressFile}
              />

              {/* Power-user tools tucked into a collapsible. On expand, scroll
                  the whole panel into view so every revealed option is visible
                  (it sits near the bottom of the fold on shorter screens). */}
              <details
                className="group mt-3"
                onToggle={(e) => {
                  if (!e.currentTarget.open) return
                  const el = e.currentTarget
                  requestAnimationFrame(() =>
                    el.scrollIntoView({ behavior: 'smooth', block: 'end' })
                  )
                }}
              >
                <summary className="flex items-center gap-2 cursor-pointer select-none list-none px-1 py-1 text-xs uppercase tracking-wide font-medium text-slate-500 hover:text-slate-700 transition-colors">
                  <span>Advanced options</span>
                  <span
                    className="ml-auto text-base text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  >
                    ⌄
                  </span>
                </summary>

                {/* The four tools wear the same pill as the two above, so
                    expanding this doesn't drop a stack of chunky cards into a
                    box of slim buttons. Each label carries its old subtitle
                    after an em dash — "what it is — what it does" — which is
                    the shape Images uses on its Convert pill. */}
                <button
                  type="button"
                  onClick={() => setMergeOpen(true)}
                  className={`${PILL} ${PILL_IDLE} mt-3`}
                >
                  <span aria-hidden="true">⧉</span>
                  Merge PDFs — combine several into one
                </button>

                <button
                  type="button"
                  onClick={() => setConvertMode('pdf-to-images')}
                  className={`${PILL} ${PILL_IDLE} mt-3`}
                >
                  <span aria-hidden="true">⇄</span>
                  Convert — PDF ↔ images (PNG/JPG)
                </button>

                {/* Make searchable (OCR) — scanned/image-only PDF → text layer */}
                <button
                  type="button"
                  onClick={() => ocrInputRef.current?.click()}
                  className={`${PILL} ${PILL_IDLE} mt-3`}
                >
                  <span aria-hidden="true">🔎</span>
                  Make searchable (OCR) — read a scan
                </button>
                <input
                  ref={ocrInputRef}
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={onOcrFile}
                />

                <button
                  type="button"
                  onClick={() => setTransformOpen(true)}
                  className={`${PILL} ${PILL_IDLE} mt-3`}
                >
                  <span aria-hidden="true">✎</span>
                  Transform text into a PDF — paste Markdown
                </button>
              </details>

              {/* OS-integration switches, apart from the document tools:
                  things that change how this MACHINE treats PDFs rather than
                  what happens to one file. Desktop-only in practice — both
                  pills render nothing in the browser — so the whole section
                  hides where it would be empty. The title names the OS
                  ("[Windows] System options") because every switch inside is
                  a promise about this machine, not about the app. */}
              {(defaultApp.available || previewPane.available) && (() => {
                const os =
                  defaultApp.platform === 'win32' || previewPane.available
                    ? 'Windows'
                    : defaultApp.platform === 'darwin'
                      ? 'macOS'
                      : defaultApp.platform === 'linux'
                        ? 'Linux'
                        : null
                return (
                <details
                  className="group mt-3"
                  onToggle={(e) => {
                    if (!e.currentTarget.open) return
                    const el = e.currentTarget
                    requestAnimationFrame(() =>
                      el.scrollIntoView({ behavior: 'smooth', block: 'end' })
                    )
                  }}
                >
                  <summary className="flex items-center gap-2 cursor-pointer select-none list-none px-1 py-1 text-xs uppercase tracking-wide font-medium text-slate-500 hover:text-slate-700 transition-colors">
                    <span>{os ? `[${os}] ` : ''}System options</span>
                    <span
                      className="ml-auto text-base text-slate-400 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    >
                      ⌄
                    </span>
                  </summary>

                  {/* Desktop only, and only while it isn't already the
                      default. */}
                  <DefaultAppPill offer={defaultApp} className={`${PILL} ${PILL_IDLE} mt-3`} />

                  {/* Windows only, and only where the preview handler shipped
                      with the app. Not a proactive offer: it costs an
                      administrator prompt, so it waits to be looked for. */}
                  <PreviewPanePill offer={previewPane} className={`${PILL} ${PILL_IDLE} mt-3`} />
                </details>
                )
              })()}
            </div>
          </div>

        </div>

        {/* ⚠️ Outside the grid, not inside it: as a third child of a
            two-column grid this became a grid ITEM and landed in the left
            column above the headline. Under the whole hero, never above it —
            the browser is the product, and nothing here should imply this
            page is the lesser version. */}
        <DownloadRow />
      </div>

      {compressJob && (
        <CompressResultModal
          sourceBytes={compressJob.sourceBytes}
          fileName={compressJob.fileName}
          initialResult={compressJob.result}
          onClose={() => setCompressJob(null)}
          discardLabel="Discard"
        />
      )}

      {batchJob && (
        <BatchCompressModal
          files={batchJob.files}
          initialResults={batchJob.results}
          initialQuality={DEFAULT_COMPRESS_QUALITY}
          onClose={() => setBatchJob(null)}
        />
      )}

      <TransformPanel open={transformOpen} onClose={() => setTransformOpen(false)} />

      {mergeOpen && <MergeDialog onClose={() => setMergeOpen(false)} />}

      {convertMode && (
        <ConvertDialog initialMode={convertMode} onClose={() => setConvertMode(null)} />
      )}

      {ocrJob && (
        <OcrModal
          sourceBytes={ocrJob.bytes}
          fileName={ocrJob.name}
          onClose={() => setOcrJob(null)}
          onOpen={(file) => {
            loadFile(file).catch((err) => {
              console.error(err)
              alert('Failed to load searchable PDF')
            })
          }}
        />
      )}

      {/* The other half of `pageWide` — the circle lights up wherever the drag
          is, and this says why, in the margin where the pointer actually is. */}
      <DropAnywhere
        show={showDropHint}
        title="Drop to open"
        hint="PDF files only — anywhere on this page will do"
        icon={<span aria-hidden="true">📄</span>}
      />
    </div>
  )
}
