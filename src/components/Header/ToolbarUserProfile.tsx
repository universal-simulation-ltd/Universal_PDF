import { useState, type ComponentProps, type ReactNode } from 'react'
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
 * The photo the identity provider handed over at sign-in — Google's `picture`,
 * GitHub/Microsoft's `avatar_url` — read off the session's user metadata.
 *
 * The suite's own copy is `profiles.avatar_url`, written by the hub's profile
 * editor, and it is still what wins. But it is only ever populated by someone
 * uploading a photo there: sign in with Google and the account has a perfectly
 * good picture that no row in `profiles` knows about, so the pill fell back to
 * the SDK's rotating anonymous figure and a signed-in user looked signed out.
 *
 * `user_metadata` is `Record<string, any>` by definition, so each candidate is
 * checked for being a non-empty string rather than trusted.
 */
function providerPhoto(metadata: Record<string, unknown> | undefined): string | null {
  for (const key of ['avatar_url', 'picture'] as const) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/**
 * Initials for the avatar disc, matching `UniversalNavBar`'s own `initialsFor`
 * so one account reads the same in the hub's bar and in this one: the display
 * name when there is one, otherwise the first two characters of the email's
 * local part.
 *
 * '?' means "nothing to go on" — <UserProfile /> treats exactly that string as
 * unset and falls through to its rotating anonymous figure, which is the right
 * end state for an account with no name, no email and no photo, and is why this
 * returns the glyph rather than undefined.
 */
function initialsFor(displayName: string | null | undefined, email: string | null | undefined): string {
  const name = displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  const local = email?.split('@')[0] ?? ''
  if (!local) return '?'
  if (local.length === 1) return local[0].toUpperCase()
  return (local[0] + local[1]).toUpperCase()
}

/**
 * The suite profile / sign-in control, extracted from UniversalAppsNavBar so it
 * can live in the dark tools bar while a document is open (the full navbar is
 * landing-page only). Mirrors the navbar's exact auth wiring: a plain click on
 * "Sign in" opens the in-app <SignInDialog /> so guests sign in via a popup and
 * stay in the app; modified clicks still follow hubLoginHref.
 *
 * Pass `actions` to merge the Actions menu into this control the way the other
 * Universal Apps do — one pill, one dropdown, app rows above the account rows —
 * instead of an Actions button and an avatar sitting apart in the same bar.
 */
export default function ToolbarUserProfile({ actions }: { actions?: ReactNode }) {
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
            // The hub's photo first, then the identity provider's. ⚠️ And
            // `initials` LAST-RESORT: without them <UserProfile /> answers a
            // missing photo with its rotating anonymous figure — the signed-out
            // avatar — so an account that never uploaded a photo to the hub sat
            // behind a stranger's face while signed in. The hub's own navbar
            // passes initials here for the same reason.
            photoUrl: profile?.avatar_url ?? providerPhoto(session?.user?.user_metadata) ?? null,
            initials: initialsFor(profile?.display_name, user.email),
            onSignOut: () => {
              void supabase.auth.signOut()
            },
          }

  return (
    <>
      <UserProfile
        {...resolvedUser}
        menuAlign="right"
        tier={subscription?.tier}
        actions={actions}
        // The bar this sits in is slate-900, so the pill takes the dark
        // treatment — otherwise it reads as a white chip punched into it.
        pillTheme="dark"
      />
      <SignInDialog
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        hubLoginHref={HUB_LOGIN_HREF}
      />
    </>
  )
}
