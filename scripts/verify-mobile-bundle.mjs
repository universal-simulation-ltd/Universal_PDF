#!/usr/bin/env node
// The web assets Capacitor copied into the native projects are actually loadable.
//
//   npm run check:mobile-bundle        (npm run cap:sync runs it for you)
//
// ⚠️ This exists because getting it wrong is INVISIBLE until the app is on a
// phone. The copied bundle is gitignored so `git status` stays clean, Xcode
// reports BUILD SUCCEEDED, the icon and the version are right, and the install
// succeeds. The only symptom is a blank screen when you tap the icon — and it
// has happened for real: Universal PDF 0.6.14 shipped to an iPhone that way on
// 2026-08-28.
//
// ── What this checks, and why it is written this way ────────────────────────
//
// The question asked here is: **does every local URL index.html asks for
// resolve to a file that exists inside the copied bundle?**
//
// ⚠️ It is NOT "are the URLs relative", and the difference is the whole point.
// Capacitor serves the copied `public/` directory AS the root of the
// `capacitor://localhost` origin, so an app whose native build uses base `/`
// legitimately ships root-absolute `/assets/index-….js` — correct, and a guard
// that rejected root-absolute URLs would fail it (Universal AI and the Assess
// apps build exactly like that). What is always wrong is asking for a path the
// bundle does not contain, whatever its spelling. Asked that way the check
// also catches a stale asset hash for free: a copy that missed the latest
// build names a file that is no longer there.
//
// Universal PDF is hosted at opensource.unisim.co.uk/pdf/, so a production web
// build rewrites every URL to `/pdf/assets/…`. There is no `pdf/` directory
// inside the bundle, so the module script 404s, nothing runs, `#root` stays
// empty. `--mode desktop` is the build that gets this right (base `./`, no
// PWA) and it is what `npm run cap:sync` runs — a bare `npx cap sync` or
// `npx cap copy` copies whatever `dist/` happens to hold, which is usually the
// last web build.
//
// Three more things are checked, each one a way a bundle can be broken while
// every URL in it resolves:
//
//   1. **Service-worker files.** `--mode desktop` omits VitePWA entirely, so
//      `sw.js` / `registerSW.js` / `workbox-*.js` in the copied directory prove
//      a web build was copied even when its URLs happen to resolve. Such a
//      worker caches the hosted origin's URLs inside the app, and there is no
//      browser UI in a Capacitor shell to clear it.
//   2. **A module script at all.** A bundle with nothing to run passes every
//      other check vacuously.
//   3. **That some bundle was found.** Otherwise a missing native project makes
//      the whole run a silent pass.
//
// This file is the suite's reference copy of the check — the other apps' guards
// are ports of it. Keep it that way: fix the rule here first.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// The path the app is served under on the web. Named only so the error message
// can tell you WHICH wrong build you copied; the check does not depend on it.
const WEB_BASE = '/pdf/'

const TARGETS = [
  ['iOS', 'ios/App/App/public'],
  ['Android', 'android/app/src/main/assets/public'],
]

// Anything with a scheme (https:, data:, mailto:), a protocol-relative host, or
// a bare fragment/query is not a file we ship. Everything else has to exist.
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i

// `workbox-*.js` is the runtime vite-plugin-pwa emits alongside sw.js.
const isServiceWorkerFile = (name) =>
  name === 'sw.js' || name === 'registerSW.js' || /^workbox-[\w-]+\.js$/.test(name)

let failed = false
let checked = 0

for (const [platform, dir] of TARGETS) {
  const bundle = join(ROOT, dir)
  const html = join(bundle, 'index.html')
  if (!existsSync(html)) {
    console.log(`${platform}: no copied bundle at ${dir} — skipped.`)
    continue
  }
  checked++
  const source = readFileSync(html, 'utf8')

  const urls = [...source.matchAll(/(?:src|href)="([^"]*)"/g)]
    .map((m) => m[1].trim())
    .filter((u) => u && !EXTERNAL.test(u))

  const missing = []
  for (const url of urls) {
    // Strip the query/fragment, then resolve. index.html sits at the bundle
    // root, so a root-absolute path and a relative one resolve the same way —
    // which is exactly why both are allowed and only existence is asked about.
    const path = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\.?\/+/, '')
    if (!path) continue
    if (!existsSync(join(bundle, path))) missing.push(url)
  }

  const sw = readdirSync(bundle).filter(isServiceWorkerFile)

  const modules = [...source.matchAll(/<script\b[^>]*>/g)].filter(
    (m) => /type="module"/.test(m[0]) && /\bsrc="/.test(m[0]),
  )

  if (missing.length === 0 && sw.length === 0 && modules.length > 0) {
    console.log(
      `${platform}: ${urls.length} local URLs all resolve inside ${dir}, ` +
        `${modules.length} module script(s), no service worker. OK`,
    )
    continue
  }

  failed = true
  console.error(`\n${platform}: ${dir} is NOT a loadable mobile bundle.`)
  for (const url of missing) {
    const hint = url.startsWith(WEB_BASE)
      ? `  <- the production web build's "${WEB_BASE}" prefix`
      : '  <- a stale or missing asset'
    console.error(`  asks for a file that is not in the bundle: ${url}${hint}`)
  }
  for (const f of sw) {
    console.error(`  service worker file present: ${f} — a --mode desktop build has none`)
  }
  if (modules.length === 0) {
    console.error('  index.html loads no module script at all — nothing would run')
  }
}

if (failed) {
  console.error('\nThis bundle would launch as a blank screen (or cache the wrong origin).')
  console.error('Rebuild and re-copy with:  npm run cap:sync')
  console.error('Never `npx cap sync` / `npx cap copy` on their own — they copy whatever')
  console.error('the last `npm run build` left behind, which is the web build.\n')
  process.exit(1)
}

if (checked === 0) {
  console.error('No copied bundle found on any platform — nothing was verified.')
  console.error('Run `npm run cap:sync` first.')
  process.exit(1)
}
