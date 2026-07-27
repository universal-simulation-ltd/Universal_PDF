import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSignatureStore } from '../../stores/signatureStore'
import { useAnnotationStore } from '../../stores/annotationStore'

interface SignatureMenuProps {
  // Retained for call-site compatibility; the compact panel always sits above
  // the mobile bar and the desktop panel always drops downward, so this is a
  // no-op today.
  openUpward?: boolean
  compact?: boolean
}

type Tab = 'signatures' | 'stamps' | 'request'

const DESKTOP_PANEL_WIDTH = 320 // w-80

// Small labelled iOS-style toggle used by the "Request" tab. `tooltip` renders
// as a native hover/focus title on the row — deliberately the browser's own
// tooltip rather than a bespoke popover, since the panel is portaled to <body>
// and a custom bubble would need its own positioning pass.
function ToggleRow({
  label,
  checked,
  onChange,
  tooltip
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  tooltip?: string
}) {
  return (
    <label
      title={tooltip}
      className="flex items-center justify-between gap-2 text-sm text-slate-700 select-none cursor-pointer"
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="relative w-9 h-5 rounded-full bg-slate-300 transition-colors peer-checked:bg-orange-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  )
}

export default function SignatureMenu({ compact = false }: SignatureMenuProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('signatures')
  const ref = useRef<HTMLDivElement>(null)
  // The desktop dropdown is portaled to <body> (see render): the dark toolbar
  // it lives in is `overflow-x-auto`, which per the CSS overflow spec also
  // clips vertically — so an in-flow dropdown gets cut off / hidden behind the
  // PDF. `panelRef` tracks the portaled panel for the outside-click handler.
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null)

  const signatures = useSignatureStore((s) => s.signatures)
  const activeId = useSignatureStore((s) => s.activeId)
  const setActive = useSignatureStore((s) => s.setActive)
  const openPad = useSignatureStore((s) => s.openPad)
  const openImport = useSignatureStore((s) => s.openImport)
  const openStampPicker = useSignatureStore((s) => s.openStampPicker)
  const remove = useSignatureStore((s) => s.remove)
  const requestName = useSignatureStore((s) => s.requestName)
  const requestDate = useSignatureStore((s) => s.requestDate)
  const requestLive = useSignatureStore((s) => s.requestLive)
  const setRequestName = useSignatureStore((s) => s.setRequestName)
  const setRequestDate = useSignatureStore((s) => s.setRequestDate)
  const setRequestLive = useSignatureStore((s) => s.setRequestLive)

  const tool = useAnnotationStore((s) => s.tool)
  const setTool = useAnnotationStore((s) => s.setTool)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      const inside =
        ref.current?.contains(t) || panelRef.current?.contains(t)
      if (!inside) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Pin the portaled desktop panel under its trigger, keeping it aligned to the
  // button's right edge (matches the old `right-0`). Re-measures on scroll
  // (capture, so the toolbar's own horizontal scroll counts) and resize.
  useLayoutEffect(() => {
    if (!open || compact) return
    function place() {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const left = Math.max(8, r.right - DESKTOP_PANEL_WIDTH)
      setPanelPos({ left, top: r.bottom + 4 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, compact])

  function pick(id: string) {
    setActive(id)
    setTool('signature')
    setOpen(false)
  }

  const active = signatures.find((s) => s.id === activeId)
  const armed = (tool === 'signature' && !!active) || tool === 'sigfield'

  function placeRequestField() {
    setTool('sigfield')
    setOpen(false)
  }

  // Separate hand-drawn signatures from stamps (stamps have " Stamp" suffix in name)
  const handSigs = signatures.filter((s) => !s.name.endsWith(' Stamp'))
  const stamps = signatures.filter((s) => s.name.endsWith(' Stamp'))
  const displayList = tab === 'signatures' ? handSigs : stamps

  // Shared dropdown contents — rendered inline (compact) or into a body portal
  // (desktop). Kept in one place so both paths stay identical.
  const menuBody = (
    <>
      {/* Tab bar */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => setTab('signatures')}
          className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
            tab === 'signatures'
              ? 'text-orange-600 border-b-2 border-orange-500 -mb-px'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Signatures
        </button>
        <button
          onClick={() => setTab('stamps')}
          className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
            tab === 'stamps'
              ? 'text-orange-600 border-b-2 border-orange-500 -mb-px'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Stamps
        </button>
        <button
          onClick={() => setTab('request')}
          className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
            tab === 'request'
              ? 'text-orange-600 border-b-2 border-orange-500 -mb-px'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Request
        </button>
      </div>

      {tab === 'request' ? (
        <div className="p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Drop a “Sign here” box on the page. Anyone opening this PDF in
            Universal PDF can click the box to sign it.
          </p>
          <div className="space-y-2">
            <ToggleRow
              label="Ask for name"
              checked={requestName}
              onChange={setRequestName}
            />
            <ToggleRow
              label="Ask for date"
              checked={requestDate}
              onChange={setRequestDate}
            />
            <ToggleRow
              label="Require live signature"
              checked={requestLive}
              onChange={setRequestLive}
              tooltip="This stops the user from uploading an image of their signature. Signing on a phone is still allowed — that is drawn ink too."
            />
          </div>
          <button
            onClick={placeRequestField}
            className="w-full px-3 py-2.5 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium"
          >
            {tool === 'sigfield' ? 'Draw the box on the page…' : 'Place signature box'}
          </button>
          <p className="text-xs text-slate-400">
            Then drag a rectangle where the signature should go.
          </p>
        </div>
      ) : (
      <>
      <div className="max-h-72 overflow-auto">
        {displayList.length === 0 ? (
          <div className="px-3 py-6 text-sm text-slate-500 text-center">
            {tab === 'signatures' ? 'No signatures yet' : 'No saved stamps yet'}
          </div>
        ) : (
          displayList.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 ${
                s.id === activeId ? 'bg-orange-50' : ''
              }`}
              onClick={() => pick(s.id)}
            >
              <img
                src={s.dataUrl}
                alt={s.name}
                className="h-10 max-w-32 object-contain bg-white"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); remove(s.id) }}
                  className="text-slate-300 hover:text-red-600 text-sm"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {tab === 'signatures' ? (
        <div className="grid grid-cols-2 border-t border-slate-100">
          <button
            onClick={() => { openPad(); setOpen(false) }}
            className="px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50"
          >
            + Draw new
          </button>
          <button
            onClick={() => { openImport('signature'); setOpen(false) }}
            className="px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 border-l border-slate-100"
          >
            + Import image
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 border-t border-slate-100">
          <button
            onClick={() => { openStampPicker(); setOpen(false) }}
            className="px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50"
          >
            + Preset stamps
          </button>
          <button
            onClick={() => { openImport('stamp'); setOpen(false) }}
            className="px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 border-l border-slate-100"
          >
            + Import image
          </button>
        </div>
      )}
      </>
      )}
    </>
  )

  return (
    <div className="relative" ref={ref}>
      {compact ? (
        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex flex-col items-center justify-center w-full h-full gap-0.5 rounded transition-colors ${
            armed ? 'text-orange-400' : 'text-slate-200'
          }`}
        >
          <span className="text-xl leading-none">✍</span>
          <span className="text-[10px] font-medium">Sign</span>
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className={`h-10 px-3 rounded flex items-center gap-2 text-sm font-medium transition-colors ${
            armed ? 'bg-orange-600 hover:bg-orange-500' : 'bg-slate-700 hover:bg-slate-600'
          }`}
        >
          <span>✍</span>
          <span>Sign</span>
          <span className="opacity-60 text-xs">▾</span>
        </button>
      )}

      {/* compact (mobile) sits inline as a fixed panel above the bottom bar;
          desktop is portaled to <body> to escape the toolbar's overflow clip. */}
      {open && (compact ? (
        <div
          ref={panelRef}
          className="bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 overflow-hidden fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-1rem)] z-50"
        >
          {menuBody}
        </div>
      ) : panelPos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: panelPos.left, top: panelPos.top, width: DESKTOP_PANEL_WIDTH, zIndex: 60 }}
          className="bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 overflow-hidden"
        >
          {menuBody}
        </div>,
        document.body
      ))}
    </div>
  )
}
