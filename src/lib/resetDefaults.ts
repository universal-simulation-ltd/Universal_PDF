// The prompts this app remembers dismissing in its OWN localStorage keys, not
// in the SDK's `useUserPrefs` bag.
//
// ⚠️ WHY THIS EXISTS. "Reset to defaults" (the foot of the SDK's "Tune this
// app") calls `useUserPrefs().reset()`, and that clears the SDK's bag and the
// synced `user_app_prefs` row — nothing else. These keys predate the bag (or,
// like the default-app offer, are deliberately device-local), so before this
// they survived the reset: a reader who'd ticked "don't show again" on the
// warning that FILLING a box doesn't REDACT what's under it could never get
// that warning back. The reset is what makes a permanent dismissal acceptable
// (see ToolbarUserProfile), so it has to reach every one of them.
//
// The SDK's hook for "the app's own settings" is the `onResetDefaults` prop:
// its Reset row runs `useResetAppDefaults` (SDK 0.172.0), which clears the
// SDK-owned defaults (default views, language and colour-scheme overrides) and
// then calls that prop. There's no registry of app keys, so both places this
// app passes `onResetDefaults` (App's landing navbar, ToolbarUserProfile) call
// this beside `useUserPrefs().reset()`.
//
// Adding a "don't show again" that stores to localStorage? Add its key here,
// or better, store it with `useUserPrefs().setPref` (as PlacementHint does)
// and the SDK reset covers it — and it follows the user across devices.
//
// The keys are DEFINED here and imported by the prompts that use them, so the
// list below cannot drift from what those prompts actually write.

/** AnnotationLayer — "filling a box isn't redacting" warning. */
export const FILL_WARNING_KEY = 'updf:fillWarningDismissed'
/** Onboarding/MobileWelcomeToast — the phone welcome toast. */
export const MOBILE_WELCOME_KEY = 'universal-pdf-mobile-welcome-dismissed'
/** hooks/useDefaultPdfApp — the desktop "make this your PDF app?" offer. */
export const DEFAULT_APP_ASKED_KEY = 'unipdf:default-app-asked'

const DISMISSAL_KEYS = [FILL_WARNING_KEY, MOBILE_WELCOME_KEY, DEFAULT_APP_ASKED_KEY]

/** Bring back every app-owned dismissed prompt. Takes effect the next time each prompt would show. */
export function clearDismissedPrompts(): void {
  for (const key of DISMISSAL_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Locked-down storage throws on access — then there was nothing stored
      // to clear either.
    }
  }
}
