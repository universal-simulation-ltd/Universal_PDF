import { useState, type ComponentProps } from 'react'
import {
  UserProfile,
  SignInDialog,
  useUser,
  useProfile,
  useUniversal,
  useSubscription,
} from '@unisim/sdk'

// Same default the UniversalAppsNavBar uses for the profile "Sign in" item.
const HUB_LOGIN_HREF = 'https://app.unisim.co.uk/login'

/**
 * The suite profile / sign-in control, extracted from UniversalAppsNavBar so it
 * can live in the dark tools bar while a document is open (the full navbar is
 * landing-page only). Mirrors the navbar's exact auth wiring: a plain click on
 * "Sign in" opens the in-app <SignInDialog /> so guests sign in via a popup and
 * stay in the app; modified clicks still follow hubLoginHref.
 */
export default function ToolbarUserProfile() {
  const { user, loading: userLoading } = useUser()
  const { profile, loading: profileLoading } = useProfile()
  const { supabase, session } = useUniversal()
  const { subscription } = useSubscription()
  const [signInOpen, setSignInOpen] = useState(false)

  const isAnonymous = session?.user?.is_anonymous === true
  const resolvedUser: ComponentProps<typeof UserProfile> =
    userLoading || profileLoading
      ? { initials: '·' }
      : !user || isAnonymous
        ? {
            initials: '?',
            signInHref: HUB_LOGIN_HREF,
            onSignInClick: () => setSignInOpen(true),
          }
        : {
            name: profile?.display_name ?? undefined,
            email: user.email ?? undefined,
            photoUrl: profile?.avatar_url ?? null,
            onSignOut: () => {
              void supabase.auth.signOut()
            },
          }

  return (
    <>
      <UserProfile {...resolvedUser} menuAlign="right" tier={subscription?.tier} />
      <SignInDialog
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        hubLoginHref={HUB_LOGIN_HREF}
      />
    </>
  )
}
