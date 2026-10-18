import { useId, useRef, type ReactNode } from 'react'
import { useT } from '../i18n'
import { useAnnotationStore } from '../stores/annotationStore'
import { usePdfStore } from '../stores/pdfStore'
import { useToolPrefs } from '../stores/toolPrefsStore'
import type { Annotation, Tool } from '../types/annotations'
import { FONT_DEFS } from '../lib/fonts'
import { useNav } from './nav'

// Board 3 · Mark up: a sheet under the page (the page stays usable above it),
// the tools standing in a row as the things they are — pens, a pad of notes, a
// photo — and the one in hand stands taller; then the inks and the width. Undo
// and the way back move into the header while it is open (DocumentScreen).
//
// The row scrolls (James, 2026-10-18: "maybe the toolbar should be scrollable
// to reveal signature, image and QR code"): five and a bit fit across, so the
// one cut off at the edge says there are more.

type MarkupId = 'pen' | 'highlight' | 'text' | 'note' | 'shape' | 'blackout' | 'signature' | 'picture' | 'qr'

const SHAPES: Tool[] = ['rect', 'ellipse', 'line', 'tick', 'cross']

/** Every tool the sheet can put in hand — so the bar knows Mark up is the one active. */
export const MARKUP_TOOLS: Tool[] = ['draw', 'highlight', 'note', 'redact', 'image', ...SHAPES]

const INKS = [
  { key: 'c_black', hex: '#1b1d22' },
  { key: 'c_blue', hex: '#2353c9' },
  { key: 'c_orange', hex: '#f97316' },
  { key: 'c_yellow', hex: '#eab308' },
  { key: 'c_green', hex: '#16a34a' },
  { key: 'c_pink', hex: '#ec4899' },
] as const

function markupOf(tool: Tool, qr: boolean): MarkupId | null {
  if (tool === 'draw') return 'pen'
  if (tool === 'highlight') return 'highlight'
  if (tool === 'text') return 'text'
  if (tool === 'note') return 'note'
  if (tool === 'redact') return 'blackout'
  if (tool === 'image') return qr ? 'qr' : 'picture'
  if (SHAPES.includes(tool)) return 'shape'
  return null
}

/** What the width slider is for: the selected stroke if there is one, else the tool in hand. */
function widthTarget(current: MarkupId | null, selected: Annotation | undefined): 'pen' | 'highlight' | 'blackout' | null {
  if (selected?.type === 'draw') return selected.opacity !== undefined ? 'highlight' : 'pen'
  if (current === 'pen' || current === 'shape') return 'pen'
  if (current === 'highlight') return 'highlight'
  if (current === 'blackout') return 'blackout'
  return null
}

export default function MarkupSheet() {
  const t = useT()
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const highlightWidth = useAnnotationStore((s) => s.highlightWidth)
  const redactWidth = useAnnotationStore((s) => s.redactWidth)
  const viewScale = useAnnotationStore((s) => s.viewScale)
  const armedQr = useAnnotationStore((s) => !!s.uploadedImageQr)
  const fontFamily = useAnnotationStore((s) => s.fontFamily)
  const selected = useAnnotationStore((s) => s.annotations.find((a) => a.id === s.selectedId))
  const widthId = useId()
  const pictureRef = useRef<HTMLInputElement>(null)
  const gripRef = useRef<{ y: number } | null>(null)
  const current = markupOf(tool, armedQr)

  function pick(id: MarkupId) {
    const s = useAnnotationStore.getState()
    s.setSelected(null)
    if (id === 'pen') {
      s.setColor('#1b1d22')
      s.setTool('draw')
    } else if (id === 'highlight') {
      s.setColor(useToolPrefs.getState().highlightColours[0])
      s.setTool('highlight')
    } else if (id === 'text') {
      s.setTool('text')
    } else if (id === 'note') {
      s.setColor(useToolPrefs.getState().highlightColours[0])
      s.setTool('note')
    } else if (id === 'shape') {
      s.setTool(SHAPES.includes(s.tool) ? s.tool : 'rect')
    } else if (id === 'blackout') {
      s.setColor('#000000')
      s.setTool('redact')
    } else if (id === 'signature') {
      // The Sign page; placing what is made there lands back here.
      useNav.getState().push('sign')
    } else if (id === 'picture') {
      pictureRef.current?.click()
    } else {
      usePdfStore.getState().setQrOpen(true)
    }
  }

  function onPicture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const s = useAnnotationStore.getState()
      s.setUploadedImageSrc(reader.result as string)
      // The page's own placement banner says "tap the page" (PlacementHint).
      s.setTool('image')
    }
    reader.readAsDataURL(file)
  }

  const tools: { id: MarkupId; label: string; art: ReactNode }[] = [
    { id: 'pen', label: t('phone.mk_pen'), art: <PenArt /> },
    { id: 'highlight', label: t('phone.mk_highlight'), art: <HighlighterArt /> },
    { id: 'text', label: t('phone.mk_text'), art: <TextArt /> },
    { id: 'note', label: t('phone.mk_note'), art: <NoteArt /> },
    { id: 'shape', label: t('phone.mk_shape'), art: <ShapeArt /> },
    { id: 'blackout', label: t('phone.mk_blackout'), art: <BlackoutArt /> },
    { id: 'signature', label: t('phone.mk_signature'), art: <SignatureArt /> },
    { id: 'picture', label: t('phone.mk_picture'), art: <PictureArt /> },
    { id: 'qr', label: t('phone.mk_qr'), art: <QrArt /> },
  ]

  const shapeLabels: Record<string, string> = {
    rect: t('phone.shape_box'),
    ellipse: t('phone.shape_circle'),
    line: t('phone.shape_line'),
    tick: t('phone.shape_tick'),
    cross: t('phone.shape_cross'),
  }

  const target = widthTarget(current, selected)
  // The slider shows the selected stroke's own width (display pixels) when
  // one is selected; otherwise the next one's.
  const selectedPx = selected?.type === 'draw' ? Math.round(selected.strokeWidth * viewScale * 2) / 2 : null
  const range =
    target === 'highlight'
      ? { min: 8, max: 40, step: 1, value: selectedPx ?? highlightWidth }
      : target === 'blackout'
        ? { min: 10, max: 40, step: 1, value: redactWidth }
        : { min: 1, max: 10, step: 0.5, value: selectedPx ?? strokeWidth }
  // Words — a text box or a note, in hand or selected — get a choice of font:
  // the three that save as they look (fonts.ts maps the others to one of these
  // on export, so offering them here would promise a look the file can't keep).
  const selectedText = selected?.type === 'text' ? selected : null
  const showsFont = current === 'text' || current === 'note' || !!selectedText
  const fontNow = selectedText ? (selectedText.fontFamily ?? 'sans') : fontFamily
  const showsInk = current !== null && current !== 'blackout' && current !== 'picture' && current !== 'qr' && current !== 'signature'

  return (
    <section
      aria-label={t('phone.markup_tools_aria')}
      className="flex-none relative z-[60] rounded-t-[26px] pt-2 flex flex-col gap-3.5"
      style={{
        background: 'var(--np-sheet)',
        boxShadow: '0 -10px 30px rgba(60,45,20,0.2)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
      }}
    >
      {/* Pull the grip down to put the sheet away, as the chevron does. */}
      <div
        className="self-stretch flex justify-center touch-none"
        onPointerDown={(e) => {
          gripRef.current = { y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerUp={(e) => {
          const start = gripRef.current
          gripRef.current = null
          if (start && e.clientY - start.y > 30) {
            useNav.getState().closeSheet()
            useAnnotationStore.getState().setTool('select')
          }
        }}
      >
        <div className="np-grip" aria-hidden="true" />
      </div>

      <div className="flex overflow-x-auto np-jobs px-2.5 snap-x" role="group" aria-label={t('phone.markup_tools_aria')}>
        {tools.map((m) => {
          const on = current === m.id
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(m.id)}
              // 5½ across, so the half at the edge shows the row goes on.
              className="flex-none w-[18.2%] snap-start flex flex-col items-center justify-end gap-1.5 min-h-[76px]"
            >
              <span
                aria-hidden="true"
                className="h-[50px] w-[44px] flex items-end justify-center transition-transform duration-150"
                style={{ transform: on ? 'translateY(-7px) scale(1.08)' : undefined, filter: 'drop-shadow(0 3px 3px rgba(23,30,50,0.18))' }}
              >
                {m.art}
              </span>
              <span
                className="text-[11px] leading-tight text-center whitespace-nowrap"
                style={{ fontWeight: on ? 800 : 600, color: on ? 'var(--np-cobalt-deep)' : 'var(--np-ink-2)' }}
              >
                {m.label}
              </span>
            </button>
          )
        })}
      </div>
      <input ref={pictureRef} type="file" accept="image/*" className="hidden" onChange={onPicture} />

      <div className="px-[18px] flex flex-col gap-3.5">
        {current === 'shape' && (
          <div className="flex gap-2 overflow-x-auto np-jobs -mx-1 px-1">
            {SHAPES.map((sh) => (
              <button
                key={sh}
                type="button"
                aria-pressed={tool === sh}
                onClick={() => useAnnotationStore.getState().setTool(sh)}
                className="flex-none min-h-[38px] px-3.5 rounded-full text-[14px] font-semibold"
                style={
                  tool === sh
                    ? { background: 'var(--np-cobalt)', color: '#ffffff' }
                    : { background: 'var(--np-slip)', border: '1px solid var(--np-line)', color: 'var(--np-ink-2)' }
                }
              >
                {shapeLabels[sh]}
              </button>
            ))}
          </div>
        )}

        {current === 'blackout' && <p className="m-0 text-[14px] leading-[1.4] text-[color:var(--np-ink-2)]">{t('phone.blackout_note')}</p>}

        {showsInk && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-semibold text-[color:var(--np-ink-2)]">{t('phone.ink')}</span>
            <div className="flex gap-2.5">
              {INKS.map((c) => {
                const on = color.toLowerCase() === c.hex
                return (
                  <button
                    key={c.hex}
                    type="button"
                    aria-label={t(`phone.${c.key}`)}
                    aria-pressed={on}
                    onClick={() => useAnnotationStore.getState().setColor(c.hex)}
                    className="w-[34px] h-[34px] rounded-full"
                    style={{
                      background: c.hex,
                      boxShadow: on ? '0 0 0 3px var(--np-sheet), 0 0 0 5px var(--np-cobalt-deep)' : 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}

        {showsFont && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-semibold text-[color:var(--np-ink-2)]">{t('phone.font')}</span>
            <div className="flex flex-wrap justify-end gap-2">
              {FONT_DEFS.filter((f) => !f.extended).map((f) => {
                const on = fontNow === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => useAnnotationStore.getState().setFontFamily(f.id)}
                    className="min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-[14px]"
                    style={
                      on
                        ? { background: 'var(--np-cobalt)', color: '#ffffff', fontWeight: 700 }
                        : { background: 'var(--np-slip)', border: '1px solid var(--np-line)', color: 'var(--np-ink-2)', fontWeight: 600 }
                    }
                  >
                    <span aria-hidden="true" className="text-[18px] leading-none" style={{ fontFamily: f.css }}>
                      Aa
                    </span>
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {target && (
          <div className="flex items-center gap-3.5">
            <label htmlFor={widthId} className="text-[14px] font-semibold text-[color:var(--np-ink-2)]">
              {t('phone.width')}
            </label>
            <input
              id={widthId}
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={range.value}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                const s = useAnnotationStore.getState()
                // Each setter repaints the selected stroke as well.
                if (target === 'highlight') s.setHighlightWidth(v)
                else if (target === 'blackout') s.setRedactWidth(v)
                else s.setStrokeWidth(v)
              }}
              className="flex-1"
              style={{ accentColor: 'var(--np-cobalt)' }}
            />
          </div>
        )}
      </div>
    </section>
  )
}

// ── The tools, drawn as the things they are ────────────────────────────────
// Each fills a 44×50 box and stands on its foot, so the row lines up.

function Art({ children }: { children: ReactNode }) {
  return (
    <svg width="44" height="50" viewBox="0 0 44 50" aria-hidden="true">
      {children}
    </svg>
  )
}

/** A marker standing on its cap: `nib` is the colour at the top. */
function Marker({ body, nib, cap, wide = false }: { body: string; nib: string; cap: string; wide?: boolean }) {
  const w = wide ? 24 : 20
  const x = (44 - w) / 2
  return (
    <Art>
      <path d={wide ? `M${x + 3} 14 L${x + w - 3} 14 L${x + w - 5} 6 L${x + 5} 6 Z` : `M${x + 4} 14 L${x + w - 4} 14 L22 3 Z`} fill={nib} />
      <rect x={x} y={13} width={w} height={33} rx={5} fill={body} />
      <rect x={x} y={36} width={w} height={10} rx={3} fill={cap} />
    </Art>
  )
}

function PenArt() {
  return <Marker body="#2a2d35" nib="#2353c9" cap="#3d414b" />
}

function HighlighterArt() {
  return <Marker body="#f97316" nib="#fdba74" cap="#ea6a0c" wide />
}

function BlackoutArt() {
  return <Marker body="#1b1d22" nib="#000000" cap="#33363d" wide />
}

/** A type block: the letter that will be printed. */
function TextArt() {
  return (
    <Art>
      <rect x={6} y={10} width={32} height={36} rx={5} fill="#fbf8f1" stroke="#d9d2c3" />
      <text x={22} y={38} textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight={700} fontSize={26} fill="#1b1d22">
        A
      </text>
      <rect x={13} y={41} width={18} height={2} rx={1} fill="#2353c9" />
    </Art>
  )
}

/** A pad of sticky notes, the top one's corner lifting. */
function NoteArt() {
  return (
    <Art>
      <rect x={7} y={14} width={30} height={30} rx={2} fill="#f2d76b" />
      <path d="M6 12 h30 v22 l-8 8 h-22 z" fill="#fde68a" transform="rotate(-4 22 28)" />
      <path d="M36 34 l-8 8 v-8 z" fill="#e5c75a" transform="rotate(-4 22 28)" />
      <path d="M11 21 h18 M11 27 h14" stroke="#b9952a" strokeWidth={2} strokeLinecap="round" transform="rotate(-4 22 28)" />
    </Art>
  )
}

/** A stencil: a box and a circle. */
function ShapeArt() {
  return (
    <Art>
      <rect x={5} y={20} width={22} height={22} rx={2} fill="none" stroke="#2353c9" strokeWidth={3.5} />
      <circle cx={28} cy={22} r={11} fill="#9db6f2" fillOpacity={0.9} stroke="#2353c9" strokeWidth={3.5} />
    </Art>
  )
}

/** A signed card. */
function SignatureArt() {
  return (
    <Art>
      <rect x={3} y={14} width={38} height={30} rx={4} fill="#ffffff" stroke="#d9d2c3" />
      <path d="M9 33 c4-2 5-11 9-11 s0 9 5 9 4-6 7-6 3 3 6 2" fill="none" stroke="#173a94" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 38 h26" stroke="#f97316" strokeWidth={2} strokeLinecap="round" />
    </Art>
  )
}

/** A photo print. */
function PictureArt() {
  return (
    <Art>
      <g transform="rotate(4 22 30)">
        <rect x={5} y={12} width={34} height={34} rx={3} fill="#ffffff" stroke="#d9d2c3" />
        <rect x={9} y={16} width={26} height={21} fill="#bfd3fb" />
        <path d="M9 37 l8-9 6 6 4-4 8 7 z" fill="#16a34a" />
        <circle cx={29} cy={21} r={3} fill="#f9c74f" />
      </g>
    </Art>
  )
}

/** A QR code on a tile. */
function QrArt() {
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={10} height={10} rx={1.5} fill="#1b1d22" />
      <rect x={x + 2} y={y + 2} width={6} height={6} rx={1} fill="#ffffff" />
      <rect x={x + 3.5} y={y + 3.5} width={3} height={3} fill="#1b1d22" />
    </g>
  )
  const dots = [
    [21, 15], [21, 20], [21, 26], [26, 27], [31, 27], [35, 31], [21, 31], [26, 35], [31, 39], [21, 39], [26, 43], [35, 43], [30, 34],
  ]
  return (
    <Art>
      <rect x={4} y={10} width={36} height={38} rx={5} fill="#ffffff" stroke="#d9d2c3" />
      {finder(8, 14)}
      {finder(26, 14)}
      {finder(8, 34)}
      {dots.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={3} height={3} fill="#1b1d22" />
      ))}
    </Art>
  )
}
