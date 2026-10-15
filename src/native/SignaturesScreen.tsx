import { useState } from 'react'
import { useT } from '../i18n'
import { useSignatureStore } from '../stores/signatureStore'
import { unlockSignatures } from '../lib/signatureLock'
import { useVaultStore } from '../lib/signatureVault'
import { Icon, PATHS } from './icons'
import { Hl } from './parts'
import SignScreen from './SignScreen'

// The Signatures tab: the drawer of saved signatures, each on its own slip of
// paper, with "Draw a new one" (the Sign page, keeping only). Nothing here is
// on a board yet; it takes the Sign page's look.

const TILTS = ['-1.5deg', '1.2deg', '-0.8deg', '1.6deg']

export default function SignaturesScreen() {
  const t = useT()
  const signatures = useSignatureStore((s) => s.signatures)
  const locked = useVaultStore((s) => s.enabled && s.locked)
  const [drawing, setDrawing] = useState(false)

  if (drawing) return <SignScreen mode="drawer" onDone={() => setDrawing(false)} />

  const saved = signatures.filter((s) => !s.id.startsWith('uid-main:'))

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ background: 'var(--np-paper)' }}>
      <div className="px-5 pb-6 flex flex-col gap-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 22px)' }}>
        <div className="flex flex-col gap-1">
          <h1 className="np-serif m-0 text-[36px] font-bold">
            {t('phone.sigs_lead')} <Hl>{t('phone.sigs_hl')}</Hl>
          </h1>
          <span className="text-[13px] text-[color:var(--np-muted)]">{t('phone.sigs_note')}</span>
        </div>

        {locked ? (
          <div className="bg-white rounded-[3px] px-4 py-4 flex flex-col gap-3" style={{ boxShadow: '0 6px 14px rgba(23,30,50,0.1)' }}>
            <p className="m-0 text-[15px]">{t('phone.sigs_locked')}</p>
            <button
              type="button"
              onClick={() => void unlockSignatures(t('sign.vault_reason_unlock')).catch(() => {})}
              className="min-h-[48px] rounded-2xl text-white text-[16px] font-bold"
              style={{ background: 'var(--np-cobalt)' }}
            >
              {t('phone.sigs_unlock')}
            </button>
          </div>
        ) : saved.length === 0 ? (
          <p className="m-0 text-[15px] leading-[1.45] text-[color:var(--np-muted)]">{t('phone.sigs_empty')}</p>
        ) : (
          <ul className="m-0 p-0 list-none grid grid-cols-2 gap-3.5">
            {saved.map((s, i) => (
              <li
                key={s.id}
                className="np-tilt bg-white rounded-[3px] relative h-[110px] flex items-center justify-center p-3"
                style={{ boxShadow: '0 6px 14px rgba(23,30,50,0.12)', transform: `rotate(${TILTS[i % 4]})` }}
              >
                <img src={s.dataUrl} alt={s.name} className="max-w-full max-h-[70px] object-contain" />
                <button
                  type="button"
                  aria-label={t('phone.sigs_delete_aria', { name: s.name })}
                  onClick={() => useSignatureStore.getState().remove(s.id)}
                  className="absolute top-1 right-1 w-9 h-9 flex items-center justify-center text-[color:var(--np-muted)]"
                >
                  <Icon d={PATHS.trash} size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!locked && (
          <button
            type="button"
            onClick={() => setDrawing(true)}
            className="min-h-[56px] rounded-[18px] text-white text-[17px] font-bold flex items-center justify-center gap-2"
            style={{ background: 'var(--np-cobalt)' }}
          >
            <Icon d={PATHS.plus} size={20} stroke="#ffffff" />
            {t('phone.sigs_new')}
          </button>
        )}
      </div>
    </div>
  )
}
