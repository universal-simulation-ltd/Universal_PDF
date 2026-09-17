import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useUniversal,
  useUser,
  useCredits,
  useAppFreeToken,
  useSignRequests,
  createSignRequest,
  updateSignRequestRecipient,
  deleteSignRequest,
  SignInDialog,
  Chip,
  ValueChip,
  type SignRequest,
} from '@unisim/sdk'
import { usePdfStore } from '../stores/pdfStore'
// App Review 3.1.1: the phone app must not point people to buying tokens on
// the web. The web and desktop builds keep the link and the wording.
import { isNativeShell } from '../lib/nativeOpen'
import { useAnnotationStore } from '../stores/annotationStore'
import { storeCurrentPdf, currentPdfBytes } from '../lib/hostedStore'
import {
  applySignRequestProtection,
  generateAccessPin,
  signRequestLink,
  certLink,
  sendSignRequestEmail,
  signRequestMailto,
} from '../lib/signRequestClient'
import { useT, intlLocale, type MessageKey } from '../i18n'

// Human labels for a request's signing state (either-order two-party flow).
// A toned state is a Value chip (the tone fills its key); the neutral one is
// a plain Orbit chip.
const STATUS_UI: Record<string, { label: MessageKey; tone?: 'good' | 'warn' }> = {
  pending: { label: 'sign.send_status_pending' },
  partially_signed: { label: 'sign.send_status_partial', tone: 'warn' },
  signed: { label: 'sign.send_status_completed', tone: 'good' },
  completed: { label: 'sign.send_status_completed', tone: 'good' },
}

const HUB_LOGIN_URL = 'https://app.unisim.co.uk/login'
// Was /subscription.html until 2026-09-07, when the marketing site split its
// one pricing page in two. The token card moved to /everyday; /subscription is
// now the Assess Suite's seats and licences and sells no tokens at all — so a
// link left pointing there sends someone who wants one upload to a £5,000/year
// enterprise plan. Not a 404: it renders fine, which is why it needed finding.
const GET_TOKENS_URL = 'https://www.unisim.co.uk/everyday'

// Export → "Send to sign": store the current PDF online (one token — the free
// app token first, returned when the stored file is deleted), mint a
// pdf_sign_requests capability link (?signdoc=<id>), and hand it to the
// recipient — copied, or emailed with the PDF attached via send-sign-request
// (mailto: fallback when that isn't configured). Gated on a signed-in,
// email-verified Universal ID: we never send documents "from" an address the
// user hasn't proven. Backend: 0041 + 0057 + the two Edge Functions.
export default function SendToSignDialog() {
  const t = useT()
  const open = usePdfStore((s) => s.sendToSignOpen)
  const setOpen = usePdfStore((s) => s.setSendToSignOpen)
  const doc = usePdfStore((s) => s.doc)
  const fileName = usePdfStore((s) => s.fileName)
  // A sign request must have at least one "Sign here" box so the signer knows
  // where to sign — gate the store step on it.
  const hasSignHereBox = useAnnotationStore((s) => s.annotations.some((a) => a.type === 'sigfield'))
  // Storing is a point of no return for redactions, exactly as export is: the
  // stored copy is the same flattened bytes, so the rasterise-and-rebuild pass
  // removes the underlying text for good. This gate used to live on the Export
  // modal's "Send to sign" button; it belongs to the destructive action, not to
  // whichever surface happens to launch it.
  const isXfa = usePdfStore((s) => s.isXfa)
  const redactCount = useAnnotationStore(
    (s) => s.annotations.filter((a) => a.type === 'redact').length
  )
  const needsRedactConfirm = !isXfa && redactCount > 0
  const [redactConfirm, setRedactConfirm] = useState('')
  const redactConfirmed = !needsRedactConfirm || redactConfirm.trim().toLowerCase() === 'redact'

  const { supabase, session, activeOrgId } = useUniversal()
  const { user } = useUser()
  const { credits, refresh: refreshCredits } = useCredits()
  const { status: freeToken, refresh: refreshFreeToken } = useAppFreeToken('pdf')
  const { requests, loading: listLoading, refresh: refreshList } = useSignRequests()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signInOpen, setSignInOpen] = useState(false)
  const [verifyInfo, setVerifyInfo] = useState<string | null>(null)
  // The request minted in this dialog session. Two parties: the recipient link
  // is copied/emailed out; the requester link is the sender's own "Sign your
  // part" (either-order counter-signing). certId → the public certificate page.
  const [minted, setMinted] = useState<{
    id: string; certId: string | null; recipientLink: string; requesterLink: string | null; docName: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'mailto'>('idle')

  // ⚠️ WHO CAN OPEN THE DOCUMENT — the one choice on this dialog that changes
  // what the link is. Unprotected, the party token is a BEARER credential:
  // whoever holds the URL is the signer, so a forwarded email signs the
  // contract. Protected, the recipient has to prove they can read the address
  // it was addressed to before the document exists for them at all.
  //
  // Not labelled "secure" / "non-secure". The property is what the sender needs
  // to weigh, and a grade invites them to pick the flattering one without
  // reading. Migration 0131 has the threat model.
  const [protect, setProtect] = useState(false)
  // Generated, never typed. See `generateAccessPin` — the sender is shown it
  // once here and has to pass it on by phone; only its hash is stored, so it
  // cannot be looked up again afterwards.
  const [usePin, setUsePin] = useState(false)
  const [pin, setPin] = useState<string | null>(null)
  // The address baked into a protected request at mint time, lower-cased. Null
  // for an unprotected one, where the address is free to change.
  const [normalizedEmailAtMint, setNormalizedEmailAtMint] = useState<string | null>(null)

  if (!open) return null

  const signedIn = !!session?.user && session.user.is_anonymous !== true
  const emailVerified = !!session?.user?.email_confirmed_at
  const tokens = credits ?? 0
  const canStore = freeToken === 'available' || tokens > 0

  function close() {
    setOpen(false)
    setError(null)
    setVerifyInfo(null)
    setMinted(null)
    setCopied(false)
    setEmail('')
    setEmailState('idle')
    setRedactConfirm('')
    setProtect(false)
    setUsePin(false)
    setPin(null)
    setNormalizedEmailAtMint(null)
  }

  // ── Email-verification gate ──
  async function onResendConfirmation() {
    if (!user?.email || busy) return
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email: user.email })
      setVerifyInfo(err ? err.message : t('sign.send_confirmation_resent', { email: user.email }))
    } finally {
      setBusy(false)
    }
  }

  async function onRecheckVerified() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // The confirmation link lands on the hub; pull a fresh session here so
      // email_confirmed_at updates without a reload.
      await supabase.auth.refreshSession()
      const { data } = await supabase.auth.getUser()
      if (!data.user?.email_confirmed_at) {
        setVerifyInfo(t('sign.send_not_verified'))
      } else {
        setVerifyInfo(null)
      }
    } finally {
      setBusy(false)
    }
  }

  // ── Store + mint the link ──
  async function onCreateLink() {
    if (!doc || !activeOrgId || busy) return
    // ⚠️ The stored address is the ONE thing the gate compares against, so a
    // protected request cannot be minted without it. Filling it in later is not
    // an option worth offering: it has to be right before the link exists.
    if (protect && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('sign.send_protect_needs_email'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const stored = await storeCurrentPdf(supabase, activeOrgId)
      if (!stored.ok || !stored.uploadId) {
        setError(
          stored.error === 'no_credits'
            ? (isNativeShell() ? t('sign.no_tokens_left') : t('sign.send_no_tokens_get_more'))
            : stored.error ?? t('sign.could_not_store'),
        )
        return
      }
      const req = await createSignRequest(supabase, {
        orgId: activeOrgId,
        uploadId: stored.uploadId,
        docName: stored.fileName ?? fileName ?? 'document.pdf',
        requesterEmail: user?.email ?? '',
        recipientEmail: email.trim() || undefined,
      })
      if (!req.ok || !req.requestId) {
        setError(req.error ?? t('sign.send_could_not_create'))
        return
      }
      // ⚠️ Applied BEFORE the link is shown, and a failure here abandons the
      // whole request rather than handing over an unprotected link the sender
      // believes is protected. That silent downgrade is the worst thing this
      // dialog could do.
      let mintedPin: string | null = null
      if (protect) {
        mintedPin = usePin ? generateAccessPin() : null
        const applied = await applySignRequestProtection(supabase, req.requestId, {
          requireVerification: true,
          pin: mintedPin,
        })
        if (!applied.ok) {
          setError(t('sign.send_could_not_protect', { error: applied.error ?? t('sign.send_unknown_error') }))
          return
        }
      }
      setPin(mintedPin)
      setNormalizedEmailAtMint(protect ? email.trim().toLowerCase() : null)

      const recipient = req.parties?.find((p) => p.role === 'recipient')
      const requester = req.parties?.find((p) => p.role === 'requester')
      setMinted({
        id: req.requestId,
        certId: req.certId ?? null,
        recipientLink: signRequestLink(recipient?.token ?? ''),
        requesterLink: requester ? signRequestLink(requester.token) : null,
        docName: stored.fileName ?? 'document.pdf',
      })
      refreshCredits()
      refreshFreeToken()
      refreshList()
    } finally {
      setBusy(false)
    }
  }

  async function onCopyLink() {
    if (!minted) return
    try {
      await navigator.clipboard.writeText(minted.recipientLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError(t('sign.send_could_not_copy'))
    }
  }

  // ── Email it ──
  async function onSendEmail() {
    if (!minted || busy) return
    const to = email.trim()
    // ⚠️ On a protected request the stored address is what the gate compares
    // against, and it was fixed when the link was minted. Emailing it somewhere
    // else would send a link its recipient can never open — a silent dead end
    // that looks exactly like a broken link.
    if (protect && normalizedEmailAtMint && to.toLowerCase() !== normalizedEmailAtMint) {
      setError(t('sign.send_locked_to', { email: normalizedEmailAtMint }))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError(t('sign.send_invalid_email'))
      return
    }
    setBusy(true)
    setError(null)
    setEmailState('sending')
    try {
      // Record who it went to (best-effort), then send with the PDF attached.
      updateSignRequestRecipient(supabase, minted.id, to).catch(() => {})
      // ⚠️ NO ATTACHMENT ON A PROTECTED REQUEST, and this is the line that
      // makes the protection mean anything. The whole point is that the
      // document does not open until the recipient proves the address is
      // theirs; attaching the same PDF to the same email hands it over
      // unconditionally to anyone the message is forwarded to, gate or no gate.
      let bytes: Uint8Array | undefined
      if (protect) {
        bytes = undefined
      } else {
        try {
          bytes = (await currentPdfBytes()).bytes
        } catch {
          bytes = undefined // attachment is a bonus; the link is the substance
        }
      }
      const res = await sendSignRequestEmail(supabase, {
        to,
        link: minted.recipientLink,
        docName: minted.docName,
        senderName: user?.email ?? undefined,
        bytes,
      })
      if (res.ok) {
        setEmailState('sent')
        refreshList()
      } else if (res.code === 'not_configured') {
        // No email provider on the server — open a prefilled draft instead.
        window.location.href = signRequestMailto({ to, docName: minted.docName, link: minted.recipientLink })
        setEmailState('mailto')
      } else {
        setEmailState('idle')
        setError(res.error ?? t('sign.send_could_not_email'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(req: SignRequest) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await deleteSignRequest(supabase, req.id)
      if (!res.ok) setError(res.error ?? t('sign.send_could_not_revoke'))
      else {
        if (minted?.id === req.id) setMinted(null)
        refreshList()
      }
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      {/* ⚠️ One box that scrolls would take the title and the Close button with
          it. This is a flex column capped at the viewport instead, with the
          title row pinned OUTSIDE the scrolling body.
          `max-h-[min(100%,100dvh)]`: 100% is the overlay's content box and
          100dvh shrinks with iOS's browser chrome, so min() takes whichever is
          actually visible — a `vh` cap does not, because `vh` is the LARGE
          viewport on iOS. */}
      <div className="flex w-full max-w-lg max-h-[min(100%,100dvh)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">{t('sign.send_to_sign')}</h2>
          <button onClick={close} aria-label={t('sign.close')} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-xs text-slate-500">
            {t('sign.send_intro')}
          </p>
          <p className="text-[11px] text-slate-400">
            {t('sign.send_legal')}
          </p>

          {!signedIn ? (
            /* ── Step 0: create / sign in with a Universal ID ── */
            <div className="rounded-xl border border-orange-200 bg-white p-4">
              <p className="text-sm text-slate-700">
                {t.rich('sign.send_needs_id', { id: <strong>Universal ID</strong> })}
              </p>
              <button
                type="button"
                onClick={() => setSignInOpen(true)}
                className="mt-3 inline-flex rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800"
              >
                {t('sign.send_create_id')}
              </button>
              <SignInDialog
                open={signInOpen}
                onClose={() => setSignInOpen(false)}
                hubLoginHref={HUB_LOGIN_URL}
                initialMode="signup"
              />
            </div>
          ) : !emailVerified ? (
            /* ── Verification gate: never send documents from an unproven address ── */
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">{t('sign.send_verify_title')}</p>
              <p className="mt-1 text-xs text-amber-800">
                {t.rich('sign.send_verify_body', { email: <strong>{user?.email}</strong> })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onResendConfirmation}
                  disabled={busy}
                  className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {t('sign.send_resend')}
                </button>
                <button
                  type="button"
                  onClick={onRecheckVerified}
                  disabled={busy}
                  className="rounded-lg border border-amber-300 px-3.5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {t('sign.send_recheck')}
                </button>
              </div>
              {verifyInfo && <p className="mt-2 text-xs text-amber-800">{verifyInfo}</p>}
            </div>
          ) : (
            <>
              {/* ── Step 1: store + mint the link ── */}
              <div className="rounded-xl border border-orange-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{t('sign.send_step1')}</span>
                  {freeToken === 'available'
                    ? <Chip size="sm">{t('sign.send_free_token')}</Chip>
                    : <ValueChip size="sm" label={tokens}>{t.plural('sign.send_tokens_unit', tokens)}</ValueChip>}
                </div>

                {!doc ? (
                  <p className="mt-2 text-xs text-slate-500">{t('sign.send_open_pdf_first')}</p>
                ) : !minted && !hasSignHereBox ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-900">{t('sign.send_add_box_first')}</p>
                    <p className="mt-1 text-xs text-amber-800">
                      {t.rich('sign.send_add_box_body', {
                        menu: <strong>{t('sign.menu_sign')} ▾</strong>,
                        item: <strong>{t('sign.menu_place_box')}</strong>,
                      })}
                    </p>
                  </div>
                ) : minted ? (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500">
                      {protect
                        ? t.rich('sign.send_only_recipient', { email: <strong>{email.trim()}</strong>, doc: <strong>{minted.docName}</strong> })
                        : t.rich('sign.send_anyone', { doc: <strong>{minted.docName}</strong> })}
                    </p>

                    {/* ⚠️ SHOWN ONCE AND NEVER AGAIN. Only a salted hash is
                        stored, so this dialog is the only place this PIN will
                        ever exist — reopening the request cannot bring it back.
                        Said plainly, because a sender who assumes they can look
                        it up later locks their own recipient out. */}
                    {pin && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-medium text-amber-900">
                          {t('sign.send_pin_title')}
                        </p>
                        <div className="mt-1.5 text-2xl font-bold tracking-[0.3em] text-amber-900 tabular-nums">{pin}</div>
                        <p className="mt-1.5 text-xs text-amber-800">
                          {t('sign.send_pin_body')}
                        </p>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        readOnly
                        value={minted.recipientLink}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs text-slate-700"
                      />
                      <button
                        type="button"
                        onClick={onCopyLink}
                        className="shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-black"
                      >
                        {copied ? t('sign.send_copied') : t('sign.send_copy_link')}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {minted.requesterLink && (
                        <a
                          href={minted.requesterLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-800"
                        >
                          {t('sign.send_sign_your_part')}
                        </a>
                      )}
                      {minted.certId && (
                        <a
                          href={certLink(minted.certId)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                        >
                          {t('sign.send_view_cert')}
                        </a>
                      )}
                    </div>
                  </div>
                ) : canStore ? (
                  <>
                  {needsRedactConfirm && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm font-medium text-red-900">
                        {t.plural('sign.send_redactions', redactCount)}
                      </p>
                      <p className="mt-1 text-xs text-red-800">
                        {t.rich('sign.send_redact_body', { word: <strong>REDACT</strong> })}
                      </p>
                      <input
                        value={redactConfirm}
                        onChange={(e) => setRedactConfirm(e.target.value)}
                        placeholder="REDACT"
                        className="mt-2 w-full rounded-lg border border-red-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                    </div>
                  )}
                  {/* ⚠️ WHO CAN OPEN IT — asked BEFORE the link is minted,
                      because the answer is baked into the request row and there
                      is no member-facing way to change it afterwards. */}
                  <div className="mt-3 rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t('sign.send_who_can_open')}
                    </div>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="radio"
                        name="sign-protect"
                        checked={!protect}
                        onChange={() => setProtect(false)}
                        disabled={busy}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-orange-700"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-900">{t('sign.send_anyone_label')}</span>
                        <span className="block text-xs text-slate-500">
                          {t('sign.send_anyone_hint')}
                        </span>
                      </span>
                    </label>
                    <label className="mt-2.5 flex cursor-pointer items-start gap-2.5">
                      <input
                        type="radio"
                        name="sign-protect"
                        checked={protect}
                        onChange={() => setProtect(true)}
                        disabled={busy}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-orange-700"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-900">{t('sign.send_only_label')}</span>
                        <span className="block text-xs text-slate-500">
                          {t('sign.send_only_hint')}
                        </span>
                      </span>
                    </label>

                    {protect && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <label className="block text-xs font-medium text-slate-700" htmlFor="sign-recipient">
                          {t('sign.send_recipient_email')}
                        </label>
                        <input
                          id="sign-recipient"
                          type="email"
                          inputMode="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={busy}
                          placeholder="signer@example.com"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-orange-700 focus:outline-none focus:ring-1 focus:ring-orange-700"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          {t('sign.send_code_always_here')}
                        </p>

                        <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={usePin}
                            onChange={(e) => setUsePin(e.target.checked)}
                            disabled={busy}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-orange-700"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-slate-900">{t('sign.send_also_pin')}</span>
                            {/* The email code proves somebody can read that
                                mailbox. Only a secret that never travels by
                                email covers the mailbox itself being read by
                                someone else. */}
                            <span className="block text-xs text-slate-500">
                              {t('sign.send_also_pin_hint')}
                            </span>
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onCreateLink}
                    disabled={busy || !redactConfirmed}
                    className="mt-3 w-full rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? t('sign.send_storing') : freeToken === 'available' ? t('sign.send_store_create') : t('sign.send_store_create_token')}
                  </button>
                  </>
                ) : freeToken === null ? null : (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      {freeToken === 'held'
                        ? (isNativeShell() ? t('sign.send_token_held_native') : t('sign.send_token_held'))
                        : t('sign.no_tokens_left')}
                    </p>
                    {!isNativeShell() && (
                      <a href={GET_TOKENS_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg bg-orange-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-800">
                        {t('sign.get_tokens')}
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* ── Step 2: email it ── */}
              <div className={`rounded-xl border p-4 ${minted ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                <span className="text-sm font-semibold text-slate-900">{t('sign.send_step2')}</span>
                <p className="mt-1 text-xs text-slate-500">
                  {t('sign.send_step2_hint')}
                </p>
                {emailState === 'sent' ? (
                  <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    {t('sign.send_sent_to', { to: email.trim(), email: user?.email ?? '' })}
                  </p>
                ) : emailState === 'mailto' ? (
                  <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    {t('sign.send_mailto')}
                  </p>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="signer@example.com"
                      disabled={!minted}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      onClick={onSendEmail}
                      disabled={!minted || busy || !email.trim()}
                      className="shrink-0 rounded-lg bg-orange-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
                    >
                      {emailState === 'sending' ? t('sign.sending') : t('sign.send_send')}
                    </button>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              {/* ── The sender's requests ── */}
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{t('sign.send_your_requests')}</p>
                {listLoading ? (
                  <p className="text-xs text-slate-400">{t('sign.loading')}</p>
                ) : requests.length === 0 ? (
                  <p className="text-xs text-slate-400">{t('sign.none_yet')}</p>
                ) : (
                  <ul className="space-y-2">
                    {requests.map((r) => {
                      const ui = STATUS_UI[r.status] ?? STATUS_UI.pending
                      const done = r.status === 'completed' || r.status === 'signed'
                      return (
                        <li key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-slate-700">{r.doc_name || 'document.pdf'}</span>
                            <span className="block text-[10px] text-slate-400">
                              {r.recipient_email ? `${t('sign.send_to_recipient', { email: r.recipient_email })} · ` : ''}{new Date(r.created_at).toLocaleDateString(intlLocale(t.lang))}
                            </span>
                          </span>
                          {ui.tone
                            ? <ValueChip size="sm" tone={ui.tone} className="shrink-0">{t(ui.label)}</ValueChip>
                            : <Chip size="sm" className="shrink-0">{t(ui.label)}</Chip>}
                          {r.cert_id && (
                            <a
                              href={certLink(r.cert_id)}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
                              title={t('sign.send_cert_title')}
                            >
                              {t('sign.send_certificate')}
                            </a>
                          )}
                          {!done && (
                            <button
                              onClick={() => onRevoke(r)}
                              disabled={busy}
                              className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-600 disabled:opacity-50"
                              title={t('sign.send_revoke_title')}
                            >
                              {t('sign.send_revoke')}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
