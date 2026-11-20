import { createSyncedSettings } from '@unisim/sdk'

// Every switch of PDF's own in Tune this app, on the device and — signed in —
// on the account (James, 2026-10-30: "mobile app and web app settings in tune
// this app should be saved and synced to their account … Global rule").
//
// One SDK synced store (`createSyncedSettings`, @unisim/sdk 0.232.0): kept in
// localStorage under `unisim:settings:pdf`, and the SDK provider carries it to
// the account's `tune-app:pdf` row, newest change wins. A device that never
// changed anything says nothing and takes the account's set; signed out it
// stays on this device. Reset to defaults (the SDK's `useResetAppDefaults`)
// puts it back and syncs that too.
//
// The website and the phone screens share it: toolPrefsStore.ts and
// native/prefs.ts are the two views of it the rest of the app uses.
//
// NOT in here: "Lock saved signatures" (lib/signatureVault.ts) — turning it on
// or off needs this device's Face ID and key, so it stays on the device.
//
// ⚠️ Every switch starts OFF, like every switch in the suite. Never change a
// default here: a device that never changed anything shows the defaults.

export const DEFAULT_PEN_COLOURS = ['#000000', '#ffffff']
export const DEFAULT_HIGHLIGHT_COLOURS = ['#eab308', '#16a34a']
export const MAX_PREFERRED = 2

export interface PdfSettings {
  /** Tune ▸ "Stay on the last tool". */
  stayOnTool: boolean
  /** Tune ▸ "Don't confirm annotations". */
  noConfirm: boolean
  /** Tune ▸ "Don't confirm page deletes" (or "Don't ask again" on the question). */
  noDeleteConfirm: boolean
  /** A new sticky note starts top-left rather than centred. */
  noteTopLeft: boolean
  /** A new sticky note starts at a set size rather than fitted. */
  noteSetSize: boolean
  /** The toolbar's two pen colour shortcuts, newest first. */
  penColours: string[]
  /** The highlighter's (and sticky note's) two. */
  highlightColours: string[]
  /** Phone ▸ keep the screen from dimming while a document is open. */
  keepAwake: boolean
  /** Phone ▸ no tilt and no handwriting on the screens — just the page. */
  plainPaper: boolean
}

export const PDF_SETTINGS_DEFAULTS: PdfSettings = {
  stayOnTool: false,
  noConfirm: false,
  noDeleteConfirm: false,
  noteTopLeft: false,
  noteSetSize: false,
  penColours: DEFAULT_PEN_COLOURS,
  highlightColours: DEFAULT_HIGHLIGHT_COLOURS,
  keepAwake: false,
  plainPaper: false,
}

const HEX = /^#[0-9a-f]{6}$/i

function colours(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback]
  const ok = raw.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, MAX_PREFERRED)
  return ok.length ? ok : [...fallback]
}

/** Anything (the stored set, an old store's state, the account's values) → a complete set. */
export function normalisePdfSettings(raw: unknown, d: PdfSettings = PDF_SETTINGS_DEFAULTS): PdfSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    stayOnTool: r.stayOnTool === true,
    noConfirm: r.noConfirm === true,
    noDeleteConfirm: r.noDeleteConfirm === true,
    noteTopLeft: r.noteTopLeft === true,
    noteSetSize: r.noteSetSize === true,
    penColours: colours(r.penColours, d.penColours),
    highlightColours: colours(r.highlightColours, d.highlightColours),
    keepAwake: r.keepAwake === true,
    plainPaper: r.plainPaper === true,
  }
}

/** The zustand `persist` keys these settings lived in before (both `{ state, version }`). */
export const LEGACY_TOOL_PREFS_KEY = 'universal-pdf-tool-prefs'
export const LEGACY_PHONE_PREFS_KEY = 'unipdf:phone-prefs'

/** Everyone's settings from before, read once: nobody loses a switch. */
export function readLegacyPdfSettings(storage: Pick<Storage, 'getItem'>): Record<string, unknown> | undefined {
  let found = false
  const out: Record<string, unknown> = {}
  for (const key of [LEGACY_TOOL_PREFS_KEY, LEGACY_PHONE_PREFS_KEY]) {
    try {
      const raw = storage.getItem(key)
      if (raw === null) continue
      const state = (JSON.parse(raw) as { state?: unknown })?.state
      if (state && typeof state === 'object') {
        Object.assign(out, state)
        found = true
      }
    } catch {
      // Corrupt: nothing to bring over from that one.
    }
  }
  return found ? out : undefined
}

export const usePdfSettings = createSyncedSettings<PdfSettings>('pdf', PDF_SETTINGS_DEFAULTS, normalisePdfSettings, {
  legacy: () => readLegacyPdfSettings(window.localStorage),
})
