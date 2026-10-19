import { useEffect, useRef } from 'react'

// A swipe in from the left edge goes back a page, as everywhere else on an
// iPhone (James, 2026-10-19: "Side swipe should go back a page, I am on send
// and it doesn't do anything"). The web view's own back/forward swipe stays
// off: it would walk the browser history, which here is the stack of layers
// (useHistoryLayers in NativeApp.tsx), not pages the user would recognise —
// so the gesture is ours, on the pushed page itself.
//
// Touch events rather than pointer events: a pointer drag that the browser
// also reads as a pan is taken over by the scroll (pointercancel) unless
// touch-action forbids it, and a touch-action on the page would cost the
// pages their sideways rows. A non-passive touchmove can say no to the scroll
// one gesture at a time instead, and only once the gesture is ours.

/** How close to the left edge a swipe has to start, as on iOS. */
const EDGE = 24
/** Movement before the swipe's direction is read. */
const SLOP = 6
/** Let go past this share of the width (or flick) and the page goes. */
const PAST = 1 / 3
/** A flick, in px per ms. */
const FLICK = 0.5

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * While `enabled`, a swipe from the left edge of `ref`'s element drags the
 * page across with the finger and, let go far enough (or flicked), finishes
 * the slide and calls `onBack` — the same as the page's back link; short of
 * that it settles back.
 *
 * What slides is the last `[data-edge-page]` inside the element (a page that
 * stands over another inside one screen, like a knowledge base article over
 * its list), else the element itself. A `[data-edge-under]` beside it is
 * shown for the length of the drag, so the list is what the article reveals.
 */
export function useEdgeSwipeBack(ref: React.RefObject<HTMLElement | null>, enabled: boolean, onBack: () => void) {
  const back = useRef(onBack)
  back.current = onBack

  useEffect(() => {
    const root = ref.current
    if (!enabled || !root) return
    const host: HTMLElement = root

    let swipe: {
      id: number
      x: number
      y: number
      /** null while the direction is still unread. */
      ours: boolean | null
      dx: number
      t: number
      v: number
      page: HTMLElement
      under: HTMLElement | null
      /** The under page's own visibility, put back after the drag. */
      hidden: string
    } | null = null

    function onStart(e: TouchEvent) {
      if (swipe || e.touches.length !== 1) {
        if (swipe?.ours) settle(false)
        swipe = null
        return
      }
      const touch = e.touches[0]
      if (touch.clientX - host.getBoundingClientRect().left > EDGE) return
      if (!(e.target instanceof Element) || ownsTheGesture(e.target, host)) return
      const pages = host.querySelectorAll<HTMLElement>('[data-edge-page]')
      const page = pages.length ? pages[pages.length - 1] : host
      const under = page === host ? null : host.querySelector<HTMLElement>('[data-edge-under]')
      swipe = { id: touch.identifier, x: touch.clientX, y: touch.clientY, ours: null, dx: 0, t: e.timeStamp, v: 0, page, under, hidden: under?.style.visibility ?? '' }
    }

    function onMove(e: TouchEvent) {
      const s = swipe
      if (!s) return
      const touch = find(e.touches, s.id)
      if (!touch) return
      const dx = touch.clientX - s.x
      const dy = touch.clientY - s.y
      if (s.ours === null) {
        if (Math.hypot(dx, dy) < SLOP) return
        // Mostly sideways and rightwards, or it's the page's own scroll.
        if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * 1.2) {
          swipe = null
          return
        }
        s.ours = true
        begin(s.page, s.under)
      }
      if (e.cancelable) e.preventDefault()
      const x = Math.max(0, dx)
      const dt = e.timeStamp - s.t
      if (dt > 0) s.v = (x - s.dx) / dt
      s.dx = x
      s.t = e.timeStamp
      s.page.style.transform = x ? `translateX(${x}px)` : ''
    }

    function onEnd(e: TouchEvent) {
      const s = swipe
      if (!s || !find(e.changedTouches, s.id)) return
      if (s.ours) settle(e.type === 'touchend')
      swipe = null
    }

    /** Let go: finish the slide and go back, or settle where it was. */
    function settle(released: boolean) {
      const s = swipe
      if (!s) return
      const width = host.offsetWidth || window.innerWidth
      const away = released && (s.dx > width * PAST || (s.v > FLICK && s.dx > 16))
      const { page, under, hidden } = s
      // Tidied before going back, not after: the page underneath re-renders
      // with its own visibility once it's the top one.
      const tidy = () => {
        page.style.transition = ''
        page.style.transform = ''
        page.style.boxShadow = ''
        if (under) under.style.visibility = hidden
      }
      if (reducedMotion()) {
        tidy()
        if (away) back.current()
        return
      }
      page.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      if (away) {
        page.style.transform = `translateX(${width + 16}px)`
        window.setTimeout(() => {
          tidy()
          back.current()
        }, 170)
      } else {
        page.style.transform = ''
        window.setTimeout(tidy, 190)
      }
    }

    host.addEventListener('touchstart', onStart, { passive: true, capture: true })
    host.addEventListener('touchmove', onMove, { passive: false, capture: true })
    host.addEventListener('touchend', onEnd, { capture: true })
    host.addEventListener('touchcancel', onEnd, { capture: true })
    return () => {
      host.removeEventListener('touchstart', onStart, { capture: true })
      host.removeEventListener('touchmove', onMove, { capture: true })
      host.removeEventListener('touchend', onEnd, { capture: true })
      host.removeEventListener('touchcancel', onEnd, { capture: true })
    }
  }, [ref, enabled])
}

function begin(page: HTMLElement, under: HTMLElement | null) {
  // The page's slide-in would otherwise hold the transform while it runs.
  page.getAnimations?.().forEach((a) => a.cancel())
  page.style.transition = 'none'
  page.style.boxShadow = '-8px 0 24px rgba(0,0,0,0.12)'
  if (under) under.style.visibility = 'visible'
}

function find(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i]
  return null
}

/**
 * Something under the finger that does its own dragging keeps it: a drawing
 * pad or anything else that has turned the browser's panning off, a slider,
 * or a sideways row that has been scrolled along (a swipe right there scrolls
 * it back, as on iOS; one at its start has nothing to scroll back to).
 */
function ownsTheGesture(target: Element, host: HTMLElement): boolean {
  for (let el: Element | null = target; el && el !== host; el = el.parentElement) {
    if (el instanceof HTMLInputElement && el.type === 'range') return true
    const cs = getComputedStyle(el)
    if (cs.touchAction === 'none' || cs.touchAction === 'pan-y') return true
    if (/(auto|scroll)/.test(cs.overflowX) && el.scrollLeft > 0) return true
  }
  return false
}
