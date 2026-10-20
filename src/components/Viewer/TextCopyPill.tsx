import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useCoarsePointer } from '../../hooks/useCoarsePointer'
import { clearWordSelectReturn, wordSelectReturnTo } from '../../lib/wordSelect'

// A word picked out with a finger — press and hold on it, or double-tap it —
// gets a Copy button over it, and letting go of the selection puts back the
// tool that was in hand (James, 2026-10-20: "tap and hold doesn't consistently
// highlight text"). A phone has no Ctrl+C and no Select text button to leave
// by, so without these the words could be selected but not taken anywhere,
// and the page stayed in Select text with every mark on it out of reach.
//
// Touch screens only, and only when a finger got here (see `wordSelectReturnTo`):
// Select text picked from the toolbar is the desktop's, and stays put.
export default function TextCopyPill({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const t = useT()
  const coarse = useCoarsePointer()
  const selecting = useAnnotationStore((s) => s.tool === 'selecttext')
  const live = coarse && selecting
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const pillRef = useRef<HTMLDivElement>(null)
  const hadSelection = useRef(false)

  // Leaving Select text any other way (a bar button) forgets the way back.
  useEffect(() => {
    if (!selecting) {
      clearWordSelectReturn()
      hadSelection.current = false
      setAt(null)
      setCopied(false)
    }
  }, [selecting])

  useLayoutEffect(() => {
    if (!live) return

    function selectedRange(): Range | null {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
      const r = sel.getRangeAt(0)
      return r.startContainer.parentElement?.closest('.textLayer') ? r : null
    }

    function handBack() {
      const to = wordSelectReturnTo()
      if (!to) return
      clearWordSelectReturn()
      window.getSelection()?.removeAllRanges()
      useAnnotationStore.getState().setTool(to)
    }

    function place() {
      const box = host.current?.getBoundingClientRect()
      const r = selectedRange()
      if (!box || !r) {
        setAt(null)
        return
      }
      const rect = r.getBoundingClientRect()
      const w = pillRef.current?.offsetWidth ?? 96
      const h = pillRef.current?.offsetHeight ?? 44
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - box.left - w / 2), box.width - w - 8)
      // Above the words, clear of the finger; below them when that is off the top.
      let top = rect.top - box.top - h - 12
      if (top < 8) top = rect.bottom - box.top + 12
      setAt({ left, top: Math.min(top, box.height - h - 8) })
    }

    function onSelection() {
      if (selectedRange()) {
        hadSelection.current = true
        place()
      } else {
        setAt(null)
        // A tap off the words lets go of them: back to the tool in hand.
        if (hadSelection.current) handBack()
      }
    }

    // A tap anywhere that isn't words or the pill — the grey desk, the bar —
    // doesn't clear a selection by itself (the phone's screens are not
    // selectable), so it is let go of here.
    function onDown(e: PointerEvent) {
      const el = e.target instanceof Element ? e.target : null
      if (!el || pillRef.current?.contains(el) || el.closest('.textLayer')) return
      if (hadSelection.current) handBack()
    }

    document.addEventListener('selectionchange', onSelection)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    onSelection()
    return () => {
      document.removeEventListener('selectionchange', onSelection)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [live, host])

  if (!live || !wordSelectReturnTo()) return null

  async function copy() {
    const text = window.getSelection()?.toString() ?? ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // No async clipboard (an old web view): the selection is still there.
      document.execCommand('copy')
    }
    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
      const to = wordSelectReturnTo()
      clearWordSelectReturn()
      window.getSelection()?.removeAllRanges()
      if (to) useAnnotationStore.getState().setTool(to)
    }, 700)
  }

  return (
    <div
      ref={pillRef}
      className="absolute z-30"
      style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? 'visible' : 'hidden' }}
    >
      <button
        type="button"
        data-testid="text-copy"
        // Kept from taking the selection away before the click lands.
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={copy}
        className="min-h-[44px] px-5 rounded-full bg-slate-900 text-white text-[15px] font-semibold shadow-lg"
      >
        {copied ? t('viewer.textcopy.copied') : t('viewer.textcopy.copy')}
      </button>
    </div>
  )
}
