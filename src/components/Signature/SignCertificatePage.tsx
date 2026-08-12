import { useEffect, useState } from 'react'
import { useUniversal, verifyPdfSignCert, type SignCertificate } from '@unisim/sdk'
import { certificateDownload } from '../../lib/signRequestClient'

/**
 * Public tamper-evident certificate page for a signed document
 * (`?cert=<cert_id>`). Renders the signing outcome, each party's status, a
 * preview + download of the final PDF, and the timestamped provenance log
 * (date · time · actor · action · SHA-256). No account needed — reads the
 * public verify_pdf_sign_cert RPC (no storage secrets / full IP). Mirrors
 * Universal Signatures' VerifyPage.
 */
const ACTION_LABEL: Record<string, string> = {
  opened: 'Opened the document',
  signature: 'Signature added',
  annotation: 'Annotation added',
  highlight: 'Highlight added',
  text: 'Text added',
  other: 'Other edit',
  completed: 'Completed — all parties signed',
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

function fmt(ts?: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

export default function SignCertificatePage({ certId }: { certId: string }) {
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
        <div className="rounded-xl bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow">Loading certificate…</div>
      </main>
    )
  }

  if (!cert?.ok) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-3xl">🔏</div>
        <h1 className="text-lg font-semibold text-slate-900">Certificate not found</h1>
        <p className="max-w-sm text-sm text-slate-500">This certificate link is invalid or has been removed.</p>
        <a href={import.meta.env.BASE_URL} className="mt-2 rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800">Open Universal PDF</a>
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
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-700">🔏 Signing certificate</div>
              <h1 className="mt-1 truncate text-xl font-bold text-slate-900">{cert.doc_name ?? 'document.pdf'}</h1>
              <p className="mt-0.5 text-xs text-slate-400">Issued {fmt(cert.created_at)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {completed ? 'Fully signed' : 'In progress'}
            </span>
          </div>

          {/* Parties */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {parties.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{p.role === 'requester' ? 'Requester' : 'Recipient'}</span>
                  <span className="block truncate text-sm text-slate-700">{p.email || '—'}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${p.status === 'signed' ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {p.status === 'signed' ? `✓ ${new Date(p.signed_at ?? '').toLocaleDateString()}` : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Preview + download */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Document</h2>
            {downloadUrl && (
              <a href={downloadUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-orange-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-800">
                Download PDF
              </a>
            )}
          </div>
          {downloadUrl ? (
            <iframe title="Signed document" src={downloadUrl} className="mt-3 h-[460px] w-full rounded-lg border border-slate-200" />
          ) : (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              The stored copy has been removed by the owner. The verified record below still stands.
            </p>
          )}
        </div>

        {/* Provenance log */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Activity log</h2>
          <p className="mt-0.5 text-xs text-slate-400">Every action recorded server-side against a SHA-256 hash chain.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Who</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Region</th>
                  <th className="py-2">Document hash</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-600">{fmt(e.occurred_at)}</td>
                    <td className="py-2 pr-3 text-slate-600">{e.actor_email || '—'}</td>
                    <td className={`py-2 pr-3 font-medium ${ACTION_TONE[e.action] ?? 'text-slate-600'}`}>{ACTION_LABEL[e.action] ?? e.action}</td>
                    <td className="py-2 pr-3 text-slate-500">{e.ip_country || '—'}</td>
                    <td className="py-2 font-mono text-[10px] text-slate-500">{shortHash(e.pdf_sha256)}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-slate-400">No activity recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-[11px]">
            <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-slate-500">Original SHA-256</dt><dd className="min-w-0 break-all font-mono text-slate-500">{cert.original_sha256 ?? '—'}</dd></div>
            <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-slate-500">Final SHA-256</dt><dd className="min-w-0 break-all font-mono text-slate-500">{cert.latest_sha256 ?? '—'}</dd></div>
          </dl>
        </div>

        <p className="px-1 text-center text-[11px] text-slate-400">
          Universal PDF · Universal Simulation. A tamper-evident record of an electronic signature — legally
          binding to the extent your jurisdiction and local laws allow. This is not legal advice.
        </p>
      </div>
    </main>
  )
}
