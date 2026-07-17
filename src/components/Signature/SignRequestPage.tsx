import { useEffect, useRef, useState } from 'react'
import { useUniversal } from '@unisim/sdk'
import App from '../../App'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { currentPdfBytes } from '../../lib/hostedStore'
import { downloadPdfBytes } from '../../lib/export'
import { loadSignRequest, submitSignedPdf, certLink } from '../../lib/signRequestClient'

/**
 * Recipient side of "Send to sign" (opened via `?signdoc=<token>` from the
 * sender's link/email). Loads the sender's stored PDF into the normal editor —
 * embedded "Sign here" boxes rehydrate automatically (loadFile →
 * readEmbeddedSigFields) — under a banner explaining what's being asked.
 * "Finish & send back" flattens the recipient's work and files it to the
 * sender via the pdf-sign-request Edge Function; no account needed.
 */
export default function SignRequestPage({ token }: { token: string }) {
  const { supabase } = useUniversal()
  const loadFile = usePdfStore((s) => s.loadFile)
  const doc = usePdfStore((s) => s.doc)

  const [phase, setPhase] = useState<'loading' | 'ready' | 'submitting' | 'done' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [docName, setDocName] = useState<string>('document.pdf')
  const [banner, setBanner] = useState(true)
  const [signedCopy, setSignedCopy] = useState<Uint8Array | null>(null)
  const [outcome, setOutcome] = useState<{ completed: boolean; certId: string | null }>({ completed: false, certId: null })
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return // StrictMode double-mount guard
    startedRef.current = true
    ;(async () => {
      const res = await loadSignRequest(supabase, token)
      if (!res.ok || !res.signedUrl) {
        setError(
          res.code === 'expired' ? 'This signing link has expired. Ask the sender for a fresh one.'
          : res.code === 'already_signed' ? 'You have already signed this document — nothing left to do.'
          : res.code === 'completed' ? 'This document is now fully signed by everyone — nothing left to do.'
          : res.code === 'deleted' ? 'The sender has removed this document, so it can no longer be signed.'
          : res.error ?? 'This signing link is invalid.',
        )
        setPhase('error')
        return
      }
      try {
        const pdfRes = await fetch(res.signedUrl)
        if (!pdfRes.ok) throw new Error(`Could not download the document (${pdfRes.status}).`)
        const blob = await pdfRes.blob()
        const name = res.docName ?? 'document.pdf'
        setDocName(name)
        await loadFile(new File([blob], name, { type: 'application/pdf' }))
        setPhase('ready')
      } catch (e) {
        setError((e as Error).message)
        setPhase('error')
      }
    })()
  }, [supabase, token, loadFile])

  async function onSubmit() {
    if (phase !== 'ready') return
    // Nudge rather than block: signing is the point, but the sender may only
    // want a tick or a date — so confirm instead of refusing.
    const anns = useAnnotationStore.getState().annotations
    const signedBoxes = anns.filter((a) => a.type === 'sigfield' && a.signed).length
    const hasWork = anns.some((a) => a.type !== 'sigfield') || signedBoxes > 0
    if (!hasWork && !window.confirm('You haven’t signed or added anything yet. Send it back as-is?')) return

    setPhase('submitting')
    setError(null)
    try {
      const { bytes } = await currentPdfBytes()
      // Send the structured annotation set too, so the server can classify what
      // was added (signature vs other edits) into the provenance log.
      const res = await submitSignedPdf(supabase, token, bytes, anns)
      if (!res.ok) {
        setError(res.code === 'already_signed'
          ? 'You have already signed this document.'
          : res.code === 'completed'
            ? 'This document is already fully signed by everyone.'
            : res.error ?? 'Could not send the signed document back.')
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
    if (!signedCopy) return
    downloadPdfBytes(signedCopy.slice(), docName.replace(/\.pdf$/i, '') + '-signed.pdf')
  }

  // ── Terminal states get a clean full-screen card instead of the editor ──
  if (phase === 'error' && !doc) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">🔏</div>
        <h1 className="text-lg font-semibold text-slate-900">Can't open this document</h1>
        <p className="max-w-sm text-sm text-slate-500">{error}</p>
        <a href={import.meta.env.BASE_URL} className="mt-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
          Open Universal PDF
        </a>
      </main>
    )
  }

  if (phase === 'done') {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600/20 text-3xl">✓</div>
        <h1 className="text-lg font-semibold">{outcome.completed ? 'Fully signed' : 'Your signature is in'}</h1>
        <p className="max-w-sm text-sm text-slate-400">
          {outcome.completed ? (
            <>Every party has now signed <strong className="text-slate-200">{docName}</strong> — everyone's been notified.</>
          ) : (
            <>Your signature on <strong className="text-slate-200">{docName}</strong> is recorded. It now goes to the other party to counter-sign; everyone's notified once it's complete.</>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={downloadCopy}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold hover:bg-orange-500"
          >
            Download your copy
          </button>
          {outcome.certId && (
            <a href={certLink(outcome.certId)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">
              View the certificate
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
            Loading document…
          </div>
        </div>
      )}

      {(phase === 'ready' || phase === 'submitting') && banner && (
        /* bottom-20 clears the mobile tool bar; md+ floats bottom-right. */
        <div className="fixed inset-x-3 bottom-20 z-[60] md:inset-x-auto md:bottom-4 md:right-4 md:w-[380px]">
          <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">You've been asked to sign</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{docName}</p>
              </div>
              <button
                type="button"
                onClick={() => setBanner(false)}
                aria-label="Hide"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Tap a <strong>Sign here</strong> box (or use the Sign tool) to add your signature, then send it back.
            </p>
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
            <button
              type="button"
              onClick={onSubmit}
              disabled={phase === 'submitting'}
              className="mt-3 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {phase === 'submitting' ? 'Sending back…' : 'Finish & send back to sender'}
            </button>
          </div>
        </div>
      )}

      {(phase === 'ready' || phase === 'submitting') && !banner && (
        <button
          type="button"
          onClick={() => setBanner(true)}
          className="fixed bottom-20 right-3 z-[60] rounded-full bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl hover:bg-orange-700 md:bottom-4 md:right-4"
        >
          Finish signing →
        </button>
      )}
    </>
  )
}
