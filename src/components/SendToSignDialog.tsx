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
  type SignRequest,
} from '@unisim/sdk'
import { usePdfStore } from '../stores/pdfStore'
import { storeCurrentPdf, currentPdfBytes, openSignedCopy } from '../lib/hostedStore'
import {
  signRequestLink,
  sendSignRequestEmail,
  signRequestMailto,
} from '../lib/signRequestClient'

const HUB_LOGIN_URL = 'https://app.unisim.co.uk/login'
const GET_TOKENS_URL = 'https://www.unisim.co.uk/subscription.html'

// Export → "Send to sign": store the current PDF online (one token — the free
// app token first, returned when the stored file is deleted), mint a
// pdf_sign_requests capability link (?signdoc=<id>), and hand it to the
// recipient — copied, or emailed with the PDF attached via send-sign-request
// (mailto: fallback when that isn't configured). Gated on a signed-in,
// email-verified Universal ID: we never send documents "from" an address the
// user hasn't proven. Backend: 0041 + 0057 + the two Edge Functions.
export default function SendToSignDialog() {
  const open = usePdfStore((s) => s.sendToSignOpen)
  const setOpen = usePdfStore((s) => s.setSendToSignOpen)
  const doc = usePdfStore((s) => s.doc)
  const fileName = usePdfStore((s) => s.fileName)

  const { supabase, session, activeOrgId } = useUniversal()
  const { user } = useUser()
  const { credits, refresh: refreshCredits } = useCredits()
  const { status: freeToken, refresh: refreshFreeToken } = useAppFreeToken('pdf')
  const { requests, loading: listLoading, refresh: refreshList } = useSignRequests()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signInOpen, setSignInOpen] = useState(false)
  const [verifyInfo, setVerifyInfo] = useState<string | null>(null)
  // The request minted in this dialog session — the link + email step target it.
  const [minted, setMinted] = useState<{ id: string; link: string; docName: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'mailto'>('idle')

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
  }

  // ── Email-verification gate ──
  async function onResendConfirmation() {
    if (!user?.email || busy) return
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email: user.email })
      setVerifyInfo(err ? err.message : `Confirmation email re-sent to ${user.email}.`)
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
        setVerifyInfo('Not verified yet — click the link in your email first.')
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
    setBusy(true)
    setError(null)
    try {
      const stored = await storeCurrentPdf(supabase, activeOrgId)
      if (!stored.ok || !stored.uploadId) {
        setError(
          stored.error === 'no_credits'
            ? 'You have no tokens left. Get more to store this PDF online for signing.'
            : stored.error ?? 'Could not store this PDF.',
        )
        return
      }
      const req = await createSignRequest(supabase, {
        orgId: activeOrgId,
        uploadId: stored.uploadId,
        docName: stored.fileName ?? fileName ?? 'document.pdf',
        senderEmail: user?.email ?? undefined,
      })
      if (!req.ok || !req.id) {
        setError(req.error ?? 'Could not create the signing link.')
        return
      }
      setMinted({ id: req.id, link: signRequestLink(req.id), docName: stored.fileName ?? 'document.pdf' })
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
      await navigator.clipboard.writeText(minted.link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Could not copy — select the link text and copy it manually.')
    }
  }

  // ── Email it ──
  async function onSendEmail() {
    if (!minted || busy) return
    const to = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError('Enter a valid email address.')
      return
    }
    setBusy(true)
    setError(null)
    setEmailState('sending')
    try {
      // Record who it went to (best-effort), then send with the PDF attached.
      updateSignRequestRecipient(supabase, minted.id, to).catch(() => {})
      let bytes: Uint8Array | undefined
      try {
        bytes = (await currentPdfBytes()).bytes
      } catch {
        bytes = undefined // attachment is a bonus; the link is the substance
      }
      const res = await sendSignRequestEmail(supabase, {
        to,
        link: minted.link,
        docName: minted.docName,
        senderName: user?.email ?? undefined,
        bytes,
      })
      if (res.ok) {
        setEmailState('sent')
        refreshList()
      } else if (res.code === 'not_configured') {
        // No email provider on the server — open a prefilled draft instead.
        window.location.href = signRequestMailto({ to, docName: minted.docName, link: minted.link })
        setEmailState('mailto')
      } else {
        setEmailState('idle')
        setError(res.error ?? 'Could not send the email.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function onOpenSigned(req: SignRequest) {
    if (busy || !req.signed_storage_path) return
    setBusy(true)
    setError(null)
    try {
      await openSignedCopy(supabase, req.signed_storage_path, req.doc_name)
      close()
    } catch (e) {
      setError((e as Error).message)
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
      if (!res.ok) setError(res.error ?? 'Could not revoke the link.')
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Send to sign</h2>
          <button onClick={close} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-xs text-slate-500">
            Store this PDF online and get a link that opens it ready to sign — no account needed on their side.
            The stored copy uses your free PDF token (or one purchased token) and the token comes back when you delete it.
          </p>

          {!signedIn ? (
            /* ── Step 0: create / sign in with a Universal ID ── */
            <div className="rounded-xl border border-orange-200 bg-white p-4">
              <p className="text-sm text-slate-700">
                Sending for signature needs a free <strong>Universal ID</strong> — it keeps the document in your account and tells you when it's been signed.
              </p>
              <button
                type="button"
                onClick={() => setSignInOpen(true)}
                className="mt-3 inline-flex rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Create a free Universal ID →
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
              <p className="text-sm font-semibold text-amber-900">Verify your email to send for signature</p>
              <p className="mt-1 text-xs text-amber-800">
                We emailed a confirmation link to <strong>{user?.email}</strong>. Documents are sent in your name, so your address must be verified first.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onResendConfirmation}
                  disabled={busy}
                  className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Resend confirmation email
                </button>
                <button
                  type="button"
                  onClick={onRecheckVerified}
                  disabled={busy}
                  className="rounded-lg border border-amber-300 px-3.5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  I've verified — check again
                </button>
              </div>
              {verifyInfo && <p className="mt-2 text-xs text-amber-800">{verifyInfo}</p>}
            </div>
          ) : (
            <>
              {/* ── Step 1: store + mint the link ── */}
              <div className="rounded-xl border border-orange-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">1 · Save online &amp; create the link</span>
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                    {freeToken === 'available' ? 'Free token' : `${tokens} token${tokens === 1 ? '' : 's'}`}
                  </span>
                </div>

                {!doc ? (
                  <p className="mt-2 text-xs text-slate-500">Open a PDF first.</p>
                ) : minted ? (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500">Anyone with this link can open and sign <strong>{minted.docName}</strong> (expires in 30 days, or when you delete the stored copy):</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        readOnly
                        value={minted.link}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs text-slate-700"
                      />
                      <button
                        type="button"
                        onClick={onCopyLink}
                        className="shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-black"
                      >
                        {copied ? '✓ Copied' : 'Copy link'}
                      </button>
                    </div>
                  </div>
                ) : canStore ? (
                  <button
                    type="button"
                    onClick={onCreateLink}
                    disabled={busy}
                    className="mt-3 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {busy ? 'Storing…' : 'Store online & create sign link (1 token)'}
                  </button>
                ) : freeToken === null ? null : (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      {freeToken === 'held'
                        ? 'Your free PDF token is in use — delete the stored PDF (Actions → Back up / store) to get it back, or add tokens.'
                        : 'You have no tokens left.'}
                    </p>
                    <a href={GET_TOKENS_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                      Get tokens →
                    </a>
                  </div>
                )}
              </div>

              {/* ── Step 2: email it ── */}
              <div className={`rounded-xl border p-4 ${minted ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                <span className="text-sm font-semibold text-slate-900">2 · Email it to someone</span>
                <p className="mt-1 text-xs text-slate-500">
                  They'll get the PDF attached plus a button to sign it online. You'll be emailed when it's signed.
                </p>
                {emailState === 'sent' ? (
                  <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    ✓ Sent to {email.trim()} — we'll email you at {user?.email} once it's signed.
                  </p>
                ) : emailState === 'mailto' ? (
                  <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    Opened a draft in your email app with the signing link — send it from there.
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
                      className="shrink-0 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      {emailState === 'sending' ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              {/* ── The sender's requests ── */}
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Your sign requests</p>
                {listLoading ? (
                  <p className="text-xs text-slate-400">Loading…</p>
                ) : requests.length === 0 ? (
                  <p className="text-xs text-slate-400">None yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {requests.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-slate-700">{r.doc_name || 'document.pdf'}</span>
                          <span className="block text-[10px] text-slate-400">
                            {r.recipient_email ? `to ${r.recipient_email} · ` : ''}{new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </span>
                        {r.status === 'signed' ? (
                          <>
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Signed</span>
                            <button
                              onClick={() => onOpenSigned(r)}
                              disabled={busy}
                              className="shrink-0 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                            >
                              Open
                            </button>
                          </>
                        ) : (
                          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Pending</span>
                        )}
                        {r.status === 'pending' && (
                          <button
                            onClick={() => onRevoke(r)}
                            disabled={busy}
                            className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-600 disabled:opacity-50"
                            title="Revoke this signing link"
                          >
                            Revoke
                          </button>
                        )}
                      </li>
                    ))}
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
