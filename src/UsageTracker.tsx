import { useEffect, useRef } from 'react'
import { useUniversal, useUsageTracker, track } from '@unisim/sdk'

/**
 * Emits a single `session.opened` usage_events row when a signed-in user with an
 * active org opens the app, so god-mode's "last product used" column (universal-
 * platform migration 0052) populates. No-op while anonymous — the SDK drops
 * usage events without a session/org. Mount once inside <UniversalProvider>.
 */
export default function UsageTracker() {
  useUsageTracker()
  const { session, activeOrgId } = useUniversal()
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current || !session || !activeOrgId) return
    fired.current = true
    track('session.opened')
  }, [session, activeOrgId])
  return null
}
