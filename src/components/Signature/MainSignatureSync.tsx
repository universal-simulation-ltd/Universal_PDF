import { useEffect, useState } from 'react'
import { useUniversal } from '@unisim/sdk'
import { useSignatureStore } from '../../stores/signatureStore'
import { useT } from '../../i18n'

// Keeps the signed-in Universal ID's MAIN signature (platform 0224) in the
// signature library, so a signature saved once — on the hub's Me page or in
// Universal Signatures — is ready to place here on any device. Read-only: it
// never writes to the account. Signed out, the entry is taken away again, so a
// shared computer does not keep someone else's signature on offer.
//
// Re-read when the tab comes back into view, which is how a signature saved
// on the Me page in another tab shows up without a reload.
export default function MainSignatureSync() {
  const t = useT()
  const { supabase, session, loading } = useUniversal()
  const sync = useSignatureStore((s) => s.syncUniversalIdSignature)
  const userId = session?.user && session.user.is_anonymous !== true ? session.user.id : null
  const name = t('sign.main_signature_name')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') setTick((n) => n + 1) }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  useEffect(() => {
    if (loading) return
    if (!userId) { sync(null); return }
    // The offline mock client has no real tables to read.
    if (typeof (supabase as { from?: unknown }).from !== 'function') return
    let cancelled = false
    supabase
      .from('signatures')
      .select('cert_id, image_data')
      .eq('user_id', userId)
      .eq('is_main', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return // unknown ≠ none: leave the library alone
        const row = data as { cert_id: string; image_data: string } | null
        if (!row) { sync(null); return }
        const img = new Image()
        img.onload = () => {
          if (cancelled) return
          sync({ certId: row.cert_id, name, dataUrl: row.image_data, width: img.naturalWidth, height: img.naturalHeight })
        }
        img.src = row.image_data
      })
    return () => { cancelled = true }
  }, [supabase, userId, loading, name, sync, tick])

  return null
}
