import { useContext, useEffect, useState } from 'react'
import { PreferencesThemeContext } from '@unisim/sdk'
import { useT } from '../../i18n'
import { disableSignatureLock, enableSignatureLock } from '../../lib/signatureLock'
import { useVaultStore, vaultAvailability, type Biometry } from '../../lib/signatureVault'

/**
 * Tune this app ▸ "Lock saved signatures" (phone app, 2026-10-12). Off by
 * default, like every switch in the suite. Shown only where the phone can do
 * it: the iOS and Android apps, with Face ID / Touch ID / a fingerprint or a
 * screen lock set up (lib/signatureVault.ts).
 *
 * Turning it on or off asks for Face ID (or the like) first; cancelling that
 * leaves it as it was.
 */
export default function SignatureVaultRow() {
  const t = useT()
  const theme = useContext(PreferencesThemeContext)
  const enabled = useVaultStore((s) => s.enabled)
  const [biometry, setBiometry] = useState<Biometry | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void vaultAvailability().then(({ available, biometry }) => {
      if (live && available) setBiometry(biometry)
    })
    return () => {
      live = false
    }
  }, [])

  if (!biometry) return null

  const method =
    biometry === 'faceID' ? t('sign.vault_face_id')
      : biometry === 'touchID' ? t('sign.vault_touch_id')
        : biometry === 'passcode' ? t('sign.vault_passcode')
          : t('sign.vault_biometric')

  async function toggle(on: boolean) {
    if (busy) return
    setBusy(true)
    try {
      if (on) await enableSignatureLock(t('sign.vault_reason_lock'))
      else await disableSignatureLock(t('sign.vault_reason_unlock'))
    } catch {
      // Cancelled at the Face ID / fingerprint prompt: nothing changed.
    } finally {
      setBusy(false)
    }
  }

  const body = theme === 'dark' ? '#e2e8f0' : '#334155'
  const note = theme === 'dark' ? '#94a3b8' : '#64748b'
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', cursor: 'pointer' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: body }}>{t('sign.vault_row')}</span>
        <span style={{ fontSize: 12, color: note }}>{t('sign.vault_note', { method })}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        disabled={busy}
        onChange={(e) => void toggle(e.target.checked)}
        style={{ width: 20, height: 20, accentColor: '#2353c9', flex: 'none' }}
      />
    </label>
  )
}
