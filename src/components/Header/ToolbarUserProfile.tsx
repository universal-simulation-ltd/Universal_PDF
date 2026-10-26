import { type ReactNode } from 'react'
import { UserProfile, useUserPrefs, KnowledgeBaseDialog } from '@unisim/sdk'
import { ABOUT_APP } from '../../lib/aboutApp'
import { KNOWLEDGE_BASE } from '../../knowledge'
import { usePdfStore } from '../../stores/pdfStore'
import { clearDismissedPrompts } from '../../lib/resetDefaults'
import PageScrollPreference from '../Viewer/PageScrollPreference'
import ToolBehaviourRows from '../Viewer/ToolBehaviourRows'
import { useToolPrefs } from '../../stores/toolPrefsStore'
import SignatureDefaultViewRows from '../Signature/SignatureDefaultViewRows'
import SignatureVaultRow from '../Signature/SignatureVaultRow'

/**
 * The suite menu, extracted from UniversalAppsNavBar so it can live in the
 * dark tools bar while a document is open (the full navbar is landing-page
 * only).
 *
 * Pass `actions` to merge the Actions menu into this control the way the other
 * Universal Apps do — one pill, one dropdown, app rows above the rest —
 * instead of an Actions button and a second control sitting apart in the same
 * bar.
 *
 * No account in it, for anyone (James, 2026-10-26: "If signed in it should be
 * clear from the personalisation — 'Bradley's Book' — as opposed to the
 * traditional profile button"). A guest is never offered Sign in here (the one
 * thing that needs an account, the certified signature in Send to sign, asks
 * in place), and someone signed in finds their account — email, the hub, Sign
 * out — in Tune this app (`accountInTune`, SDK 0.206.0), the same as the
 * landing navbar. Until then this drew the photo, initials and Sign in itself.
 */
export default function ToolbarUserProfile({ actions }: { actions?: ReactNode }) {
  const hasDoc = usePdfStore((s) => !!s.doc)
  const knowledgeBaseOpen = usePdfStore((s) => s.knowledgeBaseOpen)
  const setKnowledgeBaseOpen = usePdfStore((s) => s.setKnowledgeBaseOpen)
  // Reset to defaults — the way back from "Don't show again" (James,
  // 2026-09-08). `reset` clears the local copy AND, for a signed-in user, the
  // synced row, so a hint dismissed on another device comes back too. Since
  // 2026-09-27 the SDK draws the row at the foot of "Tune this app" (it asks
  // in place first and says "Defaults restored"), rather than Actions ▸
  // Advanced. ⚠️ Do not drop it without also making "Don't show again"
  // non-permanent: this row is what makes a permanent dismissal defensible.
  // ⚠️ `reset` only clears the SDK's own bag, so the app's localStorage
  // dismissals (the fill-isn't-redaction warning among them) are cleared
  // beside it — see lib/resetDefaults.
  const { reset: resetPrefs } = useUserPrefs()

  return (
    <>
      <UserProfile
        noAccount
        accountInTune
        menuAlign="right"
        actions={actions}
        // No `showDeleteAccount`: "Delete my account…" is the SDK's, at the
        // foot of Global Tuning (SDK 0.159.0). This menu drew its own row
        // in `extras` until 2026-09-27, when James moved it there suite-wide.
        // No `showLanguageSelector`: the language lives in the SDK's App
        // preferences (this app's override) and Global preferences rows —
        // the Actions rows' own Language picker went in 2026-09-17. Both
        // dialogs follow `theme` (light, the default), not `pillTheme`, so
        // they match the light panel.

        // About and Reset to defaults live at the foot of "Tune this app"
        // (SDK 0.161.0), the same config the landing navbar gets.
        about={ABOUT_APP}
        // Actions ▸ Advanced ▸ Knowledge base (SDK 0.163.0): this app's own
        // articles, bundled from ./knowledge so they read offline.
        // ⚠️ Only with NO document open. With one, the app's own ⚙️ Advanced
        // section is in this menu too and carries the row (FileMenu), and the
        // SDK's would be a second "Advanced" heading holding just that row.
        knowledgeBase={hasDoc ? undefined : KNOWLEDGE_BASE}
        onResetDefaults={() => { clearDismissedPrompts(); useToolPrefs.getState().reset(); void resetPrefs() }}
        // Tune this app ▸ Page scrolling (vertical or horizontal pages), then
        // the double-tap defaults' rows (SDK 0.170.0). The landing navbar
        // passes the same rows; Reset to defaults clears the double-tap
        // defaults via the SDK.
        appPreferences={<><PageScrollPreference /><ToolBehaviourRows /><SignatureDefaultViewRows /><SignatureVaultRow /></>}
        // The bar this sits in is slate-900, so the pill takes the dark
        // treatment — otherwise it reads as a white chip punched into it.
        pillTheme="dark"
      />
      <KnowledgeBaseDialog
        {...KNOWLEDGE_BASE}
        open={knowledgeBaseOpen}
        onClose={() => setKnowledgeBaseOpen(false)}
      />
    </>
  )
}
