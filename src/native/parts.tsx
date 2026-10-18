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
        <div className="np-grip" aria-hidden="true" />
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 flex flex-col gap-3.5">{children}</div>
      </section>
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
 * it scrolls"). Two signs, both only while there IS more to see:
 *
 *   • a nudge — shortly after it appears the row slides a little way along
 *     and back, once, so the hidden part peeks out. Not with reduced motion,
 *     and given up the moment a finger lands on it;
 *   • a fade at each edge that has more beyond it (`style`, a CSS mask), so
 *     a cut-off item reads as "continues" rather than "clipped".
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

    let frame = 0
    let stopped = false
    const stop = () => {
      stopped = true
      cancelAnimationFrame(frame)
      el.style.scrollSnapType = ''
    }
    el.addEventListener('pointerdown', stop, { passive: true })
    el.addEventListener('wheel', stop, { passive: true })
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => {
      const max = el.scrollWidth - el.clientWidth
      // From where it rests — a snapping row can rest a few pixels in — and
      // with the snapping off meanwhile, or it pulls every step back.
      const base = el.scrollLeft
      if (reduced || stopped || max - base < 8 || base > 24) return
      const reach = Math.min(56, max - base)
      const snap = el.style.scrollSnapType
      el.style.scrollSnapType = 'none'
      const start = performance.now()
      const OUT = 420
      const HOLD = 160
      const BACK = 460
      const ease = (p: number) => 1 - Math.pow(1 - p, 3)
      const step = (now: number) => {
        if (stopped) return
        const t = now - start
        const x =
          t < OUT ? reach * ease(t / OUT) : t < OUT + HOLD ? reach : reach * (1 - ease(Math.min(1, (t - OUT - HOLD) / BACK)))
        el.scrollLeft = base + x
        if (t < OUT + HOLD + BACK) frame = requestAnimationFrame(step)
        else el.style.scrollSnapType = snap
      }
      frame = requestAnimationFrame(step)
    }, 450)

    return () => {
      window.clearTimeout(timer)
      stop()
      el.removeEventListener('scroll', measure)
      el.removeEventListener('pointerdown', stop)
      el.removeEventListener('wheel', stop)
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
