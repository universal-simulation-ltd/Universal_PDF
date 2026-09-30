import { useCallback, useEffect, useState } from 'react'
import { useUniversal } from '@unisim/sdk'

// The org's counted free allowance (migration 0199). PDF, Images, Exports and
// Recorder share ONE "files" pool, so the numbers that matter here are
// bytes_used / bytes_limit — read from the server, never hardcoded.
export type FreeAllowanceStatus = {
  ok: boolean
  app: string
  budget: string
  unlimited: boolean
  used: number
  limit: number
  bytes_used: number
  bytes_limit: number
  month_used: number
  month_limit: number
  has_room: boolean
}

// Fails quiet: any error (or no org, `ok:false`) leaves `status` null, and a
// null status shows nothing. Gating stays with useAppFreeToken + the backend.
// `enabled` (the dialog's open flag) re-reads on every open, so a file stored
// or deleted elsewhere in the app is reflected next time the dialog shows.
export function useFreeAllowance(app: 'pdf' | 'images' | 'exports', enabled = true) {
  const { supabase, session, activeOrgId } = useUniversal()
  const signedIn = !!session?.user && session.user.is_anonymous !== true
  const [status, setStatus] = useState<FreeAllowanceStatus | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!signedIn) {
      setStatus(null)
      return
    }
    if (!enabled) return
    let cancelled = false
    supabase
      .rpc('free_allowance_status', { p_app: app })
      .then(
        ({ data, error }) => {
          if (cancelled) return
          const s = data as FreeAllowanceStatus | null
          setStatus(!error && s && s.ok ? s : null)
        },
        () => { if (!cancelled) setStatus(null) },
      )
    return () => { cancelled = true }
  }, [supabase, signedIn, activeOrgId, app, enabled, reloadKey])

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])
  return { status, refresh }
}

const MB = 1024 * 1024

// "Near the limit": signed in, not unlimited, still has room, and at least 80%
// of the shared bytes used. Returns whole megabytes for the copy, or null when
// the line should not show (below 80%, at/over the limit, or no numbers).
export function nearFreeLimit(s: FreeAllowanceStatus | null): { usedMb: number; limitMb: number } | null {
  if (!s || s.unlimited || !s.has_room) return null
  const used = Number(s.bytes_used)
  const limit = Number(s.bytes_limit)
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null
  if (used / limit < 0.8) return null
  return { usedMb: Math.round(used / MB), limitMb: Math.round(limit / MB) }
}
