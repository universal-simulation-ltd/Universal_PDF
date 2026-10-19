import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
  const grip = useSheetPull(ref, onClose)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.({ preventScroll: true })
    }
  }, [onClose])
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
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 flex flex-col gap-3.5">{children}</div>
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

/** The grip, in a strip the width of the sheet so there's a finger's worth to take hold of. */
export function SheetGrip({ grip }: { grip: GripProps }) {
  return (
    <div {...grip} className="flex-none self-stretch flex justify-center pt-1 pb-0.5 touch-none cursor-grab">
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
      style={{ borderTop: first ? 0 : '1px solid var(--np-rule)' }}
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
      style={{ borderTop: first ? 0 : '1px solid var(--np-rule)' }}
    >
      {icon && <Icon d={icon} size={22} stroke={danger ? '#b42318' : 'var(--np-cobalt)'} />}
      <span className={`flex-1 text-[16px] ${danger ? 'text-[#b42318]' : ''}`}>{label}</span>
      {value && <span className="text-[15px] text-[color:var(--np-muted)]">{value}</span>}
      <Icon d={PATHS.chevron} size={16} stroke="#9a9ca3" width={2.4} />
    </button>
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
