import { useEffect, useRef, useState, type RefObject } from 'react'
import { prefersReducedMotion } from '@unisim/sdk'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useNav } from './nav'

// The page-number chip (James, 2026-10-25): a small "3 / 12" in the bottom
// right of the open document, over the pages and above the tool bar. It shows
// the page most in view — by area, so it is right with pages side by side and
// when zoomed — while the pages move, and fades after two seconds of
// stillness; it also shows for a moment when the document opens. A tap opens
// Pages at that page (PagesScreen scrolls to it and marks it).
//
// A long-press was the other way in, and was turned down: it clashes with
// hold-to-select-a-word and with the selection box on empty paper.
//
// Faded, it lets every touch through to the page (pointer-events: none) and
// stays a real button in the accessibility tree, so VoiceOver still finds it;
// a keyboard focus brings it back. The document screen leaves it out while
// Mark up's tools, a sheet or a page are up, and while a message is showing
// at the foot (the two would overlap on a narrow phone).

const STILL_MS = 2000

/** Which page has the most of itself on screen inside `root`'s scroller. */
function pageMostInView(root: HTMLElement): number | null {
  const pages = root.querySelectorAll<HTMLElement>('[data-page-index]')
  if (!pages.length) return null
  const scroller = pages[0].closest<HTMLElement>('.overflow-auto') ?? root
  const v = scroller.getBoundingClientRect()
  let best: number | null = null
  let bestArea = 0
  for (const p of pages) {
    const r = p.getBoundingClientRect()
    const w = Math.min(r.right, v.right) - Math.max(r.left, v.left)
    const h = Math.min(r.bottom, v.bottom) - Math.max(r.top, v.top)
    const area = w > 0 && h > 0 ? w * h : 0
    if (area > bestArea) {
      bestArea = area
      best = Number(p.dataset.pageIndex)
    }
  }
  return best
}

export default function PageChip({ viewRef, shown }: { viewRef: RefObject<HTMLElement | null>; shown: boolean }) {
  const t = useT()
  const doc = usePdfStore((s) => s.doc)
  const numPages = usePdfStore((s) => s.numPages)
  const firstPaint = usePdfStore((s) => s.firstPaint)
  const [page, setPage] = useState(0)
  const [awake, setAwake] = useState(false)
  const timer = useRef(0)

  // Awake now, asleep two seconds after the last movement.
  const wake = useRef(() => {})
  wake.current = () => {
    setAwake(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setAwake(false), STILL_MS)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    const root = viewRef.current
    if (!root || !doc) return
    let frame = 0
    const read = () => {
      frame = 0
      const i = pageMostInView(root)
      if (i !== null) setPage(i)
    }
    const onMove = () => {
      wake.current()
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    // Scroll events don't bubble: caught on the way down instead.
    root.addEventListener('scroll', onMove, { capture: true, passive: true })
    window.addEventListener('resize', onMove)
    return () => {
      root.removeEventListener('scroll', onMove, { capture: true })
      window.removeEventListener('resize', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [viewRef, doc, numPages])

  // A moment on show as the document opens (and as one arrives in its place).
  useEffect(() => {
    if (!doc || !firstPaint) return
    const root = viewRef.current
    const i = root ? pageMostInView(root) : null
    if (i !== null) setPage(i)
    wake.current()
  }, [doc, firstPaint, viewRef])

  if (!doc || numPages < 1 || !shown) return null
  const n = Math.min(page, numPages - 1) + 1
  const visible = awake
  return (
    <button
      type="button"
      data-page-chip
      data-awake={visible ? '' : undefined}
      aria-label={t('phone.page_chip_aria', { page: n, total: numPages })}
      onFocus={() => wake.current()}
      onClick={() => {
        useNav.getState().setPagesFocus(n - 1)
        useNav.getState().push('pages')
      }}
      className="absolute z-[60] min-h-[36px] min-w-[52px] px-3 rounded-full flex items-center justify-center text-[14px] font-bold tabular-nums text-white"
      style={{
        right: 14,
        bottom: 'calc(env(safe-area-inset-bottom) + 104px)',
        background: 'rgba(23,30,50,0.78)',
        boxShadow: '0 4px 12px rgba(23,30,50,0.25)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: prefersReducedMotion() ? undefined : 'opacity 260ms ease',
      }}
    >
      <span aria-hidden="true">{n} / {numPages}</span>
    </button>
  )
}
