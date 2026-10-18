import { useEffect, useMemo, useRef, useState } from 'react'
import { useT, intlLocale } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import type { RecentMeta } from '../lib/recents'
import { formatSize } from '../components/Export/formatSize'
import { AppMark, Dots, Icon, PATHS } from './icons'
import { Hl, Sheet } from './parts'
import { jobCards, runJob, useJobs, type JobCard, type JobId } from './jobs'
import { examplePreview } from './examplePreview'
import { EXAMPLE_PAGES } from '../lib/exampleMeta'

// Board 1 · Home, round 4: the top half is the cobalt desk with the headline
// and the carousel of coloured sheets lying scattered on it; "On your desk"
// (the recent files, kept only on this phone) is the cream panel below.

const PAPERS = [
  { bg: '#dfe7fb', ink: '#173a94', fold: '#b3c4ee' },
  { bg: '#fde3cf', ink: '#b4480a', fold: '#efbf9a' },
  { bg: '#dcefd9', ink: '#2f6b3a', fold: '#b2d4ab' },
  { bg: '#fde68a', ink: '#6b4f00', fold: '#e5c75a' },
]
const TILTS = ['-2.5deg', '1.8deg', '-1deg', '2.6deg', '-1.8deg']
const LIFTS = ['0px', '5px', '-3px', '3px', '-5px']
const DOC_TILTS = ['-3deg', '2deg', '-1.5deg', '2.5deg']

interface CardLook {
  bg: string
  fold: string
  ink: string
  noteInk: string
  chip: string
  box: number
  iconSize: number
  ring: boolean
}

function lookFor(card: JobCard, i: number): CardLook {
  if (card.id === 'open') {
    return { bg: '#f97316', fold: '#c2410c', ink: '#1b1d22', noteInk: '#3a1d05', chip: 'transparent', box: 44, iconSize: 20, ring: true }
  }
  if (card.id === 'scan') {
    return { bg: '#ffffff', fold: '#d6c7aa', ink: '#173a94', noteInk: '#5d6068', chip: 'transparent', box: 44, iconSize: 28, ring: false }
  }
  if (card.id === 'example') {
    return { bg: '#e9defa', fold: '#cbb7ee', ink: '#5b3aa8', noteInk: '#45474e', chip: 'transparent', box: 44, iconSize: 28, ring: false }
  }
  const p = PAPERS[(i - 3) % 4]
  return { bg: p.bg, fold: p.fold, ink: p.ink, noteInk: '#45474e', chip: 'rgba(255,255,255,0.7)', box: 36, iconSize: 21, ring: false }
}

function whenText(t: ReturnType<typeof useT>, ms: number): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((day(new Date()) - day(new Date(ms))) / 86_400_000)
  if (diff <= 0) return t('phone.today')
  if (diff === 1) return t('phone.yesterday')
  return new Intl.DateTimeFormat(intlLocale(t.lang), { day: 'numeric', month: 'short' }).format(ms)
}

export default function DeskScreen() {
  const t = useT()
  const cards = useMemo(() => jobCards(), [t])
  const busy = useJobs((s) => s.busy)
  const recents = usePdfStore((s) => s.recents)
  const refreshRecents = usePdfStore((s) => s.refreshRecents)
  const [at, setAt] = useState(0)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<RecentMeta | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void refreshRecents()
  }, [refreshRecents])
  useEffect(() => {
    if (searching) searchRef.current?.focus()
  }, [searching])

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    const sorted = [...recents].sort((a, b) => b.lastOpened - a.lastOpened)
    return q ? sorted.filter((r) => r.name.toLocaleLowerCase().includes(q)) : sorted
  }, [recents, query])

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const max = el.scrollWidth - el.clientWidth
    const i = max > 0 && el.scrollLeft >= max - 2 ? cards.length - 1 : Math.round(el.scrollLeft / 152)
    if (i !== at) setAt(i)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--np-desk)' }}>
      <div
        className="flex-none px-5 pb-[30px] flex flex-col gap-4 text-white"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppMark size={26} />
            <span className="text-[15px] font-bold tracking-[-0.01em]">{t('phone.app_name')}</span>
          </div>
          <button
            type="button"
            aria-label={t('phone.search_aria')}
            aria-expanded={searching}
            onClick={() => {
              setSearching((v) => !v)
              setQuery('')
            }}
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.14)' }}
          >
            <Icon d={searching ? PATHS.close : PATHS.search} size={20} stroke="#ffffff" />
          </button>
        </div>

        <h1 className="np-serif m-0 text-[38px] leading-[1.06] font-bold tracking-[-0.015em]">
          {t('phone.headline_lead')}{' '}
          <Hl desk>{t('phone.headline_hl')}</Hl>
        </h1>

        <section aria-label={t('phone.choose_aria')} className="flex flex-col gap-2">
          <div
            className="np-jobs -mx-5 -mt-1 px-5 pt-3.5 pb-[18px] flex gap-3 overflow-x-auto"
            style={{ scrollSnapType: 'x mandatory', scrollPaddingLeft: 20 }}
            onScroll={onScroll}
          >
            {cards.map((c, i) => {
              const look = lookFor(c, i)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void runJob(c.id)}
                  disabled={busy !== null}
                  aria-busy={busy === c.id}
                  className="np-tilt flex-none w-[140px] h-[138px] rounded-md p-3 box-border flex flex-col justify-between text-left relative overflow-hidden disabled:cursor-wait"
                  style={{
                    scrollSnapAlign: 'start',
                    background: look.bg,
                    transform: `rotate(${TILTS[i % 5]}) translateY(${LIFTS[i % 5]})`,
                    boxShadow: '0 10px 20px rgba(5,15,50,0.4), 0 1px 2px rgba(5,15,50,0.3)',
                    opacity: busy !== null && busy !== c.id ? 0.7 : 1,
                  }}
                >
                  <span aria-hidden="true" className="absolute top-0 right-0 w-[18px] h-[18px]" style={{ background: look.fold, clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }} />
                  <span aria-hidden="true" className="absolute top-0 right-0 w-[18px] h-[18px]" style={{ background: 'var(--np-desk)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                  <span
                    className="relative flex items-center justify-center rounded-[11px]"
                    style={{ width: look.box, height: look.box, background: look.chip }}
                  >
                    {look.ring && (
                      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="absolute inset-0">
                        <circle cx="22" cy="22" r="19" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="4 5" />
                      </svg>
                    )}
                    <Icon d={c.icon} size={look.iconSize} stroke={look.ink} />
                  </span>
                  <span className="relative flex flex-col gap-[3px]">
                    <span className="text-[15px] font-bold leading-[1.15] text-[color:var(--np-ink)]">
                      {busy === c.id ? t('phone.opening') : c.label}
                    </span>
                    <span className="text-[12px] leading-[1.25]" style={{ color: look.noteInk }}>{c.note}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div aria-hidden="true" className="flex justify-center gap-[5px]">
            {cards.map((c, i) => (
              <span
                key={c.id}
                className="h-1.5 rounded-[3px] transition-all"
                style={{ width: i === at ? 16 : 6, background: i === at ? '#fffdf8' : 'rgba(255,255,255,0.32)' }}
              />
            ))}
          </div>
          <p className="np-hand np-tilt m-0 mt-0.5 text-[22px] leading-none text-center" style={{ color: 'var(--np-sticky)', transform: 'rotate(-1deg)' }}>
            {t('phone.swipe_hint')}
          </p>
        </section>
      </div>

      <div
        className="flex-1 min-h-0 -mt-2.5 rounded-t-3xl px-5 pt-5 flex flex-col gap-2.5"
        style={{ background: 'var(--np-paper)' }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="np-serif m-0 text-[22px] font-bold">{t('phone.desk_title')}</h2>
          <span className="text-[13px] text-[color:var(--np-muted)]">{t('phone.desk_only_here')}</span>
        </div>
        {searching && (
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('phone.search_placeholder')}
            aria-label={t('phone.search_aria')}
            className="w-full h-11 px-3.5 rounded-xl text-[16px] outline-none"
            style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}
          />
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-5 px-5 pb-4">
          {shown.length === 0 && recents.length === 0 ? (
            // Nothing on the desk at all (not a search that matched nothing):
            // the example lies there instead, drawn like any desk entry.
            <>
              <ExampleEntry busy={busy} />
              <p className="m-0 pt-2 pb-4 text-[15px] leading-[1.45] text-[color:var(--np-muted)]">{t('phone.desk_empty')}</p>
            </>
          ) : shown.length === 0 ? (
            <p className="m-0 py-4 text-[15px] leading-[1.45] text-[color:var(--np-muted)]">
              {query ? t('phone.desk_no_match') : t('phone.desk_empty')}
            </p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col">
              {shown.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3.5 py-2.5" style={{ borderTop: i ? '1px solid #e6e0d4' : 0 }}>
                  <button
                    type="button"
                    onClick={() => void usePdfStore.getState().openRecent(r.id)}
                    className="flex-1 min-w-0 flex items-center gap-3.5 text-left"
                  >
                    <DocThumb tilt={DOC_TILTS[i % 4]} />
                    <span className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="text-[16px] font-semibold truncate">{r.name.replace(/\.pdf$/i, '')}</span>
                      <span className="text-[13px] text-[color:var(--np-muted)]">
                        {formatSize(t, r.size)} · {whenText(t, r.lastOpened)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('phone.doc_options_aria', { name: r.name })}
                    onClick={() => setOptions(r)}
                    className="w-11 h-11 flex-none flex items-center justify-center"
                  >
                    <Dots size={20} fill="#5d6068" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {options && (
        <Sheet label={options.name} onClose={() => setOptions(null)}>
          <div className="flex items-center gap-3.5 px-1">
            <DocThumb tilt="-4deg" />
            <h2 className="np-serif m-0 text-[20px] font-bold truncate">{options.name.replace(/\.pdf$/i, '')}</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              const id = options.id
              setOptions(null)
              void usePdfStore.getState().openRecent(id)
            }}
            className="min-h-[54px] rounded-[18px] text-white text-[17px] font-bold"
            style={{ background: 'var(--np-cobalt)' }}
          >
            {t('phone.doc_open')}
          </button>
          <button
            type="button"
            onClick={() => {
              const id = options.id
              setOptions(null)
              void usePdfStore.getState().removeRecent(id)
            }}
            className="min-h-[54px] rounded-[18px] text-[16px] font-semibold flex flex-col items-center justify-center"
            style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)', color: '#b42318' }}
          >
            {t('phone.doc_remove')}
          </button>
          <p className="m-0 mb-1 text-[13px] text-center text-[color:var(--np-muted)]">{t('phone.doc_remove_note')}</p>
        </Sheet>
      )}
    </div>
  )
}

const PREVIEW_W = 40

/**
 * The empty desk's one entry: the example PDF, its picture the example's real
 * first page (`examplePreview`). Tapping it opens the example exactly as the
 * "Try with example PDF" card does.
 */
function ExampleEntry({ busy }: { busy: JobId | null }) {
  const t = useT()
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    // After the desk has painted: the preview boots pdf.js.
    const start = () => {
      void examplePreview(t.lang, PREVIEW_W).then((url) => {
        if (live) setSrc(url)
      })
    }
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const handle = idle ? idle(start, { timeout: 600 }) : window.setTimeout(start, 200)
    return () => {
      live = false
      if (!idle) window.clearTimeout(handle)
    }
  }, [t.lang])

  return (
    <button
      type="button"
      onClick={() => void runJob('example')}
      disabled={busy !== null}
      aria-busy={busy === 'example'}
      className="w-full flex items-center gap-3.5 py-2.5 text-left disabled:cursor-wait"
    >
      {src ? (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="np-tilt flex-none bg-white rounded-sm"
          style={{ width: PREVIEW_W, height: Math.round(PREVIEW_W * 1.414), boxShadow: '0 2px 6px rgba(23,30,50,0.16)', transform: `rotate(${DOC_TILTS[0]})` }}
        />
      ) : (
        <DocThumb tilt={DOC_TILTS[0]} />
      )}
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-[16px] font-semibold truncate">{busy === 'example' ? t('phone.opening') : t('phone.desk_example')}</span>
        <span className="text-[13px] text-[color:var(--np-muted)] truncate">
          {t.plural('phone.pages', EXAMPLE_PAGES)} · {t('phone.desk_example_note')}
        </span>
      </span>
      <span className="w-11 h-11 flex-none flex items-center justify-center" aria-hidden="true">
        <Icon d={PATHS.chevron} size={20} stroke="#5d6068" />
      </span>
    </button>
  )
}

/** A little page with a highlighted line, lying at a slant. */
export function DocThumb({ tilt }: { tilt: string }) {
  return (
    <span
      aria-hidden="true"
      className="np-tilt w-10 h-[52px] flex-none bg-white rounded-sm box-border px-1.5 py-[9px] flex flex-col gap-1 relative"
      style={{ boxShadow: '0 2px 6px rgba(23,30,50,0.16)', transform: `rotate(${tilt})` }}
    >
      <span className="h-[3px] w-[80%] rounded-sm" style={{ background: '#c9cfdc' }} />
      <span className="h-[5px] w-[90%] rounded-sm" style={{ background: 'rgba(249,115,22,0.6)' }} />
      <span className="h-[3px] w-[70%] rounded-sm" style={{ background: '#c9cfdc' }} />
      <span className="h-[3px] w-[60%] rounded-sm" style={{ background: '#c9cfdc' }} />
    </span>
  )
}
