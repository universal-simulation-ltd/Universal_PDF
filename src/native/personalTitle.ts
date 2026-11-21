import { resolveAppTitle, useAppTitleChoice, useCallMe, useUniversal } from '@unisim/sdk'
import { useT } from '../i18n'

// The phone desk's app name, personalised like the website's bar (James,
// 2026-11-21): "Bradley's PDFs" once the phone holds a suite session from any
// UNI·SIM app (the shared Keychain on iOS, the suite provider on Android),
// "My PDFs" when no name is known, "Universal PDF" for everyone else.
//
// The phone app has no sign-in of its own and shows nothing else about
// accounts: it only RECOGNISES a session another suite app made (the PDF
// website template, `signed-in-personalised` in the suite docs). The name
// comes from the SDK's `useCallMe` (Global Tuning's Call me, else the
// profile's first name, else a name-shaped email), and the account's own
// choice of title ("Universal PDF" / a custom name, set in Tune on the web)
// is honoured through `useAppTitleChoice`, the same as the website's bar.

/** "Bradley’s PDFs" → "James’ PDFs" for a name ending in s (App.tsx does the same). */
function whose(title: string, name: string): string {
  return /s$/i.test(name.trim()) ? title.replace(`${name}’s`, `${name}’`) : title
}

export function usePhoneAppTitle(): string {
  const t = useT()
  const { session } = useUniversal()
  const name = useCallMe()
  const choice = useAppTitleChoice()
  const user = session?.user as { is_anonymous?: boolean } | undefined
  const product = t('phone.app_name')
  if (!user || user.is_anonymous) return product
  const personal = name ? whose(t('app.personal_title', { name }), name) : t('app.personal_title_mine')
  return resolveAppTitle(choice.mode, choice.custom, personal) ?? product
}
