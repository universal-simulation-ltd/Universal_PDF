// "Tell me when the desktop app is ready" (James, 2026-10-13: "even if they
// are released on github, have tell me when app until we say the product is
// ready"). The download marks on the landing stay; the website also offers this
// sign-up under them — see components/Landing/DownloadRow.tsx.
//
// What is sent: ONE call, rpc register_app_interest('pdf', email, 'desktop')
// (universal-platform migration 0293). Only the email is stored; it gets one
// email when the desktop app is ready, and is deleted 30 days after that, or 24
// months after signing up if it never is. Nothing is kept in this browser.
//
// The same contract as the portal's `opensource-portal/public/notify-me.js`:
// the same address pattern, the same states.

/**
 * ⚠️ THE READY SWITCH. Set this to `true` when James says the desktop app is
 * ready: the sign-up disappears from the website, and the download marks are
 * all that is left. Starts `false`.
 */
export const DESKTOP_READY = false

/** Same rule as 0293's check constraint: something@something.something, no spaces. */
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
    fn: 'register_app_interest',
    args: { p_product: 'pdf'; p_email: string; p_what: 'desktop' },
  ) => PromiseLike<{ data: unknown; error: unknown }>
}

/**
 * Sign `email` (already normalised) up for the desktop app. The RPC answers
 * true when the address is on the list (new, or already there — by design it
 * cannot say which) and false for an address it refuses or when the suite-wide
 * hourly cap is hit. The address was checked first, so false means "try later".
 */
export async function registerDesktopInterest(client: RpcClient, email: string): Promise<InterestOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  try {
    const { data, error } = await client.rpc('register_app_interest', {
      p_product: 'pdf',
      p_email: email,
      p_what: 'desktop',
    })
    if (error) return isNetworkError(error) ? 'offline' : 'later'
    return data === true ? 'ok' : 'later'
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
