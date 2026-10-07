import { DefaultViewSelect } from '@unisim/sdk'
import { useT } from '../../i18n'
import { PAGE_SCROLL_DEFAULT, PAGE_SCROLL_ID, type PageScroll } from '../../lib/pageScroll'

/**
 * Tune this app ▸ Page scrolling — whether an open document's pages run one
 * under another or side by side (James, 2026-10-07). Passed as `appPreferences`
 * to BOTH menus that open the dialog: the landing navbar's and the open
 * document's ToolbarUserProfile.
 *
 * The SDK's own row, so it is styled like the dialog's Language row in either
 * colourway, and Reset to defaults puts it back to vertical with no wiring here.
 */
export default function PageScrollPreference() {
  const t = useT()
  return (
    <DefaultViewSelect<PageScroll>
      id={PAGE_SCROLL_ID}
      label={t('viewer.scroll.label')}
      fallback={PAGE_SCROLL_DEFAULT}
      views={[
        { value: 'vertical', label: t('viewer.scroll.vertical') },
        { value: 'horizontal', label: t('viewer.scroll.horizontal') },
      ]}
    />
  )
}
