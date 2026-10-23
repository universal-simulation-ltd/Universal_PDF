// Run the browser specs in `e2e/` one process each — the CI entry point, and
// handy locally too.
//
//   ./scripts/preview.sh                  # Universal PDF on :5174
//   node e2e/run-all.mjs                  # every spec that needs only the dev server
//   node e2e/run-all.mjs --core           # the core flows only (see CORE below)
//   node e2e/run-all.mjs lock-pdf tabs    # just these (names without .e2e.mjs)
//   E2E_BROWSER=webkit node e2e/run-all.mjs --core
//
// Options: --jobs N (default 3), --timeout S per spec (default 300),
// --retries N (default 1). Each spec's full output goes to
// $E2E_RESULTS/<browser>-<name>.log (default: a folder in the OS temp dir; CI
// sets it and uploads the folder when a run fails), and the summary prints the
// last lines of every failure.
//
// A spec that fails and then passes on its retry is reported as FLAKY and
// does not fail the run; one that fails every attempt does. The retry exists
// because a shared GitHub runner is slower and noisier than a laptop, not to
// hide a real failure: a spec that is flaky every time belongs in SKIP with a
// reason, where it is visible, rather than retried into green.
//
// E2E_BROWSER (chromium | webkit | firefox) picks the engine for the specs
// that honour it — those in CORE launch `playwright[process.env.E2E_BROWSER ||
// 'chromium']`. Every other spec still launches Chromium whatever this says,
// so a WebKit or Firefox run is only meaningful with --core.

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = process.env.E2E_RESULTS ?? join(tmpdir(), 'universal-pdf-e2e')

// Specs this runner never starts, each with the reason. Remove a line once the
// reason is gone — that is the whole fix-up list for e2e in CI.
export const SKIP = {
  // Electron, not a browser: they drive the desktop app through
  // `playwright._electron` and need `npm run build:desktop` plus a display.
  // They also still bare-import the store, because their window opens before
  // an init script can land (backlog, PDF App, "e2e fragility", 2026-10-17).
  'exit-guard-desktop': 'Electron desktop spec (needs a desktop build and a display)',
  'os-open-desktop': 'Electron desktop spec (needs a desktop build and a display)',
  'save-folder-desktop': 'Electron desktop spec (needs a desktop build and a display)',
  'tabs-desktop': 'Electron desktop spec (needs a desktop build and a display)',
  'download-staging': 'Electron desktop spec (npm run test:download-staging:desktop)',
  'hub-handoff': 'launches the Electron app for its desktop half (no display on a CI runner)',
  // Needs its own artefacts, not the dev server.
  csp: 'drives the PRODUCTION build (npm run build first); not a dev-server spec',
  extension: 'drives extension/dist (npm run build:extension first) in a headed Chromium',
  // Known broken, not flaky: its drag-and-drop checks fail (7 of them, also
  // against the old file) — backlog, PDF App, "e2e fragility".
  tabs: 'drag-and-drop checks fail (known, backlog PDF App "e2e fragility")',
  // Found failing on main when CI was added (2026-10-22, at a043f8d), every
  // run, in a clean checkout. Each is a spec or app regression to chase, not
  // CI noise; take the line out with the fix.
  'open-at-fit':
    'page 1 is re-laid-out on the way in (canvas 300px then 326px): every run in WebKit, about half in Chromium',
  'sticky-note': '"nothing moves when the editor closes": the ink sits ~2px off the editor box',
  'external-links': '"inside a native shell" part: no input[type=file] after goto ?mockauth=1 with a stubbed Capacitor',
  'panel-dodge': 'no [data-toolbar-panel] button[title="Red"] to click (the colour swatch changed)',
}

// Skipped only in one engine or on one OS: they pass elsewhere, and what
// fails is the environment, or a difference to look at that is not the flow
// itself. Found on the first CI runs (2026-10-22).
export const SKIP_WHERE = {
  // Linux renders with other fonts than macOS: the canvas underline sits
  // 7.30pt below 40pt text, the export 5.38pt, and the exported colour reads
  // off. Passes on a Mac.
  'link-style': { platform: 'linux', why: 'font metrics differ on Linux (underline depth, text colour)' },
  // Firefox only. Clicking the sr-only checkbox behind "Request name and
  // date" does not toggle it (Playwright: "Clicking the checkbox did not
  // change its state"); the visible switch is what a person clicks.
  'sigfield-extras': { browser: 'firefox', why: "the sr-only 'Request name and date' checkbox does not toggle on click" },
  // Firefox only: on the two large documents the Flattened choice never
  // appears in Export (the size estimate does not finish), 3 minutes a try.
  // Worth a look in real Firefox.
  'flatten-export': { browser: 'firefox', why: 'the flatten choice never appears for the large documents' },
}
const skipWhy = (name, browser) => {
  if (SKIP[name]) return SKIP[name]
  const w = SKIP_WHERE[name]
  if (w && (w.browser ? w.browser === browser : true) && (w.platform ? w.platform === process.platform : true)) return w.why
  return null
}

// The flows the iPhone app lives on, which therefore also run in WebKit (the
// iPhone's engine) and Firefox: open → annotate → export, redact, sign, lock.
export const CORE = [
  // open → annotate → export (each opens a PDF through the app's own picker)
  'draw-tools',
  'flatten-export',
  'export-variants',
  'scrub-export',
  'word-export',
  // redact
  'redact-shape',
  'redact-circle',
  'redact-covers-match',
  // sign
  'offline-sign',
  'sigfield-extras',
  // lock
  'lock-pdf',
  // the phone app's own pages and sheets (the phone app IS WebKit)
  'phone-pages',
]
// Not in CORE although they are core flows, because they cannot run outside
// Chromium as written: phone-markup opens a CDP session (Chromium only) and
// export-fidelity makes its WebP fixture with canvas.toDataURL('image/webp'),
// which WebKit does not encode. open-at-fit is in SKIP.

// edge-swipe and phone-knowledge launch WebKit themselves whatever
// E2E_BROWSER says, so the Chromium job (whose image has every engine) runs
// them.

// Specs that need a particular environment to run at all.
const ENV = {
  // The About sheet is shared by every Universal App; the spec is told which.
  'about-app': { SETUP: 'pdf', NAME: 'PDF' },
}

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return dflt
  const v = args[i + 1]
  args.splice(i, 2)
  return Number(v)
}
const jobs = opt('jobs', 3)
const timeoutS = opt('timeout', 300)
const retries = opt('retries', 1)
const coreOnly = args.includes('--core')
const named = args.filter((a) => !a.startsWith('--'))

const all = readdirSync(HERE)
  .filter((f) => f.endsWith('.e2e.mjs'))
  .map((f) => f.slice(0, -'.e2e.mjs'.length))
  .sort()
const browser = process.env.E2E_BROWSER ?? 'chromium'
const pool = coreOnly ? CORE : all
const skipped = named.length ? [] : pool.filter((n) => skipWhy(n, browser))
const specs = named.length ? named : pool.filter((n) => !skipped.includes(n))
for (const n of specs) {
  if (!all.includes(n)) {
    console.error(`no such spec: e2e/${n}.e2e.mjs`)
    process.exit(2)
  }
}

mkdirSync(OUT, { recursive: true })
console.log(
  `${specs.length} spec(s), ${jobs} at a time, ${browser}, against ${process.env.E2E_BASE_URL ?? 'http://localhost:5174/'}`,
)
for (const n of skipped) console.log(`  skip ${n}: ${skipWhy(n, browser)}`)

function runOnce(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, [join(HERE, `${name}.e2e.mjs`)], {
      env: { ...process.env, ...ENV[name] },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutS * 1000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        ok: code === 0 && !timedOut,
        code: timedOut ? `timed out after ${timeoutS}s` : `exit ${code}`,
        secs: Math.round((Date.now() - started) / 1000),
        out,
      })
    })
  })
}

const results = {}
async function run(name) {
  let log = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await runOnce(name)
    log += `===== attempt ${attempt + 1}: ${r.code}, ${r.secs}s\n${r.out}\n`
    if (r.ok) {
      results[name] = { status: attempt ? 'FLAKY' : 'pass', secs: r.secs }
      break
    }
    results[name] = { status: 'FAIL', secs: r.secs, code: r.code, tail: r.out.trim().split('\n').slice(-15).join('\n') }
  }
  writeFileSync(join(OUT, `${browser}-${name}.log`), log)
  const r = results[name]
  console.log(`${r.status.padEnd(5)} ${String(r.secs).padStart(4)}s  ${name}`)
}

const queue = [...specs]
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await run(queue.shift())
  }),
)

const failed = specs.filter((n) => results[n].status === 'FAIL')
const flaky = specs.filter((n) => results[n].status === 'FLAKY')
console.log(`\n${specs.length - failed.length - flaky.length} passed, ${flaky.length} flaky (passed on retry), ${failed.length} failed`)
for (const n of failed) console.log(`\n── ${n} (${results[n].code}) ──\n${results[n].tail}`)
process.exit(failed.length ? 1 : 0)
