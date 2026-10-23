import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BottomSheet, type GripProps } from '@unisim/sdk'
import { Icon, PATHS } from './icons'

// The page / sheet / gesture plumbing is the SDK's phone kit (`@unisim/sdk`,
// README ▸ "Phone pages, sheets and gestures") since SDK 0.203 — it was
// lifted out of this file. What stays here is PDF's own look: the paper, the
// cobalt, the slips and the highlighter.

/**
 * A heading with one word on the orange highlighter: "Make your *mark*",
 * "Send it on its *way*". `desk` is the Desk headline's stroke, the website's
 * landing highlighter on the cobalt desk.
 */
export function Hl({ children, desk = false }: { children: ReactNode; desk?: boolean }) {
  return <span className={`np-hl${desk ? ' np-hl--desk' : ''}`}>{children}</span>
}

/**
 * A bottom sheet over a scrim, on paper: the kit's `BottomSheet` in PDF's
 * look. The kit does the rest — a tap on the scrim, Escape, Back (Android's
 * gesture) and a big swipe down close it; a shorter pull puts the finger in
 * its text box; the grip drags it down; focus goes in and comes back.
 *
 * ⚠️ `portal={false}`: rendered inside `.np`, where PDF's `--np-*` colours
 * live — a sheet portalled to <body> would lose every one of them. It is
 * `position: fixed` either way, and `.np` is the whole screen.
 */
export function Sheet({
  label,
  onClose,
  children,
  background = 'var(--np-paper)',
  scrim = true,
}: {
  label: string
  onClose: () => void
  children: ReactNode
  background?: string
  /** False for a sheet the page above must stay usable under (Send to sign). */
  scrim?: boolean
}) {
  return (
    <BottomSheet
      label={label}
      onClose={onClose}
      scrim={scrim}
      portal={false}
      theme="light"
      className="np-sheet"
      style={{ background }}
      // ⚠️ `overflow-y-auto` is the kit's already; named here as well because
      // e2e/phone-clear-all finds the sheet's scroller by it. The body's gap
      // is in native.css (`.np-sheet > .unisim-phone-sheet-body`): a Tailwind
      // class here would lose to the kit's unlayered rule.
      bodyClassName="overflow-y-auto"
    >
      {children}
    </BottomSheet>
  )
}

/**
 * The grip, in a strip the width of the sheet so there's a finger's worth to
 * take hold of — for Mark up, the one sheet that is PDF's own chrome (it sits
 * in the document's column rather than over it). `grip` is the kit's
 * `useSheetPull`.
 */
export function SheetGrip({ grip }: { grip: GripProps }) {
  return (
    <div {...grip} data-sheet-grip className="flex-none self-stretch flex justify-center pt-1 pb-0.5 touch-none cursor-grab">
      <div className="np-grip" aria-hidden="true" />
    </div>
  )
}

/** The back chevron with the name of where it goes, as on the Sign and Share pages. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] px-2 flex items-center gap-0.5 text-[16px] text-[color:var(--np-cobalt)] max-w-full"
    >
      <Icon d={PATHS.back} size={22} width={2.4} />
      <span className="truncate">{label}</span>
    </button>
  )
}

/**
 * The line between two rows: a hairline in a Card, a pencilled dash on a
 * paper Slip (which sets `--np-row-rule`).
 */
export const ROW_RULE = 'var(--np-row-rule, 1px solid var(--np-rule))'

/** One row of a white list card: a label, an optional note, and a switch. */
export function SwitchRow({
  label,
  note,
  checked,
  onChange,
  disabled,
  first,
}: {
  label: string
  note?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  first?: boolean
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-3 min-h-[56px] px-3.5 py-2"
      style={{ borderTop: first ? 0 : ROW_RULE }}
    >
      <span className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-[16px]">{label}</span>
        {note && <span className="text-[13px] text-[color:var(--np-muted)]">{note}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="np-switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

/** One row of a white list card that goes somewhere. */
export function LinkRow({
  label,
  value,
  icon,
  onClick,
  first,
  danger,
}: {
  label: string
  value?: string
  icon?: string
  onClick: () => void
  first?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 min-h-[52px] px-3.5 text-left"
      style={{ borderTop: first ? 0 : ROW_RULE }}
    >
      {icon && <Icon d={icon} size={22} stroke={danger ? '#b42318' : 'var(--np-cobalt)'} />}
      <span className={`flex-1 text-[16px] ${danger ? 'text-[#b42318]' : ''}`}>{label}</span>
      {value && <span className="text-[15px] text-[color:var(--np-muted)]">{value}</span>}
      <Icon d={PATHS.chevron} size={16} stroke="#9a9ca3" width={2.4} />
    </button>
  )
}

/**
 * A slip of paper lying on the page, the Share page's look (round 4): white,
 * square-cornered, a soft shadow and a slight tilt, with pencilled dashes
 * between its rows. Tune and What else are made of these (James, "go ahead" on
 * round 4). Plain paper in Tune takes the tilt off.
 */
export function Slip({
  children,
  tilt = '-0.6deg',
  label,
}: {
  children: ReactNode
  tilt?: string
  /** A handwritten word on the slip's top edge, like the Share page's "how big?". */
  label?: string
}) {
  return (
    // ⚠️ A little room above and below: the tilted slip's corners reach past
    // its box, and that counts as overflow — a sheet's card that overflows
    // reads as one cut short (e2e/phone-clear-all).
    <div className="flex flex-col gap-2 py-1">
      {label && <span className="np-hand text-[22px] leading-none text-[color:var(--np-cobalt-deep)] px-1">{label}</span>}
      <div
        className="np-tilt bg-white rounded-[3px] overflow-hidden"
        style={{
          transform: `rotate(${tilt})`,
          boxShadow: '0 8px 18px rgba(60,45,20,0.16)',
          ['--np-row-rule' as string]: '1.5px dashed #ddd6c8',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * A job's page (Scan, Merge, Photos, OCR, Compare, Pages): the back chevron
 * with where it goes, the heading with one word on the highlighter, an
 * optional line under it, the page's own paper, and its buttons pinned at the
 * foot. The way every page here is built (Sign, Share, QR).
 */
export function JobPage({
  backLabel,
  onBack,
  lead,
  hl,
  note,
  children,
  footer,
  background = 'var(--np-paper)',
  bodyClass = 'gap-[18px]',
}: {
  backLabel: string
  onBack: () => void
  lead: string
  hl: string
  note?: ReactNode
  children: ReactNode
  footer?: ReactNode
  background?: string
  bodyClass?: string
}) {
  return (
    <div className="np-page-enter flex-1 min-h-0 flex flex-col" style={{ background }}>
      <header className="flex-none px-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <BackLink label={backLabel} onClick={onBack} />
      </header>
      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-4 flex flex-col ${bodyClass}`}>
        <div className="flex flex-col gap-1.5">
          <h1 className="np-serif m-0 text-[34px] leading-[1.05] font-bold">
            {lead} <Hl>{hl}</Hl>
          </h1>
          {note && <p className="m-0 text-[14px] leading-[1.45] text-[color:var(--np-ink-2)]">{note}</p>}
        </div>
        {children}
      </div>
      {footer && (
        <div className="flex-none px-5 pt-3 flex flex-col gap-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

/** The page's main button: cobalt, full width, thumb height. */
export const BTN_PRIMARY = 'min-h-[56px] rounded-[18px] text-white text-[17px] font-bold disabled:opacity-50'
export const BTN_PRIMARY_STYLE = { background: 'var(--np-cobalt)' } as const
/** The quieter one beside or under it: a paper slip with cobalt words. */
export const BTN_SECOND = 'min-h-[52px] rounded-[16px] text-[16px] font-bold disabled:opacity-50'
export const BTN_SECOND_STYLE = { background: 'var(--np-slip)', color: 'var(--np-cobalt-deep)', boxShadow: '0 2px 6px rgba(60,45,20,0.12)' } as const

/** A two-way choice drawn as the Sign page's segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid rounded-xl p-[3px]" style={{ background: '#e8e3d8', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className="min-h-[40px] rounded-[10px] text-[14px] leading-tight px-1 disabled:opacity-60"
          style={
            value === o.id
              ? { background: 'var(--np-slip)', fontWeight: 700, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { fontWeight: 600, color: 'var(--np-ink-2)' }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A progress bar drawn as the orange highlighter filling a pencil line. */
export function Progress({ fraction, label }: { fraction: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100)
  return (
    <div className="flex flex-col gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="h-3 rounded-[3px_8px_5px_3px] overflow-hidden" style={{ background: '#e8e3d8' }}>
        <div className="h-full transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, pct)}%`, background: 'rgba(249,115,22,0.85)' }} />
      </div>
      <div className="flex justify-between text-[13px] text-[color:var(--np-muted)]">
        <span className="min-w-0 truncate">{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
    </div>
  )
}

/**
 * A one-line label that shrinks to fit its cell rather than running into the
 * next one: the tool bar's and the tab bar's words. German's "Unterschreiben"
 * and "Kommentieren" (the glossary keeps them, not "Signieren") are wider than
 * a quarter of a 360 px phone at 12 px; they are set a little smaller there,
 * and at full size wherever they fit.
 */
export function FitLabel({ children, size, min = 9, className = '' }: { children: string; size: number; min?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return
    const fit = () => {
      el.style.fontSize = `${size}px`
      const room = box.clientWidth - 4
      const need = el.scrollWidth
      if (need > room && room > 0) el.style.fontSize = `${Math.max(min, Math.floor((size * room * 10) / need) / 10)}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [children, size, min])
  return (
    <span ref={ref} className={`whitespace-nowrap max-w-full ${className}`} style={{ fontSize: size }}>
      {children}
    </span>
  )
}

/** A white rounded card that holds rows. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}>
      {children}
    </div>
  )
}

export type SwipeAction = { label: string; icon: string; color: string; run: () => void }

// The one row left open, so opening another (or touching anywhere else)
// closes it, as in Mail.
let closeOpenRow: (() => void) | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', (e) => {
    if (closeOpenRow && !(e.target as Element | null)?.closest?.('[data-swipe-open]')) closeOpenRow()
  }, { passive: true, capture: true })
}

/**
 * A list row that slides sideways to show its actions (James, 2026-10-22:
 * "on the PDF main menu, allow a side swipe to reveal a delete button" and
 * "a right swipe, reveal a share button"). Swipe left for `end` (Delete),
 * right for `start` (Share); past half the button's width it stays open, short
 * of it it slides back. A tap on the open row closes it rather than opening it.
 * `touch-action: pan-y` keeps the list's own scrolling with the browser. The
 * actions are also in the row's ⋯, which is where VoiceOver finds them.
 */
export function SwipeRow({
  start,
  end,
  background = 'var(--np-paper)',
  children,
}: {
  start?: SwipeAction
  end?: SwipeAction
  background?: string
  children: ReactNode
}) {
  const W = 88
  const slide = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<0 | 1 | -1>(0)
  const g = useRef<{ x: number; y: number; base: number; off: number; lock: 'x' | 'y' | null } | null>(null)
  const swallow = useRef(0)
  const place = (x: number, animate: boolean) => {
    const el = slide.current
    if (!el) return
    el.style.transition = animate ? 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
    el.style.transform = x ? `translateX(${x}px)` : ''
  }
  // ⚠️ ONE function for the life of the row. `closeOpenRow` is compared
  // against it, and a fresh one per render left a stale close registered that
  // fired on the next touch anywhere, mid-swipe, so the second swipe on a row
  // never opened it.
  const shut = useRef<() => void>(null as unknown as () => void)
  if (!shut.current) {
    shut.current = () => {
      setOpen(0)
      const el = slide.current
      if (el) {
        el.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)'
        el.style.transform = ''
      }
      if (closeOpenRow === shut.current) closeOpenRow = null
    }
  }
  useEffect(() => () => { if (closeOpenRow === shut.current) closeOpenRow = null }, [])

  const run = (a: SwipeAction) => {
    shut.current()
    a.run()
  }
  const button = (a: SwipeAction, side: 'left' | 'right') => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={() => run(a)}
      className="absolute top-0 bottom-0 flex flex-col items-center justify-center gap-1 text-white text-[13px] font-semibold"
      style={{ [side]: 0, width: W, background: a.color }}
    >
      <Icon d={a.icon} size={22} stroke="#fff" />
      {a.label}
    </button>
  )
  return (
    <div className="relative overflow-hidden" data-swipe-open={open ? '' : undefined}>
      {start && open >= 0 && button(start, 'left')}
      {end && open <= 0 && button(end, 'right')}
      <div
        ref={slide}
        style={{ background, touchAction: 'pan-y', position: 'relative' }}
        onTouchStart={(e) => {
          const tt = e.touches[0]
          g.current = { x: tt.clientX, y: tt.clientY, base: open * W, off: open * W, lock: null }
        }}
        onTouchMove={(e) => {
          const d = g.current
          if (!d) return
          const tt = e.touches[0]
          const dx = tt.clientX - d.x
          const dy = tt.clientY - d.y
          if (d.lock === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
            d.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
          }
          if (d.lock !== 'x') return
          const min = end ? -W * 1.2 : 0
          const max = start ? W * 1.2 : 0
          d.off = Math.max(min, Math.min(max, d.base + dx))
          place(d.off, false)
        }}
        onTouchEnd={() => {
          const d = g.current
          g.current = null
          if (!d) return
          if (d.lock === 'x') {
            swallow.current = Date.now() + 400
            const next: 0 | 1 | -1 = d.off <= -W / 2 && end ? -1 : d.off >= W / 2 && start ? 1 : 0
            setOpen(next)
            place(next * W, true)
            if (next) {
              if (closeOpenRow && closeOpenRow !== shut.current) closeOpenRow()
              closeOpenRow = shut.current
            } else if (closeOpenRow === shut.current) closeOpenRow = null
          } else if (d.lock === null && open) {
            // A tap on an open row closes it.
            swallow.current = Date.now() + 400
            shut.current()
          }
        }}
        onClickCapture={(e) => {
          if (Date.now() < swallow.current) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
