import { isNativeShell } from './nativeOpen'

/**
 * Shortcuts and share-sheet actions handed to the app by the OS (2026-10-12,
 * the App Store 4.3 push: things only a phone app can do).
 *
 *   iOS      App Intents in ios/App/App/AppActions.swift — "Scan to PDF",
 *            "Make a PDF Smaller", "Sign a PDF" — in Shortcuts,
 *            Siri and Spotlight.
 *   Android  launcher shortcuts (res/xml/shortcuts.xml) for Scan, and two
 *            share-sheet targets ("Sign with Universal PDF", "Make smaller
 *            with Universal PDF"), all routed by MainActivity.
 *
 * Both sides queue the action in the native `AppActions` plugin, which hands it
 * over here: `getPending()` for a launch the action started (the WebView was not
 * listening yet), the `action` event for one that arrives while the app runs.
 *
 * ⚠️ Like DocumentScanner, the plugin lives in this repository's native
 * projects, not a package, so `npx cap sync` neither adds nor removes it.
 */
export type AppAction =
  | { type: 'scan' }
  | { type: 'compress'; file?: string }
  | { type: 'sign'; file?: string }

interface AppActionsPlugin {
  getPending(): Promise<{ actions: AppAction[] }>
  addListener(event: 'action', cb: (action: AppAction) => void): Promise<{ remove: () => Promise<void> }>
}

// See lib/documentScanner.ts: never resolve a promise with a plugin.
let plugin: Promise<{ p: AppActionsPlugin }> | null = null
function getPlugin(): Promise<{ p: AppActionsPlugin }> {
  plugin ??= import('@capacitor/core').then(({ registerPlugin }) => ({
    p: registerPlugin<AppActionsPlugin>('AppActions'),
  }))
  return plugin
}

function isAction(a: unknown): a is AppAction {
  const type = (a as { type?: unknown } | null)?.type
  return type === 'scan' || type === 'compress' || type === 'sign'
}

/**
 * Calls `onAction` for every shortcut the OS hands over, the launch one
 * included. Resolves to an unsubscribe function; off the phone apps, a no-op.
 */
export async function subscribeAppActions(onAction: (action: AppAction) => void): Promise<() => void> {
  if (!isNativeShell()) return () => {}
  let cancelled = false
  try {
    const { p } = await getPlugin()
    // Listener first, then the queue: an action that lands in between is in
    // one or the other, and the native side removes what `getPending` returns.
    const listener = await p.addListener('action', (a) => {
      if (!cancelled && isAction(a)) onAction(a)
    })
    const { actions } = await p.getPending()
    for (const a of actions ?? []) if (!cancelled && isAction(a)) onAction(a)
    return () => {
      cancelled = true
      void listener.remove()
    }
  } catch (err) {
    // A native build that predates the plugin: no shortcuts, nothing broken.
    console.warn('AppActions unavailable:', err)
    return () => {}
  }
}
