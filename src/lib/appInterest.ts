// "Tell me when the desktop app is ready" (James, 2026-10-13: "even if they
// are released on github, have tell me when app until we say the product is
// ready"). The download marks on the landing stay; the website also offers this
// sign-up under them — see components/Landing/DownloadRow.tsx.
//
// What is sent: ONE call, rpc request_launch_notification('pdf-desktop', email,
// language) — the suite's one launch list (universal-platform 0323; the
// `pdf-desktop` list since 0334, which folded the older app_interest list into
// it). Stored: the address, the language and the list. It gets one email when
// the desktop app is ready, sent from the platform administration console, and
// is deleted as it is sent — or 24 months after signing up if it never is.
// Nothing is kept in this browser.
//
// The same contract as the portal's `opensource-portal/public/notify-me.js`:
// the same address pattern, the same states.

/** This release's list on the launch list (universal-platform 0334). */
export const DESKTOP_LIST = 'pdf-desktop'

/**
 * ⚠️ THE READY SWITCH. Set this to `true` when James says the desktop app is
 * ready: the sign-up disappears from the website, and the download marks are
 * all that is left. Starts `false`.
 */
export const DESKTOP_READY = false

/** Same rule as request_launch_notification() (0323): something@something.something, no spaces. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The address as the server will store it, or null when it would refuse it. */
export function normaliseInterestEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (email.length < 3 || email.length > 254 || !EMAIL.test(email)) return null
  return email
}

/** What the visitor is told. `ok` and `already` are both "on the list". */
export type InterestOutcome = 'ok' | 'later' | 'offline'

// Structural, so the SDK's client fits without importing its types here (and a
// node test can pass a stub).
type RpcClient = {
  rpc: (
    fn: 'request_launch_notification',
    args: { p_product: typeof DESKTOP_LIST; p_email: string; p_language: string | null },
  ) => PromiseLike<{ data: unknown; error: unknown }>
}

/** A language tag the server keeps (0323: letters and hyphens, 2–10), else null. */
function languageTag(raw: string | undefined): string | null {
  const tag = (raw ?? '').trim()
  return /^[A-Za-z-]{2,10}$/.test(tag) ? tag : null
}

/**
 * Sign `email` (already normalised) up for the desktop app, in `language` (the
 * app's language, so the one email comes in it). The RPC answers nothing either
 * way, so it cannot say whether the address was already there; it refuses an
 * address it doesn't accept and when the suite-wide rate limit is hit. The
 * address was checked first, so a refusal means "try later".
 */
export async function registerDesktopInterest(client: RpcClient, email: string, language?: string): Promise<InterestOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  try {
    const { error } = await client.rpc('request_launch_notification', {
      p_product: DESKTOP_LIST,
      p_email: email,
      p_language: languageTag(language),
    })
    if (error) return isNetworkError(error) ? 'offline' : 'later'
    return 'ok'
  } catch (err) {
    return isNetworkError(err) ? 'offline' : 'later'
  }
}

// supabase-js turns a failed fetch into `{ error: { message: 'TypeError: Failed
// to fetch' } }` (or throws a TypeError, depending on version); a PostgREST
// refusal carries a code instead.
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : ''
  return /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
}
