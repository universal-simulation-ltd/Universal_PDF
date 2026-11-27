// "this phone" on a phone, "this device" on a tablet.
//
// Six lines of the phone screens name the thing in your hand ("only on this
// phone", "Nothing leaves this phone"). On an iPad that is wrong, and it is
// the first thing on the Desk. Each has a `_tablet` twin in phone.ts that says
// "device"; `deviceKey()` picks it on a tablet.
//
// ⚠️ By the DEVICE, not the width: an iPad in Slide Over is 320 pt across and
// still an iPad. Outside a native shell (the dev server, the e2e specs, the
// store captures) it is a phone unless the session says otherwise:
// `sessionStorage['unipdf:device'] = 'tablet'`, which store-assets/generate.mjs
// sets for the iPad captures.

import { isNativeShell } from '../lib/nativeOpen'
import type { MessageKey } from '../i18n'

const KEY = 'unipdf:device'

export function isTablet(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const forced = sessionStorage.getItem(KEY)
    if (forced) return forced === 'tablet'
  } catch { /* no storage */ }
  if (!isNativeShell()) return false
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac with a touch screen.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return true
  return /Android/.test(ua) && !/Mobile/.test(ua)
}

type Worded = 'open_files_note' | 'desk_only_here' | 'doc_remove' | 'tune_card' | 'sigs_note' | 'merge_note'

/** The key for one of the six lines, as this device should read it. */
export function deviceKey(key: Worded): MessageKey {
  return `phone.${key}${isTablet() ? '_tablet' : ''}` as MessageKey
}
