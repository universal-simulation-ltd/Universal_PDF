import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'universal-pdf-mobile-welcome-dismissed'
const MOBILE_QUERY = '(max-width: 767px)'

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export default function MobileWelcomeToast() {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isDismissed()) return
    if (!window.matchMedia(MOBILE_QUERY).matches) return

    const showTimer = window.setTimeout(() => {
      setMounted(true)
      window.setTimeout(() => setVisible(true), 30)
    }, 600)

    return () => window.clearTimeout(showTimer)
  }, [])

  function close() {
    setVisible(false)
    window.setTimeout(() => setMounted(false), 250)
  }

  // ⚠️ This coach-mark floats exactly where every toolbar panel opens — the
  // Sign menu, the draw/text option trays — so leaving it up until someone
  // finds the × hid the whole Sign panel behind it on a first mobile visit
  // (tabs and all, unreachable). Any touch outside it now takes it away, and
  // the listener is capture-phase + non-blocking so that same tap still lands
  // on whatever was tapped.
  useEffect(() => {
    if (!mounted) return
    function onDown(e: PointerEvent) {
      if (boxRef.current?.contains(e.target as Node)) return
      close()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [mounted])

  function dontShowAgain() {
    persistDismissed()
    close()
  }

  if (!mounted) return null

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-live="polite"
      aria-label="Welcome to Universal PDF"
      /* z-30: below the bottom bar (z-40) and its panels (z-40/z-50) so a
         greeting can never cover a control, above the document either way. */
      className={`md:hidden fixed left-1/2 -translate-x-1/2 z-30 w-[min(92vw,360px)] transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))' }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 px-4 py-3">
        <button
          type="button"
          onClick={close}
          aria-label="Close welcome message"
          className="absolute top-2 right-2 w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 text-lg leading-none"
        >
          ×
        </button>
        <div className="flex items-start gap-2 pr-6">
          <span className="text-xl leading-none" aria-hidden="true">👋</span>
          <div className="text-sm">
            <div className="font-semibold text-slate-900">Welcome to Universal PDF</div>
            <div className="text-slate-600 mt-0.5">
              Your editing tools live in the toolbar below.
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={dontShowAgain}
            className="text-xs text-slate-500 underline-offset-2 hover:underline"
          >
            Don't show again
          </button>
          <button
            type="button"
            onClick={close}
            className="text-xs font-semibold text-orange-700 hover:text-orange-800 px-3 py-1.5 rounded-full bg-orange-50 hover:bg-orange-100"
          >
            Got it
          </button>
        </div>
        <div
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45 bg-white ring-1 ring-slate-200"
          style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        />
      </div>
      <div
        aria-hidden="true"
        className="mt-2 flex justify-center text-orange-500 text-2xl leading-none animate-bounce"
      >
        ↓
      </div>
    </div>
  )
}
