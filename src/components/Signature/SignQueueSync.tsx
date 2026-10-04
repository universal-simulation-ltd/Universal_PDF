import { useEffect, useState } from 'react'
import { useUniversal } from '@unisim/sdk'
import { queueSubmitter } from '../../lib/signRequestClient'
import { listQueued, syncQueue } from '../../lib/signQueue'
import { useT } from '../../i18n'

/**
 * Sends signed copies that were queued offline (see `lib/signQueue.ts`) when
 * Universal PDF starts or the device comes back online — so a signer who
 * closed the signing page while offline doesn't have to find the link again.
 * Mounted on the app's own pages; the signing page (`?signdoc=`) sends its own.
 *
 * ⚠️ Only plain `queued` entries go. One that needs email verification, or was
 * overtaken by another party's signature, waits for the signer to open its
 * link — this never asks for or checks a code.
 */
export default function SignQueueSync() {
  const t = useT()
  const { supabase } = useUniversal()
  const [sent, setSent] = useState<string[]>([])

  useEffect(() => {
    let running = false
    const run = async () => {
      if (running) return
      running = true
      try {
        if ((await listQueued()).every((q) => q.state !== 'queued')) return
        const out = await syncQueue(queueSubmitter(supabase))
        const names = out.filter((o) => o.result === 'sent').map((o) => o.docName)
        if (names.length) setSent((s) => [...s, ...names])
      } finally {
        running = false
      }
    }
    void run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [supabase])

  useEffect(() => {
    if (!sent.length) return
    const timer = window.setTimeout(() => setSent([]), 8000)
    return () => window.clearTimeout(timer)
  }, [sent])

  if (!sent.length) return null
  return (
    <div
      role="status"
      data-sign-queue-sent
      className="fixed inset-x-3 bottom-20 z-[80] mx-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl md:bottom-4"
    >
      {sent.map((name) => (
        <p key={name}>✓ {t('sign.offline_sent_toast', { name })}</p>
      ))}
    </div>
  )
}
