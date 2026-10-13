import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useUniversal } from '@unisim/sdk'
import { useT } from '../../i18n'
import { isNativeShell } from '../../lib/nativeOpen'
import { DESKTOP_READY, normaliseInterestEmail, registerDesktopInterest } from '../../lib/appInterest'
// The app's own icon, the cobalt page with the orange highlighter: the thing
// you get when you download (James, 2026-10-12). Drawn by
// scripts/app-icon.mjs with the rest, so it can't drift from the real one.
import appIcon from '../../assets/app-icon.png'

const RELEASES = 'https://github.com/universal-simulation-ltd/Universal_PDF/releases/latest'

// The same marks the download page on the marketing site uses, so the two read
// as one product rather than two takes on the same four platforms.
const ICON = 'h-5 w-5 shrink-0'

function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5.5 10 4.5v7H3zM11.5 4.3 21 3v8.5h-9.5zM3 12.5h7v7L3 18.5zM11.5 12.5H21V21l-9.5-1.3z" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
      <path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}

// Tux, in the same outline weight as its neighbours: body, belly, eyes, and
// the beak and big feet filled — the feet are what make it read as a penguin
// at 20 px (an outline alone looked like a pear).
function LinuxIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.6c-2.5 0-3.8 2-3.8 4.5 0 1.5-.5 2.5-1.3 3.7C5.6 12.6 4.7 14.4 4.7 16.4c0 1.3.4 2.4 1 3.2M12 2.6c2.5 0 3.8 2 3.8 4.5 0 1.5.5 2.5 1.3 3.7 1.3 1.8 2.2 3.6 2.2 5.6 0 1.3-.4 2.4-1 3.2M9.6 20.6h4.8" />
      <ellipse cx="12" cy="15.4" rx="3" ry="4" />
      <path d="M10.7 6.5h.01M13.3 6.5h.01" />
      <path d="M10.8 8.6h2.4L12 9.8z" fill="currentColor" />
      <path d="M3.8 20.4c.2-1 1.2-1.5 2.3-1.2l2.6.8c.9.3.9 1.5 0 1.8l-2.7.6c-1.3.3-2.4-.5-2.2-2zM20.2 20.4c-.2-1-1.2-1.5-2.3-1.2l-2.6.8c-.9.3-.9 1.5 0 1.8l2.7.6c1.3.3 2.4-.5 2.2-2z" fill="currentColor" />
    </svg>
  )
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 10.5h14v6.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M8 10.5a4 4 0 0 1 8 0" />
      <path d="M6.5 6 8 8M17.5 6 16 8M10 6.8h.01M14 6.8h.01" />
      <path d="M2.8 11.5v4M21.2 11.5v4M9.5 19v2.2M14.5 19v2.2" />
    </svg>
  )
}

function IPhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="2.6" />
      <path d="M11 18.5h2" />
    </svg>
  )
}

// Icon-only (James, 2026-09-30): the marks are recognisable on their own, and
// four words on a phone wrapped the row onto two lines. Each keeps its name as
// an aria-label + tooltip, so screen readers and hover still say "macOS".
const ITEM =
  'inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors'

/**
 * Where to get the app for each platform, kept quiet on purpose.
 *
 * The browser IS the product here — nothing on this page should suggest the
 * page itself is the lesser version — so this is a row of small marks under
 * the drop zone rather than a banner above it: findable by someone looking for
 * it, ignorable by everyone else.
 *
 * ⚠️ The iPhone entry is not a link. There is no App Store listing yet, and a
 * dead href is worse than no link — that is the mistake the Universal Screens
 * page shipped. It reveals the Add-to-Home-Screen route instead, which does
 * work today.
 */
export default function DownloadRow() {
  const t = useT()
  const [showIosHint, setShowIosHint] = useState(false)
  const iosHintId = useId()

  // The desktop app is already the download; offering it one is noise.
  if (typeof window !== 'undefined' && window.desktop) return null

  return (
    <section aria-labelledby="get-the-app" className="mt-8 text-center">
      {/* The heading is for screen readers only (James, 2026-10-12: the line
          of text under the card "doesn't quite look right"). On screen the
          app's own icon says what the marks are for — the thing you get — and
          each mark's tooltip names the file. */}
      <h2 id="get-the-app" className="sr-only">
        {t('app.download_heading')}
      </h2>

      <div className="inline-flex items-center gap-3">
        {/* Decorative: the heading says what it is. */}
        <img
          src={appIcon}
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 drop-shadow-[0_4px_10px_rgba(23,58,148,0.22)]"
        />
        <span aria-hidden="true" className="h-8 w-px bg-slate-200" />
        <ul className="flex flex-wrap items-center justify-center gap-x-1 sm:gap-x-2 gap-y-1">
          <li>
            <a className={ITEM} href={RELEASES} rel="noopener" title={t('app.download_windows_title')} aria-label="Windows">
              <WindowsIcon />
            </a>
          </li>
          <li>
            <a className={ITEM} href={RELEASES} rel="noopener" title={t('app.download_macos_title')} aria-label="macOS">
              <AppleIcon />
            </a>
          </li>
          <li>
            <a className={ITEM} href={RELEASES} rel="noopener" title={t('app.download_linux_title')} aria-label="Linux">
              <LinuxIcon />
            </a>
          </li>
          <li>
            <a className={ITEM} href={RELEASES} rel="noopener" title={t('app.download_android_title')} aria-label="Android">
              <AndroidIcon />
            </a>
          </li>
          <li>
            <button
              type="button"
              className={ITEM}
              aria-label="iPhone"
              title="iPhone"
              aria-expanded={showIosHint}
              aria-controls={iosHintId}
              onClick={() => setShowIosHint((open) => !open)}
            >
              <IPhoneIcon />
            </button>
          </li>
        </ul>
      </div>

      {showDesktopNotify() && <DesktopNotify />}

      {showIosHint && (
        <p id={iosHintId} className="mx-auto mt-1 max-w-sm text-[13px] text-slate-500">
          {t.rich('app.download_ios_hint', {
            share: <strong className="font-medium">{t('app.download_ios_share')}</strong>,
            add: <strong className="font-medium">{t('app.download_ios_add_to_home')}</strong>
          })}
        </p>
      )}
    </section>
  )
}

/**
 * The website only, and only until the desktop app is ready (`DESKTOP_READY`
 * in lib/appInterest.ts). Not in the desktop app (it is the thing being waited
 * for; DownloadRow already returns null there), not in the phone apps or the
 * extension (every one of those is Vite mode 'desktop', and the phone shell is
 * also caught by `isNativeShell()`).
 */
function showDesktopNotify(): boolean {
  if (DESKTOP_READY) return false
  if (typeof window === 'undefined' || window.desktop) return false
  if (import.meta.env.MODE === 'desktop' || isNativeShell()) return false
  return /^https?:$/.test(window.location.protocol)
}

type NotifyState = 'idle' | 'busy' | 'ok' | 'already' | 'bad' | 'later' | 'offline'

const NOTIFY_MSG = {
  busy: 'app.notify_desktop_busy',
  ok: 'app.notify_desktop_ok',
  already: 'app.notify_desktop_already',
  bad: 'app.notify_desktop_bad',
  later: 'app.notify_desktop_later',
  offline: 'app.notify_desktop_offline',
} as const

/**
 * "Tell me when the desktop app is ready": a quiet link under the marks that
 * opens a one-field form. The marks still download today's early release from
 * GitHub; this is for people who would rather wait for the finished one.
 *
 * Hover is colour only, as a CSS transition, so leaving plays it back rather
 * than snapping (BRANDING.md → Motion). Nothing here animates in.
 */
function DesktopNotify() {
  const t = useT()
  const { supabase } = useUniversal()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [state, setState] = useState<NotifyState>('idle')
  // Addresses already taken this visit, so a second press can say "already
  // on the list". In-page only: gone when the tab closes, never stored.
  const sent = useRef(new Set<string>())
  const inputRef = useRef<HTMLInputElement>(null)
  const formId = useId()
  const msgId = useId()

  // Opening puts the cursor in the field; preventScroll so the page does not
  // jump under the pointer.
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
  }, [open])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (state === 'busy') return
    const address = normaliseInterestEmail(email)
    if (!address) {
      setState('bad')
      inputRef.current?.focus()
      return
    }
    if (sent.current.has(address)) {
      setState('already')
      return
    }
    setState('busy')
    const outcome = await registerDesktopInterest(supabase, address)
    if (outcome === 'ok') {
      sent.current.add(address)
      setEmail('')
    }
    setState(outcome)
  }

  const isError = state === 'bad' || state === 'later' || state === 'offline'
  const isDone = state === 'ok' || state === 'already'

  return (
    <div className="mx-auto mt-1 max-w-sm px-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => setOpen((was) => !was)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-[13px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {t('app.notify_desktop_label')}
      </button>

      {open && (
        <form id={formId} onSubmit={onSubmit} noValidate className="mt-1 text-left" aria-busy={state === 'busy'}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="send"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (state === 'bad') setState('idle')
              }}
              placeholder="you@example.com"
              aria-label={t('app.notify_desktop_email_aria')}
              aria-invalid={state === 'bad' || undefined}
              aria-describedby={msgId}
              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt aria-[invalid=true]:border-red-600"
            />
            <button
              type="submit"
              disabled={state === 'busy'}
              className="h-11 shrink-0 rounded-lg bg-cobalt px-4 text-sm font-semibold text-white transition-colors hover:bg-cobalt-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('app.notify_desktop_button')}
            </button>
          </div>
          <p
            id={msgId}
            role="status"
            aria-live="polite"
            className={`mt-1.5 min-h-[1.25rem] text-[13px] leading-snug ${
              isError ? 'text-red-700' : isDone ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {state === 'idle' ? '' : t(NOTIFY_MSG[state])}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-slate-500">{t('app.notify_desktop_small_print')}</p>
        </form>
      )}
    </div>
  )
}
