import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnnotationStore } from '../../stores/annotationStore'
import { usePdfStore } from '../../stores/pdfStore'
import SignatureMenu from '../Signature/SignatureMenu'
import ExportModal from '../Export/ExportModal'
import type { Annotation, FontFamily, Tool } from '../../types/annotations'

const FONT_OPTIONS: { id: FontFamily; label: string; preview: string; css: string }[] = [
  { id: 'sans', label: 'Sans', preview: 'Aa', css: 'Helvetica, Arial, sans-serif' },
  { id: 'serif', label: 'Serif', preview: 'Aa', css: '"Times New Roman", Times, serif' },
  { id: 'mono', label: 'Mono', preview: 'Aa', css: '"Courier New", Courier, monospace' }
]

const LONG_PRESS_MS = 450

function HighlighterIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Yellow marker body */}
      <path d="M16 3 L21 8 L12 17 L7 12 Z" fill="#fde047" stroke="#a16207" strokeWidth="0.8" strokeLinejoin="round" />
      {/* Dark chisel tip */}
      <path d="M7 12 L12 17 L10 19 L5 19 L4 18 L4 14 Z" fill="#1e293b" stroke="#0f172a" strokeWidth="0.8" strokeLinejoin="round" />
      {/* Highlight swipe under tip */}
      <path d="M3 22 L13 22" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

function PictureFrameIcon({ active = false, className = 'w-6 h-6' }: { active?: boolean; className?: string }) {
  const frame = active ? '#fff' : '#fbbf24'
  const sky = '#7dd3fc'
  const ground = '#86efac'
  const sun = '#fde047'
  const mountain = '#94a3b8'
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill={sky} stroke={frame} strokeWidth="1.6" />
      <rect x="3" y="14" width="18" height="6" fill={ground} />
      <circle cx="8.5" cy="9" r="1.8" fill={sun} />
      <path d="M3 17 L9 11 L13 14 L18 9 L21 12 L21 20 L3 20 Z" fill={mountain} opacity="0.9" />
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke={frame} strokeWidth="1.6" />
    </svg>
  )
}

const COLORS = [
  { hex: '#000000', name: 'Black' },
  { hex: '#ffffff', name: 'White' },
  { hex: '#dc2626', name: 'Red' },
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#16a34a', name: 'Green' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#9333ea', name: 'Purple' }
]

const HIGHLIGHT_YELLOW = '#eab308'
const HIGHLIGHT_GREEN = '#16a34a'

const DRAW_SHAPES: { id: Tool; icon: string; label: string }[] = [
  { id: 'tick', icon: '✓', label: 'Tick' },
  { id: 'cross', icon: '✗', label: 'Cross' },
  { id: 'line', icon: '╱', label: 'Line' },
  { id: 'rect', icon: '▭', label: 'Box' },
  { id: 'ellipse', icon: '◯', label: 'Circle' }
]

type Panel = 'select' | 'text' | 'draw' | 'color' | null

// Renders a toolbar dropdown into a body-level portal, fixed-positioned under
// its anchor. The desktop toolbar sits inside an `overflow-x-auto` container
// (so it can scroll horizontally on narrow viewports); per the CSS overflow
// spec that container also clips vertically, which turned the dropdowns into an
// inner scrollbar instead of letting them overlay the PDF. Portaling escapes
// the clip. `panelRef` is shared with the outside-click handler so clicks
// inside the floated panel don't close it.
function FloatingPanel({
  anchorRef,
  panelRef,
  children
}: {
  anchorRef: React.RefObject<HTMLDivElement>
  panelRef: React.RefObject<HTMLDivElement>
  children: React.ReactNode
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    function place() {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 4 })
    }
    place()
    window.addEventListener('resize', place)
    // Capture phase so the toolbar's own horizontal scroll (and any ancestor
    // scroll) keeps the panel pinned to its anchor.
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef])
  if (!pos) return null
  return createPortal(
    <div ref={panelRef} style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 60 }}>
      {children}
    </div>,
    document.body
  )
}

const SELECT_OPTIONS: { id: Tool; icon: string; label: string; help: string }[] = [
  { id: 'select', icon: '↖', label: 'Select', help: 'Click to move, resize or edit. On desktop, drag empty space to select many' },
  { id: 'marquee', icon: '⛶', label: 'Select area', help: 'Drag a box to select many edits, then move/resize/rotate them together' },
  { id: 'hand', icon: '✋', label: 'Hand', help: 'Drag to pan around the PDF without selecting' }
]

// Icon shown on the main Select-group button for the currently-active tool.
const SELECT_GROUP_ICON: Partial<Record<Tool, string>> = {
  select: '↖',
  marquee: '⛶',
  hand: '✋'
}

// Module-level in-app clipboard for annotations (Ctrl+C/X/V)
let clipboardAnnotation: Annotation | null = null

// Shared keyboard shortcuts: Delete/Backspace, Ctrl+Z, Ctrl+C/X/V.
// Mounted once at the App level whenever a PDF is loaded.
export function useToolbarKeyboardShortcuts(enabled: boolean) {
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const selectedIds = useAnnotationStore((s) => s.selectedIds)
  const undo = useAnnotationStore((s) => s.undo)
  const redo = useAnnotationStore((s) => s.redo)
  const remove = useAnnotationStore((s) => s.remove)
  const removeMany = useAnnotationStore((s) => s.removeMany)
  const add = useAnnotationStore((s) => s.add)

  useEffect(() => {
    if (!enabled) return
    function isEditable(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if ((el as HTMLElement).isContentEditable) return true
      return false
    }
    function onKey(e: KeyboardEvent) {
      if (isEditable(document.activeElement)) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }
      if (mod && key === 'c') {
        if (!selectedId) return
        const sel = useAnnotationStore.getState().annotations.find((a) => a.id === selectedId)
        if (!sel) return
        clipboardAnnotation = sel
        e.preventDefault()
        return
      }
      if (mod && key === 'x') {
        if (!selectedId) return
        const sel = useAnnotationStore.getState().annotations.find((a) => a.id === selectedId)
        if (!sel) return
        clipboardAnnotation = sel
        remove(selectedId)
        e.preventDefault()
        return
      }
      if (mod && key === 'v') {
        if (!clipboardAnnotation) return
        const clone: Annotation = JSON.parse(JSON.stringify(clipboardAnnotation))
        clone.id = crypto.randomUUID()
        if ('x' in clone && 'y' in clone) {
          ;(clone as { x: number; y: number }).x = (clone as { x: number; y: number }).x + 20
          ;(clone as { x: number; y: number }).y = (clone as { x: number; y: number }).y + 20
        } else if ('points' in clone) {
          ;(clone as { points: number[] }).points = (clone as { points: number[] }).points.map((v, i) =>
            i % 2 === 0 ? v + 20 : v + 20
          )
        }
        add(clone)
        e.preventDefault()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 1) {
          e.preventDefault()
          removeMany(selectedIds)
          return
        }
        if (!selectedId) return
        e.preventDefault()
        remove(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, selectedId, selectedIds, remove, removeMany, undo, redo, add])
}

const isDrawShape = (t: Tool) => t === 'tick' || t === 'cross' || t === 'line' || t === 'rect' || t === 'ellipse' || t === 'highlight'

// --- DESKTOP TOOLS (left, inline in header) -------------------------------
export function ToolbarDesktopTools() {
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const setTool = useAnnotationStore((s) => s.setTool)
  const setColor = useAnnotationStore((s) => s.setColor)
  const setStrokeWidth = useAnnotationStore((s) => s.setStrokeWidth)
  const setSelected = useAnnotationStore((s) => s.setSelected)
  const remove = useAnnotationStore((s) => s.remove)
  const fontSize = useAnnotationStore((s) => s.fontSize)
  const setFontSize = useAnnotationStore((s) => s.setFontSize)
  const fontFamily = useAnnotationStore((s) => s.fontFamily)
  const setFontFamily = useAnnotationStore((s) => s.setFontFamily)
  const setUploadedImageSrc = useAnnotationStore((s) => s.setUploadedImageSrc)

  const [openPanel, setOpenPanel] = useState<Panel>(null)

  const selectGroupRef = useRef<HTMLDivElement>(null)
  const textGroupRef = useRef<HTMLDivElement>(null)
  const drawGroupRef = useRef<HTMLDivElement>(null)
  // The open panel is portaled out of the toolbar, so it's no longer a DOM
  // descendant of the group refs — track it separately for outside-click.
  const panelContentRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)

  function togglePanel(p: Panel) {
    setOpenPanel((prev) => (prev === p ? null : p))
  }

  useEffect(() => {
    if (!openPanel) return
    function onDoc(e: MouseEvent) {
      const refs = [selectGroupRef, textGroupRef, drawGroupRef, panelContentRef]
      const inside = refs.some((r) => r.current?.contains(e.target as Node))
      if (!inside) setOpenPanel(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openPanel])

  // Drawing a line auto-selects it and pops a contextual stroke/snap panel next
  // to the line. Collapse the draw-options dropdown so that panel isn't hidden
  // behind it.
  useEffect(() => {
    if (!selectedId) return
    const sel = useAnnotationStore.getState().annotations.find((a) => a.id === selectedId)
    if (sel && sel.type === 'draw' && sel.shape === 'line') setOpenPanel(null)
  }, [selectedId])

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target?.result as string
      setUploadedImageSrc(src)
      setTool('image')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function PlusBox({ panel }: { panel: Panel }) {
    return (
      <button
        onClick={() => togglePanel(panel)}
        className={`w-[14px] h-[14px] text-[9px] font-bold rounded-[3px] flex items-center justify-center transition-colors border self-start mt-[3px] -ml-[2px] leading-none ${
          openPanel === panel
            ? 'bg-orange-500 border-orange-400 text-white'
            : 'bg-slate-600 border-slate-500 text-slate-300 hover:bg-slate-500 hover:text-white'
        }`}
        title={`${openPanel === panel ? 'Close' : 'Open'} options`}
      >
        +
      </button>
    )
  }

  function startLongPress(panel?: Panel) {
    if (!panel) return
    longPressed.current = false
    if (pressTimer.current !== null) clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      setOpenPanel(panel)
    }, LONG_PRESS_MS)
  }
  function endLongPress() {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  function handleToolClick(id: Tool, panel?: Panel, defaultColor?: string) {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (panel && tool === id) {
      togglePanel(panel)
    } else {
      setTool(id)
      if (defaultColor) {
        // Deselect first so setColor doesn't repaint the currently selected
        // annotation when the user is really just switching tools.
        setSelected(null)
        setColor(defaultColor)
      }
    }
  }

  function toolBtn(id: Tool, icon: string, label: string, panel?: Panel, defaultColor?: string) {
    return (
      <button
        key={id}
        onClick={() => handleToolClick(id, panel, defaultColor)}
        onPointerDown={() => startLongPress(panel)}
        onPointerUp={endLongPress}
        onPointerLeave={endLongPress}
        onPointerCancel={endLongPress}
        title={panel ? `${label} — tap again or long-press for options` : label}
        className={`w-9 h-9 rounded flex items-center justify-center text-lg font-semibold transition-colors ${
          tool === id ? 'bg-orange-600' : 'hover:bg-slate-700'
        }`}
      >
        {icon}
      </button>
    )
  }

  function colorSwatch(hex: string, name: string, small = false, onActiveReclick?: () => void) {
    const active = color === hex
    return (
      <button
        key={hex}
        onClick={() => {
          if (active && onActiveReclick) onActiveReclick()
          else setColor(hex)
        }}
        title={onActiveReclick ? `${name} — click again for more colours` : name}
        className={`rounded-full border-2 transition-transform flex-shrink-0 ${
          small ? 'w-6 h-6' : 'w-7 h-7'
        } ${active ? 'border-white scale-110' : 'border-slate-600 hover:scale-105'}`}
        style={{ backgroundColor: hex }}
      />
    )
  }

  function ColorPickerTrigger() {
    const isCustom = !COLORS.some((c) => c.hex === color)
    return (
      <label
        title="Custom colour"
        className={`w-7 h-7 rounded-full cursor-pointer border-2 flex-shrink-0 overflow-hidden transition-transform ${
          isCustom ? 'border-white scale-110' : 'border-slate-600 hover:scale-105'
        }`}
        style={{
          background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'
        }}
      >
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="sr-only"
        />
      </label>
    )
  }

  return (
    <div className="hidden md:flex items-center gap-1 text-white shrink-0 [&>*]:shrink-0">
      {/* Select / Hand with options panel */}
      <div ref={selectGroupRef} className="relative flex items-start">
        {toolBtn(
          tool === 'hand' ? 'hand' : tool === 'marquee' ? 'marquee' : 'select',
          SELECT_GROUP_ICON[tool] ?? '↖',
          tool === 'hand' ? 'Hand — drag to pan' : tool === 'marquee' ? 'Select area — drag a box' : 'Select / move',
          'select'
        )}
        <PlusBox panel="select" />
        {openPanel === 'select' && (
          <FloatingPanel anchorRef={selectGroupRef} panelRef={panelContentRef}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 whitespace-nowrap min-w-56">
            {SELECT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { setTool(opt.id); setOpenPanel(null) }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  tool === opt.id ? 'bg-orange-600 text-white' : 'hover:bg-slate-700 text-slate-100'
                }`}
              >
                <span className="text-lg leading-none w-5 text-center">{opt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[11px] opacity-70">{opt.help}</div>
                </div>
              </button>
            ))}
          </div>
          </FloatingPanel>
        )}
      </div>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      {/* Text + font-size expander */}
      <div ref={textGroupRef} className="relative flex items-start">
        {toolBtn('text', 'T', 'Add text', 'text')}
        <PlusBox panel="text" />
        {openPanel === 'text' && (
          <FloatingPanel anchorRef={textGroupRef} panelRef={panelContentRef}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl px-3 py-2 flex items-center gap-3 whitespace-nowrap">
            <span className="text-xs text-slate-400">Size</span>
            <input
              type="range"
              min={10}
              max={48}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
              className="w-28"
            />
            <span className="text-xs text-slate-300 w-9 tabular-nums text-right">{fontSize}px</span>
            <div className="w-px h-6 bg-slate-600 mx-1" />
            <span className="text-xs text-slate-400">Font</span>
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFontFamily(f.id)}
                title={f.label}
                style={{ fontFamily: f.css }}
                className={`px-2 h-8 rounded text-sm transition-colors ${
                  fontFamily === f.id ? 'bg-orange-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                }`}
              >
                {f.preview}
              </button>
            ))}
          </div>
          </FloatingPanel>
        )}
      </div>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      {/* Pencil + highlighter + colours + combined options panel */}
      <div ref={drawGroupRef} className="relative flex items-start gap-1">
        {toolBtn('draw', '✎', 'Free draw', 'draw', '#000000')}
        <button
          onClick={() => handleToolClick('highlight', 'draw', HIGHLIGHT_YELLOW)}
          onPointerDown={() => startLongPress('draw')}
          onPointerUp={endLongPress}
          onPointerLeave={endLongPress}
          onPointerCancel={endLongPress}
          title="Highlighter — tap again or long-press for options"
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
            tool === 'highlight' ? 'bg-orange-600' : 'hover:bg-slate-700'
          }`}
        >
          <HighlighterIcon className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1 self-center ml-1">
          {tool === 'highlight' ? (
            <>
              {colorSwatch(HIGHLIGHT_YELLOW, 'Yellow', true, () => setOpenPanel('draw'))}
              {colorSwatch(HIGHLIGHT_GREEN, 'Green', true, () => setOpenPanel('draw'))}
            </>
          ) : (
            <>
              {colorSwatch('#000000', 'Black', true, () => setOpenPanel('draw'))}
              {colorSwatch('#ffffff', 'White', true, () => setOpenPanel('draw'))}
            </>
          )}
        </div>
        <PlusBox panel="draw" />
        {openPanel === 'draw' && (
          <FloatingPanel anchorRef={drawGroupRef} panelRef={panelContentRef}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl px-3 py-2 flex items-center gap-2 whitespace-nowrap">
            {DRAW_SHAPES.map((s) => (
              <button
                key={s.id}
                onClick={() => setTool(s.id)}
                title={s.label}
                className={`w-9 h-9 rounded flex items-center justify-center text-lg font-semibold text-white transition-colors ${
                  tool === s.id ? 'bg-orange-600' : 'hover:bg-slate-700'
                }`}
              >
                {s.icon}
              </button>
            ))}
            <div className="w-px h-6 bg-slate-600 mx-1" />
            <span className="text-xs text-slate-400">Stroke</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
              className="w-20"
            />
            <span className="text-xs text-slate-300 w-12 tabular-nums text-right">{strokeWidth.toFixed(1)}px</span>
            <div className="w-px h-6 bg-slate-600 mx-1" />
            <span className="text-xs text-slate-400">Colour</span>
            {COLORS.map((c) => colorSwatch(c.hex, c.name))}
            <ColorPickerTrigger />
          </div>
          </FloatingPanel>
        )}
      </div>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      {/* Image upload */}
      <label
        title="Upload and place an image"
        className={`w-9 h-9 rounded flex items-center justify-center transition-colors cursor-pointer ${
          tool === 'image' ? 'bg-orange-600' : 'hover:bg-slate-700'
        }`}
      >
        <PictureFrameIcon active={tool === 'image'} className="w-5 h-5" />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={handleImageUpload}
        />
      </label>

      {/* Delete (only when an annotation is selected) */}
      {selectedId && (
        <button
          onClick={() => remove(selectedId)}
          title="Delete selected (Del)"
          className="ml-1 px-3 h-9 rounded bg-red-600 hover:bg-red-500 text-sm font-medium"
        >
          Delete
        </button>
      )}
    </div>
  )
}

// --- DESKTOP ACTIONS (right, inline in header) ----------------------------
export function ToolbarDesktopActions() {
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <>
      <div className="hidden md:flex items-center gap-2 shrink-0 [&>*]:shrink-0">
        <SignatureMenu />
        <button
          onClick={() => setExportOpen(true)}
          disabled={!sourceBytes}
          className="px-4 h-9 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
        >
          Export
        </button>
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  )
}

// --- MOBILE TOOLBAR (bottom, fixed) --------------------------------------
export function ToolbarMobile() {
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const annotations = useAnnotationStore((s) => s.annotations)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const setTool = useAnnotationStore((s) => s.setTool)
  const setColor = useAnnotationStore((s) => s.setColor)
  const setStrokeWidth = useAnnotationStore((s) => s.setStrokeWidth)
  const setSelected = useAnnotationStore((s) => s.setSelected)
  const undo = useAnnotationStore((s) => s.undo)
  const canUndo = useAnnotationStore((s) => s.past.length > 0)
  const remove = useAnnotationStore((s) => s.remove)
  const fontSize = useAnnotationStore((s) => s.fontSize)
  const setFontSize = useAnnotationStore((s) => s.setFontSize)
  const setUploadedImageSrc = useAnnotationStore((s) => s.setUploadedImageSrc)

  const sourceBytes = usePdfStore((s) => s.sourceBytes)

  const selectedAnnotation = annotations.find((a) => a.id === selectedId)
  const textSelected = selectedAnnotation?.type === 'text'

  const [openPanel, setOpenPanel] = useState<Panel>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const mobilePanelRef = useRef<HTMLDivElement>(null)

  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)

  function togglePanel(p: Panel) {
    setOpenPanel((prev) => (prev === p ? null : p))
  }

  useEffect(() => {
    if (!openPanel) return
    function onDoc(e: MouseEvent) {
      if (!mobilePanelRef.current?.contains(e.target as Node)) setOpenPanel(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openPanel])

  // Drawing a line auto-selects it and pops a contextual stroke/snap panel next
  // to the line. Collapse the big draw-options panel so that toolbar isn't
  // hidden behind it.
  useEffect(() => {
    if (!selectedId) return
    const sel = useAnnotationStore.getState().annotations.find((a) => a.id === selectedId)
    if (sel && sel.type === 'draw' && sel.shape === 'line') setOpenPanel(null)
  }, [selectedId])

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target?.result as string
      setUploadedImageSrc(src)
      setTool('image')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function startLongPress(panel?: Panel) {
    if (!panel) return
    longPressed.current = false
    if (pressTimer.current !== null) clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      setOpenPanel(panel)
    }, LONG_PRESS_MS)
  }
  function endLongPress() {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  function handleToolClick(id: Tool, panel?: Panel, defaultColor?: string) {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (panel && tool === id) {
      togglePanel(panel)
    } else {
      setTool(id)
      if (defaultColor) {
        setSelected(null)
        setColor(defaultColor)
      }
    }
  }

  const mobilePanelContent = (() => {
    if (openPanel === 'select') {
      return (
        <div className="flex items-center gap-2">
          {SELECT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { setTool(opt.id); setOpenPanel(null) }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tool === opt.id ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className="text-lg leading-none">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )
    }
    if (openPanel === 'text') {
      return (
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium">Size</span>
          <button
            onClick={() => setFontSize(Math.max(10, fontSize - 2))}
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-lg font-semibold text-slate-700"
          >
            −
          </button>
          <span className="text-sm font-medium w-10 text-center tabular-nums text-slate-700">
            {fontSize}px
          </span>
          <button
            onClick={() => setFontSize(Math.min(48, fontSize + 2))}
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-lg font-semibold text-slate-700"
          >
            +
          </button>
        </div>
      )
    }
    if (openPanel === 'draw') {
      return (
        <div className="flex items-center gap-2 flex-wrap max-w-[92vw]">
          <button
            onClick={() => {
              if (tool !== 'highlight') {
                setSelected(null)
                setColor(HIGHLIGHT_YELLOW)
              }
              setTool('highlight')
            }}
            title="Highlighter"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              tool === 'highlight' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <HighlighterIcon className="w-6 h-6" />
          </button>
          {DRAW_SHAPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setTool(s.id)}
              title={s.label}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-semibold transition-colors ${
                tool === s.id ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {s.icon}
            </button>
          ))}
          <div className="w-px h-7 bg-slate-200 mx-1" />
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
            className="w-20"
          />
          <span className="text-xs text-slate-700 tabular-nums w-10 text-right">{strokeWidth.toFixed(1)}px</span>
          <div className="w-px h-7 bg-slate-200 mx-1" />
          {COLORS.map((c) => (
            <button
              key={c.hex}
              onClick={() => setColor(c.hex)}
              className={`w-8 h-8 rounded-full border-2 flex-shrink-0 transition-transform ${
                color === c.hex ? 'border-slate-900 scale-110' : 'border-slate-200 hover:scale-105'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
          <label
            title="Custom colour"
            className={`w-8 h-8 rounded-full cursor-pointer border-2 flex-shrink-0 overflow-hidden transition-transform ${
              !COLORS.some((c) => c.hex === color) ? 'border-slate-900 scale-110' : 'border-slate-200 hover:scale-105'
            }`}
            style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
          >
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="sr-only"
            />
          </label>
        </div>
      )
    }
    return null
  })()

  function mobileBtnWithPlus(id: Tool, icon: string, label: string, panel: Panel, defaultColor?: string) {
    const active = tool === id || (panel === 'draw' && isDrawShape(tool))
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full relative">
        <button
          onClick={() => handleToolClick(id, panel, defaultColor)}
          onPointerDown={() => startLongPress(panel)}
          onPointerUp={endLongPress}
          onPointerLeave={endLongPress}
          onPointerCancel={endLongPress}
          className={`flex flex-col items-center justify-center w-full h-full gap-0.5 rounded transition-colors ${
            active ? 'text-orange-400' : 'text-slate-200'
          }`}
        >
          <span className="text-xl leading-none">{icon}</span>
          <span className="text-[10px] font-medium">{label}</span>
        </button>
        <button
          onClick={() => togglePanel(panel)}
          className={`absolute top-1 right-1 w-[13px] h-[13px] text-[8px] font-bold rounded-[2px] flex items-center justify-center leading-none border ${
            openPanel === panel
              ? 'bg-orange-500 border-orange-400 text-white'
              : 'bg-slate-700 border-slate-600 text-slate-400'
          }`}
        >
          +
        </button>
      </div>
    )
  }

  return (
    <div className="md:hidden">
      {/* Selection action bar */}
      {selectedId && openPanel === null && (
        <div className="fixed bottom-[68px] left-0 right-0 z-30 flex items-center justify-center gap-2 px-3 pb-2 pointer-events-none">
          {textSelected && (
            <div className="pointer-events-auto inline-flex items-center gap-1 bg-white rounded-full shadow-lg px-1 py-1">
              <button
                onClick={() => setFontSize(Math.max(10, fontSize - 2))}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-lg font-semibold text-slate-700"
                aria-label="Decrease text size"
              >
                −
              </button>
              <span className="text-xs font-medium w-10 text-center tabular-nums text-slate-700">
                {fontSize}px
              </span>
              <button
                onClick={() => setFontSize(Math.min(48, fontSize + 2))}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-lg font-semibold text-slate-700"
                aria-label="Increase text size"
              >
                +
              </button>
            </div>
          )}
          <button
            onClick={() => remove(selectedId)}
            className="pointer-events-auto px-4 py-2 rounded-full bg-red-600 text-white text-sm font-medium shadow-lg"
          >
            Delete
          </button>
        </div>
      )}

      {/* Expandable panel above toolbar */}
      {openPanel !== null && mobilePanelContent && (
        <div
          ref={mobilePanelRef}
          className="fixed bottom-[68px] left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-2 whitespace-nowrap max-w-[96vw] overflow-x-auto"
        >
          {mobilePanelContent}
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-slate-900 border-t border-slate-700 flex items-stretch px-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Select / Select area / Hand with + */}
        {mobileBtnWithPlus(
          tool === 'hand' ? 'hand' : tool === 'marquee' ? 'marquee' : 'select',
          SELECT_GROUP_ICON[tool] ?? '↖',
          tool === 'hand' ? 'Hand' : tool === 'marquee' ? 'Area' : 'Select',
          'select'
        )}

        {/* Draw with + (includes shapes/stroke/colour in panel) */}
        {mobileBtnWithPlus('draw', '✎', 'Draw', 'draw', '#000000')}

        {/* Text with + */}
        {mobileBtnWithPlus('text', 'T', 'Text', 'text')}

        {/* Image upload */}
        <label className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 cursor-pointer ${tool === 'image' ? 'text-orange-400' : 'text-slate-200'}`}>
          <PictureFrameIcon active={tool === 'image'} className="w-6 h-6" />
          <span className="text-[10px] font-medium">Image</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={handleImageUpload}
          />
        </label>

        <div className="flex-1 h-full flex items-stretch">
          <SignatureMenu openUpward compact />
        </div>

        <button
          onClick={undo}
          disabled={!canUndo}
          className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-slate-200 disabled:opacity-40"
        >
          <span className="text-xl leading-none">↶</span>
          <span className="text-[10px] font-medium">Undo</span>
        </button>

        <button
          onClick={() => setExportOpen(true)}
          disabled={!sourceBytes}
          className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-orange-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-xl leading-none">⤓</span>
          <span className="text-[10px] font-medium">Save</span>
        </button>
      </nav>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}

// Backward-compatible default export — renders both the desktop tools and
// actions on a single bar plus the mobile toolbar. New layouts should
// prefer the named exports so the desktop pieces can live inside the
// app header.
export default function Toolbar() {
  return (
    <>
      <div className="hidden md:block bg-slate-800 text-white border-b border-slate-700">
        <div className="mx-auto w-full max-w-7xl flex flex-wrap items-center gap-1 px-4 py-2">
          <ToolbarDesktopTools />
          <div className="ml-auto flex items-center gap-2">
            <ToolbarDesktopActions />
          </div>
        </div>
      </div>
      <ToolbarMobile />
    </>
  )
}
