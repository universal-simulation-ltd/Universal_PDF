import { useEffect, useId, useRef, useState } from 'react'
import { create } from 'zustand'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { setNotifier, setTextAsker } from '../lib/notice'
import { BTN_PRIMARY, BTN_PRIMARY_STYLE, Sheet } from './parts'
import { useNav } from './nav'

// The questions the shared code asks, as the phone asks them: never a browser
// box (2026-10-22, "review every popup"). Messages become the short line at
// the foot of the screen (`say`); a one-line question (a link for some text)
// is a sheet with a text box; a locked PDF's password is a sheet too, in place
// of the website's dialog.

interface AskState {
  question: string | null
  value: string
  resolve: ((answer: string | null) => void) | null
}

const useAsk = create<AskState>(() => ({ question: null, value: '', resolve: null }))

/** Route `notice()` and `askText()` (lib/notice) to the phone's own ways of saying and asking. */
export function usePhonePrompts() {
  useEffect(() => {
    const offNotice = setNotifier((message) => useNav.getState().say(message))
    const offAsk = setTextAsker(
      (question, value) =>
        new Promise((resolve) => {
          // A question still open is answered "no" by the next one.
          useAsk.getState().resolve?.(null)
          useAsk.setState({ question, value, resolve })
        })
    )
    return () => {
      offNotice()
      offAsk()
    }
  }, [])
}

/** The one-line question, as a sheet. */
export function AskSheet() {
  const t = useT()
  const question = useAsk((s) => s.question)
  const initial = useAsk((s) => s.value)
  const [value, setValue] = useState(initial)
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => setValue(initial), [question, initial])
  // After the sheet has taken focus for itself (its effect runs after ours).
  useEffect(() => {
    if (!question) return
    const r = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(r)
  }, [question])
  if (!question) return null

  const answer = (a: string | null) => {
    const r = useAsk.getState().resolve
    useAsk.setState({ question: null, value: '', resolve: null })
    r?.(a)
  }

  return (
    <Sheet label={question} onClose={() => answer(null)} background="var(--np-sheet)">
      <form
        className="flex flex-col gap-3 pb-1"
        onSubmit={(e) => {
          e.preventDefault()
          answer(value)
        }}
      >
        <label htmlFor={id} className="text-[16px] font-semibold">{question}</label>
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          className="h-12 px-3 rounded-xl text-[16px] outline-none bg-white"
          style={{ border: '1px solid var(--np-line)' }}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => answer(null)} className="min-h-[52px] rounded-[16px] text-[16px] font-semibold" style={{ border: '1px solid var(--np-line)' }}>
            {t('phone.cancel')}
          </button>
          <button type="submit" className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE}>
            {t('phone.done')}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

/**
 * A locked PDF's password, as a sheet (was the website's LockedFilePrompt).
 * No attempt limit, deliberately — see that file. "No way back if it's lost"
 * is said up front, as there.
 */
export function LockedSheet() {
  const t = useT()
  const locked = usePdfStore((s) => s.lockedFile)
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    if (!locked) return
    setPassword('')
    setBusy(false)
    // After the sheet has taken focus for itself (its effect runs after ours).
    const r = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(r)
  }, [locked?.file, locked?.error])

  if (!locked) return null
  const cancel = () => usePdfStore.getState().cancelLockedFile()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || busy || !locked) return
    setBusy(true)
    await usePdfStore.getState().loadFile(locked.file, { notice: locked.notice, password })
    setBusy(false)
  }

  return (
    <Sheet label={t('tools.locked.title')} onClose={cancel} background="var(--np-sheet)">
      <form className="flex flex-col gap-3 pb-1" onSubmit={submit}>
        <h2 className="np-serif m-0 text-[24px] font-bold">{t('tools.locked.title')}</h2>
        <p className="m-0 text-[15px] leading-snug text-[color:var(--np-ink-2)]">
          {t.rich('tools.locked.needs_password', { name: <span className="font-semibold">{locked.file.name}</span> })}
        </p>
        <div className="flex gap-2">
          <label htmlFor={id} className="sr-only">{t('tools.locked.password_or_pin')}</label>
          <input
            ref={inputRef}
            id={id}
            type={reveal ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="current-password"
            placeholder={t('tools.locked.password_or_pin')}
            aria-invalid={locked.error ? true : undefined}
            className="min-w-0 flex-1 h-12 px-3 rounded-xl text-[16px] outline-none bg-white"
            style={{ border: `1px solid ${locked.error ? '#b42318' : 'var(--np-line)'}` }}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-pressed={reveal}
            disabled={busy}
            className="flex-none px-3.5 min-h-[48px] rounded-xl text-[15px] font-semibold"
            style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)', color: 'var(--np-cobalt-deep)' }}
          >
            {reveal ? t('tools.common.hide') : t('tools.common.show')}
          </button>
        </div>
        {locked.error && <p role="alert" className="m-0 text-[14px] text-[#b42318]">{locked.error}</p>}
        <p className="np-hand np-tilt m-0 text-[21px] leading-tight text-[color:var(--np-orange-ink)]" style={{ transform: 'rotate(-1deg)' }}>
          {t('tools.locked.no_recovery')}
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-2.5">
          <button type="button" onClick={cancel} disabled={busy} className="min-h-[52px] px-5 rounded-[16px] text-[16px] font-semibold" style={{ border: '1px solid var(--np-line)' }}>
            {t('phone.cancel')}
          </button>
          <button type="submit" disabled={!password || busy} className={BTN_PRIMARY} style={BTN_PRIMARY_STYLE}>
            {busy ? t('tools.locked.unlocking') : t('tools.locked.unlock')}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
