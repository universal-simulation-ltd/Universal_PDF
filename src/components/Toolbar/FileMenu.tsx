import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnnotationStore } from '../../stores/annotationStore'
import { usePdfStore } from '../../stores/pdfStore'
import { useSearchStore } from '../../stores/searchStore'
import { LANGS, persistLang, readSavedLang, type LangCode } from '../../lib/lang'
import { RedactIcon } from '../icons/RedactIcon'

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
  const redactFill = useAnnotationStore((s) => s.redactFill)
  const setRedactFill = useAnnotationStore((s) => s.setRedactFill)

  const doc = usePdfStore((s) => s.doc)
  const fileName = usePdfStore((s) => s.fileName)
  const numPages = usePdfStore((s) => s.numPages)
  const loadFile = usePdfStore((s) => s.loadFile)
  const renameFile = usePdfStore((s) => s.renameFile)
  const reset = usePdfStore((s) => s.reset)
  const setPageNavOpen = usePdfStore((s) => s.setPageNavOpen)
  const setPresentOpen = usePdfStore((s) => s.setPresentOpen)
  const setHostedStoreOpen = usePdfStore((s) => s.setHostedStoreOpen)
  const setOcrOpen = usePdfStore((s) => s.setOcrOpen)
  const isXfa = usePdfStore((s) => s.isXfa)
  const setSearchOpen = useSearchStore((s) => s.setOpen)
  const openForRedact = useSearchStore((s) => s.openForRedact)

  const canClear = annotations.length > 0
  const canRename = !!doc && !!fileName

  // View-submenu items are each conditional; the group only renders if at least
  // one would show (e.g. a single-page XFA form has none, so no empty "View").
  const showPages = variant === 'toolbar' && !!doc && numPages > 1
  const showPresent = variant === 'toolbar' && !!doc
  const showFind = !!doc && !isXfa
  const hasViewItems = showPages || showPresent || showFind

  const [open, setOpen] = useState(false)
  const [langSubOpen, setLangSubOpen] = useState(false)
  const [redactSubOpen, setRedactSubOpen] = useState(false)
  const [editSubOpen, setEditSubOpen] = useState(false)
  const [fileSubOpen, setFileSubOpen] = useState(false)
  const [viewSubOpen, setViewSubOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [currentLang, setCurrentLang] = useState<LangCode>(readSavedLang())
  const [showOtherHint, setShowOtherHint] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

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

  // Header variant lives inside <UniversalAppsNavBar />'s white chrome —
  // light pill, slate text, slate hover. Toolbar variant still ships in the
  // dark slate-900 toolbar below the editor on desktop.
  const triggerClass =
    variant === 'header'
      ? 'h-8 px-3 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium ring-1 ring-slate-200 flex items-center gap-1.5'
      : 'h-10 px-3 rounded bg-slate-700 hover:bg-slate-600 text-sm font-medium flex items-center gap-1.5 text-white'

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      // The toolbar variant renders its panel in a portal outside `ref`, so
      // check the menu element too — otherwise clicks inside it (rename input,
      // language list) would count as "outside" and close the menu.
      if (
        (ref.current && ref.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target))
      ) {
        return
      }
      setOpen(false)
      setLangSubOpen(false)
      setRedactSubOpen(false)
      setEditSubOpen(false)
      setFileSubOpen(false)
      setViewSubOpen(false)
      setRenameOpen(false)
      setShowOtherHint(false)
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
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, langSubOpen, renameOpen])

  // The toolbar variant lives inside the editor's dark bar, which sets
  // `overflow-x-auto` — and per CSS that forces `overflow-y` to clip too, so an
  // absolutely-positioned dropdown gets cut off and the PDF shows through. Pin
  // the panel to the viewport (portal + fixed) anchored under the trigger so it
  // escapes the scroll box and paints above the page.
  useLayoutEffect(() => {
    if (!open || variant !== 'toolbar') return
    function place() {
      const anchor = ref.current
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      const width = 240 // w-60
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      setMenuPos({ top: r.bottom + 4, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, variant])

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

  // Header variant nests inside the navbar chrome (no clipping), so a plain
  // absolute panel is fine. Toolbar variant must escape the dark bar's
  // overflow box, so it portals to <body> with fixed coords.
  function renderMenu(body: React.ReactNode) {
    const panelClass =
      'w-60 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200'
    if (variant === 'header') {
      return (
        <div ref={menuRef} className={`absolute right-0 mt-2 ${panelClass} overflow-hidden z-50`}>
          {body}
        </div>
      )
    }
    if (!menuPos) return null
    return createPortal(
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
        className={`${panelClass} max-h-[80vh] overflow-y-auto z-[60]`}
      >
        {body}
      </div>,
      document.body,
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
        aria-haspopup="true"
        aria-expanded={open}
      >
        Actions
        <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={onPick}
      />
      {open && renderMenu(
        <>
          {/* Current file name — a non-interactive header at the very top of the
              dropdown so the user always knows which PDF the actions apply to. */}
          {doc && fileName && (
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Current file</div>
              <div className="text-sm font-medium text-slate-800 truncate" title={fileName}>{fileName}</div>
            </div>
          )}

          {/* When no PDF is loaded, keep Open as the prominent primary action;
              once a doc is open, Open/Close live inside the File submenu below. */}
          {!doc && (
            <button
              onClick={() => { fileInputRef.current?.click(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-orange-50 hover:text-orange-700 text-sm"
            >
              <span aria-hidden="true">📄</span>
              <span className="flex-1 text-left font-medium">Open PDF…</span>
            </button>
          )}

          {/* File — open / close / backup / rename, grouped into a secondary submenu. */}
          <button
            onClick={() => { setFileSubOpen((v) => !v) }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
            aria-haspopup="true"
            aria-expanded={fileSubOpen}
          >
            <span aria-hidden="true">🗂</span>
            <span className="flex-1 text-left">File</span>
            <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${fileSubOpen ? '-rotate-90' : ''}`} aria-hidden="true">
              <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {fileSubOpen && (
            <div className="border-t border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
              {doc && (
                <button
                  onClick={() => { reset(); setOpen(false) }}
                  className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                >
                  <span aria-hidden="true">🏠</span>
                  <span className="flex-1 text-left">Close PDF</span>
                </button>
              )}

              {doc && (
                <button
                  onClick={() => { fileInputRef.current?.click(); setOpen(false) }}
                  className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                >
                  <span aria-hidden="true">📄</span>
                  <span className="flex-1 text-left">Open another PDF…</span>
                </button>
              )}

              {/* Backup: free local (automatic) vs paid "Hosted by UNI·SIM" cloud. */}
              <button
                onClick={() => { setHostedStoreOpen(true); setOpen(false) }}
                className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
              >
                <span aria-hidden="true">💾</span>
                <span className="flex-1 text-left">{doc ? 'Back up…' : 'Backups…'}</span>
              </button>

              {canRename && !renameOpen && (
                <button
                  onClick={startRename}
                  className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                >
                  <span aria-hidden="true">✎</span>
                  <span className="flex-1 text-left">Rename PDF</span>
                </button>
              )}

              {canRename && renameOpen && (
                <div className="pl-8 pr-3 py-2.5">
                  <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                    Rename PDF
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
            </div>
          )}

          {/* View — Pages / Present / Find. Each item is conditional (see the
              show* flags); Pages & Present live in the desktop viewer bar, so
              this group mainly serves mobile, where that bar has no room. */}
          {hasViewItems && (
            <>
              <button
                onClick={() => { setViewSubOpen((v) => !v) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
                aria-haspopup="true"
                aria-expanded={viewSubOpen}
              >
                <span aria-hidden="true">👁</span>
                <span className="flex-1 text-left">View</span>
                <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${viewSubOpen ? '-rotate-90' : ''}`} aria-hidden="true">
                  <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {viewSubOpen && (
                <div className="border-t border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
                  {showPages && (
                    <button
                      onClick={() => { setPageNavOpen(true); setOpen(false) }}
                      className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                    >
                      <span aria-hidden="true">☰</span>
                      <span className="flex-1 text-left">Pages</span>
                      <span className="text-[11px] text-slate-400 tabular-nums">{numPages}</span>
                    </button>
                  )}
                  {showPresent && (
                    <button
                      onClick={() => { setPresentOpen(true); setOpen(false) }}
                      className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                    >
                      <span aria-hidden="true">▶</span>
                      <span className="flex-1 text-left">Present</span>
                    </button>
                  )}
                  {showFind && (
                    <button
                      onClick={() => { setSearchOpen(true); setOpen(false) }}
                      className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                    >
                      <span aria-hidden="true">🔍</span>
                      <span className="flex-1 text-left">Find</span>
                      <span className="text-[11px] text-slate-400 tracking-wide">Ctrl+F</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Make searchable (OCR) — image-only / scanned PDFs get an on-device
              text layer so Find, copy and redact-by-search work. Hidden for XFA
              forms (dynamic HTML forms, not raster pages). */}
          {doc && !isXfa && (
            <button
              onClick={() => { setOcrOpen(true); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-orange-50 hover:text-orange-700 text-sm border-t border-slate-100"
            >
              <span aria-hidden="true">🔎</span>
              <span className="flex-1 text-left">
                <span className="block font-medium leading-tight">Make searchable (OCR)</span>
                <span className="block text-[11px] text-slate-500 leading-tight">Read a scanned PDF on-device so you can find &amp; select its text</span>
              </span>
            </button>
          )}

          {doc && (
            <>
              <button
                onClick={() => { setRedactSubOpen((v) => !v) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
                aria-haspopup="true"
                aria-expanded={redactSubOpen}
              >
                <RedactIcon size={16} className="text-slate-700" />
                <span className="flex-1 text-left">Redact</span>
                <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${redactSubOpen ? '-rotate-90' : ''}`} aria-hidden="true">
                  <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {redactSubOpen && (
                <div className="border-t border-slate-100 bg-slate-50/60">
                  {!isXfa && (
                    <button
                      type="button"
                      onClick={() => { openForRedact(); setOpen(false) }}
                      className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                    >
                      <span aria-hidden="true">🔍</span>
                      <span className="flex-1 text-left">
                        <span className="block font-medium leading-tight">Find and redact</span>
                        <span className="block text-[11px] text-slate-500 leading-tight">Search the text and black out every match</span>
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setTool('redact'); setOpen(false) }}
                    className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors border-t border-slate-100"
                  >
                    <span aria-hidden="true">✏️</span>
                    <span className="flex-1 text-left">
                      <span className="block font-medium leading-tight">Free draw</span>
                      <span className="block text-[11px] text-slate-500 leading-tight">Drag a box over anything to redact it by hand</span>
                    </span>
                  </button>

                  {/* Fill colour for new redactions (black is the privacy default; white blanks a white page) */}
                  <div className="flex items-center gap-2 pl-8 pr-3 py-2.5 border-t border-slate-100">
                    <span className="text-[11px] font-medium text-slate-500">Fill</span>
                    {(['black', 'white'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setRedactFill(f)}
                        title={f === 'black' ? 'Black redaction' : 'White redaction'}
                        aria-pressed={redactFill === f}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          redactFill === f ? 'border-orange-500 scale-110' : 'border-slate-300 hover:scale-105'
                        } ${f === 'white' ? 'bg-white' : 'bg-black'}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Undo / Redo / Clear collapse into one secondary submenu — they're
              editing conveniences (Ctrl+Z/Y and the mobile bar cover the fast
              path), so grouping them keeps the top level short. */}
          {doc && (
            <>
              <button
                onClick={() => { setEditSubOpen((v) => !v) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
                aria-haspopup="true"
                aria-expanded={editSubOpen}
              >
                <span aria-hidden="true">↶</span>
                <span className="flex-1 text-left">Undo / Redo</span>
                <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${editSubOpen ? '-rotate-90' : ''}`} aria-hidden="true">
                  <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {editSubOpen && (
                <div className="border-t border-slate-100 bg-slate-50/60">
                  <button
                    onClick={() => { if (canUndo) { undo(); setOpen(false) } }}
                    disabled={!canUndo}
                    className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span aria-hidden="true">↶</span>
                    <span className="flex-1 text-left">Undo</span>
                    <span className="text-[11px] text-slate-400 tracking-wide">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={() => { if (canRedo) { redo(); setOpen(false) } }}
                    disabled={!canRedo}
                    className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-t border-slate-100"
                  >
                    <span aria-hidden="true">↷</span>
                    <span className="flex-1 text-left">Redo</span>
                    <span className="text-[11px] text-slate-400 tracking-wide">Ctrl+Y</span>
                  </button>
                  <button
                    onClick={() => { if (canClear) { clearAll(); setOpen(false) } }}
                    disabled={!canClear}
                    className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-red-600 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-t border-slate-100"
                  >
                    <span aria-hidden="true">🗑</span>
                    <span className="flex-1 text-left">Clear all annotations</span>
                  </button>
                </div>
              )}
            </>
          )}

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
        </>,
      )}
    </div>
  )
}
