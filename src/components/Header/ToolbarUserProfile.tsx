import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import {
  UserProfile,
  SignInDialog,
  useUser,
  useProfile,
  useUniversal,
  useSubscription,
} from '@unisim/sdk'
import CompanyBadge from './CompanyBadge'

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
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile()
  const { supabase, session } = useUniversal()
  const { subscription } = useSubscription()
  const [signInOpen, setSignInOpen] = useState(false)

  // ⚠️ WHY THE NAME WENT STALE, and why this is a refresh rather than a
  // subscription. `useProfile()` is a hook with its OWN `useState` per call
  // site, not a shared store. The dialog that edits the display name is the
  // SDK's <ProfileDialog>, rendered inside <UserProfile>, and it calls
  // `useProfile()` for itself — so saving refreshed THAT copy and this one,
  // which is the copy feeding the `name` below, was never told. The dropdown
  // (and the initials on the pill) went on showing the old name until the app
  // was reloaded.
  //
  // The SDK publishes no event for the save, so the fix is to re-read the row
  // at the moments the answer could have changed:
  //
  //   • the pointer reaching this control — the pill is the only way to the
  //     profile editor, so this covers "edited it, closed the dialog, went back
  //     to the menu". ⚠️ It must be ENTER as well as DOWN: <UserProfile /> opens
  //     on hover, so a pointerdown-only refresh would miss every user who never
  //     clicks the pill at all; and
  //   • the window regaining focus — the web build's "View profile" is a link
  //     to the hub, so there the edit happens in another tab entirely.
  //
  // One `profiles` select per menu-open is cheap; a polling loop or a realtime
  // channel for a row that changes once a year would not be.
  // ⚠️ Held in a ref, not listed as a dependency. `useProfile().refresh` is a
  // fresh arrow function on every render, so `[refreshProfile]` would tear the
  // listeners down and put them back on every single render — the same
  // unstable-identity trap the SDK's own `useUser` carries a warning about.
  const refreshRef = useRef(refreshProfile)
  refreshRef.current = refreshProfile

  // Mouse enter fires again every time the pointer crosses the pill's edge, and
  // the panel sits right underneath it — so without a floor, wandering over the
  // control is a burst of identical selects.
  //
  // ⚠️ Keep this floor SHORT. At a second and a half it swallowed the very case
  // it exists to serve: close the profile dialog, go straight back to the menu,
  // and the re-read was thrown away as a duplicate — the name stayed stale and
  // the fix looked like it had not worked. Half a second still collapses a
  // pointer skating over the edge, and is under the time it takes to move a
  // hand back to the pill.
  const lastRefreshAt = useRef(0)
  function rereadProfileSoon() {
    const now = Date.now()
    if (now - lastRefreshAt.current < 500) return
    lastRefreshAt.current = now
    refreshRef.current()
  }

  useEffect(() => {
    function reread() {
      if (document.visibilityState === 'hidden') return
      refreshRef.current()
    }
    window.addEventListener('focus', reread)
    document.addEventListener('visibilitychange', reread)
    return () => {
      window.removeEventListener('focus', reread)
      document.removeEventListener('visibilitychange', reread)
    }
  }, [])

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
      {/* Capture phase, and on the WRAPPER rather than the pill: <UserProfile />
          owns its trigger and gives no onOpen, so this is the one place that
          sees the pointer before the panel is drawn. */}
      <span
        // ⚠️ `onPointerEnter` has no Capture twin in React — enter/leave do not
        // bubble, so there is no capture phase to hook. It is on the wrapper, so
        // it fires as the pointer arrives, which is the same moment
        // <UserProfile /> opens the panel on hover.
        onPointerEnter={rereadProfileSoon}
        onPointerDownCapture={rereadProfileSoon}
      >
        <UserProfile
          {...resolvedUser}
          menuAlign="right"
          tier={subscription?.tier}
          actions={actions}
          // The org's mark and name, from whatever My Company → Branding
          // already holds. `extras` sits with the account rows (profile, app
          // settings, language) and above the sign-out divider, which is where
          // "who am I signed in as" belongs — not up among the app's actions.
          //
          // ⚠️ Styled LIGHT deliberately. The SDK renders `extras` as-is and
          // does not theme it, and `theme` is left at its default here (a dark
          // pill over a light panel — see pillTheme below), so a dark treatment
          // would be white text on white.
          extras={<CompanyBadge />}
          // The bar this sits in is slate-900, so the pill takes the dark
          // treatment — otherwise it reads as a white chip punched into it.
          pillTheme="dark"
        />
      </span>
      <SignInDialog
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        hubLoginHref={HUB_LOGIN_HREF}
      />
    </>
  )
}
