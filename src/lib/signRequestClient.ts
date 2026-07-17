import { useUniversal } from '@unisim/sdk'

// Client wrappers for the "Send to sign" Edge Functions.
//
// - pdf-sign-request  (recipient side): validate the ?signdoc=<token> link,
//   fetch a signed URL for the stored PDF, and submit the signed copy back.
// - send-sign-request (sender side): email the request out with the PDF
//   attached; a 501 not_configured response means "fall back to mailto:".
//
// Backend: migration 0057_pdf_sign_requests + the two functions in
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
  code?: 'invalid_token' | 'expired' | 'already_signed' | 'deleted' | 'completed' | (string & {})
  docName?: string
  signedUrl?: string
  party?: { role: 'requester' | 'recipient'; status: 'pending' | 'signed' }
  alreadySigned?: boolean
}

/** Recipient: validate the token and get the document (name + signed URL). */
export async function loadSignRequest(supabase: Supabase, token: string): Promise<LoadSignRequestResult> {
  const { data, error } = await supabase.functions.invoke('pdf-sign-request', {
    body: { action: 'load', token },
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
): Promise<SubmitSignedResult> {
  const { data, error } = await supabase.functions.invoke('pdf-sign-request', {
    body: { action: 'submit', token, pdfBase64: base64FromBytes(bytes), annotations },
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
