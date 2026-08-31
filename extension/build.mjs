// Package the browser extension into `extension/dist/`.
//
//   npm run build:extension
//
// The output is a directory you can load straight into Chrome or Edge with
// "Load unpacked", and the same directory is what gets zipped for the store.
// It is entirely separate from `dist/` — `npm run build`, `build:desktop` and
// `build:mobile` neither read nor write anything under `extension/`.

import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DIST = join(HERE, 'dist')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

// 1. The app itself, built for a chrome-extension:// origin.
//    ⚠️ `--mode desktop` is load-bearing, not cosmetic — see the comment at the
//    top of vite.config.extension.ts.
console.log('• building the viewer (vite, mode=desktop)')
rmSync(DIST, { recursive: true, force: true })
execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'build', '--mode', 'desktop', '--config', 'vite.config.extension.ts'],
  { cwd: ROOT, stdio: 'inherit' }
)

// 2. The extension's own files.
console.log('• packaging the extension')
for (const name of ['background.js', 'popup.html', 'popup.js', 'options.html', 'options.js']) {
  copyFileSync(join(HERE, 'src', name), join(DIST, name))
}

mkdirSync(join(DIST, 'icons'), { recursive: true })
copyFileSync(join(ROOT, 'public', 'icon-192.png'), join(DIST, 'icons', 'icon.png'))

// 3. The manifest, with the version taken from package.json so the extension
//    and the app can never claim different releases.
const manifest = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'))
manifest.version = pkg.version
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

// 4. Prove the two halves actually agree, because the ways they can silently
//    disagree are all invisible until the extension is loaded in a browser.
const viewerHtml = join(DIST, 'viewer', 'index.html')
const problems = []
if (!existsSync(viewerHtml)) problems.push('viewer/index.html was not built')
else {
  const html = readFileSync(viewerHtml, 'utf8')
  // The shim must be there, and it must come BEFORE the app's module bundle —
  // if it ever slipped after it, `window.launchQueue` would be defined too
  // late, the app would decide no file was coming, and every document would
  // land on the landing page instead.
  const shimAt = html.indexOf('launch-shim.js')
  const appAt = html.search(/<script type="module"/)
  if (shimAt === -1) problems.push('viewer/index.html does not load launch-shim.js')
  else if (appAt !== -1 && shimAt > appAt) problems.push('launch-shim.js is loaded AFTER the app bundle')
  // An absolute `/assets/...` would 404 under chrome-extension://.
  if (/(?:src|href)="\/(?!\/)/.test(html)) problems.push('viewer/index.html has root-absolute asset paths (base is wrong)')
}
if (!existsSync(join(DIST, 'viewer', 'launch-shim.js'))) problems.push('launch-shim.js was not emitted')
// A service worker in here would try to precache the app under an origin that
// has no network scope, and would fight the extension's own worker for the name.
if (existsSync(join(DIST, 'viewer', 'sw.js'))) problems.push('a PWA service worker leaked into the extension build')
if (problems.length) {
  console.error('\n✗ the packaged extension is not usable:\n' + problems.map((p) => `  · ${p}`).join('\n'))
  process.exit(1)
}

function dirSize(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size
  }
  return total
}

console.log(`\n✓ ${relative(ROOT, DIST)} — v${manifest.version}, ${(dirSize(DIST) / 1e6).toFixed(1)} MB`)
console.log('  Load it with chrome://extensions → Developer mode → Load unpacked.')
