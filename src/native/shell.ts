// shell.ts — does this run the phone screens (`src/native/`)?
//
// The phone app (iOS / Android) has screens of its own, built for a phone
// rather than the website squeezed onto one (James, 2026-10-16: the mobile-first
// pass, round 4 of the "paper on a desk" boards). A desk with the jobs on it, a
// document with four tools under it, Sign and Share as pages, and the moments
// after signing and shrinking. No navbar, suite switcher, Actions menu or
// sign-in. The website, and the Electron desktop app, keep `App.tsx`'s own
// layout and never download this folder (it is lazy-loaded).
//
// ⚠️ NOT `isNativeShell()`. That one answers "can I use the native file
// plugins?" and is read all over the app; this one only picks the screens. In
// `npm run dev`, `?app` shows the phone screens in a browser (it sticks for the
// tab; `?app=0` turns it off) while the files still come from the browser's own
// pickers — so the dev flag must never leak into `isNativeShell()`.
//
// Jukebox's shell.ts is the pattern this follows.

import { isNativeShell } from '../lib/nativeOpen'

const DEV_KEY = 'unipdf:dev-phone-screens'

/** Set by `store-assets/generate.mjs` before the app loads, to capture the phone screens. */
const CAPTURE_KEY = 'unipdf:store-capture'

export function phoneScreens(): boolean {
  if (typeof window === 'undefined') return false
  if (window.desktop) return false
  if (isNativeShell()) return true
  // The store screenshots are the phone screens, captured from the built
  // bundle in a browser. A session flag only a script sets before load —
  // never the address — so nobody on the website lands here by accident.
  try {
    if (sessionStorage.getItem(CAPTURE_KEY) === '1') return true
  } catch { /* no storage: not a capture */ }
  if (!import.meta.env.DEV) return false
  try {
    const q = new URLSearchParams(window.location.search).get('app')
    if (q !== null) sessionStorage.setItem(DEV_KEY, q === '0' ? '0' : '1')
    return sessionStorage.getItem(DEV_KEY) === '1'
  } catch {
    return false
  }
}
