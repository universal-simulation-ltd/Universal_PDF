import { useCallback, useEffect, useRef, useState } from 'react'
import { useUniversal } from '@unisim/sdk'
import App from '../../App'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { currentPdfBytes } from '../../lib/hostedStore'
import { downloadPdfBytes } from '../../lib/download'
import { beginSignRequest, loadSignRequest, submitSignedPdf, certLink, queueSubmitter } from '../../lib/signRequestClient'
import {
  cacheSignDoc,
  enqueueSubmission,
  getCachedSignDoc,
  getQueued,
  isOffline,
  removeQueued,
  sendQueued,
  sha256Hex,
  type QueuedSubmission,
} from '../../lib/signQueue'
import SignRequestGate from './SignRequestGate'
import { useT } from '../../i18n'

/**
 * Recipient side of "Send to sign" (opened via `?signdoc=<token>` from the
 * sender's link/email). Loads the sender's stored PDF into the normal editor —
 * embedded "Sign here" boxes rehydrate automatically (loadFile →
 * readEmbeddedSigFields) — under a banner explaining what's being asked.
 * "Finish & send back" flattens the recipient's work and files it to the
 * sender via the pdf-sign-request Edge Function; no account needed.
 *
 * OFFLINE (2026-10-04). In the installed web app a signer can do all of it
 * without a connection: a request opened once before opens from this device
 * (`lib/signQueue.ts` — unprotected requests only), and "Finish & send back"
 * with no connection keeps the signed copy here (`queued`) and sends it the
 * moment the device is back online. Every submission carries the hash of the
 * version it was signed on, so one that waited while somebody else signed is
 * refused (`stale`) instead of erasing their signature.
 */
export default function SignRequestPage({ token }: { token: string }) {
  const t = useT()
  const { supabase } = useUniversal()
  const loadFile = usePdfStore((s) => s.loadFile)
  const doc = usePdfStore((s) => s.doc)

  // 'gate' = a protected link waiting on the recipient to prove the email
  // address it was sent to is theirs. See SignRequestGate.
  // 'queued' = signed and waiting on this device for a connection (or for the
  // signer to verify / reopen — see `queued.state`).
  const [phase, setPhase] = useState<'loading' | 'gate' | 'ready' | 'submitting' | 'queued' | 'done' | 'error'>('loading')
  const [queued, setQueued] = useState<QueuedSubmission | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  // The hash of the version on screen — sent with the submit (stale guard).
  const [baseSha, setBaseSha] = useState<string | null>(null)
  // True when the document came from this device because there was no
  // connection: the banner says signing will be sent later.
  const [offlineCopy, setOfflineCopy] = useState(false)
  const [gate, setGate] = useState<{ docName: string; maskedEmail: string | null; hasPin: boolean } | null>(null)
  // ⚠️ Held in React state only — deliberately NOT in localStorage or the URL.
  // It is a bearer credential for this document, and the whole point of the
  // gate is that possession of a link is not enough; leaving the session behind
  // on a shared machine would reintroduce exactly that.
  const [session, setSession] = useState<string | undefined>(undefined)
  // ⚠️ A session that expires WHILE somebody is signing must not cost them the
  // signature. This re-opens the gate as an overlay over the editor rather than
  // sending them back through `openDocument`, which would reload the PDF and
  // wipe every annotation they had just placed.
  const [reverify, setReverify] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [docName, setDocName] = useState<string>('document.pdf')
  const [banner, setBanner] = useState(true)
  const [signedCopy, setSignedCopy] = useState<Uint8Array | null>(null)
  const [outcome, setOutcome] = useState<{ completed: boolean; certId: string | null }>({ completed: false, certId: null })
  const startedRef = useRef(false)
  // Live connection state, for the banner.
  const [online, setOnline] = useState(() => !isOffline())
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  useEffect(() => {
    if (startedRef.current) return // StrictMode double-mount guard
    startedRef.current = true
    ;(async () => {
      // A signed copy already waiting on this device: show that, never the
      // editor again (a second signature would only be refused).
      const waiting = await getQueued(token)
      // ⚠️ `begin` first, always. It returns no document and no signed URL, so
      // a link scanner that fetches the URL learns nothing and moves nothing —
      // and for an unprotected request it simply says so and we fall straight
      // through to the load below, exactly as before 0131.
      const pre = isOffline() ? { ok: false, network: true } as Awaited<ReturnType<typeof beginSignRequest>> : await beginSignRequest(supabase, token)
      if (pre.ok && pre.requireVerification) {
        setGate({
          docName: pre.docName ?? 'document.pdf',
          maskedEmail: pre.maskedEmail ?? null,
          hasPin: !!pre.hasPin,
        })
      }
      if (waiting) {
        setQueued(waiting)
        setDocName(waiting.docName)
        setPhase('queued')
        if (waiting.state === 'queued' && !pre.network) void trySend(waiting)
        return
      }
      if (pre.network) {
        await openFromDevice()
        return
      }
      if (pre.ok && pre.requireVerification) {
        setGate({
          docName: pre.docName ?? 'document.pdf',
          maskedEmail: pre.maskedEmail ?? null,
          hasPin: !!pre.hasPin,
        })
        setDocName(pre.docName ?? 'document.pdf')
        setPhase('gate')
        return
      }
      await openDocument(undefined)
    })()
  }, [supabase, token, loadFile])

  // No connection: open the copy this device kept the last time, if any.
  async function openFromDevice() {
    const cached = await getCachedSignDoc(token)
    if (!cached) {
      setError(t('sign.offline_not_cached'))
      setPhase('error')
      return
    }
    setDocName(cached.docName)
    setBaseSha(cached.sha256)
    setOfflineCopy(true)
    await loadFile(new File([cached.bytes], cached.docName, { type: 'application/pdf' }))
    setPhase('ready')
  }

  // Fetch + load the document. `sess` is required for a verified request and
  // ignored by the server for any other.
  async function openDocument(sess: string | undefined) {
    setPhase('loading')
    {
      const res = await loadSignRequest(supabase, token, sess)
      if (res.network && !sess) {
        await openFromDevice()
        return
      }
      if (!res.ok || !res.signedUrl) {
        setError(
          res.code === 'expired' ? t('sign.request_expired')
          : res.code === 'already_signed' ? t('sign.request_already_signed_nothing')
          : res.code === 'completed' ? t('sign.request_completed_nothing')
          : res.code === 'deleted' ? t('sign.request_deleted')
          : res.error ?? t('sign.request_invalid'),
        )
        setPhase('error')
        return
      }
      try {
        const pdfRes = await fetch(res.signedUrl)
        if (!pdfRes.ok) throw new Error(t('sign.request_download_failed', { status: pdfRes.status }))
        const blob = await pdfRes.blob()
        const name = res.docName ?? 'document.pdf'
        setDocName(name)
        const bytes = await blob.arrayBuffer()
        const sha = await sha256Hex(bytes)
        setBaseSha(sha)
        setOfflineCopy(false)
        // Kept for offline use — ⚠️ never for a request behind email
        // verification (`sess` set): see lib/signQueue.ts.
        if (!sess) void cacheSignDoc({ token, docName: name, bytes, sha256: sha, savedAt: Date.now() })
        await loadFile(new File([bytes], name, { type: 'application/pdf' }))
        setPhase('ready')
      } catch (e) {
        setError((e as Error).message)
        setPhase('error')
      }
    }
  }

  // ⚠️ `sessionOverride` exists because `setSession` has not landed yet when the
  // re-verify overlay calls straight back into this. Reading `session` from
  // state here would resubmit with the OLD, expired one and loop.
  async function onSubmit(sessionOverride?: string) {
    if (phase !== 'ready') return
    // Nudge rather than block: signing is the point, but the sender may only
    // want a tick or a date — so confirm instead of refusing.
    const anns = useAnnotationStore.getState().annotations
    const signedBoxes = anns.filter((a) => a.type === 'sigfield' && a.signed).length
    const hasWork = anns.some((a) => a.type !== 'sigfield') || signedBoxes > 0
    if (!hasWork && !window.confirm(t('sign.request_confirm_empty'))) return

    setPhase('submitting')
    setError(null)
    try {
      const { bytes } = await currentPdfBytes()
      // Only what the server classifies — the queue keeps this on the device.
      const slim = anns.map((a) => ({ type: a.type, opacity: (a as { opacity?: number }).opacity, pageIndex: a.pageIndex }))
      const keep = async (state: QueuedSubmission['state'] = 'queued', lastError?: string) => {
        const item: QueuedSubmission = {
          token, docName, bytes, annotations: slim, baseSha256: baseSha, queuedAt: Date.now(), state, lastError,
        }
        await enqueueSubmission(item)
        setQueued(item)
        setSignedCopy(bytes)
        setPhase('queued')
      }
      // No connection: keep it and send it later. Not even attempted, so a
      // flaky "online" that is really offline can't half-send it either.
      if (isOffline()) {
        await keep()
        return
      }
      // Send the structured annotation set too, so the server can classify what
      // was added (signature vs other edits) into the provenance log.
      const res = await submitSignedPdf(supabase, token, bytes, slim, sessionOverride ?? session, baseSha)
      if (!res.ok && res.network) {
        await keep()
        return
      }
      if (!res.ok && res.code === 'stale_version') {
        await keep('stale', res.error)
        return
      }
      if (!res.ok) {
        if (res.code === 'verification_expired' || res.code === 'verification_required') {
          setError(t('sign.request_verification_expired'))
          setReverify(true)
          setPhase('ready')
          return
        }
        setError(res.code === 'already_signed'
          ? t('sign.request_already_signed')
          : res.code === 'completed'
            ? t('sign.request_already_completed')
            : res.error ?? t('sign.request_could_not_send_back'))
        setPhase('ready')
        return
      }
      setSignedCopy(bytes)
      setOutcome({ completed: !!res.completed, certId: res.cert_id ?? null })
      setPhase('done')
    } catch (e) {
      setError((e as Error).message)
      setPhase('ready')
    }
  }

  function downloadCopy() {
    const copy = signedCopy ?? queued?.bytes
    if (!copy) return
    downloadPdfBytes(copy.slice(), docName.replace(/\.pdf$/i, '') + '-signed.pdf')
  }

  // Send a waiting copy. `sess` only after the signer verified by hand —
  // ⚠️ nothing here ever asks for or checks a code on its own.
  const trySend = useCallback(
    async (item: QueuedSubmission, sess?: string) => {
      setSyncing(true)
      setSyncNote(null)
      const r = await sendQueued(item, queueSubmitter(supabase), sess)
      setSyncing(false)
      if (r.result === 'sent') {
        setSignedCopy(item.bytes)
        setOutcome({ completed: r.completed, certId: r.certId })
        setQueued(null)
        setPhase('done')
        return
      }
      if (r.result === 'already') {
        setQueued(null)
        setError(t('sign.request_already_signed_nothing'))
        setPhase('error')
        return
      }
      if (r.result === 'offline') {
        setSyncNote(t('sign.offline_still_offline'))
        return
      }
      setQueued((await getQueued(token)) ?? item)
    },
    [supabase, t, token],
  )

  // Back online with a copy waiting: send it straight away.
  useEffect(() => {
    if (phase !== 'queued' || !queued || queued.state !== 'queued') return
    const onOnline = () => void trySend(queued)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [phase, queued, trySend])

  // Start again on the latest version: the stale copy goes (it can still be
  // downloaded first), and the link is opened afresh.
  async function openLatest() {
    await removeQueued(token)
    window.location.reload()
  }

  // Re-verification after an expiry mid-signature: the same gate, but reached
  // from the editor, and on success it retries the submit instead of reloading
  // the file. A QUEUED copy that needs verification comes through here too,
  // and on success sends that copy.
  if (reverify && gate && phase === 'queued' && queued) {
    return (
      <SignRequestGate
        token={token}
        docName={gate.docName}
        maskedEmail={gate.maskedEmail}
        hasPin={gate.hasPin}
        onVerified={(s) => {
          setSession(s)
          setReverify(false)
          void trySend({ ...queued, state: 'queued' }, s)
        }}
      />
    )
  }
  if (reverify && gate) {
    return (
      <SignRequestGate
        token={token}
        docName={gate.docName}
        maskedEmail={gate.maskedEmail}
        hasPin={gate.hasPin}
        onVerified={(s) => {
          setSession(s)
          setReverify(false)
          setError(null)
          void onSubmit(s)
        }}
      />
    )
  }

  if (phase === 'gate' && gate) {
    return (
      <SignRequestGate
        token={token}
        docName={gate.docName}
        maskedEmail={gate.maskedEmail}
        hasPin={gate.hasPin}
        onVerified={(s) => {
          setSession(s)
          void openDocument(s)
        }}
      />
    )
  }

  // ── Terminal states get a clean full-screen card instead of the editor ──
  if (phase === 'error' && !doc) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">🔏</div>
        <h1 className="text-lg font-semibold text-slate-900">{t('sign.request_cant_open')}</h1>
        <p className="max-w-sm text-sm text-slate-500">{error}</p>
        <a href={import.meta.env.BASE_URL} className="mt-2 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800">
          {t('sign.open_universal_pdf')}
        </a>
      </main>
    )
  }

  if (phase === 'queued' && queued) {
    const doc = <strong className="text-slate-200">{docName}</strong>
    const state = queued.state
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-white" data-sign-queued={state}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-3xl">{state === 'stale' || state === 'failed' ? '!' : '⏳'}</div>
        <h1 className="text-lg font-semibold">{t('sign.offline_queued_title')}</h1>
        <p className="max-w-sm text-sm text-slate-400">
          {state === 'stale'
            ? t.rich('sign.offline_stale', { doc })
            : state === 'needs_verification'
              ? t.rich('sign.offline_needs_verification', { doc })
              : state === 'failed'
                ? t.rich('sign.offline_failed', { doc, error: queued.lastError ?? '' })
                : t.rich('sign.offline_queued_body', { doc })}
        </p>
        {syncNote && <p className="max-w-sm text-xs text-amber-300" data-sign-sync-note>{syncNote}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {state === 'queued' && (
            <button
              type="button"
              onClick={() => void trySend(queued)}
              disabled={syncing}
              className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold hover:bg-orange-800 disabled:opacity-60"
            >
              {syncing ? t('sign.offline_sending') : t('sign.offline_send_now')}
            </button>
          )}
          {state === 'needs_verification' && gate && (
            <button
              type="button"
              onClick={() => setReverify(true)}
              className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold hover:bg-orange-800"
            >
              {t('sign.offline_confirm_send')}
            </button>
          )}
          {state === 'stale' && (
            <button
              type="button"
              onClick={() => void openLatest()}
              className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold hover:bg-orange-800"
            >
              {t('sign.offline_open_latest')}
            </button>
          )}
          <button
            type="button"
            onClick={downloadCopy}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
          >
            {t('sign.request_download_copy')}
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'done') {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600/20 text-3xl">✓</div>
        <h1 className="text-lg font-semibold">{outcome.completed ? t('sign.request_fully_signed') : t('sign.request_signature_in')}</h1>
        <p className="max-w-sm text-sm text-slate-400">
          {outcome.completed ? (
            t.rich('sign.request_done_completed', { doc: <strong className="text-slate-200">{docName}</strong> })
          ) : (
            t.rich('sign.request_done_partial', { doc: <strong className="text-slate-200">{docName}</strong> })
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={downloadCopy}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold hover:bg-orange-800"
          >
            {t('sign.request_download_copy')}
          </button>
          {outcome.certId && (
            <a href={certLink(outcome.certId)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">
              {t('sign.request_view_cert')}
            </a>
          )}
        </div>
      </main>
    )
  }

  return (
    <>
      <App />

      {phase === 'loading' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40">
          <div className="rounded-xl bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow-xl">
            {t('sign.request_loading')}
          </div>
        </div>
      )}

      {(phase === 'ready' || phase === 'submitting') && banner && (
        /* bottom-20 clears the mobile tool bar; md+ floats bottom-right. */
        <div className="fixed inset-x-3 bottom-20 z-[60] md:inset-x-auto md:bottom-4 md:right-4 md:w-[380px]">
          <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{t('sign.request_asked')}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{docName}</p>
              </div>
              <button
                type="button"
                onClick={() => setBanner(false)}
                aria-label={t('sign.request_hide')}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {t.rich('sign.request_hint', { box: <strong>{t('sign.request_sign_here')}</strong> })}
            </p>
            {(offlineCopy || !online) && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800" data-sign-offline-banner>
                {t('sign.offline_banner')}
              </p>
            )}
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
            <button
              type="button"
              onClick={() => { void onSubmit() }}
              disabled={phase === 'submitting'}
              className="mt-3 w-full rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
            >
              {phase === 'submitting' ? t('sign.request_sending_back') : t('sign.request_finish_send')}
            </button>
          </div>
        </div>
      )}

      {(phase === 'ready' || phase === 'submitting') && !banner && (
        <button
          type="button"
          onClick={() => setBanner(true)}
          className="fixed bottom-20 right-3 z-[60] rounded-full bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl hover:bg-orange-800 md:bottom-4 md:right-4"
        >
          {t('sign.request_finish_signing')}
        </button>
      )}
    </>
  )
}
