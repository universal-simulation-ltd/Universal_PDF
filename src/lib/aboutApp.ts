import type { AboutAppConfig } from '@unisim/sdk'
// Generated — `node ../unisim-workspace/Universal_Apps/scripts/gen-credits.mjs .`
// after any dependency change. Never edit it by hand: it is read off the
// installed tree, so a hand-kept list drifts from the lockfile the first time
// anyone upgrades anything, and a credits list naming a package we removed is
// worse than no list at all.
import credits from '../generated/credits.json'

/**
 * "About this app", for the navbars' `about` prop. Since @unisim/sdk 0.161.0
 * the SDK draws the row at the foot of "Tune this app" and mounts its own
 * <AboutAppDialog>, so this app no longer carries an About row in Actions ▸
 * Advanced (James, 2026-09-27). ONE object, passed to BOTH bars — the landing
 * page's UniversalAppsNavBar and the open-document ToolbarUserProfile — so the
 * two can never disagree about what this app says of itself.
 *
 * Its content — the product name, mark, tagline and the privacy note itself —
 * comes from the SDK; only what is true of THIS app is passed.
 */
export const ABOUT_APP: AboutAppConfig = {
  repo: 'https://github.com/universal-simulation-ltd/Universal_PDF',
  proof: 'https://github.com/universal-simulation-ltd/Universal_PDF/blob/main/PRIVACY.md',
  subject: 'Your PDF',
  except: 'backup and send-to-sign',
  version: __APP_VERSION__,
  credits,
  noticesHref: 'https://github.com/universal-simulation-ltd/Universal_PDF/blob/main/THIRD-PARTY-NOTICES.md',
}
