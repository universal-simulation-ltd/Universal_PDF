import { useId } from 'react'
import { useT } from '../i18n'
import { useAnnotationStore } from '../stores/annotationStore'
import { useToolPrefs } from '../stores/toolPrefsStore'
import type { Tool } from '../types/annotations'

// Board 3 · Mark up: a sheet under the page (the page stays usable above it),
// the tools drawn as markers standing in a row — the one in hand stands taller —
// then the inks and the width. Undo and Done move into the header while it is
// open (DocumentScreen).

type MarkupId = 'pen' | 'highlight' | 'text' | 'note' | 'shape' | 'blackout'

const SHAPES: Tool[] = ['rect', 'ellipse', 'line', 'tick', 'cross']

/** Every tool the sheet can put in hand — so the bar knows Mark up is the one active. */
export const MARKUP_TOOLS: Tool[] = ['draw', 'highlight', 'note', 'redact', ...SHAPES]

const INKS = [
  { key: 'c_black', hex: '#1b1d22' },
  { key: 'c_blue', hex: '#2353c9' },
  { key: 'c_orange', hex: '#f97316' },
  { key: 'c_yellow', hex: '#eab308' },
  { key: 'c_green', hex: '#16a34a' },
  { key: 'c_pink', hex: '#ec4899' },
] as const

function markupOf(tool: Tool): MarkupId | null {
  if (tool === 'draw') return 'pen'
  if (tool === 'highlight') return 'highlight'
  if (tool === 'text') return 'text'
  if (tool === 'note') return 'note'
  if (tool === 'redact') return 'blackout'
  if (SHAPES.includes(tool)) return 'shape'
  return null
}

export default function MarkupSheet() {
  const t = useT()
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const highlightWidth = useAnnotationStore((s) => s.highlightWidth)
  const widthId = useId()
  const current = markupOf(tool)

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
    } else {
      s.setColor('#000000')
      s.setTool('redact')
    }
  }

  const markers: { id: MarkupId; label: string; body: string; tip: string }[] = [
    { id: 'pen', label: t('phone.mk_pen'), body: '#2a2d35', tip: '#173a94' },
    { id: 'highlight', label: t('phone.mk_highlight'), body: '#f97316', tip: '#fdba74' },
    { id: 'text', label: t('phone.mk_text'), body: '#e8e3d8', tip: '#5d6068' },
    { id: 'note', label: t('phone.mk_note'), body: '#fde68a', tip: '#e5c75a' },
    { id: 'shape', label: t('phone.mk_shape'), body: '#2353c9', tip: '#9db6f2' },
    { id: 'blackout', label: t('phone.mk_blackout'), body: '#1b1d22', tip: '#000000' },
  ]

  const shapeLabels: Record<string, string> = {
    rect: t('phone.shape_box'),
    ellipse: t('phone.shape_circle'),
    line: t('phone.shape_line'),
    tick: t('phone.shape_tick'),
    cross: t('phone.shape_cross'),
  }

  const usesWidth = current === 'pen' || current === 'shape' || current === 'highlight'
  const isHighlight = current === 'highlight'

  return (
    <section
      aria-label={t('phone.markup_tools_aria')}
      className="flex-none relative z-[60] rounded-t-[26px] px-[18px] pt-2 flex flex-col gap-3.5"
      style={{
        background: 'var(--np-sheet)',
        boxShadow: '0 -10px 30px rgba(60,45,20,0.2)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
      }}
    >
      <div className="np-grip" aria-hidden="true" />
      <div className="grid grid-cols-6 gap-1 items-end">
        {markers.map((m) => {
          const on = current === m.id
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(m.id)}
              className="flex flex-col items-center justify-end gap-1.5 min-h-[70px]"
            >
              <span
                aria-hidden="true"
                className="w-[22px] relative transition-[height] duration-150"
                style={{
                  height: on ? 46 : 34,
                  borderRadius: '6px 6px 3px 3px',
                  background: m.body,
                  boxShadow: '0 3px 6px rgba(23,30,50,0.18)',
                }}
              >
                <span className="absolute left-1 right-1 -top-2 h-2.5 rounded-t-[3px]" style={{ background: m.tip }} />
              </span>
              <span
                className="text-[11px] leading-tight text-center"
                style={{ fontWeight: on ? 800 : 600, color: on ? 'var(--np-cobalt-deep)' : 'var(--np-ink-2)' }}
              >
                {m.label}
              </span>
            </button>
          )
        })}
      </div>

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

      {current === 'blackout' ? (
        <p className="m-0 text-[14px] leading-[1.4] text-[color:var(--np-ink-2)]">{t('phone.blackout_note')}</p>
      ) : (
        current !== null && (
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
        )
      )}

      {usesWidth && (
        <div className="flex items-center gap-3.5">
          <label htmlFor={widthId} className="text-[14px] font-semibold text-[color:var(--np-ink-2)]">
            {t('phone.width')}
          </label>
          <input
            id={widthId}
            type="range"
            min={isHighlight ? 8 : 1}
            max={isHighlight ? 40 : 10}
            step={isHighlight ? 1 : 0.5}
            value={isHighlight ? highlightWidth : strokeWidth}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              const s = useAnnotationStore.getState()
              if (isHighlight) s.setHighlightWidth(v)
              else s.setStrokeWidth(v)
            }}
            className="flex-1"
            style={{ accentColor: 'var(--np-cobalt)' }}
          />
        </div>
      )}
    </section>
  )
}
