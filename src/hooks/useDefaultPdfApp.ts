import { useCallback, useEffect, useState } from 'react'

type DesktopApi = NonNullable<Window['desktop']>
type DefaultAppStatus = Awaited<ReturnType<DesktopApi['defaultApp']['status']>>

export type DefaultAppOutcome =
  | { kind: 'done' }
  | { kind: 'settings' }
  | { kind: 'error'; message: string }

// Whether the proactive offer has been put to this person already. One ask,
// then never again — the app is useful whether or not it owns the file type,
// and a prompt that returns every launch is the reason people distrust them.
const ASKED_KEY = 'unipdf:default-app-asked'

function readAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    // Private windows and locked-down storage throw on access. Treating that
    // as "already asked" is the safe way round: it loses an offer rather than
    // repeating one that can never be remembered as answered.
    return true
  }
}

/**
 * The app's standing with the OS over `.pdf`, and the one action that can
 * change it.
 *
 * ⚠️ Ask the OS, never assume from the platform. Detection works on all three
 * desktops, but only macOS and Linux can be *changed* from in here — Windows
 * can only open Settings (see `electron/defaultApp.cjs`), which is why
 * `canSet` and `isDefault` are separate answers and the UI reads both.
 */
export function useDefaultPdfApp() {
  const [status, setStatus] = useState<DefaultAppStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<DefaultAppOutcome | null>(null)
  const [asked, setAsked] = useState(readAsked)

  const refresh = useCallback(async () => {
    const api = window.desktop?.defaultApp
    if (!api) return
    try {
      setStatus(await api.status())
    } catch {
      // An unanswerable probe leaves `status` null, which shows nothing at
      // all. Better than an offer that cannot be honoured.
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!status?.supported || status.isDefault) return
    // On Windows the change is made in Settings, in another window — so the
    // answer can be different by the time the app is looked at again.
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [status, refresh])

  const remember = useCallback(() => {
    setAsked(true)
    try {
      localStorage.setItem(ASKED_KEY, '1')
    } catch {
      /* Nothing to do: the offer is hidden for this session either way. */
    }
  }, [])

  const makeDefault = useCallback(async () => {
    const api = window.desktop?.defaultApp
    if (!api) return
    setBusy(true)
    setOutcome(null)
    try {
      const result = await api.makeDefault()
      if (result.isDefault) {
        setStatus((prev) => (prev ? { ...prev, isDefault: true } : prev))
        setOutcome({ kind: 'done' })
        remember()
      } else if (result.openedSettings) {
        setOutcome({ kind: 'settings' })
        remember()
      } else {
        // Deliberately NOT remembered: a failure should not spend the one ask
        // this app gets.
        setOutcome({ kind: 'error', message: result.error ?? 'Could not change the default.' })
      }
    } catch {
      setOutcome({ kind: 'error', message: 'Could not change the default.' })
    } finally {
      setBusy(false)
    }
  }, [remember])

  const dismiss = useCallback(() => {
    setOutcome(null)
    remember()
  }, [remember])

  // ⚠️ Windows is the one platform where `canSet` is false and there is still
  // something worth offering — opening Settings. Anywhere else a false
  // `canSet` means the change genuinely cannot be made (an AppImage with no
  // installed desktop entry), and offering it would be a button that only ever
  // returns an error.
  const actionable =
    !!status?.supported && !status.isDefault && (status.canSet || status.platform === 'win32')

  return {
    /** This app is not the handler, and something can be done about it. */
    available: actionable,
    /** The unprompted offer: only before it has been put, and only once. */
    showOffer: actionable && !asked,
    /** False where the app cannot make the change itself (Windows). */
    canSet: !!status?.canSet,
    isDefault: !!status?.isDefault,
    /** What currently opens PDFs instead of us, where the OS will say. */
    currentName: status?.currentName,
    reason: status?.reason,
    platform: status?.platform,
    busy,
    outcome,
    makeDefault,
    dismiss,
  }
}

export type DefaultAppOffer = ReturnType<typeof useDefaultPdfApp>
