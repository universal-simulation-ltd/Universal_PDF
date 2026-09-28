// Status-bar glyphs on the native shell — never white on the white strip.
//
//   npm run test:status-bar
//
// Runs under Node's type-stripping, so `statusBarGlyphs.ts` is imported
// directly; it is a leaf module with no imports for exactly that reason.
//
// What is being pinned. With a document open the app asks for light glyphs
// over its slate notch spacer. That spacer only exists where the page is drawn
// under the status bar: iOS, and Android with a WebView from Chromium 140. On
// an older Android WebView, Capacitor's SystemBars pads the web view natively,
// the strip behind the clock is the window background (pinned white), and
// light glyphs there made the clock invisible.
//
// Capacitor's names read backwards: 'DARK' = light glyphs, 'LIGHT' = dark.

import { pageUnderStatusBar, statusBarStyleFor } from '../src/lib/statusBarGlyphs.ts'

let failed = 0
const check = (label, actual, expected) => {
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} → ${actual}${ok ? '' : ` (expected ${expected})`}`)
}

const android = (chrome) =>
  `Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${chrome}.0.0.0 Mobile Safari/537.36`
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

// ── Where the page is under the bar ────────────────────────────────────────
check('iOS is always under the bar', pageUnderStatusBar('ios', iphone), true)
check('Android WebView 124 is padded natively', pageUnderStatusBar('android', android(124)), false)
check('Android WebView 139 is padded natively', pageUnderStatusBar('android', android(139)), false)
check('Android WebView 140 is edge-to-edge', pageUnderStatusBar('android', android(140)), true)
check('Android WebView 141 is edge-to-edge', pageUnderStatusBar('android', android(141)), true)
check('Android with no Chrome token is padded natively', pageUnderStatusBar('android', 'Mozilla/5.0'), false)
check('the web is never under a native bar', pageUnderStatusBar('web', android(141)), false)

// ── The style asked for ────────────────────────────────────────────────────
check('iOS, document open → light glyphs', statusBarStyleFor(true, 'ios', iphone), 'DARK')
check('iOS, landing page → dark glyphs', statusBarStyleFor(false, 'ios', iphone), 'LIGHT')
check('Android 140, document open → light glyphs', statusBarStyleFor(true, 'android', android(140)), 'DARK')
check('Android 140, landing page → dark glyphs', statusBarStyleFor(false, 'android', android(140)), 'LIGHT')
check('Android 124, document open → dark glyphs (white strip)', statusBarStyleFor(true, 'android', android(124)), 'LIGHT')
check('Android 124, landing page → dark glyphs', statusBarStyleFor(false, 'android', android(124)), 'LIGHT')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall status-bar checks passed')
