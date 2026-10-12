// The signer's country for the signing audit trail (2026-10-12).
//
// pdf-sign-request records each signer's IP, browser and country on the
// provenance log, but it can't see the country itself: Supabase drops
// Cloudflare's country header before the Edge Function runs. The suite's
// portal Worker, which can see it, hands out a short-lived signed token naming
// it (GET /api/geo), and the function checks the signature before recording
// it. The same token Universal Exports sends to exports-sign.
//
// Best effort: no token, no country. Signing is never held up for it — a
// 2.5-second cap, and any failure (offline, blocked, 503) is just "no token".

const GEO_URL = 'https://opensource.unisim.co.uk/api/geo'
let cache: { token: string; at: number } | null = null

export async function geoToken(): Promise<string | undefined> {
  // Tokens live 10 minutes; reuse one for 8.
  if (cache && Date.now() - cache.at < 8 * 60_000) return cache.token
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(GEO_URL, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(timer)
    if (!res.ok) return undefined
    const { token } = (await res.json()) as { token?: unknown }
    if (typeof token !== 'string') return undefined
    cache = { token, at: Date.now() }
    return token
  } catch {
    return undefined
  }
}
