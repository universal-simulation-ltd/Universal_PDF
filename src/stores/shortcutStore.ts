import { useEffect, useRef } from 'react'
import { create } from 'zustand'

/**
 * What a shortcut (lib/appActions.ts) asked the open document's tools to do
 * once its file has loaded: open Export on the smaller copy, or open the Sign
 * menu. The component that can do it takes the request, so it runs once.
 *
 * ⚠️ Two toolbars can be mounted (the bottom bar below `lg`, the top bar above
 * it), so each consumer checks it is the one on screen before taking.
 */
export type ShortcutRequest = 'export' | 'sign'

interface ShortcutState {
  request: ShortcutRequest | null
  ask: (r: ShortcutRequest) => void
  /** Returns true, and clears it, if `r` is the request waiting. */
  take: (r: ShortcutRequest) => boolean
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  request: null,
  ask: (request) => set({ request }),
  take: (r) => {
    if (get().request !== r) return false
    set({ request: null })
    return true
  },
}))

/** True where the bottom (phone) toolbar is the one on screen. */
export const phoneToolbarShowing = (): boolean =>
  typeof window !== 'undefined' && !window.matchMedia?.('(min-width: 1024px)').matches

/**
 * Runs `onRun` once when a shortcut asks for `r`, from the copy of a control
 * that is on screen: `phone` is true for the bottom-toolbar copy, false for
 * the top-bar one.
 */
export function useShortcutRequest(r: ShortcutRequest, phone: boolean, onRun: () => void): void {
  const request = useShortcutStore((s) => s.request)
  const run = useRef(onRun)
  run.current = onRun
  useEffect(() => {
    if (request !== r || phoneToolbarShowing() !== phone) return
    if (useShortcutStore.getState().take(r)) run.current()
  }, [request, r, phone])
}
