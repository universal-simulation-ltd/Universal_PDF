import { useCallback, useEffect, useState } from 'react'

type DesktopApi = NonNullable<Window['desktop']>
type PreviewPaneStatus = Awaited<ReturnType<DesktopApi['previewPane']['status']>>

export type PreviewPaneOutcome =
  | { kind: 'enabled' }
  | { kind: 'disabled' }
  | { kind: 'declined' }
  | { kind: 'error'; message: string }

export type PreviewPaneOffer = {
  available: boolean
  enabled: boolean
  incomplete: boolean
  busy: boolean
  outcome: PreviewPaneOutcome | null
  toggle: () => Promise<void>
}

/**
 * Whether PDFs show in Explorer's preview pane (Alt+P), and the switch for it.
 *
 * ⚠️ Turning it on raises a Windows administrator prompt — the key that makes a
 * preview handler visible to the shell is machine-wide and a per-user installer
 * cannot write it (see `electron/previewPane.cjs`). So this is deliberately not
 * offered proactively the way the default-app bar is: it is a switch someone
 * has to go and find, because it costs them a UAC prompt.
 *
 * ⚠️ Read `enabled` from the result of the change, never `ok`. A dismissed
 * prompt is not an error worth shouting about — it is simply still off.
 */
export function usePreviewPane(): PreviewPaneOffer {
  const [status, setStatus] = useState<PreviewPaneStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<PreviewPaneOutcome | null>(null)

  const refresh = useCallback(async () => {
    const api = window.desktop?.previewPane
    if (!api) return
    try {
      setStatus(await api.status())
    } catch {
      // An unanswerable probe leaves `status` null, which shows nothing —
      // better than a switch that cannot be honoured.
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const toggle = useCallback(async () => {
    const api = window.desktop?.previewPane
    if (!api || busy) return
    const turningOn = !status?.enabled
    setBusy(true)
    setOutcome(null)
    try {
      const result = await api.set(turningOn)
      setStatus((prev) => (prev ? { ...prev, enabled: result.enabled, incomplete: false } : prev))
      if (result.enabled === turningOn) {
        setOutcome({ kind: turningOn ? 'enabled' : 'disabled' })
      } else if (result.error) {
        // The overwhelmingly likely cause is a dismissed prompt, which is a
        // choice rather than a fault.
        setOutcome({ kind: 'declined' })
      }
    } catch (err) {
      setOutcome({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
      void refresh()
    }
  }, [busy, refresh, status?.enabled])

  return {
    available: !!status?.supported,
    enabled: !!status?.enabled,
    incomplete: !!status?.incomplete,
    busy,
    outcome,
    toggle,
  }
}
