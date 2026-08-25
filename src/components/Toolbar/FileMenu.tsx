import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnnotationStore } from '../../stores/annotationStore'
import { usePdfStore } from '../../stores/pdfStore'
import { useSearchStore } from '../../stores/searchStore'
import { LANGS, persistLang, readSavedLang, type LangCode } from '../../lib/lang'
import { OfficeImportError, PDF_OR_OFFICE_ACCEPT, toViewablePdf } from '../../lib/officeToPdf'
import { RedactIcon } from '../icons/RedactIcon'
import { useCloseAppMenu } from '@unisim/sdk'

interface Props {
  /**
   * `toolbar` (default) and `header` own their trigger and panel — the dark
   * editor bar and the white navbar respectively.
   *
   * `rows` renders the menu BODY only, no trigger and no panel, for the SDK's
   * `actions` slot: since @unisim/sdk 0.78.0 the app's actions and the profile
   * are one pill with one dropdown, so this menu supplies its rows and the SDK
   * supplies the container. The body is a flat accordion list — every submenu
   * expands in place rather than flying out — which is exactly why it can be
   * dropped into someone else's panel unchanged.
   */
  variant?: 'header' | 'toolbar' | 'rows'
}

// Middle-truncate a long file name so the END survives. A plain CSS
// end-ellipsis throws away the extension and the tail — and "…-v3-final.pdf"
// is usually the half that tells two documents apart. The `truncate` class
// stays on the span underneath as the belt-and-braces cap for a name that is
// still too wide at this length (one long unbroken word, a narrow panel).
// 26 characters is what fits the 216px the panel's header row gives it at
// text-sm/font-medium, with the ✎ alongside. Set it any higher and CSS
// `truncate` clips the shortened name a SECOND time — which throws away the
// extension the middle-ellipsis exists to keep.
const NAME_MAX = 26

// The menu's resting width — wide enough for its WIDEST row, not its narrowest.
//
// ⚠️ The panel is not a fixed box in the variant the editor actually uses. App
// renders <FileMenu variant="rows" /> inside the SDK's <UserProfile> dropdown,
// and that surface sizes itself to its content above a 220px floor. So the
// panel used to sit at 220px until you opened Advanced — whose "Make searchable
// (OCR)" row carries a (?) button as well as the deepest indent — and then
// jumped to 251px, re-flowing every row under the cursor mid-click.
//
// Measured in the browser with every submenu expanded, the widest row wants
// 252px; 256 clears it with a little slack, so no submenu can move the edge.
// Keep the px and the classes in step — the toolbar variant positions itself
// from the number, and the other two size themselves from the classes.
const MENU_WIDTH_PX = 256
const MENU_WIDTH_CLASS = 'w-64' // 16rem
const MENU_MIN_WIDTH_CLASS = 'min-w-64' // rows mode: the SDK surface is the box
function shortenFileName(name: string): string {
  if (name.length <= NAME_MAX) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : ''
  const stem = ext ? name.slice(0, dot) : name
  const keep = NAME_MAX - ext.length - 1
  const head = Math.ceil(keep * 0.6)
  const tail = keep - head
  return `${stem.slice(0, head)}…${tail > 0 ? stem.slice(-tail) : ''}${ext}`
}

// A menu row whose explanation is behind a (?) rather than printed underneath.
//
// These rows used to carry a second line of description each. Six of them at
// once made the menu a wall of text and stretched it far past the width of the
// labels themselves — the descriptions, not the labels, were setting the size.
// Now every row is one line, so the menu is uniform and compact, and the
// explanation is one tap away.
//
// ⚠️ The action and the (?) are SIBLING buttons inside a flex row, not nested.
// A <button> inside a <button> is invalid HTML and browsers do not agree on
// which one a click belongs to — the row's own action would fire when you were
// only asking what it does. For the same reason the (?) stops propagation and
// leaves the menu open: asking for help must never pick the item.
function InfoRow({
  icon,
  label,
  info,
  onSelect,
  indent = 'pl-8',
  className = '',
}: {
  icon: React.ReactNode
  label: string
  info: string
  onSelect: () => void
  indent?: string
  className?: string
}) {
  const [showInfo, setShowInfo] = useState(false)
  return (
    <div className={className}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onSelect}
          className={`flex-1 min-w-0 flex items-center gap-3 ${indent} pr-1 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors`}
        >
          <span aria-hidden="true">{icon}</span>
          <span className="flex-1 text-left font-medium leading-tight">{label}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowInfo((v) => !v)
          }}
          aria-expanded={showInfo}
          aria-label={`What does "${label}" do?`}
          className={`shrink-0 self-center mr-2 w-6 h-6 rounded-full border text-[11px] font-semibold transition-colors ${
            showInfo
              ? 'border-orange-300 bg-orange-50 text-orange-700'
              : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
          }`}
        >
          ?
        </button>
      </div>
      {showInfo && (
        <p className={`${indent} pr-3 pb-2.5 -mt-0.5 text-[11px] leading-snug text-slate-500`}>
          {info}
        </p>
      )}
    </div>
  )
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
  const setMergeOpen = usePdfStore((s) => s.setMergeOpen)
  const setConvertOpen = usePdfStore((s) => s.setConvertOpen)
  const setMetadataOpen = usePdfStore((s) => s.setMetadataOpen)
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
  const [advancedSubOpen, setAdvancedSubOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  // Where the rename editor is drawn: the "Current file" header (clicking
  // the name) or the File submenu's Rename row. One editor, two homes —
  // showing it in both at once would be two inputs racing over one name.
  const [renameInHeader, setRenameInHeader] = useState(false)
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
    closeMenu()
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      try {
        // Same front door as the landing page: a Word or OpenDocument file is
        // converted on-device first, and its notice rides along with the load.
        const { file, notice } = await toViewablePdf(f)
        await loadFile(file, { notice })
      } catch (err) {
        console.error(err)
        alert(err instanceof OfficeImportError ? err.message : 'Failed to load PDF')
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
      closeMenu()
      setLangSubOpen(false)
      setRedactSubOpen(false)
      setEditSubOpen(false)
      setFileSubOpen(false)
      setViewSubOpen(false)
      setAdvancedSubOpen(false)
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
          closeMenu()
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
      const width = MENU_WIDTH_PX
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

  /**
   * Dismiss the menu after a terminal action.
   *
   * ⚠️ React's `setOpen(false)` alone is a NO-OP in `rows` mode, which is
   * what the mobile profile pill uses: there the panel belongs to the SDK's
   * <UserProfile> dropdown, this component's own `open` state is never true
   * (see the rows branch at the bottom), and the SDK renders `actions` as-is
   * without handing down any way to close itself. So on a phone every menu
   * item left the dropdown sitting open over whatever it had just opened.
   *
   * `useCloseAppMenu()` is the SDK's own handle on that dropdown, added in
   * 0.110.0 for exactly this. It replaces a workaround that dispatched a
   * synthetic document `mousedown` to trip DropdownSurface's outside-click —
   * correct in effect, but reaching into another package's internals and liable
   * to break silently the day that surface changed.
   */
  const closeAppMenu = useCloseAppMenu()

  function closeMenu() {
    setOpen(false)
    // In `rows` mode the panel belongs to the SDK's <UserProfile> dropdown and
    // the `open` above is never true, so this is what actually dismisses it.
    // Outside a UserProfile the hook is a no-op, so it costs nothing to call
    // unconditionally.
    closeAppMenu()
  }

  function startRename(fromHeader = false) {
    if (!fileName) return
    setRenameDraft(fileName)
    setLangSubOpen(false)
    setShowOtherHint(false)
    setRenameInHeader(fromHeader)
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
    closeMenu()
  }

  /**
   * The rename editor itself. Drawn either under the "Current file" header —
   * clicking the name is the fast path, since that is where you are already
   * looking when you decide the name is wrong — or in the File submenu's
   * Rename row, which is where it has always lived.
   */
  function renameEditor(wrapperClass: string, showLabel: boolean) {
    return (
      <div className={wrapperClass}>
        {showLabel && (
          <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">
            Rename PDF
          </label>
        )}
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
            className="px-3 py-1 text-xs font-medium text-white bg-orange-700 hover:bg-orange-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  // Header variant nests inside the navbar chrome (no clipping), so a plain
  // absolute panel is fine. Toolbar variant must escape the dark bar's
  // overflow box, so it portals to <body> with fixed coords.
  function renderMenu(body: React.ReactNode) {
    const panelClass =
      `${MENU_WIDTH_CLASS} bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200`
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

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={PDF_OR_OFFICE_ACCEPT}
      hidden
      onChange={onPick}
    />
  )

  const body = (
        <>
          {/* Current file name — a header at the very top of the dropdown so the
              user always knows which PDF the actions apply to, and the shortest
              way to fix a wrong name: clicking it renames in place.

              ⚠️ The name is capped in BOTH directions on purpose. In `rows` mode
              the panel belongs to the SDK's <UserProfile> dropdown and sizes
              itself to its content, so an unbounded name set the width of the
              whole menu — a 46-character export name stretched it halfway across
              the screen. `max-w` bounds what this row can contribute to that
              width; shortenFileName keeps the tail readable inside it. */}
          {doc && fileName && (
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Current file</div>
              {canRename && renameOpen && renameInHeader ? (
                renameEditor('mt-1', false)
              ) : (
                <button
                  type="button"
                  onClick={() => startRename(true)}
                  title={`${fileName} — click to rename`}
                  aria-label={`Rename ${fileName}`}
                  className="group w-full max-w-[13.5rem] flex items-center gap-1.5 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 group-hover:text-orange-700 transition-colors">
                    {shortenFileName(fileName)}
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-[11px] text-slate-400 group-hover:text-orange-700 transition-colors">
                    ✎
                  </span>
                </button>
              )}
            </div>
          )}

          {/* When no PDF is loaded, keep Open as the prominent primary action;
              once a doc is open, Open/Close live inside the File submenu below. */}
          {!doc && (
            <button
              onClick={() => { fileInputRef.current?.click(); closeMenu() }}
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
                  onClick={() => { reset(); closeMenu() }}
                  className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                >
                  <span aria-hidden="true">🏠</span>
                  <span className="flex-1 text-left">Close PDF</span>
                </button>
              )}

              {doc && (
                <button
                  onClick={() => { fileInputRef.current?.click(); closeMenu() }}
                  className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                >
                  <span aria-hidden="true">📄</span>
                  <span className="flex-1 text-left">Open another PDF…</span>
                </button>
              )}

              {/* Backup: free local (automatic) vs paid "Hosted by UNI·SIM" cloud. */}
              <button
                onClick={() => { setHostedStoreOpen(true); closeMenu() }}
                className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
              >
                <span aria-hidden="true">💾</span>
                <span className="flex-1 text-left">{doc ? 'Back up…' : 'Backups…'}</span>
              </button>

              {canRename && !renameOpen && (
                <button
                  onClick={() => startRename()}
                  className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                >
                  <span aria-hidden="true">✎</span>
                  <span className="flex-1 text-left">Rename PDF</span>
                </button>
              )}

              {canRename && renameOpen && !renameInHeader && renameEditor('pl-8 pr-3 py-2.5', true)}
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
                      onClick={() => { setPageNavOpen(true); closeMenu() }}
                      className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                    >
                      <span aria-hidden="true">☰</span>
                      <span className="flex-1 text-left">Pages</span>
                      <span className="text-[11px] text-slate-400 tabular-nums">{numPages}</span>
                    </button>
                  )}
                  {showPresent && (
                    <button
                      onClick={() => { setPresentOpen(true); closeMenu() }}
                      className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors"
                    >
                      <span aria-hidden="true">▶</span>
                      <span className="flex-1 text-left">Present</span>
                    </button>
                  )}
                  {showFind && (
                    <button
                      onClick={() => { setSearchOpen(true); closeMenu() }}
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

          {/* Advanced — power-user actions that transform the whole document:
              OCR, merge with other PDFs, and convert the pages to images. Grouped
              into a secondary submenu so the top level stays short. */}
          {doc && (
            <>
              <button
                onClick={() => { setAdvancedSubOpen((v) => !v) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
                aria-haspopup="true"
                aria-expanded={advancedSubOpen}
              >
                <span aria-hidden="true">⚙️</span>
                <span className="flex-1 text-left">Advanced</span>
                <svg viewBox="0 0 12 12" className={`w-3 h-3 transition-transform ${advancedSubOpen ? '-rotate-90' : ''}`} aria-hidden="true">
                  <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {advancedSubOpen && (
                <div className="border-t border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
                  {!isXfa && (
                    <InfoRow
                      icon="🔎"
                      label="Make searchable (OCR)"
                      info="Read a scanned PDF on-device so you can find & select its text."
                      onSelect={() => { setOcrOpen(true); closeMenu() }}
                    />
                  )}
                  <InfoRow
                    icon="⧉"
                    label="Merge with another PDF"
                    info="Combine this file with others — reorder before you export."
                    onSelect={() => { setMergeOpen(true); closeMenu() }}
                  />
                  <InfoRow
                    icon="⇄"
                    label="Convert into images"
                    info="Render each page to PNG or JPG (a ZIP for multiple pages)."
                    onSelect={() => { setConvertOpen(true); closeMenu() }}
                  />
                  <InfoRow
                    icon="🏷"
                    label="Document metadata"
                    info="See who and what this file names — then scrub it."
                    onSelect={() => { setMetadataOpen(true); closeMenu() }}
                  />
                </div>
              )}
            </>
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
                    <InfoRow
                      icon="🔍"
                      label="Find and redact"
                      info="Search the text and black out every match."
                      onSelect={() => { openForRedact(); closeMenu() }}
                    />
                  )}
                  <InfoRow
                    icon="✏️"
                    label="Free draw"
                    info="Drag a box over anything to redact it by hand."
                    onSelect={() => { setTool('redact'); closeMenu() }}
                    className="border-t border-slate-100"
                  />

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
                    onClick={() => { if (canUndo) { undo(); closeMenu() } }}
                    disabled={!canUndo}
                    className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span aria-hidden="true">↶</span>
                    <span className="flex-1 text-left">Undo</span>
                    <span className="text-[11px] text-slate-400 tracking-wide">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={() => { if (canRedo) { redo(); closeMenu() } }}
                    disabled={!canRedo}
                    className="w-full flex items-center gap-3 pl-8 pr-3 py-2.5 text-sm text-slate-700 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-t border-slate-100"
                  >
                    <span aria-hidden="true">↷</span>
                    <span className="flex-1 text-left">Redo</span>
                    <span className="text-[11px] text-slate-400 tracking-wide">Ctrl+Y</span>
                  </button>
                  <button
                    onClick={() => { if (canClear) { clearAll(); closeMenu() } }}
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

          {/* Language submenu — "Document" is load-bearing, not decoration. This
              sets the PDF's own `document.documentElement.lang`; the SDK's
              profile menu carries the SUITE-WIDE UI language, and since 0.78.0
              both live in this one dropdown. Two rows called "Language" in one
              panel is a coin toss for the user. */}
          <button
            onClick={() => { setLangSubOpen((v) => !v); setShowOtherHint(false) }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-t border-slate-100"
            aria-haspopup="true"
            aria-expanded={langSubOpen}
          >
            <span aria-hidden="true">{currentLangOpt.flag}</span>
            <span className="flex-1 text-left">Document language</span>
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
                    className="text-orange-700 hover:underline font-medium"
                  >
                    Contact UNI SIM
                  </a>{' '}
                  to request a language.
                </div>
              )}
            </div>
          )}
        </>
  )

  // Rows mode: the SDK's dropdown is the container, so there is no trigger, no
  // panel and no `open` state in play (the outside-click and positioning
  // effects above are both gated on `open`, which stays false here).
  if (variant === 'rows') {
    return (
      <>
        {fileInput}
        <div className={MENU_MIN_WIDTH_CLASS}>{body}</div>
      </>
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
      {fileInput}
      {open && renderMenu(body)}
    </div>
  )
}
