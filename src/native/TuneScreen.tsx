import { useEffect, useId, useState } from 'react'
import { AboutAppDialog, LANGUAGE_LABELS, SUPPORTED_LANGUAGES, useDefaultView, useLanguage, useResetAppDefaults, useUserPrefs } from '@unisim/sdk'
import { useT, type Language } from '../i18n'
import { useToolPrefs } from '../stores/toolPrefsStore'
import { clearDismissedPrompts } from '../lib/resetDefaults'
import { PAGE_SCROLL_ID, PAGE_SCROLLS, pageScrollDefault, type PageScroll } from '../lib/pageScroll'
import { ABOUT_APP } from '../lib/aboutApp'
import { disableSignatureLock, enableSignatureLock } from '../lib/signatureLock'
import { useVaultStore, vaultAvailability, type Biometry } from '../lib/signatureVault'
import { Icon, PATHS } from './icons'
import { Hl, LinkRow, Sheet, Slip, SwitchRow } from './parts'
import { usePhonePrefs } from './prefs'
import { useNav } from './nav'

// Board 8 · Tune this app, a tab: the switches and the rows on paper slips
// (round 4, James: "go ahead" — Tune and What else as paper slips), Reset to
// defaults, and a white slip saying what the app is, signed in handwriting:
// "James Markey MBE" and "the UNI·SIM team" each a link to its own site
// (James, 2026-10-20; store-listings §8 — the app's only pointer outward). The
// (?) on the slip opens board 8b, "All free, nothing hidden".

// Ink-coloured, underlined in pencil: a link you can see is one, still in the hand.
const CREDIT_LINK = 'underline decoration-[1.5px] underline-offset-[3px] decoration-[color:var(--np-orange)]'

const PRIVACY_URL = ABOUT_APP.proof ?? 'https://github.com/universal-simulation-ltd/Universal_PDF/blob/main/PRIVACY.md'

export default function TuneScreen() {
  const t = useT()
  const { reset: resetUserPrefs } = useUserPrefs()
  const { language, setLanguage } = useLanguage()
  const scroll = useDefaultView<PageScroll>(PAGE_SCROLL_ID, pageScrollDefault(), { views: PAGE_SCROLLS })
  const keepAwake = usePhonePrefs((s) => s.keepAwake)
  const plainPaper = usePhonePrefs((s) => s.plainPaper)
  const vaultOn = useVaultStore((s) => s.enabled)
  const [biometry, setBiometry] = useState<Biometry | null>(null)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [freeOpen, setFreeOpen] = useState(false)
  const languageId = useId()

  const resetAll = useResetAppDefaults(() => {
    clearDismissedPrompts()
    useToolPrefs.getState().reset()
    usePhonePrefs.getState().reset()
    void resetUserPrefs()
  })

  useEffect(() => {
    let live = true
    void vaultAvailability().then(({ available, biometry }) => {
      if (live && available) setBiometry(biometry)
    })
    return () => {
      live = false
    }
  }, [])

  async function toggleVault(on: boolean) {
    if (vaultBusy) return
    setVaultBusy(true)
    try {
      if (on) await enableSignatureLock(t('sign.vault_reason_lock'))
      else await disableSignatureLock(t('sign.vault_reason_unlock'))
    } catch {
      // Face ID cancelled: the switch stays as it was.
    } finally {
      setVaultBusy(false)
    }
  }

  const method = !biometry
    ? ''
    : biometry === 'faceID' ? t('sign.vault_face_id')
      : biometry === 'touchID' ? t('sign.vault_touch_id')
        : biometry === 'passcode' ? t('sign.vault_passcode')
          : t('sign.vault_biometric')

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ background: 'var(--np-paper)' }}>
      <div className="px-5 pb-6 flex flex-col gap-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 22px)' }}>
        <h1 className="np-serif m-0 text-[36px] font-bold">
          <Hl>{t('phone.tune_hl')}</Hl> {t('phone.tune_rest')}
        </h1>

        <Slip label={t('phone.tune_how')} tilt="-0.6deg">
          <SwitchRow
            first
            label={t('phone.scroll_vertical')}
            note={t('phone.scroll_vertical_note')}
            checked={scroll.defaultView === 'vertical'}
            onChange={(v) => scroll.setDefaultView(v ? 'vertical' : 'horizontal')}
          />
          <SwitchRow
            label={t('phone.keep_awake')}
            note={t('phone.keep_awake_note')}
            checked={keepAwake}
            onChange={(v) => usePhonePrefs.getState().setKeepAwake(v)}
          />
          <SwitchRow
            label={t('phone.plain_paper')}
            note={t('phone.plain_paper_note')}
            checked={plainPaper}
            onChange={(v) => usePhonePrefs.getState().setPlainPaper(v)}
          />
          {biometry && (
            <SwitchRow
              label={t('sign.vault_row')}
              note={t('sign.vault_note', { method })}
              checked={vaultOn}
              disabled={vaultBusy}
              onChange={(v) => void toggleVault(v)}
            />
          )}
        </Slip>

        <Slip tilt="0.5deg">
          <label htmlFor={languageId} className="relative w-full flex items-center gap-3 min-h-[52px] px-3.5">
            <span className="flex-1 text-[16px]">{t('phone.language')}</span>
            <span className="text-[15px] text-[color:var(--np-muted)]">{LANGUAGE_LABELS[language as Language]}</span>
            <Icon d={PATHS.chevron} size={16} stroke="#9a9ca3" width={2.4} />
            <select
              id={languageId}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="absolute inset-0 w-full h-full opacity-0"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
              ))}
            </select>
          </label>
          <LinkRow label={t('phone.howto')} onClick={() => useNav.getState().push('kb')} />
          <LinkRow label={t('phone.privacy')} onClick={() => window.open(PRIVACY_URL, '_blank', 'noopener')} />
          <LinkRow label={t('phone.about')} onClick={() => setAboutOpen(true)} />
        </Slip>

        <button
          type="button"
          onClick={() => {
            resetAll()
            useNav.getState().say(t('phone.reset_done'))
          }}
          className="np-tilt min-h-[50px] rounded-[3px] text-[16px] text-[#b42318] bg-white"
          style={{ transform: 'rotate(-0.4deg)', boxShadow: '0 6px 14px rgba(60,45,20,0.14)' }}
        >
          {t('phone.reset')}
        </button>

        <div
          className="np-tilt mt-1 bg-white rounded-[3px] px-[18px] py-4 flex flex-col gap-1.5 relative"
          style={{ boxShadow: '0 6px 14px rgba(23,30,50,0.1)', transform: 'rotate(-1deg)' }}
        >
          <div className="flex gap-2.5 items-start">
            <p className="m-0 flex-1 text-[14px] leading-[1.45] text-[color:var(--np-ink-2)]">{t('phone.tune_card')}</p>
            <button
              type="button"
              aria-label={t('app.landing_free_open')}
              onClick={() => setFreeOpen(true)}
              className="flex-none w-[30px] h-[30px] rounded-full bg-white text-[15px] font-extrabold"
              style={{ border: '1.5px solid var(--np-cobalt)', color: 'var(--np-cobalt-deep)' }}
            >
              ?
            </button>
          </div>
          <p className="np-hand m-0 text-[22px] leading-tight text-[color:var(--np-cobalt-deep)]">
            {t.rich('phone.credit', {
              james: <a href="https://jamesmarkey.co.uk" target="_blank" rel="noreferrer" className={CREDIT_LINK}>James Markey MBE</a>,
              team: <a href="https://www.unisim.co.uk" target="_blank" rel="noreferrer" className={CREDIT_LINK}>{t('phone.credit_team')}</a>,
            })}
          </p>
          <p className="m-0 text-[12px] text-[color:var(--np-muted)] tabular-nums">v{__APP_VERSION__}</p>
        </div>
      </div>

      <AboutAppDialog {...ABOUT_APP} open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {freeOpen && <FreeSheet onClose={() => setFreeOpen(false)} />}
    </div>
  )
}

const FREE = [
  'app.landing_free_sign',
  'app.landing_free_compress',
  'app.landing_free_convert',
  'app.landing_free_qr',
  'app.landing_free_redact',
  'app.landing_free_export',
] as const
const NEVER = ['app.landing_no_uploads', 'app.landing_no_scraping', 'app.landing_no_ads'] as const

/** Board 8b · the (?) on Tune: what is free, and what the app never does. */
function FreeSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <Sheet label={t('app.landing_free_title')} onClose={onClose} background="var(--np-sheet)">
      <div className="flex items-center justify-between">
        <h2 className="np-serif m-0 text-[24px] font-bold">{t('app.landing_free_title')}</h2>
        <button type="button" aria-label={t('phone.close')} onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[color:var(--np-muted)]">
          <Icon d={PATHS.close} size={20} />
        </button>
      </div>
      <Slip tilt="-0.4deg">
        {FREE.map((k, i) => (
          <div key={k} className="flex items-center gap-3.5 min-h-[44px] px-3.5" style={{ borderTop: i ? '1px solid var(--np-rule)' : 0 }}>
            <Icon d={PATHS.tick} size={18} width={3} stroke="var(--np-cobalt)" />
            <span className="text-[15px]">{t(k)}</span>
          </div>
        ))}
        {NEVER.map((k) => (
          <div key={k} className="flex items-center gap-3.5 min-h-[44px] px-3.5" style={{ borderTop: '1px solid var(--np-rule)' }}>
            <Icon d={PATHS.never} size={18} width={2.6} stroke="var(--np-orange-ink)" />
            <span className="text-[15px]">{t(k)}</span>
          </div>
        ))}
      </Slip>
      <div className="h-2" />
    </Sheet>
  )
}
