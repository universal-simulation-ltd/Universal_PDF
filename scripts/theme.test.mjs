// The theme key is written down TWICE, and this is what stops the two drifting.
//
//   npm run test:theme
//
// `src/stores/themeStore.ts` names it for the SDK's store; `public/theme-prepaint.js`
// names it again in the script index.html loads in its <head> to put `.dark` on
// `<html>` before the first paint, which is the only place early enough to
// matter. There is no way to share one constant between a bundled module and a
// script that must run during head parsing, so renaming either without the
// other fails here instead.
//
// It is not a style rule. The key IS every user's saved choice: change it and
// everybody who chose dark is silently back on light.
//
// The same assertions as Universal Images' `scripts/theme.test.mjs`, adapted to
// PDF's file-not-inline script (its CSP and the extension's both refuse inline).

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

let pass = 0
let fail = 0
const ok = (cond, label, detail = '') => {
  if (cond) {
    pass++
    console.log(`  ok   ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`)
  }
}

/** The key as the store declares it: `createThemeStore('…')`. */
const match = /createThemeStore\('([^']+)'\)/.exec(read('src/stores/themeStore.ts'))
if (!match) {
  console.log('  FAIL themeStore.ts no longer calls createThemeStore with a literal key')
  process.exit(1)
}
const key = match[1]
const script = read('public/theme-prepaint.js')

console.log(`The pre-paint theme script (key '${key}'):`)

ok(key === 'unisim-pdf-theme', "the key is still 'unisim-pdf-theme' (every user's saved choice)")
ok(
  script.includes(`localStorage.getItem('${key}')`),
  'reads the same localStorage key as the theme store',
  `public/theme-prepaint.js has no localStorage.getItem('${key}')`,
)
// The app's key is an override: absent, the global choice applies, and the
// pre-paint script has to know that as well as the store does.
ok(
  script.includes("localStorage.getItem('universal:color-scheme')"),
  "falls back to Global Tuning's universal:color-scheme when the app has no override",
)
// 'system' has to be honoured here too, or somebody on the OS setting gets the
// light ground first and the dark one once the bundle catches up.
ok(
  script.includes("classList.add('dark')") && script.includes('prefers-color-scheme: dark'),
  "puts the dark class on <html> before anything is painted, 'system' included",
)
ok(!script.includes("classList.remove('dark')"), 'never removes the class: light is the default, so it only ever adds')

// index.html must load it in the <head>, as a classic (blocking) script, ahead
// of the module bundle. An inline copy would be refused by the CSP.
const html = read('index.html')
const head = html.slice(0, html.indexOf('</head>'))
ok(
  /<script src="\/theme-prepaint\.js"><\/script>/.test(head),
  "index.html's <head> loads /theme-prepaint.js as a classic script",
)
// The live site is served under /pdf/ from a flat dist/: without its own
// rewrite the SPA fallback would answer with index.html and the script would
// never run (the trap boot-fallback.js's line in _redirects describes).
ok(
  /^\/pdf\/theme-prepaint\.js\s+\/theme-prepaint\.js\s+200$/m.test(read('public/_redirects')),
  'public/_redirects serves /pdf/theme-prepaint.js',
)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
