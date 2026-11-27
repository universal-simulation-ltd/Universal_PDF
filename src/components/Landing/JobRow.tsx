import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'

// The phone app's carousel, on the website (James, 2026-11-27): the three ways
// in and the twelve jobs as one row of cards, so a visitor can start from what
// they came to do ("Black out text") rather than from "open a file, then find
// the tool". Each job picks a file and opens that tool on it.
//
// The website's own look, not the phone's coloured paper: white cards with the
// hairline border and the cobalt chip the rest of this page uses, which is
// also what the dark theme already knows how to turn (styles/dark.css).
//
// A sideways row shows that it scrolls (BRANDING.md → scrolling rows): the
// last card in view is cut off, the edge fades, and on a pointer there are
// arrows. No nudge.

export interface JobCard {
  id: string
  label: string
  note: string
  /** An SVG path, 24 × 24, stroked. */
  icon: string
  run: () => void
  /** Shown instead of the label while this card's job is starting. */
  busyLabel?: string
  /** The first card: the page's main action, in the app's cobalt. */
  primary?: boolean
}

export default function JobRow({ cards, busy }: { cards: JobCard[]; busy: string | null }) {
  const t = useT()
  const row = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  useEffect(() => {
    const el = row.current
    if (!el) return
    const read = () => setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 })
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', read)
      ro.disconnect()
    }
  }, [cards.length])

  const step = (dir: 1 | -1) => {
    const el = row.current
    if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' })
  }
  // The fade is a mask on the row itself, so it works on any ground, light or dark.
  const fade = `linear-gradient(to right, ${edge.start ? '#000' : 'transparent'} 0, #000 32px, #000 calc(100% - 44px), ${edge.end ? '#000' : 'transparent'} 100%)`
  const ARROW =
    'hidden [@media(hover:hover)]:flex absolute top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2'

  return (
    <section aria-labelledby="pdf-landing-jobs" className="mt-10 lg:mt-12 min-w-0">
      <h2 id="pdf-landing-jobs" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t('app.landing_jobs_title')}
      </h2>
      <div className="relative mt-3">
        {!edge.start && (
          <button type="button" aria-label={t('app.landing_jobs_prev')} onClick={() => step(-1)} className={`${ARROW} -left-3`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
        <div
          ref={row}
          data-landing-jobs
          className="flex gap-3 overflow-x-auto pb-2 pt-0.5 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitMaskImage: fade, maskImage: fade }}
        >
          {cards.map((c) => {
            const mine = busy === c.id
            return (
              <button
                key={c.id}
                type="button"
                data-job={c.id}
                onClick={c.run}
                disabled={busy !== null}
                aria-busy={mine}
                className={`group flex-none snap-start w-[150px] min-h-[132px] rounded-xl border p-3 text-left flex flex-col justify-between gap-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2 disabled:cursor-wait ${
                  busy !== null && !mine ? 'opacity-60' : ''
                } ${
                  c.primary
                    ? 'border-cobalt bg-cobalt-tint hover:bg-[#e2e9fb]'
                    : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.primary ? 'bg-cobalt text-white' : 'bg-cobalt-tint text-cobalt-deep'}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={c.icon} />
                  </svg>
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className={`text-[14px] font-bold leading-tight ${c.primary ? 'text-cobalt-deep' : 'text-slate-900'}`}>{mine && c.busyLabel ? c.busyLabel : c.label}</span>
                  <span className="text-[12px] leading-snug text-slate-500">{c.note}</span>
                </span>
              </button>
            )
          })}
        </div>
        {!edge.end && (
          <button type="button" aria-label={t('app.landing_jobs_next')} onClick={() => step(1)} className={`${ARROW} -right-3`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>
    </section>
  )
}
