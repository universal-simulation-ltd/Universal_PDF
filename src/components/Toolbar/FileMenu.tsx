import { useEffect, useRef, useState } from 'react'
import { useAnnotationStore } from '../../stores/annotationStore'
import { usePdfStore } from '../../stores/pdfStore'
import { LANGS, persistLang, readSavedLang, type LangCode } from '../../lib/lang'

interface Props {
  variant?: 'header' | 'toolbar'
}

export default function FileMenu({ variant = 'toolbar' }: Props) {
  const annotations = useAnnotationStore((s) => s.annotations)
  const undo = useAnnotationStore((s) => s.undo)
  const redo = useAnnotationStore((s) => s.redo)
  const canUndo = useAnnotationStore((s) => s.past.length > 0)
  const canRedo = useAnnotationStore((s) => s.future.length > 0)
  const clearAll = useAnnotationStore((s) => s.clearAll)
  const setTool = useAnnotationStore((s) => s.setTool)

  const doc = usePdfStore((s) => s.doc)
  const numPages = usePdfStore((s) => s.numPages)
  const fileName = usePdfStore((s) => s.fileName)
  const pageNavOpen = usePdfStore((s) => s.pageNavOpen)
  const togglePageNav = usePdfStore((s) => s.togglePageNav)
  const loadFile = usePdfStore((s) => s.loadFile)
  const renameFile = usePdfStore((s) => s.renameFile)
  const reset = usePdfStore((s) => s.reset)

  const canClear = annotations.length > 0
  const canShowPages = !!doc && numPages > 1
  const canRename = !!doc && !!fileName

  const [open, setOpen] = useState(false)
  const [langSubOpen, setLangSubOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [currentLang, setCurrentLang] = useState<LangCode>(readSavedLang())
  const [showOtherHint, setShowOtherHint] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const currentLangOpt = LANGS.find((l) => l.code === currentLang) ?? LANGS[0]

  function pickLang(code: LangCode) {
    if (code === 'other') {
      setShowOtherHint(true)
      return
    }
    setCurrentLang(code)
    persistLang(code)
    setShowOtherHint(false)
    setLangSubOpen(false)
    setOpen(false)
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      try {
        await loadFile(f)
      } catch (err) {
        console.error(err)
        alert('Failed to load PDF')
      }
    }
    e.target.value = ''
  }

  const triggerClass =
    variant === 'header'
      ? 'h-8 px-3 rounded-md bg-white/10 hover:bg-white/15 text-white text-sm font-medium ring-1 ring-white/15 flex items-center gap-1.5'
      : 'h-10 px-3 rounded bg-slate-700 hover:bg-slate-600 text-sm font-medium flex items-center gap-1.5 text-white'

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setLangSubOpen(false)
        setRenameOpen(false)
        setShowOtherHint(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (renameOpen) {
          setRenameOpen(false)
        } else if (langSubOpen) {
          setLangSubOpen(false)
          setShowOtherHint(false)
        } else {
          setOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, langSubOpen, renameOpen])

  useEffect(() => {
    if (!renameOpen || !renameInputRef.current) return
    const el = renameInputRef.current
    el.focus()
    const value = el.value
    const stem = /\.pdf$/i.test(value) ? value.length - 4 : value.length
    el.setSelectionRange(0, stem)
    // Run only when opening the rename row — keeping `renameDraft` in
    // the dep array would re-select the text on every keystroke and
    // make each new character replace the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renameOpen])

  function startRename() {
    if (!fileName) return
    setRenameDraft(fileName)
    setLangSubOpen(false)
    setShowOtherHint(false)
    setRenameOpen(true)
  }

  function commitRename() {
    const next = renameDraft.trim()
    if (!next || next === fileName) {
      setRenameOpen(false)
      return
    }
    void renameFile(next)
    setRenameOpen(false)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      {variant === 'header' ? (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={open}
          title="Universal PDF — menu"
          className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-white/5 transition-colors text-white"
        >
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-orange-600 text-white text-[11px] font-bold">U</span>
          <span className="hidden sm:inline font-semibold tracking-tight">Universal PDF</span>
          <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
            <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className={triggerClass}
          aria-haspopup="true"
          aria-expanded={open}
        >
          File
          <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
            <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={onPick}
      />
      {open && (
        <div className={`absolute ${variant === 'header' ? 'left-0 mt-2' : 'right-0 mt-1'} w-60 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden`}>
          {doc && (
            <button
              onClick={() => { reset(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-b border-slate-100"
            >
              <span aria-hidden="true">🏠</span>
              <span className="flex-1 text-left">Close PDF</span>
            </button>
          )}
          <button
            onClick={() => { fileInputRef.current?.click(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-orange-50 hover:text-orange-700 text-sm"
          >
            <span aria-hidden="true">📄</span>
            <span className="flex-1 text-left font-medium">{doc ? 'Open another PDF…' : 'Open PDF…'}</span>
          </button>

          {canRename && !renameOpen && (
            <button
              onClick={startRename}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
            >
              <span aria-hidden="true">✎</span>
              <span className="flex-1 text-left truncate">Rename file…</span>
              <span className="text-[11px] text-slate-400 truncate max-w-[120px]" title={fileName ?? ''}>
                {fileName}
              </span>
            </button>
          )}

          {canRename && renameOpen && (
            <div className="px-3 py-2.5 border-t border-slate-100 bg-slate-50/60">
              <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                Rename file
              </label>
              <input
                ref={renameInputRef}
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitRename()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setRenameOpen(false)
                  }
                }}
                className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                aria-label="New file name"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameOpen(false)}
                  className="px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitRename}
                  disabled={!renameDraft.trim() || renameDraft.trim() === fileName}
                  className="px-3 py-1 text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {canShowPages && (
            <button
              onClick={() => { togglePageNav(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
            >
              <span aria-hidden="true">☰</span>
              <span className="flex-1 text-left">{pageNavOpen ? 'Hide pages panel' : 'Show pages panel'}</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{numPages}</span>
            </button>
          )}

          {doc && (
            <button
              onClick={() => { setTool('redact'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
            >
              <span aria-hidden="true">▮</span>
              <span className="flex-1 text-left">Redact Text</span>
            </button>
          )}

          <button
            onClick={() => { if (canUndo) { undo(); setOpen(false) } }}
            disabled={!canUndo}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm disabled:opacity-40 disabled:cursor-not-allowed border-t border-slate-100"
          >
            <span aria-hidden="true">↶</span>
            <span className="flex-1 text-left">Undo</span>
            <span className="text-[11px] text-slate-400 tracking-wide">Ctrl+Z</span>
          </button>
          <button
            onClick={() => { if (canRedo) { redo(); setOpen(false) } }}
            disabled={!canRedo}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm disabled:opacity-40 disabled:cursor-not-allowed border-t border-slate-100"
          >
            <span aria-hidden="true">↷</span>
            <span className="flex-1 text-left">Redo</span>
            <span className="text-[11px] text-slate-400 tracking-wide">Ctrl+Y</span>
          </button>
          <button
            onClick={() => { if (canClear) { clearAll(); setOpen(false) } }}
            disabled={!canClear}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-red-50 hover:text-red-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed border-t border-slate-100"
          >
            <span aria-hidden="true">🗑</span>
            <span className="flex-1 text-left">Clear all annotations</span>
          </button>

          {/* Language submenu */}
          <button
            onClick={() => { setLangSubOpen((v) => !v); setShowOtherHint(false) }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
            aria-haspopup="true"
            aria-expanded={langSubOpen}
          >
            <span aria-hidden="true">{currentLangOpt.flag}</span>
            <span className="flex-1 text-left">Language</span>
            <span className="text-[11px] text-slate-500 uppercase tracking-wide mr-1">
              {currentLangOpt.code === 'other' ? 'EN' : currentLangOpt.code}
            </span>
            <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${langSubOpen ? '-rotate-90' : ''}`} aria-hidden="true">
              <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {langSubOpen && (
            <div className="border-t border-slate-100 bg-slate-50/60">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => pickLang(l.code)}
                  className={`w-full flex items-center gap-3 pl-8 pr-3 py-2 text-sm transition-colors ${
                    l.code === currentLang
                      ? 'text-orange-700 font-medium bg-orange-50/60'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <span aria-hidden="true">{l.flag}</span>
                  <span className="flex-1 text-left">{l.label}</span>
                  {l.code === currentLang && <span aria-hidden="true">✓</span>}
                </button>
              ))}
              {showOtherHint && (
                <div className="px-3 py-2 text-[11px] text-slate-600 border-t border-slate-100">
                  <a
                    href="https://www.unisim.co.uk"
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-600 hover:underline font-medium"
                  >
                    Contact UNI SIM
                  </a>{' '}
                  to request a language.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
