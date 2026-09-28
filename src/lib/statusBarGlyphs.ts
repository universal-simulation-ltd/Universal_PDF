// Which status-bar glyphs the native shell should ask for — the decision only.
//
// A leaf module with NO imports, so `scripts/statusBarGlyphs.test.mjs` can load
// it under Node's type-stripping. `setStatusBarOverDarkChrome` (nativeOpen.ts)
// is the caller that actually talks to Capacitor.
//
// What sits behind the clock depends on Capacitor 8's core SystemBars plugin:
//
// - iOS, and Android with a WebView from Chromium 140: the page is drawn under
//   the status bar (`viewport-fit=cover`) and pads itself by
//   `env(safe-area-inset-top)`, so the glyphs sit over the APP's own chrome —
//   the slate notch spacer with a document open, the white nav bar on the
//   landing page. The glyphs must follow the screen.
// - Android with an older WebView: SystemBars pads the web view natively and
//   `env(safe-area-inset-top)` reads 0, so the spacer has no height and the
//   glyphs sit over the WINDOW background, which values/styles.xml pins white
//   on every screen. Light glyphs there are white on white — the clock gone —
//   so the answer is dark glyphs, always.

/** Is the page drawn under the status bar (so the app's chrome is behind the glyphs)? */
export function pageUnderStatusBar(platform: string, userAgent: string): boolean {
  if (platform === 'ios') return true
  if (platform !== 'android') return false
  // SystemBars' own rule: edge-to-edge only on a WebView from Chromium 140.
  const major = Number(/Chrome\/(\d+)/.exec(userAgent)?.[1] ?? 0)
  return major >= 140
}

/**
 * The SystemBars style to set, in Capacitor's (backwards-reading) names:
 * `'DARK'` = "for a dark background", i.e. LIGHT glyphs; `'LIGHT'` = dark glyphs.
 */
export function statusBarStyleFor(
  darkChrome: boolean,
  platform: string,
  userAgent: string,
): 'DARK' | 'LIGHT' {
  if (!pageUnderStatusBar(platform, userAgent)) return 'LIGHT'
  return darkChrome ? 'DARK' : 'LIGHT'
}
