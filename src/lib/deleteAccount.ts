// "Delete my account": the request half of components/Header/DeleteAccountDialog.
//
// Kept out of the component so it can be tested against a fake client
// (scripts/deleteAccount.test.mjs). The SDK's offline mock (`?mockauth=1`) has
// no `functions` at all, so no browser test can reach a successful call.

export const CONFIRM_PHRASE = 'delete-all'

export const FALLBACK_ERROR =
  "Couldn't delete your account. Check your connection and try again, or email inbox@unisim.co.uk."

/** Forgiving of case and stray spaces; the function itself gets the exact phrase. */
export function isConfirmed(typed: string): boolean {
  return typed.trim().toLowerCase() === CONFIRM_PHRASE
}

/** The two parts of a Supabase client this needs. */
export interface DeleteAccountClient {
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ error: unknown }> }
  auth: { signOut(options: { scope: 'local' }): Promise<unknown> }
}

/**
 * The function's own sentence when it sent one. supabase-js wraps a non-2xx
 * answer in a FunctionsHttpError whose `context` is the raw Response, and the
 * platform's `delete-account` always answers `{ ok: false, error }`.
 */
async function reasonFrom(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (typeof Response !== 'undefined' && context instanceof Response) {
    try {
      const body = (await context.json()) as { error?: unknown }
      if (typeof body?.error === 'string' && body.error) return body.error
    } catch { /* not JSON: fall through */ }
  }
  return FALLBACK_ERROR
}

/**
 * Delete the signed-in person's Universal ID in every UNI·SIM product, then
 * drop the session on this device.
 *
 * The platform's `delete-account` edge function does the work and checks the
 * phrase too, so nothing here can delete an account nobody confirmed.
 */
export async function deleteMyAccount(
  supabase: DeleteAccountClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.functions.invoke('delete-account', {
      body: { confirm: CONFIRM_PHRASE },
    })
    if (error) return { ok: false, error: await reasonFrom(error) }
  } catch (e) {
    return { ok: false, error: await reasonFrom(e) }
  }
  // ⚠️ LOCAL sign-out. The account no longer exists on the server, so the
  // session is a dead token; a global sign-out would call the server as a user
  // who is not there any more and fail.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  return { ok: true }
}
