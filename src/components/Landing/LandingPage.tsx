import { useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { createExamplePdfFile } from '../../lib/examplePdf'
import { compressPdf, type CompressQuality, type CompressResult } from '../../lib/export'
import CompressResultModal from '../Compress/CompressResultModal'
import BatchCompressModal, { type BatchSource } from '../Compress/BatchCompressModal'
import RecentFilesList from '../RecentFiles/RecentFilesList'
import TransformPanel from '../Transform/TransformPanel'
import PdfIllustration from './PdfIllustration'

// Balanced is the default when compressing — 'light' is lossless but usually
// barely shrinks, so people expect the "1 Click Compress" default to actually
// make the file smaller. Stronger/lighter are still one tap away in the modal.
const DEFAULT_COMPRESS_QUALITY: CompressQuality = 'balanced'

export default function LandingPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const compressInputRef = useRef<HTMLInputElement>(null)
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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      try {
        await loadFile(file)
      } catch (err) {
        console.error(err)
        alert('Failed to load PDF')
      }
    }
    e.target.value = ''
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
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 lg:py-14">
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
              {/* Open existing — primary action */}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="group relative w-full flex items-center gap-4 p-5 border-2 border-dashed border-orange-500 bg-orange-50/40 rounded-xl text-left hover:bg-orange-50 hover:border-orange-600 hover:shadow-lg hover:shadow-orange-500/10 transition-all"
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl ring-4 ring-orange-500/0 group-hover:ring-orange-500/15 transition-all" />
                <div className="shrink-0 w-12 h-12 rounded-lg bg-orange-600 text-white flex items-center justify-center text-2xl shadow-sm group-hover:scale-105 transition-transform">
                  📄
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-base">Open a PDF</div>
                  <div className="text-sm text-slate-600">Click to choose, or drop a file anywhere</div>
                </div>
                <span className="ml-auto text-orange-600 text-lg group-hover:translate-x-0.5 transition-transform" aria-hidden="true">
                  →
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={onFile}
              />

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

              {/* For geeks — power-user tools tucked into a collapsible */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer select-none list-none px-1 py-1 text-xs uppercase tracking-wide font-medium text-slate-500 hover:text-slate-700 transition-colors">
                  <span>For us geeks</span>
                  <span
                    className="ml-auto text-base text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  >
                    ⌄
                  </span>
                </summary>
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
    </div>
  )
}
