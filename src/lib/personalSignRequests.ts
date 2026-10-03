import { useCallback, useEffect, useState } from 'react'
import type { useUniversal, CreateSignRequestResult, SignRequest } from '@unisim/sdk'

// Send to sign for a Universal ID with no company (migration 0228). The SDK's
// createSignRequest / useSignRequests are company-only — `orgId` is a string
// and the list is empty without an org — so the personal versions live here:
// the same rows with org_id null, owned by their creator (created_by_id
// defaults to auth.uid() since 0228; the owner RLS policies check it).

type Supabase = ReturnType<typeof useUniversal>['supabase']

const LIST_COLUMNS =
  'id, org_id, upload_id, created_by_id, recipient_email, sender_email, doc_name, status, cert_id, original_sha256, latest_sha256, signed_at, expires_at, created_at'

/** Mint a personal two-party sign request — `createSignRequest` with no company. */
export async function createPersonalSignRequest(
  supabase: Supabase,
  input: { uploadId: string; docName?: string; requesterEmail: string; recipientEmail?: string },
): Promise<CreateSignRequestResult> {
  const { data: reqRow, error: reqErr } = await supabase
    .from('pdf_sign_requests')
    .insert({
      org_id: null,
      upload_id: input.uploadId,
      doc_name: input.docName ?? null,
      recipient_email: input.recipientEmail ?? null,
      sender_email: input.requesterEmail,
    })
    .select('id, cert_id')
    .single()
  if (reqErr) return { ok: false, error: reqErr.message }
  const requestId = (reqRow as { id: string }).id
  const certId = (reqRow as { cert_id: string }).cert_id

  const { data: parties, error: partyErr } = await supabase
    .from('pdf_sign_parties')
    .insert([
      { request_id: requestId, org_id: null, role: 'requester', email: input.requesterEmail },
      { request_id: requestId, org_id: null, role: 'recipient', email: input.recipientEmail ?? null },
    ])
    .select('role, email, party_token')
  if (partyErr) return { ok: false, error: partyErr.message }

  return {
    ok: true,
    requestId,
    certId,
    parties: (parties ?? []).map((p) => ({
      role: p.role as 'requester' | 'recipient',
      email: (p.email as string) ?? null,
      token: p.party_token as string,
    })),
  }
}

/** The signed-in user's personal sign requests, newest first. Reads nothing
 *  while `enabled` is false (a company's requests come from useSignRequests). */
export function usePersonalSignRequests(supabase: Supabase, userId: string | null, enabled: boolean) {
  const [requests, setRequests] = useState<SignRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled || !userId) {
      setRequests([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('pdf_sign_requests')
      .select(LIST_COLUMNS)
      .is('org_id', null)
      .eq('created_by_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        setRequests(error ? [] : ((data ?? []) as SignRequest[]))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, userId, enabled, reloadKey])

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])
  return { requests, loading, refresh }
}
