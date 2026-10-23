// Scan to sign, step 2: the verified-email trail (universal-platform 0306,
// 2026-10-22).
//
// When the UNI·SIM Hub phone app answers a "Sign on phone" QR, it first asks
// the `phone-sign-attest` edge function to record that a Universal ID with a
// CONFIRMED email sent this exact PNG to this exact channel, and adds the
// record's id to the broadcast as `attest: <cert_id>` (32 hex characters). A
// phone signing through this app's own phone page sends no `attest`, and
// neither does an older Hub — both keep working exactly as before.
//
// The id on its own proves nothing: anyone on the channel could paste someone
// else's. So the desktop looks it up (verify_phone_sign_attestation, anon) and
// believes it only when the record says
//   ok             true
//   app            this app
//   channel_sha256 sha256(UTF-8 of OUR token, the part after `mobile-sig:`)
//   png_sha256     sha256(the DECODED PNG bytes we received)
// — so it can't be lifted onto another session or another image. Anything
// missing or different: null, and nothing extra is printed.
//
// ⚠️ Kept free of app imports so `npm run test:attest` can load it in plain
// Node. Universal Exports has a copy (src/lib/phoneAttest.ts) — keep the two
// in step; Universal PDF is to copy the same rules.

/** Where anyone can check an attestation (the hub's /check page). */
export const ATTEST_CHECK_URL = 'https://app.unisim.co.uk/check?attest='

export type AttestApp = 'signatures' | 'pdf' | 'ergo' | 'exports'

/** A checked attestation: safe to print. */
export interface PhoneAttestation {
  certId: string
  /** The signer's confirmed Universal ID email, as the server holds it. */
  signerEmail: string
  /** When the server recorded it, ISO-8601. */
  signedAt: string
  /** sha256 of the PNG it vouches for, so a caller can re-check before printing. */
  pngSha256: string
  /** https://app.unisim.co.uk/check?attest=<certId> */
  checkUrl: string
}

/** supabase.rpc, or a stand-in for tests. */
export type AttestRpc = (
  fn: 'verify_phone_sign_attestation',
  args: { p_cert: string },
) => PromiseLike<{ data: unknown; error: unknown }>

const CERT = /^[0-9a-f]{32}$/
const HEX64 = /^[0-9a-f]{64}$/
const B64 = /^[A-Za-z0-9+/]+=*$/
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function isAttestCertId(v: unknown): v is string {
  return typeof v === 'string' && CERT.test(v)
}

/**
 * The PNG's own bytes from a `data:image/png;base64,` URL or bare base64 (the
 * two dialects the suite's desktops receive). Null for anything else,
 * including a JPEG, which no attestation can be about.
 */
export function pngBytes(signature: string): Uint8Array | null {
  const b64 = signature.startsWith('data:')
    ? (/^data:image\/png;base64,(.*)$/s.exec(signature)?.[1] ?? '')
    : signature
  if (!b64 || !B64.test(b64)) return null
  let bin: string
  try {
    bin = atob(b64)
  } catch {
    return null
  }
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  if (bytes.length < PNG_MAGIC.length || PNG_MAGIC.some((b, i) => bytes[i] !== b)) return null
  return bytes
}

/** Lowercase hex SHA-256 of bytes, or of a string's UTF-8. */
export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Check a broadcast's `attest` against what this desktop actually holds.
 * Never throws: every failure, including the lookup itself, is null.
 */
export async function verifyPhoneAttestation(
  rpc: AttestRpc,
  args: { attest: unknown; channelToken: string; signature: string; app: AttestApp },
): Promise<PhoneAttestation | null> {
  try {
    const { attest, channelToken, signature, app } = args
    if (!isAttestCertId(attest) || !channelToken) return null
    const bytes = pngBytes(signature)
    if (!bytes) return null
    const { data, error } = await rpc('verify_phone_sign_attestation', { p_cert: attest })
    if (error || !data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    if (d.ok !== true || d.app !== app) return null
    if (d.cert_id !== undefined && d.cert_id !== attest) return null
    const email = typeof d.signer_email === 'string' ? d.signer_email.trim() : ''
    if (!email || email.length > 320 || !email.includes('@')) return null
    const signedAt = typeof d.signed_at === 'string' && !Number.isNaN(Date.parse(d.signed_at)) ? d.signed_at : ''
    if (!signedAt) return null
    if (typeof d.channel_sha256 !== 'string' || !HEX64.test(d.channel_sha256)) return null
    if (typeof d.png_sha256 !== 'string' || !HEX64.test(d.png_sha256)) return null
    const [channelHash, pngHash] = await Promise.all([sha256Hex(channelToken), sha256Hex(bytes)])
    if (d.channel_sha256 !== channelHash || d.png_sha256 !== pngHash) return null
    return { certId: attest, signerEmail: email, signedAt, pngSha256: pngHash, checkUrl: ATTEST_CHECK_URL + attest }
  } catch {
    return null
  }
}

/**
 * True when `attestation` is about exactly this image — checked again just
 * before printing, because the signature can be changed after it arrived.
 */
export async function attestationMatches(attestation: PhoneAttestation | null | undefined, signature: string | null | undefined): Promise<boolean> {
  if (!attestation || !signature) return false
  const bytes = pngBytes(signature)
  return !!bytes && (await sha256Hex(bytes)) === attestation.pngSha256
}

/** "22 Oct 2026, 14:07 UTC" — for a printed page, which may be read anywhere. */
export function formatAttestUtc(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  })} UTC`
}

/** The time in the reader's own language and zone, for the screen. */
export function formatAttestLocal(iso: string, lang: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return d.toLocaleString()
  }
}

/** The printed line (documents in this app are English, like the certificate page). */
export function attestLineEnglish(a: PhoneAttestation): string {
  return `Signed by ${a.signerEmail} via Universal ID · ${formatAttestUtc(a.signedAt)}`
}

// ── Which attested signatures are on a document ────────────────────────────

/** A held attestation, as phoneAttestStore keeps it (no store import here). */
export interface AttestedSignature {
  attestation: PhoneAttestation
  /** The base64 PNG exactly as the phone sent it. */
  received: string
  /** The library entry's image: what a placed signature carries. */
  dataUrl: string
}

/** The parts of an annotation this needs (types/annotations, structurally). */
type PlacedMark =
  | { type: 'image'; src?: string; sig?: { ink?: string } }
  | { type: 'sigfield'; signed?: { src?: string; data?: { ink?: string } } }
  | { type: string }

/**
 * The attested signatures that are actually ON the document: a placed
 * library signature (its `src`, or the untouched `sig.ink` once its name or
 * date was changed) or a signed box holding the same image. One per
 * attestation, however many times it was placed. Empty means no record page.
 */
export function attestedOnDocument(
  annotations: readonly PlacedMark[],
  byEntry: Record<string, AttestedSignature>,
): AttestedSignature[] {
  const held = Object.values(byEntry)
  if (!held.length) return []
  const images = new Set<string>()
  for (const a of annotations) {
    if (a.type === 'image') {
      const m = a as { src?: string; sig?: { ink?: string } }
      if (m.src) images.add(m.src)
      if (m.sig?.ink) images.add(m.sig.ink)
    } else if (a.type === 'sigfield') {
      const f = a as { signed?: { src?: string; data?: { ink?: string } } }
      if (f.signed?.src) images.add(f.signed.src)
      if (f.signed?.data?.ink) images.add(f.signed.data.ink)
    }
  }
  const seen = new Set<string>()
  return held.filter((h) => {
    if (!images.has(h.dataUrl) || seen.has(h.attestation.certId)) return false
    seen.add(h.attestation.certId)
    return true
  })
}
