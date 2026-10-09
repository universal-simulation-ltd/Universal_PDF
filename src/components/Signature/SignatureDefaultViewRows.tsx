import { DefaultViewSelect } from '@unisim/sdk'
import { useT } from '../../i18n'
import { SIGN_MENU_VIEW, SIGN_PAD_VIEW, type SignMenuTab, type SignPadMode } from '../../lib/defaultViews'

/**
 * Tune this app's rows for the two double-tap defaults — the same choice for
 * anybody who cannot double-tap. Passed as `appPreferences` by BOTH menus that
 * open Tune this app (App's navbar and the toolbar's ToolbarUserProfile), so
 * the two dialogs match.
 */
export default function SignatureDefaultViewRows() {
  const t = useT()
  return (
    <>
      <DefaultViewSelect<SignMenuTab>
        id={SIGN_MENU_VIEW}
        label={t('sign.default_menu_tab')}
        fallback="signatures"
        views={[
          { value: 'signatures', label: t('sign.menu_tab_signatures') },
          { value: 'stamps', label: t('sign.menu_tab_stamps') },
          { value: 'request', label: t('sign.menu_tab_request') },
        ]}
      />
      <DefaultViewSelect<SignPadMode>
        id={SIGN_PAD_VIEW}
        label={t('sign.default_pad_mode')}
        fallback="draw"
        views={[
          { value: 'draw', label: t('sign.pad_mode_draw') },
          { value: 'phone', label: t('sign.send_to_sign') },
        ]}
      />
    </>
  )
}
