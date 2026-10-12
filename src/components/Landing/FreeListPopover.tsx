import { useEffect, useId, useRef, useState } from 'react'
import { useT, type MessageKey } from '../../i18n'

/**
 * The round "?" at the end of the privacy note, and what it opens: the
 * ticks-and-crosses list that used to close the landing card (2026-10-12, the
 * "highlighter + blue" pass). The card had nine lines of small print under the
 * buttons; the list is still one click from the promise it backs up, and the
 * card is down to the drop circle and two buttons.
 *
 * A floating popover above the "?" on a computer; a bottom sheet on a phone,
 * where a 380px popover anchored to the right of the note would hang off the
 * left of the screen.
 *
 * Closes on ×, Escape and a click outside. Focus moves into it on open, Tab
 * cycles inside it, and closing hands focus back to the "?".
 */

// Cobalt ticks for what's free, orange no-signs for what we never do.
const FREE: MessageKey[] = [
  'app.landing_free_sign',
  'app.landing_free_compress',
  'app.landing_free_convert',
  'app.landing_free_qr',
  'app.landing_free_redact',
  'app.landing_free_export'
]
const NEVER: MessageKey[] = ['app.landing_no_uploads', 'app.landing_no_scraping', 'app.landing_no_ads']

const TICK = 'M5 13l4 4 10-10'
const NO_SIGN = 'M5.6 5.6l12.8 12.8M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'

/** Below Tailwind's `sm`: the sheet, not the popover. */
function useNarrow() {
  const query = '(max-width: 639px)'
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

export default function FreeListPopover({ className = '' }: { className?: string }) {
  const t = useT()
  const narrow = useNarrow()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus()

    function close() {
      setOpen(false)
      buttonRef.current?.focus()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      // The trap. The panel's only focusable thing today is the ×, but the
      // loop is written for any number so a link added later stays inside.
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])')
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (!panel.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
    function onDown(e: PointerEvent) {
      const target = e.target as Node
      if (panel?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const list = (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-slate-700">
      {FREE.map((k) => (
        <li key={k} className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 text-cobalt" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={TICK} />
          </svg>
          {t(k)}
        </li>
      ))}
      {NEVER.map((k) => (
        <li key={k} className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 text-orange-700" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={NO_SIGN} />
          </svg>
          {t(k)}
        </li>
      ))}
    </ul>
  )

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h2 id={titleId} className="text-base font-extrabold text-slate-900">
        {t('app.landing_free_title')}
      </h2>
      <button
        type="button"
        data-autofocus
        onClick={() => {
          setOpen(false)
          buttonRef.current?.focus()
        }}
        aria-label={t('app.close')}
        title={t('app.close')}
        className="w-8 h-8 -mr-1.5 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('app.landing_free_open')}
        title={t('app.landing_free_open')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        className="w-[30px] h-[30px] rounded-full border-[1.5px] border-cobalt bg-white text-cobalt-deep text-[15px] font-extrabold leading-none flex items-center justify-center hover:bg-cobalt-tint transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2"
      >
        ?
      </button>

      {open && !narrow && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="absolute right-0 bottom-[calc(100%+10px)] z-30 w-[380px] max-w-[calc(100vw-32px)] bg-white border border-slate-200 rounded-2xl shadow-[0_18px_40px_rgba(15,23,42,0.18)] p-[18px] pb-4 flex flex-col gap-3"
        >
          {header}
          {list}
          {/* The little arrow pointing down at the "?". */}
          <span
            aria-hidden="true"
            className="absolute right-[9px] -bottom-[7px] w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45"
          />
        </div>
      )}

      {open && narrow && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-slate-900/40" aria-hidden="true" />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full bg-white rounded-t-2xl shadow-2xl px-5 pt-3 flex flex-col gap-3"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
          >
            <span aria-hidden="true" className="self-center w-10 h-1 rounded-full bg-slate-300" />
            {header}
            {list}
          </div>
        </div>
      )}
    </div>
  )
}
