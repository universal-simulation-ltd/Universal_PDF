import { useEffect, useRef, useState } from 'react'
import { useUniversal } from '@unisim/sdk'
import { requestAccessCode, verifyAccess } from '../../lib/signRequestClient'
import { useT } from '../../i18n'

/**
 * The holding page a protected signing link lands on, before the document
 * exists as far as this app is concerned.
 *
 * ⚠️ WHAT THIS DEFENDS AGAINST, AND WHAT IT DOES NOT. The threat is the link
 * being FORWARDED — a shared `accounts@` mailbox, a helpful paste into Teams, an
 * assistant with delegate access. A code emailed to the address the sender
 * addressed it to proves the visitor can read that mailbox, which forwarding
 * does not give you. It does nothing about a mailbox that is already
 * compromised, because the link and the code land in the same inbox; that is
 * what the sender's optional PIN, passed on by phone, is for.
 *
 * ⚠️ Nothing on this page moves anything server-side until a button is pressed.
 * Defender Safe Links and Proofpoint fetch every URL in an email before a human
 * sees it, so an auto-send on mount would mean a code going out — and being
 * spent — on every scanned message.
 */
export default function SignRequestGate({
  token,
  docName,
  maskedEmail,
  hasPin,
  onVerified,
}: {
  token: string
  docName: string
  maskedEmail: string | null
  hasPin: boolean
  onVerified: (session: string) => void
}) {
  const t = useT()
  const { supabase } = useUniversal()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !email.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const res = await requestAccessCode(supabase, token, email.trim())
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? t('sign.gate_could_not_send'))
      if (res.code === 'too_soon' && res.retryAfter) setCooldown(res.retryAfter)
      return
    }
    setStep('code')
    setCooldown(60)
    setNotice(t.plural('sign.gate_code_sent', res.expiresInMinutes ?? 10, { email: res.maskedEmail ?? maskedEmail ?? t('sign.gate_your_email') }))
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    if (busy || code.length < 6) return
    setBusy(true)
    setError(null)
    const res = await verifyAccess(supabase, token, { code, pin: hasPin ? pin : undefined })
    setBusy(false)
    if (!res.ok || !res.session) {
      setError(res.error ?? t('sign.gate_did_not_work'))
      // A spent or expired code sends them back to ask for another, rather than
      // leaving them retyping into a box that can no longer succeed.
      if (res.code === 'code_expired' || res.code === 'too_many_attempts' || res.code === 'no_code') {
        setStep('email')
        setCode('')
        setCooldown(0)
      }
      return
    }
    onVerified(res.session)
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-700 focus:outline-none focus:ring-1 focus:ring-orange-700 disabled:opacity-50'

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 text-sm font-bold tracking-tight text-orange-700">Universal&nbsp;PDF</div>
        <h1 className="text-lg font-semibold text-slate-900">{t('sign.gate_title')}</h1>

        <p className="mt-2 text-sm text-slate-600">
          {maskedEmail ? (
            t.rich('sign.gate_sent_to', {
              email: <span className="font-medium text-slate-900">{maskedEmail}</span>,
              doc: <span className="font-medium text-slate-900">{docName}</span>,
            })
          ) : (
            t.rich('sign.gate_confirm_email', { doc: <span className="font-medium text-slate-900">{docName}</span> })
          )}
        </p>

        {step === 'email' ? (
          <form onSubmit={onSendCode} className="mt-5 space-y-3">
            <div>
              <label htmlFor="sr-email" className="mb-1 block text-xs font-medium text-slate-700">
                {t('sign.gate_email_label')}
              </label>
              <input
                id="sr-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                placeholder="you@example.com"
                className={field}
              />
            </div>
            <button
              type="submit"
              disabled={busy || !email.trim() || cooldown > 0}
              className="w-full rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('sign.sending') : cooldown > 0 ? t('sign.gate_wait', { seconds: cooldown }) : t('sign.gate_email_me')}
            </button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="mt-5 space-y-3">
            <div>
              <label htmlFor="sr-code" className="mb-1 block text-xs font-medium text-slate-700">
                {t('sign.gate_code_label')}
              </label>
              <input
                id="sr-code"
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={busy}
                placeholder="000000"
                className={`${field} text-center text-lg tracking-[0.4em]`}
              />
            </div>

            {hasPin && (
              <div>
                <label htmlFor="sr-pin" className="mb-1 block text-xs font-medium text-slate-700">
                  {t('sign.gate_pin_label')}
                </label>
                <input
                  id="sr-pin"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  disabled={busy}
                  placeholder="000000"
                  className={`${field} text-center text-lg tracking-[0.4em]`}
                />
                {/* Said here rather than in the email, because the email is the
                    one place this PIN must never appear. */}
                <p className="mt-1 text-xs text-slate-500">
                  {t('sign.gate_pin_hint')}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || code.length < 6 || (hasPin && pin.length < 4)}
              className="w-full rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('sign.gate_checking') : t('sign.gate_open')}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setCode(''); setError(null); setNotice(null) }}
              disabled={busy}
              className="w-full text-xs text-slate-500 underline underline-offset-2 hover:text-slate-800"
            >
              {t('sign.gate_different')}
            </button>
          </form>
        )}

        {notice && !error && <p className="mt-3 text-xs text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}

        <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
          {t('sign.gate_forwarded')}
        </p>
      </div>
    </main>
  )
}
