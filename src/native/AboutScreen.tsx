import { useT } from '../i18n'
import { ABOUT_APP } from '../lib/aboutApp'
import { goBack } from './nav'
import { JobPage, LinkRow, ROW_RULE, Slip } from './parts'

// About, as a page of the phone's own (the mobile-first pass, 2026-11-27). It
// was the website's "About this app" dialog floating over Tune: a popup, with
// the website's wording ("never leaves this computer"), the wrong licence, and
// links to the changelog, the blog and other unisim.co.uk pages. A phone app
// has pages, and this one says only what is true of this app: what it is, its
// licence, where the code and the privacy promise can be read, and the
// open-source projects it stands on. The credit stays on Tune's slip, the one
// pointer outward.
//
// Every link here opens in the system browser and goes to this app's own
// repository, never to a suite page.

const REPO = ABOUT_APP.repo ?? 'https://github.com/universal-simulation-ltd/Universal_PDF'
const PRIVACY = ABOUT_APP.proof ?? `${REPO}/blob/main/PRIVACY.md`
const NOTICES = ABOUT_APP.noticesHref ?? `${REPO}/blob/main/THIRD-PARTY-NOTICES.md`

const open = (url: string) => window.open(url, '_blank', 'noopener')

export default function AboutScreen() {
  const t = useT()
  const ships = ABOUT_APP.credits?.ships ?? []
  return (
    <JobPage backLabel={t('phone.tab_tune')} onBack={() => void goBack()} lead="Universal" hl="PDF" note={t('phone.tune_card')}>
      <Slip tilt="-0.5deg">
        <p className="m-0 px-3.5 py-3 text-[14px] leading-[1.45] text-[color:var(--np-ink-2)]">{t('phone.about_licence')}</p>
        <LinkRow label={t('phone.privacy')} onClick={() => open(PRIVACY)} />
        <LinkRow label={t('phone.about_source')} onClick={() => open(REPO)} />
        <LinkRow label={t('phone.about_report')} onClick={() => open(`${REPO}/issues`)} />
      </Slip>

      {ships.length > 0 && (
        <Slip label={t('phone.about_built_with')} tilt="0.4deg">
          <p className="m-0 px-3.5 py-3 text-[14px] leading-[1.45] text-[color:var(--np-ink-2)]">{t('phone.about_built_note')}</p>
          <ul className="m-0 p-0 list-none">
            {ships.map((p) => (
              <li key={p.name} className="px-3.5 py-2.5 flex items-baseline gap-3" style={{ borderTop: ROW_RULE }}>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[16px] break-words">{p.title ?? p.name}</span>
                  {p.authors && p.authors.length > 0 && (
                    <span className="text-[13px] text-[color:var(--np-muted)]">{p.authors.slice(0, 2).join(', ')} et al.</span>
                  )}
                </span>
                {p.licence && <span className="flex-none text-[13px] text-[color:var(--np-muted)] tabular-nums">{p.licence}</span>}
              </li>
            ))}
          </ul>
          <LinkRow label={t('phone.about_notices')} onClick={() => open(NOTICES)} />
        </Slip>
      )}

      <p className="m-0 px-1 text-[12px] text-[color:var(--np-muted)] tabular-nums">v{__APP_VERSION__}</p>
    </JobPage>
  )
}
