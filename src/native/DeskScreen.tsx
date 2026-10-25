import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PullDrawer, insideScrolledChild, modalIsOpen, openThenFocus, usePullHint, useSearchRequests } from '@unisim/sdk'
import { useT, intlLocale, getT } from '../i18n'
import { DESK_PULL_HINT_KEY } from '../lib/resetDefaults'
import { usePdfStore } from '../stores/pdfStore'
import { getRecent, getRecentEdits, type RecentMeta } from '../lib/recents'
import { formatSize } from '../components/Export/formatSize'
import { AppMark, Dots, Icon, PATHS } from './icons'
import { Hl, Sheet, SwipeRow } from './parts'
import { useNav } from './nav'
import { jobCards, runJob, useJobs, type JobCard, type JobId } from './jobs'
import { examplePreview } from './examplePreview'
import { KEEP_FOCUS, leaveIfEmptyOnBlur, useSearchMode } from './searchMode'
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
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<RecentMeta | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // The search, folded away above "On your desk" until you pull down (BRANDING.md
  // ▸ "Pull down for search, pull again for the keyboard"; James, 2026-10-19:
  // "where appropriate swipe down to reveal search bar and swipe again to open
  // keyboard. As we do in jukebox"). It replaced a search button in the header.
  // The gesture is the SDK's PullDrawer, the one Jukebox and BlackBook use.
  //
  // The desk itself never scrolls (the window's scrollY is always 0, which is
  // all the SDK asks of "the top of the page"); the list under it does. So the
  // drawer is the first thing INSIDE the list, and a pull counts only while
  // that list is at its top — `notAPull` below.
  //
  // Other ways in, so nobody needs the gesture: tapping Desk while on it, a
  // search button that is invisible until it takes keyboard focus (where the
  // old button was), and the first-run hint, which is a button too.
  const [pulled, setPulled] = useState(false)
  const [focused, setFocused] = useState(false)
  const searchShown = pulled || query !== ''
  // In use, the search moves to the top (searchMode.ts; James, 2026-10-25):
  // the cobalt desk and "On your desk" fold away above it, the box pins under
  // the status bar, and the documents found fill the room down to the
  // keyboard. Opened by a pull, a tap on Desk, or a finger in the box; left by
  // Cancel, Back, or the box emptied and let go.
  const searching = searchShown || focused
  const canSearch = recents.length > 0
  const { learnt, learn } = usePullHint(DESK_PULL_HINT_KEY)

  useEffect(() => {
    void refreshRecents()
  }, [refreshRecents])

  const openDrawer = useCallback(() => {
    setPulled(true)
    learn()
  }, [learn])
  // A second pull while it's open: into the box, keyboard up. Called from
  // inside the touch's release, which is what iOS needs to raise the keyboard.
  const typeIntoSearch = useCallback(() => searchRef.current?.focus({ preventScroll: true }), [])
  // Open AND focus inside the same tap. `openThenFocus` renders the drawer open
  // first: shut, it is inert, and focusing an inert box does nothing.
  const openAndFocus = useCallback(() => {
    const list = listRef.current
    if (list && list.scrollTop > 0) list.scrollTop = 0
    openThenFocus(() => setPulled(true), searchRef)
    learn()
  }, [learn])
  const clearAndClose = useCallback(() => {
    setQuery('')
    setPulled(false)
    setFocused(false)
    searchRef.current?.blur()
  }, [])
  const keyboard = useSearchMode(searching, clearAndClose)
  // The status bar's glyphs go dark over the paper while the desk is folded away.
  useEffect(() => {
    useNav.setState({ deskSearching: searching })
  }, [searching])
  useEffect(() => () => useNav.setState({ deskSearching: false }), [])
  // The tab bar's `requestSearch` (NativeApp's TabBar): Desk tapped while on it.
  useSearchRequests({ onOpen: openAndFocus }, canSearch)

  /**
   * A touch that is never a pull, on top of the SDK's own (the sideways
   * carousel is `data-swipe-x`): one made outside the desk (the tab bar, a
   * dialog or the options sheet over it), or while the list is scrolled down —
   * then a drag down is the list scrolling back up, and a pull on the cobalt
   * desk above would open a box scrolled out of sight.
   */
  const notAPull = useCallback((e: TouchEvent) => {
    const root = rootRef.current
    if (!root || !(e.target instanceof Node) || !root.contains(e.target)) return true
    return modalIsOpen() || (listRef.current?.scrollTop ?? 0) > 0 || insideScrolledChild(e.target)
  }, [])

  // ⚠️ No folding away when the list scrolls (it did until 2026-10-25): open,
  // the box is pinned at the top of the list (sticky), so it never scrolls out
  // of sight. Cancel, Back or an empty box let go are the ways out.

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
    <div ref={rootRef} className="flex-1 min-h-0 flex flex-col" style={{ background: searching ? 'var(--np-paper)' : 'var(--np-desk)' }}>
      <div className="np-collapse flex-none" data-collapsed={searching || undefined} aria-hidden={searching || undefined} {...(searching ? { inert: '' } : {})}>
      {/* ⚠️ The grid's child has no padding of its own: padding can't fold to 0. */}
      <div>
      <div
        className="px-5 pb-[30px] flex flex-col gap-4 text-white"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)', background: 'var(--np-desk)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppMark size={26} />
            <span className="text-[15px] font-bold tracking-[-0.01em]">{t('phone.app_name')}</span>
          </div>
          {/* The keyboard and screen-reader way in: it takes no room until it
              is focused, and then looks like the button that used to be here. */}
          {canSearch && !searchShown && (
            <button
              type="button"
              aria-label={t('phone.search_aria')}
              onClick={openAndFocus}
              className="sr-only focus:not-sr-only focus:w-11 focus:h-11 focus:rounded-full focus:flex focus:items-center focus:justify-center"
              style={{ background: 'rgba(255,255,255,0.14)' }}
            >
              <Icon d={PATHS.search} size={20} stroke="#ffffff" />
            </button>
          )}
        </div>

        <h1 className="np-serif m-0 text-[38px] leading-[1.06] font-bold tracking-[-0.015em]">
          {t('phone.headline_lead')}{' '}
          <Hl desk>{t('phone.headline_hl')}</Hl>
        </h1>

        <section aria-label={t('phone.choose_aria')} className="flex flex-col gap-2">
          <div
            className="np-jobs -mx-5 -mt-1 px-5 pt-3.5 pb-[18px] flex gap-3 overflow-x-auto"
            style={{ scrollSnapType: 'x mandatory', scrollPaddingLeft: 20 }}
            data-swipe-x
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
      </div>
      </div>

      <div
        data-desk-panel
        className="np-search-move flex-1 min-h-0 px-5 flex flex-col"
        style={{
          background: 'var(--np-paper)',
          marginTop: searching ? 0 : -10,
          borderRadius: searching ? 0 : '24px 24px 0 0',
          paddingTop: searching ? 'calc(env(safe-area-inset-top) + 8px)' : 20,
        }}
      >
        <div className="np-collapse flex-none" data-collapsed={searching || undefined} aria-hidden={searching || undefined}>
          <div>
            <div className="flex items-baseline justify-between gap-3 pb-2.5">
              <h2 className="np-serif m-0 text-[22px] font-bold">{t('phone.desk_title')}</h2>
              <span className="text-[13px] text-[color:var(--np-muted)]">{t('phone.desk_only_here')}</span>
            </div>
          </div>
        </div>
        {canSearch && !searchShown && !learnt && (
          // First run: nothing else on screen says the search is there. A tap
          // opens it too. Tune ▸ Reset to defaults brings it back.
          <button
            type="button"
            onClick={openDrawer}
            className="np-hand np-pull-hint self-center -mt-1 mb-1.5 px-3 min-h-[36px] flex items-center gap-1 text-[21px] leading-none"
            style={{ color: 'var(--np-cobalt)' }}
          >
            <span aria-hidden="true">↓</span> {t('phone.pull_to_search')}
          </button>
        )}
        <div
          ref={listRef}
          data-desk-list
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-5 px-5"
          style={{ paddingBottom: 16 + (searching ? keyboard : 0) }}
        >
          {/* No pull-to-refresh while it can be pulled (containOverscroll):
              Chrome on Android starts it on the same gesture. */}
          <PullDrawer
            shown={searchShown}
            onOpen={openDrawer}
            onPullAgain={typeIntoSearch}
            pullable={canSearch}
            ignoreTouch={notAPull}
            containOverscroll
            innerClassName="pt-[3px] pb-2.5"
            // Pinned at the top of the list while open, over the rows that
            // scroll under it.
            style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--np-paper)' }}
          >
            <div role="search" className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                ref={searchRef}
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={(e) => {
                  setFocused(false)
                  leaveIfEmptyOnBlur(e.currentTarget, clearAndClose)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') clearAndClose()
                  else if (e.key === 'Enter') e.currentTarget.blur()
                }}
                placeholder={t('phone.search_placeholder')}
                aria-label={t('phone.search_aria')}
                className="np-kb-search w-full h-11 pl-3.5 pr-11 rounded-xl text-[16px] outline-none"
                style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}
              />
              {query && (
                <button
                  type="button"
                  aria-label={t('phone.kb_clear')}
                  // Keeps the finger in the box: clearing is not leaving.
                  {...KEEP_FOCUS}
                  onClick={() => {
                    setQuery('')
                    searchRef.current?.focus({ preventScroll: true })
                  }}
                  className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-[color:var(--np-muted)]"
                >
                  <Icon d={PATHS.close} size={16} width={2.4} />
                </button>
              )}
            </div>
              <button
                type="button"
                data-search-cancel
                {...KEEP_FOCUS}
                onClick={clearAndClose}
                className="flex-none min-h-[44px] px-1 text-[16px] font-semibold text-[color:var(--np-cobalt)]"
              >
                {t('phone.cancel')}
              </button>
            </div>
          </PullDrawer>
          <div>
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
                <li key={r.id} style={{ borderTop: i ? '1px solid #e6e0d4' : 0 }}>
                  <SwipeRow
                    start={{ label: t('phone.swipe_share'), icon: PATHS.share, color: 'var(--np-cobalt)', run: () => void shareRecent(r) }}
                    end={{ label: t('phone.swipe_delete'), icon: PATHS.trash, color: '#b42318', run: () => void usePdfStore.getState().removeRecent(r.id) }}
                  >
                  <div className="flex items-center gap-3.5 py-2.5">
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
                  </div>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          )}
          </div>
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
              const r = options
              setOptions(null)
              void shareRecent(r)
            }}
            className="min-h-[54px] rounded-[18px] text-[16px] font-semibold flex items-center justify-center gap-2"
            style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)', color: 'var(--np-cobalt)' }}
          >
            <Icon d={PATHS.share} size={20} />
            {t('phone.doc_share')}
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

/**
 * Send a PDF on the desk to someone, through the phone's share sheet, with
 * its annotations and answers on it (James, 2026-10-22: "reveal a share
 * button to send the PDF to someone from the main menu") — without opening
 * it. The same build the document's own Share makes.
 */
async function shareRecent(r: RecentMeta): Promise<void> {
  try {
    const bytes = await getRecent(r.id)
    if (!bytes) return
    const edits = await getRecentEdits(r.id)
    const marked = (edits.annotations?.length ?? 0) > 0 || (edits.formValues?.length ?? 0) > 0
    const { buildAnnotatedPdfBytes } = await import('../lib/export')
    const { signingRecordsFor } = await import('../lib/signingRecord')
    const out = marked
      ? await buildAnnotatedPdfBytes(bytes.slice(0), edits.annotations ?? [], 1.0, edits.formValues, {
          signingRecords: signingRecordsFor(edits.annotations ?? []),
        })
      : new Uint8Array(bytes)
    const { downloadPdfBytes } = await import('../lib/download')
    downloadPdfBytes(out, /\.pdf$/i.test(r.name) ? r.name : `${r.name}.pdf`)
  } catch (e) {
    console.warn('desk share failed', e)
    useNav.getState().say(getT()('phone.failed', { message: (e as Error).message || String(e) }))
  }
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
