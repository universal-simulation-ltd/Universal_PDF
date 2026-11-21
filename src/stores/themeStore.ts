import { createThemeStore, type ThemePref } from '@unisim/sdk'

// Light, Dark or Match my device (2026-11-21). The store lives in @unisim/sdk
// (createThemeStore); this file only names the key. Light until somebody
// chooses otherwise, here or in their Global Tuning (`universal:color-scheme`,
// which the store follows while this app has no override of its own).
//
// What goes dark is the CHROME: the bars, panels, dialogs, the landing page
// and the desk the pages lie on. The PDF pages themselves stay as rendered,
// white paper on a dark desk; nothing in a document is ever inverted (see
// src/styles/dark.css and `data-paper`).
//
// ⚠️ The key is every user's saved choice. Renaming it silently puts them all
// back on light. It is written down a second time in public/theme-prepaint.js
// (the pre-paint script index.html loads in its <head>); `npm run test:theme`
// keeps the two the same.
export type { ThemePref }

export const useThemeStore = createThemeStore('unisim-pdf-theme')
