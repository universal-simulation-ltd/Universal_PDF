import { useRef, useState } from 'react'
import { DropRing, useFileDrop } from '@unisim/sdk'
import { usePdfStore } from '../../stores/pdfStore'
import { createExamplePdfFile } from '../../lib/examplePdf'
import { compressPdf, type CompressQuality, type CompressResult } from '../../lib/export'
import CompressResultModal from '../Compress/CompressResultModal'
import BatchCompressModal, { type BatchSource } from '../Compress/BatchCompressModal'
import MergeDialog from '../Convert/MergeDialog'
import ConvertDialog, { type ConvertMode } from '../Convert/ConvertDialog'
import RecentFilesList from '../RecentFiles/RecentFilesList'
import OcrModal from '../Ocr/OcrModal'
import TransformPanel from '../Transform/TransformPanel'
import PdfIllustration from './PdfIllustration'
import { CONTAINER } from '../../lib/layout'

// Balanced is the default when compressing — 'light' is lossless but usually
// barely shrinks, so people expect the "1 Click Compress" default to actually
// make the file smaller. Stronger/lighter are still one tap away in the modal.
const DEFAULT_COMPRESS_QUALITY: CompressQuality = 'balanced'

export default function LandingPage() {
  const compressInputRef = useRef<HTMLInputElement>(null)
  const ocrInputRef = useRef<HTMLInputElement>(null)
  const loadFile = usePdfStore((s) => s.loadFile)
  const hasRecents = usePdfStore((s) => s.recents.length > 0)
  const [opening, setOpening] = useState(false)
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
  const drop = useFileDrop({
    onFiles: openFiles,
    accept: 'application/pdf',
    multiple: false,
    label: 'Drop a PDF here, or click to browse',
  })

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
        const result = await compressPdf(buf.slice(0), files[0].name, DEFAULT_COMPRESS_QUALITY)
        setCompressJob({ sourceBytes: buf, fileName: files[0].name, result })
        return
      }
      // Batch: compress each at the default quality (re-tunable in the modal).
      const sources: BatchSource[] = []
      const results: CompressResult[] = []
      for (let i = 0; i < files.length; i++) {
        setCompressProgress(`Compressing ${i + 1}/${files.length}…`)
        const buf = await files[i].arrayBuffer()
        const result = await compressPdf(buf.slice(0), files[i].name, DEFAULT_COMPRESS_QUALITY)
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
  async function openFiles(files: File[]) {
    const file = files[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      alert('Please choose a PDF file.')
      return
    }
    try {
      await loadFile(file)
    } catch (err) {
      console.error(err)
      alert('Failed to load PDF')
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
    const files = e.target.files
    e.target.value = ''
    if (files && files.length > 0) await runCompress(files)
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

  const exampleButton = (
    <button
      type="button"
      onClick={openExample}
      disabled={opening}
      className="group w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl text-left hover:border-orange-400 hover:bg-orange-50/50 transition-colors disabled:opacity-60 disabled:cursor-wait"
    >
      <div className="shrink-0 w-12 h-12 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-2xl">
        👁
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-slate-900">
          {opening ? 'Opening example…' : 'Open example PDF'}
        </div>
        <div className="text-sm text-slate-500">
          form · image · signature · annotations
        </div>
      </div>
      <span className="ml-auto text-slate-400 group-hover:text-orange-700 transition-colors" aria-hidden="true">
        →
      </span>
    </button>
  )

  return (
    <div className="min-h-full flex items-center">
      <div className={`${CONTAINER} py-8 lg:py-14`}>
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left: animated PDF illustration */}
          <div className="flex flex-col items-center lg:items-start gap-4 order-2 lg:order-1">
            <PdfIllustration />
          </div>

          {/* Right: open / create cards */}
          <div className="order-1 lg:order-2">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900">
              Universal PDFs that <span className="text-orange-600">just work</span>.
            </h1>
            <p className="mt-3 text-slate-600 max-w-md">
              View, annotate, sign and export — everything stays on your device.
            </p>

            {/* Box 1: open a PDF → recent files → example */}
            <div className="mt-7 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
              {/* Open existing — primary action, wearing the suite's shared
                  drop circle (`DropRing` + `useFileDrop` from @unisim/sdk)
                  rather than a copy, so it is the same front door Universal
                  Compress and the Converter's All tab open on. It replaced a
                  dashed rectangle: one look for "drop a file here" across the
                  suite. Always `idle` — nothing runs on this page, and a busy
                  chase on an empty page reads as "still loading".

                  ⚠️ The drag handlers stop the event. App.tsx also watches
                  `window` so a PDF can land anywhere on the page, and without
                  this the same file would go through `loadFile` twice — which
                  destroys the document the first call just set and writes two
                  recents entries. Stopping enter/leave as well keeps that
                  listener's depth counter balanced (its full-screen overlay
                  steps aside while the circle has the drag, and the circle's
                  own highlight takes over), and its capture-phase reset clears
                  the overlay on a drop this one swallows. */}
              <div className="flex flex-col items-center">
                <div
                  {...drop.dropzoneProps}
                  onDragEnter={(e) => { e.stopPropagation(); drop.dropzoneProps.onDragEnter(e) }}
                  onDragLeave={(e) => { e.stopPropagation(); drop.dropzoneProps.onDragLeave(e) }}
                  onDrop={(e) => { e.stopPropagation(); drop.dropzoneProps.onDrop(e) }}
                  className={`relative w-full max-w-[260px] cursor-pointer rounded-full transition-transform focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600 ${
                    drop.over ? 'scale-[1.02]' : ''
                  }`}
                >
                  <DropRing size="100%" over={drop.over} motion="idle">
                    <svg
                      viewBox="0 0 24 24"
                      className={`mb-1 h-9 w-9 ${drop.over ? 'text-orange-500' : 'text-slate-400'}`}
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
                      {drop.over ? 'Drop to open' : 'Drop a PDF here'}
                    </span>
                    <span className="text-[11.5px] leading-relaxed text-slate-500">
                      it stays on your device
                    </span>
                    <span className="mt-1 text-[11px] text-slate-400">or click to browse</span>
                  </DropRing>
                </div>
                <input {...drop.inputProps} className="hidden" />
              </div>

              {/* When there are recents, tuck them and the example into a
                  collapsed collapsible so the primary action stays front and
                  centre. With no recents, the example stays visible to help
                  first-time visitors. */}
              {hasRecents ? (
                <details className="group mt-5">
                  <summary className="flex items-center gap-2 cursor-pointer select-none list-none px-1 py-1 text-xs uppercase tracking-wide font-medium text-slate-500 hover:text-slate-700 transition-colors">
                    <span>Recent files &amp; example</span>
                    <span
                      className="ml-auto text-base text-slate-400 transition-transform group-open:rotate-180"
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
            </div>

            {/* Box 2: convert tools — compress & text → PDF */}
            <div className="mt-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-3">
              {/* Compress */}
              <button
                type="button"
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
                  'group w-full flex items-center gap-4 p-4 border rounded-xl text-left transition-colors disabled:opacity-60 disabled:cursor-wait',
                  dragOverCompress
                    ? 'border-amber-500 bg-amber-50 border-dashed border-2'
                    : 'border-slate-200 hover:border-amber-400 hover:bg-amber-50/50'
                ].join(' ')}
              >
                <div className="shrink-0 w-12 h-12 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">
                  ⬇
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">
                    {compressing
                      ? compressProgress || 'Compressing…'
                      : dragOverCompress
                        ? 'Drop to compress'
                        : '1 Click Compress'}
                  </div>
                  <div className="text-sm text-slate-500">
                    Drop one or more files — batch them into a ZIP
                  </div>
                </div>
                <span className="ml-auto text-slate-400 group-hover:text-amber-700 transition-colors" aria-hidden="true">
                  →
                </span>
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
                className="group"
                onToggle={(e) => {
                  if (!e.currentTarget.open) return
                  const el = e.currentTarget
                  requestAnimationFrame(() =>
                    el.scrollIntoView({ behavior: 'smooth', block: 'end' })
                  )
                }}
              >
                <summary className="flex items-center gap-2 cursor-pointer select-none list-none px-1 py-1 text-xs uppercase tracking-wide font-medium text-slate-500 hover:text-slate-700 transition-colors">
                  <span>More options</span>
                  <span
                    className="ml-auto text-base text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  >
                    ⌄
                  </span>
                </summary>

                {/* Merge PDFs */}
                <button
                  type="button"
                  onClick={() => setMergeOpen(true)}
                  className="group/btn mt-3 w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl text-left hover:border-orange-400 hover:bg-orange-50/50 transition-colors"
                >
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center text-2xl">
                    ⧉
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">Merge PDFs</div>
                    <div className="text-sm text-slate-500">
                      Combine several files into one — reorder before you export
                    </div>
                  </div>
                  <span className="ml-auto text-slate-400 group-hover/btn:text-orange-700 transition-colors" aria-hidden="true">
                    →
                  </span>
                </button>

                {/* Convert PDF ↔ images */}
                <button
                  type="button"
                  onClick={() => setConvertMode('pdf-to-images')}
                  className="group/btn mt-3 w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl text-left hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
                >
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-2xl">
                    ⇄
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">Convert</div>
                    <div className="text-sm text-slate-500">
                      PDF → images (PNG/JPG), or images → PDF
                    </div>
                  </div>
                  <span className="ml-auto text-slate-400 group-hover/btn:text-indigo-700 transition-colors" aria-hidden="true">
                    →
                  </span>
                </button>

                {/* Make searchable (OCR) — scanned/image-only PDF → text layer */}
                <button
                  type="button"
                  onClick={() => ocrInputRef.current?.click()}
                  className="group/btn mt-3 w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl text-left hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
                >
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl">
                    🔎
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">Make searchable (OCR)</div>
                    <div className="text-sm text-slate-500">
                      Read a scanned PDF on your device — find, select &amp; copy its text
                    </div>
                  </div>
                  <span className="ml-auto text-slate-400 group-hover/btn:text-emerald-700 transition-colors" aria-hidden="true">
                    →
                  </span>
                </button>
                <input
                  ref={ocrInputRef}
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={onOcrFile}
                />

                {/* Transform text → PDF */}
                <button
                  type="button"
                  onClick={() => setTransformOpen(true)}
                  className="group/btn mt-3 w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl text-left hover:border-sky-400 hover:bg-sky-50/60 transition-colors"
                >
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center text-2xl">
                    ✎
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">Transform text into a PDF</div>
                    <div className="text-sm text-slate-500">
                      Paste Markdown — headings, lists, tables &amp; code blocks
                    </div>
                  </div>
                  <span className="ml-auto text-slate-400 group-hover/btn:text-sky-700 transition-colors" aria-hidden="true">
                    →
                  </span>
                </button>
              </details>
            </div>
          </div>
        </div>
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
    </div>
  )
}
