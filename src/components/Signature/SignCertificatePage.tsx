import { useEffect, useState } from 'react'
import { useUniversal, verifyPdfSignCert, ValueChip, type SignCertificate } from '@unisim/sdk'
import { certificateDownload } from '../../lib/signRequestClient'
import { useT, intlLocale, type MessageKey } from '../../i18n'

/**
 * Public tamper-evident certificate page for a signed document
 * (`?cert=<cert_id>`). Renders the signing outcome, each party's status, a
 * preview + download of the final PDF, and the timestamped provenance log
 * (date · time · actor · action · SHA-256). No account needed — reads the
 * public verify_pdf_sign_cert RPC (no storage secrets / full IP). Mirrors
 * Universal Signatures' VerifyPage.
 */
// The log stores action CODES; only their display wording is translated here,
// so the recorded (hashed) events are untouched.
const ACTION_LABEL: Record<string, MessageKey> = {
  opened: 'sign.cert_action_opened',
  signature: 'sign.cert_action_signature',
  annotation: 'sign.cert_action_annotation',
  highlight: 'sign.cert_action_highlight',
  text: 'sign.cert_action_text',
  other: 'sign.cert_action_other',
  completed: 'sign.cert_action_completed',
}

const ACTION_TONE: Record<string, string> = {
  signature: 'text-emerald-700',
  completed: 'text-emerald-700',
  annotation: 'text-amber-700',
  highlight: 'text-amber-700',
  text: 'text-amber-700',
  other: 'text-rose-700',
  opened: 'text-slate-500',
}

function shortHash(h?: string | null): string {
  return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '—'
}

function fmt(ts: string | undefined, locale: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

export default function SignCertificatePage({ certId }: { certId: string }) {
  const t = useT()
  const locale = intlLocale(t.lang)
  const { supabase } = useUniversal()
  const [cert, setCert] = useState<SignCertificate | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await verifyPdfSignCert(supabase, certId)
      if (cancelled) return
      setCert(res)
      setLoading(false)
      if (res.ok && res.bytes_available) {
        const dl = await certificateDownload(supabase, certId)
        if (!cancelled && dl.ok && dl.signedUrl) setDownloadUrl(dl.signedUrl)
      }
    })()
    return () => { cancelled = true }
  }, [supabase, certId])

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-slate-100 p-6">
        <div className="rounded-xl bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow">{t('sign.cert_loading')}</div>
      </main>
    )
  }

  if (!cert?.ok) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-3xl">🔏</div>
        <h1 className="text-lg font-semibold text-slate-900">{t('sign.cert_not_found')}</h1>
        <p className="max-w-sm text-sm text-slate-500">{t('sign.cert_not_found_body')}</p>
        <a href={import.meta.env.BASE_URL} className="mt-2 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800">{t('sign.open_universal_pdf')}</a>
      </main>
    )
  }

  const completed = cert.status === 'completed' || cert.status === 'signed'
  const parties = cert.parties ?? []
  const events = cert.events ?? []

  return (
    <main className="min-h-svh bg-slate-100 py-8 px-4">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-700">{t('sign.cert_heading')}</div>
              <h1 className="mt-1 truncate text-xl font-bold text-slate-900">{cert.doc_name ?? 'document.pdf'}</h1>
              <p className="mt-0.5 text-xs text-slate-400">{t('sign.cert_issued', { date: fmt(cert.created_at, locale) })}</p>
            </div>
            <ValueChip tone={completed ? 'good' : 'warn'} className="shrink-0">
              {completed ? t('sign.request_fully_signed') : t('sign.cert_in_progress')}
            </ValueChip>
          </div>

          {/* Parties */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {parties.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{p.role === 'requester' ? t('sign.cert_requester') : t('sign.cert_recipient')}</span>
                  <span className="block truncate text-sm text-slate-700">{p.email || '—'}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${p.status === 'signed' ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {p.status === 'signed' ? `✓ ${new Date(p.signed_at ?? '').toLocaleDateString(locale)}` : t('sign.cert_pending')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Preview + download */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">{t('sign.cert_document')}</h2>
            {downloadUrl && (
              <a href={downloadUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-orange-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-800">
                {t('sign.cert_download_pdf')}
              </a>
            )}
          </div>
          {downloadUrl ? (
            <iframe title={t('sign.cert_iframe_title')} src={downloadUrl} className="mt-3 h-[460px] w-full rounded-lg border border-slate-200" />
          ) : (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {t('sign.cert_copy_removed')}
            </p>
          )}
        </div>

        {/* Provenance log */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">{t('sign.cert_activity_log')}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{t('sign.cert_activity_hint')}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">{t('sign.cert_col_when')}</th>
                  <th className="py-2 pr-3">{t('sign.cert_col_who')}</th>
                  <th className="py-2 pr-3">{t('sign.cert_col_action')}</th>
                  <th className="py-2 pr-3">{t('sign.cert_col_region')}</th>
                  <th className="py-2">{t('sign.cert_col_hash')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-600">{fmt(e.occurred_at, locale)}</td>
                    <td className="py-2 pr-3 text-slate-600">{e.actor_email || '—'}</td>
                    <td className={`py-2 pr-3 font-medium ${ACTION_TONE[e.action] ?? 'text-slate-600'}`}>{ACTION_LABEL[e.action] ? t(ACTION_LABEL[e.action]) : e.action}</td>
                    <td className="py-2 pr-3 text-slate-500">{e.ip_country || '—'}</td>
                    <td className="py-2 font-mono text-[10px] text-slate-500">{shortHash(e.pdf_sha256)}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-slate-400">{t('sign.cert_no_activity')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-[11px]">
            <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-slate-500">{t('sign.cert_original_sha')}</dt><dd className="min-w-0 break-all font-mono text-slate-500">{cert.original_sha256 ?? '—'}</dd></div>
            <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-slate-500">{t('sign.cert_final_sha')}</dt><dd className="min-w-0 break-all font-mono text-slate-500">{cert.latest_sha256 ?? '—'}</dd></div>
          </dl>
        </div>

        <p className="px-1 text-center text-[11px] text-slate-400">
          {t('sign.cert_footer')}
        </p>
      </div>
    </main>
  )
}
