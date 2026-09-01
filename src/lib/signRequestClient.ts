import { useUniversal } from '@unisim/sdk'
import { hashSecret, randomHex, generateAccessPin } from './signAccessSecret'

// Client wrappers for the "Send to sign" Edge Functions.
//
// - pdf-sign-request  (recipient side): validate the ?signdoc=<token> link,
//   fetch a signed URL for the stored PDF, and submit the signed copy back.
// - send-sign-request (sender side): email the request out with the PDF
//   attached; a 501 not_configured response means "fall back to mailto:".
//
// On a request minted with verification on (migration 0131), three more
// recipient-side actions run BEFORE the document exists as far as the client is
// concerned: `begin` (what the holding page shows), `requestAccessCode` (the
// typed address is compared and a code emailed to the STORED one), and
// `verifyAccess` (code + optional PIN → a session). The session is then required
// by BOTH `load` and `submit`.
//
// Backend: migrations 0057 + 0058 + 0131 and the two functions in
// universal-platform/supabase/functions/.

type Supabase = ReturnType<typeof useUniversal>['supabase']

/** Build a party's signing link for a sign-request party token. BASE_URL keeps
 *  it correct under the /pdf/ portal prefix and in local dev alike. */
export function signRequestLink(token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}?signdoc=${token}`
}

/** Public certificate-page link for a request's cert_id. */
export function certLink(certId: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}?cert=${certId}`
}

function base64FromBytes(bytes: Uint8Array): string {
  // Chunked btoa — String.fromCharCode(...bytes) overflows the arg limit on
  // multi-MB PDFs.
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export interface LoadSignRequestResult {
  ok: boolean
  error?: string
  code?: 'invalid_token' | 'expired' | 'already_signed' | 'deleted' | 'completed'
    | 'verification_required' | 'verification_expired' | 'no_recipient' | (string & {})
  docName?: string
  signedUrl?: string
  party?: { role: 'requester' | 'recipient'; status: 'pending' | 'signed' }
  alreadySigned?: boolean
}

/** Recipient: validate the token and get the document (name + signed URL).
 *  `session` is required when the request was minted with verification on —
 *  without it the server answers `verification_required`. */
export async function loadSignRequest(supabase: Supabase, token: string, session?: string): Promise<LoadSignRequestResult> {
  const { data, error } = await supabase.functions.invoke('pdf-sign-request', {
    body: { action: 'load', token, session },
  })
  if (error) {
    // FunctionsHttpError carries the response — surface the body's message/code.
    const body = await parseFunctionError(error)
    return { ok: false, error: body.error ?? error.message, code: body.code }
  }
  return (data ?? { ok: false, error: 'No response' }) as LoadSignRequestResult
}

export interface SubmitSignedResult {
  ok: boolean
  error?: string
  code?: string
  notified?: boolean
  completed?: boolean
  status?: 'partially_signed' | 'completed'
  cert_id?: string
}

/** Recipient/party: file the signed PDF back, along with the structured
 *  annotation set so the server can classify what was added (signature vs
 *  other edits) into the provenance log. */
export async function submitSignedPdf(
  supabase: Supabase,
  token: string,
  bytes: Uint8Array,
  annotations: Array<{ type?: string; opacity?: number; pageIndex?: number }>,
  session?: string,
): Promise<SubmitSignedResult> {
  // ⚠️ The session goes on the SUBMIT too, not just the load. The server
  // enforces it on both — guarding only the view would leave a forwarded link
  // able to sign the document without ever opening it.
  const { data, error } = await supabase.functions.invoke('pdf-sign-request', {
    body: { action: 'submit', token, pdfBase64: base64FromBytes(bytes), annotations, session },
  })
  if (error) {
    const body = await parseFunctionError(error)
    return { ok: false, error: body.error ?? error.message, code: body.code }
  }
  return (data ?? { ok: false, error: 'No response' }) as SubmitSignedResult
}

export interface CertDownloadResult {
  ok: boolean
  error?: string
  code?: 'not_found' | 'deleted' | (string & {})
  docName?: string
  signedUrl?: string
}

/** Certificate page: get a signed URL for the final signed PDF (by cert_id). */
export async function certificateDownload(supabase: Supabase, certId: string): Promise<CertDownloadResult> {
  const { data, error } = await supabase.functions.invoke('pdf-sign-request', {
    body: { action: 'download', cert_id: certId },
  })
  if (error) {
    const body = await parseFunctionError(error)
    return { ok: false, error: body.error ?? error.message, code: body.code }
  }
  return (data ?? { ok: false, error: 'No response' }) as CertDownloadResult
}

export interface SendSignEmailResult {
  ok: boolean
  error?: string
  /** 'not_configured' ⇒ open a mailto: draft instead. */
  code?: 'not_configured' | 'email_unverified' | 'too_large' | (string & {})
}

/** Sender: email the request (PDF attached) to the recipient. */
export async function sendSignRequestEmail(
  supabase: Supabase,
  input: { to: string; link: string; docName: string; senderName?: string; bytes?: Uint8Array },
): Promise<SendSignEmailResult> {
  const { data, error } = await supabase.functions.invoke('send-sign-request', {
    body: {
      to: input.to,
      link: input.link,
      docName: input.docName,
      senderName: input.senderName,
      pdfBase64: input.bytes ? base64FromBytes(input.bytes) : undefined,
    },
  })
  if (error) {
    const body = await parseFunctionError(error)
    return { ok: false, error: body.error ?? error.message, code: body.code }
  }
  return (data ?? { ok: false, error: 'No response' }) as SendSignEmailResult
}

/** Prefilled mailto: draft — the fallback when the email function isn't
 *  deployed/configured. */
export function signRequestMailto(input: { to: string; docName: string; link: string }): string {
  const subject = `Please sign: ${input.docName}`
  const body =
    `Hi,\n\nI've sent you a document to sign — ${input.docName}.\n\n` +
    `Click here to sign it online (no account needed):\n${input.link}\n\nThanks!`
  return `mailto:${encodeURIComponent(input.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

async function parseFunctionError(error: unknown): Promise<{ error?: string; code?: string }> {
  // supabase-js throws FunctionsHttpError with `.context` = the Response.
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body && typeof body === 'object') {
        return { error: (body as { error?: string }).error, code: (body as { code?: string }).code }
      }
    } catch {
      // fall through to the generic message
    }
  }
  return {}
}

// ── Verified access (migration 0131) ────────────────────────────────────────

export interface BeginSignRequestResult {
  ok: boolean
  error?: string
  code?: string
  docName?: string
  /** False for every request minted before 0131, and for any the sender left
   *  open — the caller then goes straight to `loadSignRequest`. */
  requireVerification?: boolean
  hasPin?: boolean
  /** e.g. `j••••@u•••••.co.uk`, or null if no address is on file. */
  maskedEmail?: string | null
  role?: 'requester' | 'recipient'
  alreadySigned?: boolean
  completed?: boolean
}

/** Recipient: what the holding page needs. Returns no document and no signed
 *  URL, and moves nothing — safe for a link scanner to hit. */
export async function beginSignRequest(supabase: Supabase, token: string): Promise<BeginSignRequestResult> {
  const { data, error } = await supabase.functions.invoke('pdf-sign-request', {
    body: { action: 'begin', token },
  })
  if (error) {
    const body = await parseFunctionError(error)
    return { ok: false, error: body.error ?? error.message, code: body.code }
  }
  return (data ?? { ok: false, error: 'No response' }) as BeginSignRequestResult
}

export interface RequestAccessCodeResult {
  ok: boolean
  error?: string
  code?: 'email_mismatch' | 'too_soon' | 'too_many_sends' | 'not_configured' | 'no_recipient' | (string & {})
  maskedEmail?: string
  expiresInMinutes?: number
  retryAfter?: number
}

/**
 * Recipient: "this is my address, send me a code."
 *
 * ⚠️ The address is a CLAIM the server compares against the one the sender
 * stored; the code is emailed to the stored one either way. Nothing the caller
 * types can redirect it.
 */
export async function requestAccessCode(
  supabase: Supabase,
  token: string,
  email: string,
): Promise<RequestAccessCodeResult> {
  const { data, error } = await supabase.functions.invoke('pdf-sign-request', {
    body: { action: 'request_code', token, email },
  })
  if (error) {
    const body = await parseFunctionError(error)
    return { ok: false, error: body.error ?? error.message, code: body.code }
  }
  return (data ?? { ok: false, error: 'No response' }) as RequestAccessCodeResult
}

export interface VerifyAccessResult {
  ok: boolean
  error?: string
  code?: 'bad_credentials' | 'code_expired' | 'too_many_attempts' | 'no_code' | (string & {})
  /** Hand this to `loadSignRequest` and `submitSignedPdf`. */
  session?: string
  triesLeft?: number
  expiresInMinutes?: number
}

/** Recipient: the emailed code, plus the sender's PIN if there is one. */
export async function verifyAccess(
  supabase: Supabase,
  token: string,
  input: { code: string; pin?: string },
): Promise<VerifyAccessResult> {
  const { data, error } = await supabase.functions.invoke('pdf-sign-request', {
    body: { action: 'verify', token, code: input.code, pin: input.pin },
  })
  if (error) {
    const body = await parseFunctionError(error)
    return { ok: false, error: body.error ?? error.message, code: body.code }
  }
  return (data ?? { ok: false, error: 'No response' }) as VerifyAccessResult
}

// ── Sender side: turning the protection on ──────────────────────────────────

/**
 * Sender: switch verification on for a freshly minted request, and store the
 * hash of the optional PIN.
 *
 * ⚠️ A separate UPDATE rather than part of the insert because
 * `createSignRequest` lives in `@unisim/sdk` and does not know about these
 * columns. The UPDATE only started working in migration 0131, which added the
 * member update policy that `pdf_sign_requests` never had — see the note there
 * about `updateSignRequestRecipient` having silently matched zero rows.
 *
 * The PIN itself is never sent anywhere: only its salt and hash leave the
 * browser. The sender is shown it once and has to pass it on themselves.
 */
export { generateAccessPin }

export async function applySignRequestProtection(
  supabase: Supabase,
  requestId: string,
  opts: { requireVerification: boolean; pin?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = {
    require_verification: opts.requireVerification,
    has_access_pin: !!opts.pin,
    access_pin_hash: null,
    access_pin_salt: null,
  }
  if (opts.pin) {
    const salt = randomHex(16)
    patch.access_pin_salt = salt
    patch.access_pin_hash = await hashSecret(opts.pin, salt)
  }
  const { error } = await supabase.from('pdf_sign_requests').update(patch).eq('id', requestId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
