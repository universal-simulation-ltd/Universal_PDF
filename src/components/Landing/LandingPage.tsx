import { useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { createExamplePdfFile } from '../../lib/examplePdf'
import { compressPdf, type CompressResult } from '../../lib/export'
import CompressResultModal from '../Compress/CompressResultModal'
import RecentFilesList from '../RecentFiles/RecentFilesList'
import TransformPanel from '../Transform/TransformPanel'
import PdfIllustration from './PdfIllustration'

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_PDF'

export default function LandingPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const compressInputRef = useRef<HTMLInputElement>(null)
  const loadFile = usePdfStore((s) => s.loadFile)
  const [opening, setOpening] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null)
  const [dragOverCompress, setDragOverCompress] = useState(false)
  const [transformOpen, setTransformOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 lg:py-14">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left: animated PDF illustration */}
          <div className="flex flex-col items-center lg:items-start gap-4 order-2 lg:order-1">
            <PdfIllustration />
            <button
              type="button"
              onClick={openExample}
              disabled={opening}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-slate-900 border border-slate-200 shadow-sm hover:border-orange-400 hover:text-orange-700 hover:shadow transition-all disabled:opacity-60 disabled:cursor-wait"
            >
              <span aria-hidden="true">👁</span>
              <span className="font-medium text-sm">
                {opening ? 'Opening example…' : 'View PDF example'}
              </span>
              <span className="text-xs text-slate-400">
                form · image · signature · annotations
              </span>
            </button>
          </div>

          {/* Right: open / create card */}
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-medium ring-1 ring-orange-200 mb-4">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
              Free · No upload · Works offline
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900">
              Universal PDFs that <span className="text-orange-600">just work</span>.
            </h1>
            <p className="mt-3 text-slate-600 max-w-md">
              View, annotate, sign and export — everything stays on your device.
            </p>

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

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs uppercase tracking-wide text-slate-400 font-medium">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

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

              {/* Advanced Options (collapsed by default) */}
              <div className="mt-4 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={advancedOpen}
                  aria-controls="advanced-options-panel"
                  className="w-full flex items-center justify-between gap-2 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <span>Advanced Options</span>
                  <span
                    aria-hidden="true"
                    className={[
                      'text-slate-400 transition-transform',
                      advancedOpen ? 'rotate-180' : '',
                    ].join(' ')}
                  >
                    ▾
                  </span>
                </button>
                {advancedOpen && (
                  <div id="advanced-options-panel" className="mt-3">
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
                )}
              </div>
            </div>

            <RecentFilesList />
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>
              Open source — self-host free or PRO hosted by{' '}
              <a
                href="https://www.unisim.co.uk"
                target="_blank"
                rel="noreferrer"
                className="text-slate-700 hover:text-orange-600 underline-offset-2 hover:underline"
              >
                UNI SIM
              </a>
            </span>
          </div>
          <div className="sm:ml-auto flex items-center gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Universal PDF on GitHub"
              title="View source on GitHub"
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
                aria-hidden="true"
              >
                <path d="M12 .5C5.65.5.5 5.65.5 12.02c0 5.09 3.29 9.4 7.86 10.92.57.1.78-.25.78-.55 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.39-5.26 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.66.79.55 4.57-1.52 7.86-5.83 7.86-10.92C23.5 5.65 18.35.5 12 .5z" />
              </svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </div>
      </footer>

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
