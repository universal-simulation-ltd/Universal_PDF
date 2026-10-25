import { useEffect, useRef, useState } from 'react'
import { usePhoneLayer } from '@unisim/sdk'

// "Search moves to the top" (James, 2026-10-25): every search on the phone —
// the Desk's "On your desk" and the knowledge base's — moves its box up under
// the status bar while it is in use, with the rest of the page's heading out
// of the way, so the results have the room between the box and the keyboard.
// Leaving the search (Cancel, Back, or the box emptied and let go) puts the
// page back as it was.
//
// This is the plumbing the two share: Back (Android's gesture, the browser's)
// leaves the search before it leaves the page — the search is a layer of its
// own on the SDK's stack while it is up — and the keyboard's height, which iOS
// does not take off the page (its web view keeps its size and the keyboard
// covers the bottom of it), so the list can leave room for it. Android's web
// view shrinks instead, and the height reads 0 there.
//
// The look (what folds away, how the box pins) is each page's: `.np-collapse`
// in native.css does the folding, reduced motion respected.

/** How much of the page the on-screen keyboard covers, in CSS px (0 with none, or where the page shrinks for it). */
export function useKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!enabled || !vv) {
      setInset(0)
      return
    }
    const read = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    read()
    vv.addEventListener('resize', read)
    vv.addEventListener('scroll', read)
    return () => {
      vv.removeEventListener('resize', read)
      vv.removeEventListener('scroll', read)
    }
  }, [enabled])
  return inset
}

/**
 * While `active`, Back calls `leave` (and the page stays), and the keyboard's
 * height comes back for the list's foot.
 */
export function useSearchMode(active: boolean, leave: () => void): number {
  const leaveRef = useRef(leave)
  leaveRef.current = leave
  usePhoneLayer('sheet', () => leaveRef.current(), { open: active })
  return useKeyboardInset(active)
}

/**
 * The box was let go of: with nothing typed in it, that is the search over —
 * a moment later, and only if the finger did not go straight back into it (or
 * onto the page's own Cancel, which leaves anyway).
 */
export function leaveIfEmptyOnBlur(input: HTMLInputElement | null, leave: () => void): void {
  window.setTimeout(() => {
    if (!input || document.activeElement === input || input.value.trim() !== '') return
    leave()
  }, 120)
}

/**
 * For the buttons beside a search box (its ×, Cancel): a tap on one leaves
 * the finger in the box rather than letting it go first (which, with the box
 * emptied, would read as leaving the search and move the page under the tap).
 */
export const KEEP_FOCUS = {
  onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
  onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(),
}
