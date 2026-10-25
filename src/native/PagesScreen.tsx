import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { phoneConfirm, prefersReducedMotion } from '@unisim/sdk'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { usePageThumbnails } from '../hooks/usePageThumbnails'
import type { PDFDocumentProxy } from '../lib/pdfjs'
import { requestRenderSlot } from '../lib/renderQueue'
import { holdPage } from '../components/Viewer/pageRetention'
import { Icon, PATHS } from './icons'
import { BackLink, BTN_PRIMARY, BTN_PRIMARY_STYLE, BTN_SECOND, BTN_SECOND_STYLE, FitLabel, JobPage } from './parts'
import { goBack, topScreen, useNav } from './nav'
import { baseName } from './output'

// "Pages" (James, 2026-10-25; was "Split or reorder pages"), a page of its
// own. Every page lies on the desk as a sheet, two across. Nothing happens to
// the file until "Apply changes": moves, turns and pages taken out are all
// STAGED here, can be undone one at a time (Undo) or all at once (Put them
// back), and are written in one go — one rewrite, one undo step in the
// document (pdfStore.applyPageChanges). Leaving with changes staged asks first,
// by any road (backGuard, as Scan does).
//
//   • ← and → under a sheet move it; × takes it out.
//   • Select: tap several, then take them out together. Never every page.
//   • A tap on a sheet opens it large (the viewer, 'page-view' on the nav
//     stack, so Back and the edge swipe close it): move it earlier or later,
//     turn it a quarter at a time, take it out, swipe to the next. Confirm
//     hands those back to this page, still staged; Cancel or Back drops them.
//
// Turning is the page's own /Rotate in the saved PDF, and the marks on it
// turn with it (lib/rotateAnnotations).

const TILTS = ['-1.2deg', '1deg', '0.6deg', '-0.8deg']

/** One page as staged: which page of the file it is, and how many quarter turns clockwise. */
interface Slot {
  src: number
  q: number
}

const sameSlots = (a: Slot[], b: Slot[]) => a.length === b.length && a.every((s, i) => s.src === b[i].src && s.q % 4 === b[i].q % 4)
const identity = (n: number): Slot[] => Array.from({ length: n }, (_, i) => ({ src: i, q: 0 }))

export default function PagesScreen() {
  const t = useT()
  const doc = usePdfStore((s) => s.doc)
  const numPages = usePdfStore((s) => s.numPages)
  const fileName = usePdfStore((s) => s.fileName)
  const viewing = useNav((s) => topScreen(s.screens) === 'page-view')
  const rootRef = useRef<HTMLDivElement>(null)
  const thumbFor = usePageThumbnails(doc, numPages, true, rootRef)
  const base = useMemo(() => identity(numPages), [numPages])
  const [slots, setSlots] = useState<Slot[]>(base)
  const [history, setHistory] = useState<Slot[][]>([])
  const [busy, setBusy] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [viewAt, setViewAt] = useState(0)
  const pending = !sameSlots(slots, base)
  // Opened from the document's page chip: that page, scrolled to and marked
  // for a moment (PageChip.tsx).
  const [flash, setFlash] = useState<number | null>(() => useNav.getState().pagesFocus)
  useEffect(() => {
    if (flash === null) return
    useNav.getState().setPagesFocus(null)
    const frame = requestAnimationFrame(() =>
      rootRef.current?.querySelector(`[data-thumb-page="${flash}"]`)?.scrollIntoView({ block: 'center' }),
    )
    const id = window.setTimeout(() => setFlash(null), 2400)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(id)
    }
  }, [flash])

  // Staged changes belong to the document they were staged on.
  useEffect(() => {
    setSlots(identity(numPages))
    setHistory([])
    setPicked(new Set())
    setSelecting(false)
  }, [doc, numPages])

  // Every way back asks first while something is staged — but leaving the
  // viewer for this page never does (its own changes are simply dropped).
  const guard = useRef<() => boolean>(() => true)
  guard.current = () => {
    if (topScreen(useNav.getState().screens) === 'page-view') return true
    if (busy) return false
    if (selecting) {
      setSelecting(false)
      setPicked(new Set())
      return false
    }
    if (!pending) return true
    void phoneConfirm({
      message: t('phone.pages_leave_q'),
      confirmLabel: t('phone.scan_discard'),
      cancelLabel: t('phone.pages_leave_no'),
      danger: true,
    }).then((leave) => {
      if (!leave) return
      useNav.getState().setBackGuard(null)
      useNav.getState().pop()
    })
    return false
  }
  useEffect(() => {
    useNav.getState().setBackGuard(() => guard.current())
    return () => useNav.getState().setBackGuard(null)
  }, [])

  function stage(next: Slot[]) {
    if (busy || sameSlots(next, slots)) return
    setHistory((h) => [...h, slots])
    setSlots(next)
  }

  function undo() {
    if (!history.length || busy) return
    setSlots(history[history.length - 1])
    setHistory((h) => h.slice(0, -1))
  }

  function putBack() {
    if (busy) return
    setSlots(base)
    setHistory([])
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= slots.length) return
    const next = slots.slice()
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    stage(next)
  }

  function takeOut(srcs: Set<number>) {
    const next = slots.filter((s) => !srcs.has(s.src))
    if (next.length === 0) {
      useNav.getState().say(t('phone.pages_keep_one'))
      return false
    }
    stage(next)
    return true
  }

  async function apply() {
    if (!pending || busy) return
    setBusy(true)
    try {
      const turns: Record<number, number> = {}
      for (const s of slots) if (s.q % 4) turns[s.src] = s.q % 4
      await usePdfStore.getState().applyPageChanges(slots.map((s) => s.src), turns)
      // The effect above resets the staging as the new document arrives.
      useNav.getState().say(t('phone.pages_reordered'))
    } catch (err) {
      console.error(err)
      useNav.getState().say(t('viewer.nav.reorder_failed'))
    } finally {
      setBusy(false)
    }
  }

  function tapSheet(i: number, src: number) {
    if (busy) return
    if (selecting) {
      setPicked((p) => {
        const next = new Set(p)
        if (next.has(src)) next.delete(src)
        else next.add(src)
        return next
      })
      return
    }
    setViewAt(i)
    useNav.getState().push('page-view')
  }

  const pickedLeft = slots.filter((s) => picked.has(s.src)).length
  const allPicked = pickedLeft > 0 && pickedLeft === slots.length
  // Pages taken out stay in the DOM, hidden, so their thumbnails are still
  // watched (usePageThumbnails observes what was there when it started) when
  // Undo brings them back.
  const out = base.filter((b) => !slots.some((s) => s.src === b.src))

  const footer = selecting ? (
    <div className="grid grid-cols-[auto_1fr] gap-2.5">
      <button type="button" className={`${BTN_SECOND} px-4`} style={BTN_SECOND_STYLE} onClick={() => { setSelecting(false); setPicked(new Set()) }}>
        {t('phone.done')}
      </button>
      <button
        type="button"
        className={BTN_PRIMARY}
        style={{ background: '#b42318' }}
        disabled={pickedLeft === 0 || allPicked}
        data-pages-take-out
        onClick={() => {
          if (takeOut(picked)) {
            setPicked(new Set())
            setSelecting(false)
          }
        }}
      >
        {allPicked ? t('phone.pages_keep_one') : t.plural('phone.pages_take_out', Math.max(1, pickedLeft))}
      </button>
    </div>
  ) : pending ? (
    <div className="grid grid-cols-[auto_1fr] gap-2.5">
      <button type="button" className={`${BTN_SECOND} px-4 flex items-center gap-1.5`} style={BTN_SECOND_STYLE} disabled={busy || !history.length} onClick={undo}>
        <Icon d={PATHS.undo} size={18} width={2.2} />
        {t('phone.undo')}
      </button>
      <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} disabled={busy} onClick={() => void apply()}>
        {busy ? t('viewer.nav.applying') : t('phone.pages_apply')}
      </button>
    </div>
  ) : undefined

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <div data-edge-under className="flex-1 min-h-0 flex flex-col" aria-hidden={viewing || undefined} style={viewing ? { visibility: 'hidden' } : undefined}>
        <JobPage
          backLabel={baseName(fileName)}
          onBack={() => void goBack()}
          lead={t('phone.pages_lead')}
          hl={t('phone.pages_hl')}
          note={
            selecting ? (
              t.plural('phone.pages_selected', pickedLeft) + ' · ' + t('phone.pages_select_note')
            ) : pending ? (
              <>
                {t('phone.pages_pending')}{' '}
                <button type="button" onClick={putBack} disabled={busy} className="underline font-semibold text-[color:var(--np-cobalt)]">
                  {t('phone.pages_put_back')}
                </button>
              </>
            ) : (
              t('phone.pages_note')
            )
          }
          background="var(--np-grey-desk)"
          action={
            numPages > 1 && (
              <button
                type="button"
                aria-pressed={selecting}
                disabled={busy}
                onClick={() => {
                  setSelecting((v) => !v)
                  setPicked(new Set())
                }}
                className="min-h-[44px] px-3 text-[16px] font-semibold text-[color:var(--np-cobalt)] disabled:opacity-50"
              >
                {selecting ? t('phone.done') : t('phone.pages_select')}
              </button>
            )
          }
          footer={footer}
        >
          <div ref={rootRef}>
            <ol className="m-0 p-0 list-none grid grid-cols-2 gap-x-4 gap-y-5">
              {[...slots, ...out].map((slot, i) => {
                const gone = i >= slots.length
                const isPicked = selecting && picked.has(slot.src)
                const lit = flash === slot.src
                return (
                  <li key={slot.src} data-thumb-page={slot.src} hidden={gone} className={gone ? 'hidden' : 'flex flex-col gap-2'}>
                    <button
                      type="button"
                      onClick={() => tapSheet(i, slot.src)}
                      aria-label={t('viewer.nav.page', { page: i + 1 })}
                      aria-pressed={selecting ? isPicked : undefined}
                      aria-current={lit ? 'page' : undefined}
                      data-flash={lit ? '' : undefined}
                      className="np-tilt relative bg-white block"
                      style={{
                        transform: `rotate(${TILTS[i % 4]})`,
                        boxShadow: isPicked
                          ? '0 0 0 3px var(--np-cobalt), 0 8px 18px rgba(60,45,20,0.2)'
                          : lit
                            ? '0 0 0 4px var(--np-orange), 0 8px 18px rgba(60,45,20,0.2)'
                            : '0 8px 18px rgba(60,45,20,0.2)',
                        transition: 'box-shadow 400ms ease',
                      }}
                    >
                      <Thumb src={thumbFor(slot.src)} q={slot.q} />
                      <span className="np-hand absolute right-2 bottom-0.5 text-[22px] text-[color:var(--np-orange-ink)]">{i + 1}</span>
                      {selecting && (
                        <span
                          aria-hidden="true"
                          className="absolute left-2 top-2 w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: isPicked ? 'var(--np-cobalt)' : 'rgba(255,255,255,0.9)', border: isPicked ? 0 : '2px solid #9a9ca3' }}
                        >
                          {isPicked && <Icon d={PATHS.tick} size={16} stroke="#ffffff" width={2.6} />}
                        </span>
                      )}
                    </button>
                    {!selecting && (
                      <div className="flex justify-between">
                        <SheetAction label={t('viewer.nav.move_up', { page: i + 1 })} disabled={i === 0 || busy} onClick={() => move(i, i - 1)}>
                          <Icon d={PATHS.back} size={18} width={2.4} />
                        </SheetAction>
                        <SheetAction
                          label={t('viewer.nav.delete_page', { page: i + 1 })}
                          disabled={slots.length <= 1 || busy}
                          onClick={() => takeOut(new Set([slot.src]))}
                          danger
                        >
                          <Icon d={PATHS.trash} size={18} width={2.2} />
                        </SheetAction>
                        <SheetAction label={t('viewer.nav.move_down', { page: i + 1 })} disabled={i === slots.length - 1 || busy} onClick={() => move(i, i + 1)}>
                          <Icon d={PATHS.chevron} size={18} width={2.4} />
                        </SheetAction>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </JobPage>
      </div>
      {viewing && doc && (
        <PageViewer
          doc={doc}
          slots={slots}
          start={Math.min(viewAt, slots.length - 1)}
          onConfirm={(next) => {
            stage(next)
            useNav.getState().pop()
          }}
        />
      )}
    </div>
  )
}

function SheetAction({ label, disabled, onClick, danger, children }: { label: string; disabled?: boolean; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30"
      style={{ background: 'var(--np-slip)', boxShadow: '0 1px 4px rgba(60,45,20,0.14)', color: danger ? '#b42318' : 'var(--np-cobalt)' }}
    >
      {children}
    </button>
  )
}

/** A thumbnail, turned as staged. */
function Thumb({ src, q }: { src: string | undefined; q: number }) {
  const turned = useTurned(src, q % 4)
  const shown = q % 4 ? turned : src
  return shown ? <img src={shown} alt="" draggable={false} className="block w-full" /> : <span className="block w-full aspect-[1/1.41] bg-white" />
}

// Turned thumbnails, drawn once each: a canvas turned a quarter at a time.
const turnedCache = new Map<string, string>()
function useTurned(src: string | undefined, q: number): string | undefined {
  const key = src && q ? `${q}:${src}` : ''
  const [url, setUrl] = useState<string | undefined>(() => (key ? turnedCache.get(key) : undefined))
  useEffect(() => {
    if (!src || !q) return
    const hit = turnedCache.get(key)
    if (hit) {
      setUrl(hit)
      return
    }
    let live = true
    const img = new Image()
    img.onload = () => {
      const odd = q % 2 === 1
      const c = document.createElement('canvas')
      c.width = odd ? img.naturalHeight : img.naturalWidth
      c.height = odd ? img.naturalWidth : img.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.translate(c.width / 2, c.height / 2)
      ctx.rotate((q * Math.PI) / 2)
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      const out = c.toDataURL('image/jpeg', 0.85)
      if (turnedCache.size > 64) turnedCache.delete(turnedCache.keys().next().value as string)
      turnedCache.set(key, out)
      if (live) setUrl(out)
    }
    img.src = src
    return () => {
      live = false
    }
  }, [key, src, q])
  return key ? url : undefined
}

/** The most pixels one drawing of a page may have, zoomed or not (as the export's rasters). */
const MAX_BIG_PIXELS = 8_000_000

/**
 * One page of the file drawn large enough for the viewer: the screen's width
 * at the device's pixels (at most twice), times `level` once it is zoomed in
 * (drawn again as a pinch settles, so it stays sharp), never past
 * MAX_BIG_PIXELS — through the render queue like any viewer page. Upright as
 * the file has it; the viewer turns the picture. While a sharper drawing is
 * made the last one stays up.
 */
function useBigPage(doc: PDFDocumentProxy, src: number, level = 1): { url: string; w: number; h: number } | null {
  const [out, setOut] = useState<{ src: number; url: string; w: number; h: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    let release = () => {}
    let slotRelease = () => {}
    let task: { cancel: () => void } | null = null
    const canvas = document.createElement('canvas')
    void (async () => {
      try {
        const page = await doc.getPage(src + 1)
        if (cancelled) return
        release = holdPage(page)
        const slot = requestRenderSlot(src)
        slotRelease = () => slot.release()
        if (!(await slot.granted) || cancelled) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const unscaled = page.getViewport({ scale: 1 })
        const longSide = Math.max(unscaled.width, unscaled.height)
        const want = Math.min(1600, Math.max(window.innerWidth, window.innerHeight * 0.6) * dpr) * level
        const cap = Math.sqrt(MAX_BIG_PIXELS / (unscaled.width * unscaled.height))
        const viewport = page.getViewport({ scale: Math.min(want / longSide, cap) })
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const rt = page.render({ canvasContext: ctx, viewport })
        task = rt
        await rt.promise
        task = null
        if (cancelled) return
        setOut({ src, url: canvas.toDataURL('image/jpeg', 0.9), w: canvas.width, h: canvas.height })
      } catch {
        /* the page keeps its blank sheet */
      } finally {
        canvas.width = 0
        canvas.height = 0
        slotRelease()
        release()
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
      slotRelease()
    }
  }, [doc, src, level])
  return out && out.src === src ? out : null
}

/**
 * One page large, over the Pages page. Its own copy of the staging: Confirm
 * hands it back (still staged, nothing written), Cancel and Back drop it.
 */
function PageViewer({ doc, slots, start, onConfirm }: { doc: PDFDocumentProxy; slots: Slot[]; start: number; onConfirm: (next: Slot[]) => void }) {
  const t = useT()
  const [draft, setDraft] = useState<Slot[]>(slots)
  const [pos, setPos] = useState(Math.max(0, start))
  const at = Math.min(pos, draft.length - 1)
  const slot = draft[at]
  const stageRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  // Pinch to look closer (James, 2026-10-25: "so he can check details such as
  // whether it's the right way up"). The zoom is the picture's: scale `s`
  // about the stage's middle, moved by (x, y). Settled past 1.2×, the page is
  // drawn again sharper (`level`, within MAX_BIG_PIXELS).
  const [zoom, setZoom] = useState<Zoom>(FIT)
  const [live, setLive] = useState(false)
  const [level, setLevel] = useState(1)
  const big = useBigPage(doc, slot.src, level)

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const goTo = (i: number) => setPos(Math.max(0, Math.min(draft.length - 1, i)))
  const cancel = () => void goBack()

  function moveBy(d: -1 | 1) {
    const to = at + d
    if (to < 0 || to >= draft.length) return
    const next = draft.slice()
    const [m] = next.splice(at, 1)
    next.splice(to, 0, m)
    setDraft(next)
    setPos(to)
  }
  function turn() {
    setZoom(FIT)
    setDraft((d) => d.map((s, i) => (i === at ? { ...s, q: s.q + 1 } : s)))
  }
  function takeOut() {
    if (draft.length <= 1) {
      useNav.getState().say(t('phone.pages_keep_one'))
      return
    }
    const next = draft.filter((_, i) => i !== at)
    setDraft(next)
    setPos(Math.min(at, next.length - 1))
  }

  // The picture, fitted to the stage as it will stand once turned.
  const odd = slot.q % 2 === 1
  let size = { w: 0, h: 0 }
  if (big && box.w > 0 && box.h > 0) {
    const bw = odd ? big.h : big.w
    const bh = odd ? big.w : big.h
    const s = Math.min(box.w / bw, box.h / bh)
    size = { w: big.w * s, h: big.h * s }
  }
  const smooth = !prefersReducedMotion()

  // Another page, or the same one turned: back to the whole page.
  useEffect(() => {
    setZoom(FIT)
  }, [slot.src])
  useEffect(() => {
    const id = window.setTimeout(() => setLevel(zoom.s <= 1.2 ? 1 : zoom.s <= 2.5 ? 2 : 4), 250)
    return () => window.clearTimeout(id)
  }, [zoom.s])
  // The picture as it stands on the stage (turned), for keeping it on screen.
  const shownW = odd ? size.h : size.w
  const shownH = odd ? size.w : size.h
  const clamp = (z: Zoom): Zoom => {
    const sc = Math.max(1, Math.min(MAX_ZOOM, z.s))
    if (sc <= 1.001) return FIT
    const mx = Math.max(0, (sc * shownW - box.w) / 2)
    const my = Math.max(0, (sc * shownH - box.h) / 2)
    return { s: sc, x: Math.max(-mx, Math.min(mx, z.x)), y: Math.max(-my, Math.min(my, z.y)) }
  }
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const clampRef = useRef(clamp)
  clampRef.current = clamp
  const pageRef = useRef({ at, goTo })
  pageRef.current = { at, goTo }

  // The gestures, with pointer events (a finger, a pen or a mouse alike):
  // two fingers pinch (and move it); one finger pans while zoomed in, and at
  // the whole page swipes to the next; a double tap zooms in where it lands,
  // or back out. A trackpad pinch (a wheel with ctrl) and, zoomed in, the
  // wheel itself, on the web.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const pts = new Map<number, { x: number; y: number }>()
    let g:
      | { kind: 'pinch'; s0: number; x0: number; y0: number; d0: number; m0: { x: number; y: number } }
      | { kind: 'pan' | 'swipe'; x0: number; y0: number; start: { x: number; y: number }; t: number; moved: boolean }
      | null = null
    let lastTap: { t: number; x: number; y: number } | null = null
    const rel = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }
    }
    const two = () => {
      const [a, b] = [...pts.values()]
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }
    const set = (z: Zoom) => setZoom(clampRef.current(z))
    /** Scale to `s` keeping the picture's point under `p` (from the middle) where it is. */
    const scaleAbout = (z: Zoom, s: number, p: { x: number; y: number }, to = p): Zoom => {
      const cx = (p.x - z.x) / z.s
      const cy = (p.y - z.y) / z.s
      return { s, x: to.x - s * cx, y: to.y - s * cy }
    }
    const startOne = (p: { x: number; y: number }, afterPinch = false) => {
      const z = zoomRef.current
      g = { kind: z.s > 1.01 || afterPinch ? 'pan' : 'swipe', x0: z.x, y0: z.y, start: p, t: Date.now(), moved: afterPinch }
    }
    function down(e: PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      el!.setPointerCapture?.(e.pointerId)
      pts.set(e.pointerId, rel(e))
      setLive(true)
      if (pts.size === 2) {
        const z = zoomRef.current
        const { d, m } = two()
        g = { kind: 'pinch', s0: z.s, x0: z.x, y0: z.y, d0: d, m0: m }
      } else if (pts.size === 1) startOne(rel(e))
    }
    function move(e: PointerEvent) {
      if (!pts.has(e.pointerId)) return
      const p = rel(e)
      pts.set(e.pointerId, p)
      if (!g) return
      if (g.kind === 'pinch' && pts.size >= 2) {
        const { d, m } = two()
        set(scaleAbout({ s: g.s0, x: g.x0, y: g.y0 }, Math.max(1, Math.min(MAX_ZOOM, (g.s0 * d) / g.d0)), g.m0, m))
      } else if (g.kind !== 'pinch') {
        const dx = p.x - g.start.x
        const dy = p.y - g.start.y
        if (Math.hypot(dx, dy) > 8) g.moved = true
        if (g.kind === 'pan') set({ s: zoomRef.current.s, x: g.x0 + dx, y: g.y0 + dy })
      }
    }
    function up(e: PointerEvent) {
      if (!pts.has(e.pointerId)) return
      const p = rel(e)
      pts.delete(e.pointerId)
      if (g?.kind === 'pinch') {
        // One finger left on the glass carries on as a pan.
        // (Never a tap or a swipe: it was a pinch.)
        if (pts.size === 1) startOne([...pts.values()][0], true)
        else g = null
      } else if (g && pts.size === 0) {
        const dx = p.x - g.start.x
        const dy = p.y - g.start.y
        if (g.kind === 'swipe' && e.type === 'pointerup' && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          const { at: i, goTo: go } = pageRef.current
          go(dx < 0 ? i + 1 : i - 1)
        } else if (!g.moved && e.type === 'pointerup' && Date.now() - g.t < 350) {
          const now = Date.now()
          if (lastTap && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 40) {
            lastTap = null
            const z = zoomRef.current
            set(z.s > 1.05 ? FIT : scaleAbout(z, DOUBLE_TAP_ZOOM, p))
          } else lastTap = { t: now, x: p.x, y: p.y }
        }
        g = null
      }
      if (pts.size === 0) setLive(false)
    }
    function wheel(e: WheelEvent) {
      const z = zoomRef.current
      if (e.ctrlKey) {
        e.preventDefault()
        set(scaleAbout(z, Math.max(1, Math.min(MAX_ZOOM, z.s * Math.exp(-e.deltaY * 0.01))), rel(e)))
      } else if (z.s > 1.01) {
        e.preventDefault()
        set({ s: z.s, x: z.x - e.deltaX, y: z.y - e.deltaY })
      }
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [])

  const actions: { id: string; label: string; aria: string; icon: string; run: () => void; disabled: boolean; danger?: boolean; flip?: boolean }[] = [
    { id: 'earlier', label: t('phone.view_earlier'), aria: t('phone.view_earlier_aria'), icon: PATHS.back, run: () => moveBy(-1), disabled: at === 0 },
    { id: 'turn', label: t('phone.view_turn'), aria: t('phone.view_turn_aria'), icon: PATHS.turn, run: turn, disabled: false },
    { id: 'out', label: t('phone.view_take_out'), aria: t('phone.view_take_out_aria'), icon: PATHS.trash, run: takeOut, disabled: draft.length <= 1, danger: true },
    { id: 'later', label: t('phone.view_later'), aria: t('phone.view_later_aria'), icon: PATHS.chevron, run: () => moveBy(1), disabled: at === draft.length - 1 },
  ]

  return (
    <div data-edge-page data-page-viewer className="np-page-enter absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--np-grey-desk)' }}>
      <header className="flex-none px-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <BackLink label={t('phone.pages_back')} onClick={cancel} />
      </header>
      <div className="flex-none px-5 pb-2 flex items-center gap-2">
        <h1 className="np-serif m-0 flex-1 min-w-0 text-[26px] leading-tight font-bold" aria-live="polite">
          {t('phone.view_title', { page: at + 1, total: draft.length })}
        </h1>
        <RoundButton label={t('phone.view_prev')} disabled={at === 0} onClick={() => goTo(at - 1)}>
          <Icon d={PATHS.back} size={18} width={2.4} />
        </RoundButton>
        <RoundButton label={t('phone.view_next')} disabled={at === draft.length - 1} onClick={() => goTo(at + 1)}>
          <Icon d={PATHS.chevron} size={18} width={2.4} />
        </RoundButton>
      </div>

      <div
        ref={stageRef}
        data-swipe-x
        data-page-stage
        data-zoom={zoom.s.toFixed(2)}
        className="flex-1 min-h-0 relative mx-5 my-1 overflow-hidden select-none"
        style={{ touchAction: 'none' }}
      >
        {big && size.w > 0 ? (
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
              transformOrigin: '50% 50%',
              transition: smooth && !live ? 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)' : undefined,
            }}
          >
          <img
            key={slot.src}
            src={big.url}
            alt={t('viewer.nav.page', { page: at + 1 })}
            draggable={false}
            className="absolute left-1/2 top-1/2 bg-white max-w-none"
            style={{
              width: size.w,
              height: size.h,
              transform: `translate(-50%, -50%) rotate(${slot.q * 90}deg)`,
              transition: smooth ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : undefined,
              boxShadow: '0 10px 24px rgba(60,45,20,0.22)',
            }}
          />
          </div>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[15px] text-[color:var(--np-muted)]">{t('phone.opening')}</span>
        )}
      </div>
      <p className="np-hand m-0 text-center text-[19px] leading-none text-[color:var(--np-muted)]" aria-hidden="true">{t('phone.view_hint')}</p>

      <div className="flex-none px-5 pt-3 grid grid-cols-4 gap-2">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-label={a.aria}
            title={a.aria}
            disabled={a.disabled}
            onClick={a.run}
            data-view-action={a.id}
            className="min-w-0 min-h-[64px] rounded-2xl flex flex-col items-center justify-center gap-1 disabled:opacity-35"
            style={{ background: 'var(--np-slip)', boxShadow: '0 1px 4px rgba(60,45,20,0.14)', color: a.danger ? '#b42318' : 'var(--np-cobalt-deep)' }}
          >
            <Icon d={a.icon} size={22} width={2.2} />
            <FitLabel size={13} className="font-semibold">{a.label}</FitLabel>
          </button>
        ))}
      </div>

      <div className="flex-none px-5 pt-3 grid grid-cols-[auto_1fr] gap-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}>
        <button type="button" className={`${BTN_SECOND} px-4`} style={BTN_SECOND_STYLE} onClick={cancel}>
          {t('phone.cancel')}
        </button>
        <button type="button" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE} onClick={() => onConfirm(draft)}>
          {t('phone.view_confirm')}
        </button>
      </div>
    </div>
  )
}

interface Zoom {
  s: number
  x: number
  y: number
}
const FIT: Zoom = { s: 1, x: 0, y: 0 }
const MAX_ZOOM = 6
const DOUBLE_TAP_ZOOM = 2.5

function RoundButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex-none w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30"
      style={{ background: 'var(--np-slip)', boxShadow: '0 1px 4px rgba(60,45,20,0.14)', color: 'var(--np-cobalt)' }}
    >
      {children}
    </button>
  )
}
