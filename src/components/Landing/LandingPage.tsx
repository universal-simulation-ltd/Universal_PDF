import { useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { createExamplePdfFile } from '../../lib/examplePdf'
import { compressPdf, type CompressResult } from '../../lib/export'
import CompressResultModal from '../Compress/CompressResultModal'
import RecentFilesList from '../RecentFiles/RecentFilesList'
import TransformPanel from '../Transform/TransformPanel'
import PdfIllustration from './PdfIllustration'

export default function LandingPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const compressInputRef = useRef<HTMLInputElement>(null)
  const loadFile = usePdfStore((s) => s.loadFile)
  const [opening, setOpening] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null)
  const [dragOverCompress, setDragOverCompress] = useState(false)
  const [transformOpen, setTransformOpen] = useState(false)

  async function runCompress(file: File) {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      alert('Please choose a PDF file.')
      return
    }
    setCompressing(true)
    try {
      const buf = await file.arrayBuffer()
      const result = await compressPdf(buf, file.name)
      setCompressResult(result)
    } catch (err) {
      console.error(err)
      alert('Compression failed: ' + (err as Error).message)
    } finally {
      setCompressing(false)
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
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await runCompress(file)
  }

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

              {/* Recent files — only renders when there are any */}
              <RecentFilesList className="mt-5" />

              {/* Open example */}
              <button
                type="button"
                onClick={openExample}
                disabled={opening}
                className="group mt-5 w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl text-left hover:border-orange-400 hover:bg-orange-50/50 transition-colors disabled:opacity-60 disabled:cursor-wait"
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
                  const file = e.dataTransfer.files?.[0]
                  if (file) runCompress(file)
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
                    {compressing ? 'Compressing…' : dragOverCompress ? 'Drop to compress' : 'Compress a PDF'}
                  </div>
                  <div className="text-sm text-slate-500">
                    Drop a file or click — see original vs compressed
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
                hidden
                onChange={onCompressFile}
              />

              {/* Transform text → PDF */}
              <button
                type="button"
                onClick={() => setTransformOpen(true)}
                className="group w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl text-left hover:border-sky-400 hover:bg-sky-50/60 transition-colors"
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
                <span className="ml-auto text-slate-400 group-hover:text-sky-700 transition-colors" aria-hidden="true">
                  →
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {compressResult && (
        <CompressResultModal
          result={compressResult}
          onClose={() => setCompressResult(null)}
          discardLabel="Discard"
        />
      )}

      <TransformPanel open={transformOpen} onClose={() => setTransformOpen(false)} />
    </div>
  )
}
