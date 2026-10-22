import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, PATHS } from './icons'

/**
 * A heading with one word on the orange highlighter: "Make your *mark*",
 * "Send it on its *way*". `desk` is the Desk headline's stroke, the website's
 * landing highlighter on the cobalt desk.
 */
export function Hl({ children, desk = false }: { children: ReactNode; desk?: boolean }) {
  return <span className={`np-hl${desk ? ' np-hl--desk' : ''}`}>{children}</span>
}

/**
 * A bottom sheet over a scrim. Tapping the scrim or Escape closes it; focus
 * goes into the sheet when it opens and back where it was when it closes.
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
  /** False for a sheet the page above must stay usable under (Mark up). */
  scrim?: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const grip = useSheetPull(ref, onClose)
  useSheetBodyPull(ref, bodyRef, onClose)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // ⚠️ Once, for the life of the sheet — not on each new `onClose`. Callers
  // pass an inline arrow, and re-running this on every render put the focus
  // back on the sheet (and the opener) under a box being typed in, so each
  // keystroke in a sheet's text box lost the keyboard.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.({ preventScroll: true })
    }
  }, [])
  return (
    <div className="absolute inset-0 z-[200]" style={scrim ? undefined : { pointerEvents: 'none' }}>
      {scrim && <div className="np-scrim" onClick={onClose} aria-hidden="true" />}
      <section
        ref={ref}
        role="dialog"
        aria-modal={scrim ? 'true' : undefined}
        aria-label={label}
        tabIndex={-1}
        className="np-sheet outline-none"
        style={{ background, pointerEvents: 'auto' }}
      >
        <SheetGrip grip={grip} />
        {/* ⚠️ Children never shrink (`[&>*]:flex-none`): a flex column lets
            them, so a menu taller than the sheet squashed its last card,
            whose overflow-hidden cut the bottom rows off instead of the
            sheet scrolling (James, 2026-10-22: ⋯ What else ended at
            Rename, with "Clear all annotations" out of reach). */}
        <div ref={bodyRef} className="min-h-0 overflow-y-auto overscroll-contain px-4 flex flex-col gap-3.5 [&>*]:flex-none">{children}</div>
      </section>
    </div>
  )
}

type GripProps = Pick<
  React.HTMLAttributes<HTMLDivElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
>

/**
 * A sheet that comes down with the finger from its grip, like any phone's
 * (James, 2026-10-19: "taking the drawer handle you should be able to drag it
 * down and it takes the drawer with it"). Let go past a third of its height —
 * or flick it — and it slides the rest of the way and closes; short of that it
 * settles back. The sheet's own transform is written straight to the element,
 * so a drag doesn't re-render the tools under it on every move.
 */
export function useSheetPull(ref: React.RefObject<HTMLElement | null>, onClose: () => void): GripProps {
  const drag = useRef<{ y: number; dy: number; t: number; v: number } | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  function finish(cancelled: boolean) {
    const d = drag.current
    drag.current = null
    const el = ref.current
    if (!d || !el) return
    const away = !cancelled && (d.dy > Math.min(140, el.offsetHeight / 3) || (d.v > 0.5 && d.dy > 16))
    el.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
    if (away) {
      el.style.transform = `translateY(${el.offsetHeight + 24}px)`
      window.setTimeout(() => close.current(), 160)
    } else {
      el.style.transform = ''
    }
  }

  return {
    onPointerDown(e) {
      const el = ref.current
      if (!el) return
      drag.current = { y: e.clientY, dy: 0, t: e.timeStamp, v: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
      // The rise-in (or Mark up's first-time dip) would otherwise hold the
      // transform while it runs.
      el.getAnimations?.().forEach((a) => a.cancel())
      el.style.animation = 'none'
      el.style.transition = 'none'
    },
    onPointerMove(e) {
      const d = drag.current
      const el = ref.current
      if (!d || !el) return
      // Down only: pulled up, it stays put.
      const dy = Math.max(0, e.clientY - d.y)
      const dt = e.timeStamp - d.t
      if (dt > 0) d.v = (dy - d.dy) / dt
      d.dy = dy
      d.t = e.timeStamp
      el.style.transform = dy ? `translateY(${dy}px)` : ''
    },
    onPointerUp: () => finish(false),
    onPointerCancel: () => finish(true),
  }
}

// Where a pull down must not be taken over: a box being typed in, a slider,
// a sideways swiper, and anything drawn on (the Sign page's pad is a canvas,
// and a downward stroke of a signature is not a pull).
const PULL_EXEMPT = 'input, textarea, select, canvas, [contenteditable="true"], [data-swipe-x], [data-sheet-grip]'
// The boxes a pull down puts the finger in: one-line text and the like.
const TYPE_BOX = 'input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="tel"], input[type="number"], input[type="password"], textarea'

/** The first visible, usable text box inside `root`, in reading order. */
export function firstTypeBox(root: HTMLElement | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (!root) return null
  for (const el of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TYPE_BOX)) {
    if (el.disabled || el.readOnly) continue
    if (el.getClientRects().length === 0) continue
    return el
  }
  return null
}

/**
 * Two suite-wide rules for a pull down anywhere on a drawer (James,
 * 2026-10-22), not just on its grip:
 *
 *  • A big swipe down closes it ("allow a big swipe down to close drawers
 *    without having to use the handle"). The drawer follows the finger; let
 *    go far enough, or flick hard, and it goes.
 *  • A shorter pull puts the finger in its text box, keyboard up, when it has
 *    one ("on a swipe down, focus on the input"). The focus is made in the
 *    touch's release, the only place iOS raises the keyboard for it.
 *
 * Only from the top of the drawer's own scroll, only a mostly downward pull,
 * and not one that starts on a slider, a box being typed in or a swiper.
 * Touch events, not pointer ones, so the drawer's own scrolling is untouched
 * until the pull is decided.
 */
export function useSheetBodyPull(
  sheetRef: React.RefObject<HTMLElement | null>,
  bodyRef: React.RefObject<HTMLElement | null>,
  onClose: () => void
) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const sheet = sheetRef.current
    const body = bodyRef.current
    if (!sheet || !body) return
    let g: { x: number; y: number; dy: number; t: number; v: number; pull: boolean | null } | null = null
    const onStart = (e: TouchEvent) => {
      g = null
      if (e.touches.length !== 1) return
      const target = e.target as Element | null
      if (target?.closest?.(PULL_EXEMPT)) return
      if (body.scrollTop > 0) return
      const tt = e.touches[0]
      g = { x: tt.clientX, y: tt.clientY, dy: 0, t: e.timeStamp, v: 0, pull: null }
    }
    const onMove = (e: TouchEvent) => {
      if (!g) return
      const tt = e.touches[0]
      const dx = tt.clientX - g.x
      const dy = tt.clientY - g.y
      if (g.pull === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        g.pull = dy > 0 && dy > Math.abs(dx) * 1.2 && body.scrollTop <= 0
        if (!g.pull) { g = null; return }
        sheet.getAnimations?.().forEach((a) => a.cancel())
        sheet.style.animation = 'none'
        sheet.style.transition = 'none'
      }
      e.preventDefault()
      const d = Math.max(0, dy)
      const dt = e.timeStamp - g.t
      if (dt > 0) g.v = (d - g.dy) / dt
      g.dy = d
      g.t = e.timeStamp
      sheet.style.transform = d ? `translateY(${d}px)` : ''
    }
    const onEnd = () => {
      const d = g
      g = null
      if (!d?.pull) return
      const big = d.dy > Math.min(180, sheet.offsetHeight * 0.4) || (d.v > 0.8 && d.dy > 90)
      sheet.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      if (big) {
        sheet.style.transform = `translateY(${sheet.offsetHeight + 24}px)`
        window.setTimeout(() => close.current(), 160)
        return
      }
      sheet.style.transform = ''
      if (d.dy > 36) firstTypeBox(body)?.focus()
    }
    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd)
    sheet.addEventListener('touchcancel', onEnd)
    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [sheetRef, bodyRef])
}

/** The nearest scrolling box between `el` and `root`, or `root`. */
function scrollerOf(el: Element | null, root: HTMLElement): HTMLElement {
  for (let n = el as HTMLElement | null; n && n !== root; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return root
}

/**
 * A pull down on a page (QR, Sign's Type, the knowledge base…) puts the finger
 * in its text box, keyboard up (James, 2026-10-22: "on the QR pop-up … if you
 * scroll down, it should focus on the input and allow you to use the
 * keyboard"). The page never focuses it on arrival, so the keyboard comes up
 * only when asked for. Only from the top of the page's scroll, only a mostly
 * downward pull, and only on a page that has a box; the page gives a little
 * with the finger so the pull is felt.
 */
export function usePagePullToType(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const page = ref.current
    if (!page || !enabled) return
    let g: { x: number; y: number; dy: number; scroller: HTMLElement; pull: boolean | null } | null = null
    const onStart = (e: TouchEvent) => {
      g = null
      if (e.touches.length !== 1) return
      const target = e.target as Element | null
      if (target?.closest?.(PULL_EXEMPT)) return
      if (!firstTypeBox(page)) return
      const scroller = scrollerOf(target, page)
      if (scroller.scrollTop > 0) return
      const tt = e.touches[0]
      g = { x: tt.clientX, y: tt.clientY, dy: 0, scroller, pull: null }
    }
    const onMove = (e: TouchEvent) => {
      if (!g) return
      const tt = e.touches[0]
      const dx = tt.clientX - g.x
      const dy = tt.clientY - g.y
      if (g.pull === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        g.pull = dy > 0 && dy > Math.abs(dx) * 1.2 && g.scroller.scrollTop <= 0
        if (!g.pull) { g = null; return }
        page.style.transition = 'none'
      }
      e.preventDefault()
      g.dy = Math.max(0, dy)
      page.style.transform = `translateY(${Math.min(48, g.dy * 0.35)}px)`
    }
    const onEnd = () => {
      const d = g
      g = null
      if (!d?.pull) return
      page.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      page.style.transform = ''
      if (d.dy > 50) firstTypeBox(page)?.focus()
    }
    page.addEventListener('touchstart', onStart, { passive: true })
    page.addEventListener('touchmove', onMove, { passive: false })
    page.addEventListener('touchend', onEnd)
    page.addEventListener('touchcancel', onEnd)
    return () => {
      page.removeEventListener('touchstart', onStart)
      page.removeEventListener('touchmove', onMove)
      page.removeEventListener('touchend', onEnd)
      page.removeEventListener('touchcancel', onEnd)
    }
  }, [ref, enabled])
}

/** The grip, in a strip the width of the sheet so there's a finger's worth to take hold of. */
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

/**
 * A row that scrolls sideways shows that it does (James, 2026-10-18: "needs to
 * be obvious you can scroll … make it a global rule — maybe it could nudge
 * slightly on page load"; Docs_UNI_SIM/BRANDING.md → "A row that scrolls shows
 * it scrolls"): a fade at each edge that has more beyond it (`style`, a CSS
 * mask), so the cut-off item reads as "continues" rather than "clipped". It
 * also nudged along and back as it appeared until James dropped that
 * (2026-10-19: "doesn't need the peek anymore, the fade on the last item works
 * well").
 *
 * Spread `style` onto the scroller and give it `ref`. ⚠️ The scroller must be
 * mounted with the component that calls this (the effect runs once): a row
 * that appears later needs a component of its own.
 */
export function useScrollHint<T extends HTMLElement>(): { ref: React.RefObject<T>; style: React.CSSProperties } {
  const ref = useRef<T>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth
      setEdges({ start: el.scrollLeft > 2, end: el.scrollLeft < max - 2 })
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [])

  const FADE = 28
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'} 0, #000 ${edges.start ? FADE : 0}px, #000 calc(100% - ${edges.end ? FADE : 0}px), ${edges.end ? 'transparent' : '#000'} 100%)`
      : undefined
  return { ref, style: mask ? { maskImage: mask, WebkitMaskImage: mask } : {} }
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
