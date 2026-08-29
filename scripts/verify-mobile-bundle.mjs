#!/usr/bin/env node
// The web assets Capacitor copied into the native projects are loadable.
//
//   node scripts/verify-mobile-bundle.mjs
//
// ⚠️ This exists because getting it wrong is INVISIBLE until the app is on a
// phone. Capacitor serves the bundle from a `capacitor://localhost` origin
// whose root is the copied `public/` directory, so assets must resolve
// relatively — that is what `--mode desktop` is for (see capacitor.config.ts
// and vite.config.ts). Build with the default production mode instead and every
// asset URL comes out as `/pdf/assets/...`, which on the phone is a 404: the
// module script never runs, `#root` stays empty, and the app is a blank screen.
// Xcode still reports BUILD SUCCEEDED, the icon is right, the version is right.
//
// It has happened: 0.6.14 shipped to a real iPhone that way and could not load.
//
// The other half is the service worker. `--mode desktop` omits it; a production
// build ships `sw.js` + `registerSW.js`, which caches the wrong origin's URLs
// inside the app.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = [
  ['iOS', 'ios/App/App/public'],
  ['Android', 'android/app/src/main/assets/public']
]

let failed = false
for (const [platform, dir] of TARGETS) {
  const html = join(ROOT, dir, 'index.html')
  if (!existsSync(html)) {
    console.log(`${platform}: no copied bundle at ${dir} — skipped.`)
    continue
  }
  const source = readFileSync(html, 'utf8')
  // Any src=/href= that starts with a single "/" is rooted at the web host's
  // base path, not at the bundle.
  const absolute = [...source.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)].map((m) => m[1])
  const sw = ['sw.js', 'registerSW.js'].filter((f) => existsSync(join(ROOT, dir, f)))

  if (absolute.length === 0 && sw.length === 0) {
    console.log(`${platform}: bundle resolves relatively, no service worker. OK`)
    continue
  }
  failed = true
  console.error(`${platform}: ${dir} is a WEB build, not a mobile one.`)
  for (const url of absolute) console.error(`  absolute asset URL: ${url}`)
  for (const f of sw) console.error(`  service worker present: ${f}`)
}

if (failed) {
  console.error('\nRebuild and re-copy:  npm run cap:sync')
  process.exit(1)
}
