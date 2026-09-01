// The sender's half of "Send to sign" verified access (migration 0131): the
// access PIN, and the one recipe that has to agree with the server.
//
// ⚠️ Imports NOTHING — `scripts/signAccessSecret.test.mjs` runs it under Node's
// type stripping.

/**
 * `SHA-256(salt + ":" + value)`, hex.
 *
 * ⚠️ THIS RECIPE IS SHARED WITH ANOTHER REPO AND NOTHING ENFORCES IT AT BUILD
 * TIME. The sender's browser hashes the PIN here; `hashSecret` in
 * universal-platform's `supabase/functions/_shared/sign-access.ts` is what
 * compares it. The two cannot import each other, so the only thing holding them
 * together is that BOTH repos' tests assert the same hard-coded vector —
 * `hashSecret('123456', 'a1b2c3d4')` ends `…1ed00d54`. Change the separator,
 * the order or the encoding on either side and every PIN silently stops
 * matching, with no error anywhere to say why: the recipient simply cannot get
 * in and nobody can tell them why.
 */
export async function hashSecret(value: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${value}`))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * A 6-digit PIN for the sender to read out over the phone.
 *
 * ⚠️ Generated, never chosen. A sender picking their own picks 1234 — and
 * because only a salted hash is stored they could not look it up later anyway,
 * so asking them to invent one buys nothing and costs entropy. Rejection
 * sampling rather than `% 1000000`, which biases toward the low PINs.
 */
export function generateAccessPin(): string {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0xFFFFFFFF / 1_000_000) * 1_000_000
  let v: number
  do {
    crypto.getRandomValues(buf)
    v = buf[0]
  } while (v >= limit)
  return String(v % 1_000_000).padStart(6, '0')
}
