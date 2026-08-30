import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { markdownToPdfFile, type Orientation } from '../../lib/markdownToPdf'

interface Props {
  open: boolean
  onClose: () => void
}

const SAMPLE = `# Welcome to Universal PDF

Paste **Markdown** here and click *Build PDF* to turn formatted text into a clean, printable document.

## Supported formatting

- Headings with \`#\`, \`##\` and \`###\`
- **Bold**, *italic* and \`inline code\`
- Bulleted and numbered lists
- Fenced code blocks, tables and horizontal rules
- [Clickable links](https://www.unisim.co.uk)

> Quotes are highlighted with a coloured bar.

### Example table

| Feature | Status | Notes |
|---|---|---|
| Headings | ready | H1, H2, H3 |
| Tables | ready | auto column widths |
| Code blocks | ready | mono font, wraps |

\`\`\`
Code blocks preserve whitespace.
  Indentation stays put.
\`\`\`

---

Replace this sample with your own text to build a custom PDF.
`

export default function TransformPanel({ open, onClose }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // Deliberately NOT remembered between openings. Landscape is the exception,
  // not a preference — someone who built one wide table last week should not
  // find their next document sideways without having asked for it.
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const loadFile = usePdfStore((s) => s.loadFile)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setText((t) => t || SAMPLE)
      const id = window.setTimeout(() => textareaRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if ((e.key === 'Enter' || e.key === 'Return') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void build()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text])

  async function build() {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const file = await markdownToPdfFile(text, { orientation })
      await loadFile(file)
      onClose()
    } catch (err) {
      console.error(err)
      alert('Failed to build PDF: ' + ((err as Error).message || err))
    } finally {
      setBusy(false)
    }
  }

  function loadSample() {
    setText(SAMPLE)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const looksTexty =
      file.type.startsWith('text/') ||
      /\.(md|markdown|txt)$/i.test(file.name) ||
      file.type === 'application/json'
    if (!looksTexty) {
      alert('Drop a Markdown (.md) or plain text (.txt) file.')
      return
    }
    file
      .text()
      .then((t) => setText(t))
      .catch((err) => {
        console.error(err)
        alert('Could not read file.')
      })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[min(100%,100dvh)] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">Transform text into a PDF</div>
            <div className="text-xs text-slate-500 truncate">
              Paste Markdown (or plain text). Headings, lists, tables, code &amp; links supported.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div
          className="relative flex-1 min-h-0"
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!dragOver) setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.stopPropagation()
            setDragOver(false)
          }}
          onDrop={onDrop}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="block w-full h-[55vh] min-h-[280px] px-5 py-4 font-mono text-[13px] text-slate-800 leading-relaxed focus:outline-none resize-none bg-white"
            placeholder={'# My document\n\nStart writing Markdown…'}
          />
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 rounded-xl border-2 border-dashed border-orange-500 bg-orange-50/70 flex items-center justify-center">
              <div className="bg-white border border-orange-200 shadow-md rounded-lg px-4 py-3 text-sm">
                <span className="font-semibold text-slate-900">Drop to load</span>
                <span className="text-slate-500"> &middot; .md or .txt</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
          {/* Every item is nowrap and the hints drop out one at a time as the row
              narrows, so the two things you can actually PRESS — Load sample and
              the orientation control — never wrap or collide. Adding the
              orientation control without this pushed "Load sample" onto two
              lines at 1280px. */}
          <div className="flex items-center gap-3 text-xs text-slate-500 min-w-0">
            <button
              type="button"
              onClick={loadSample}
              className="shrink-0 whitespace-nowrap text-slate-600 hover:text-orange-700 underline-offset-2 hover:underline"
            >
              Load sample
            </button>
            <span aria-hidden="true" className="shrink-0">·</span>
            {/* Orientation lives in the quiet row with "Load sample" rather than
                beside the Build button, because almost nobody wants it and a
                control given prominence is a question every user has to answer.
                Portrait is preselected, so ignoring it entirely is correct. */}
            <label className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <span className="text-slate-500">Page</span>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as Orientation)}
                aria-label="Page orientation"
                className="bg-transparent text-slate-600 hover:text-orange-700 border border-transparent hover:border-slate-300 rounded px-1 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <span aria-hidden="true" className="hidden lg:inline shrink-0">·</span>
            <span className="hidden lg:inline whitespace-nowrap">Drag a .md / .txt file to load</span>
            <span aria-hidden="true" className="hidden xl:inline shrink-0">·</span>
            <span className="hidden xl:inline whitespace-nowrap text-slate-400">⌘/Ctrl + Enter to build</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm whitespace-nowrap text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={build}
              disabled={busy || !text.trim()}
              className="px-4 py-1.5 text-sm font-medium whitespace-nowrap text-white bg-orange-700 hover:bg-orange-800 rounded-lg shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? 'Building…' : 'Build PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
