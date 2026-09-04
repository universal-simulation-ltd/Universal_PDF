// The toolbar's floating option panels, browser-level: they step below the
// placement banner rather than covering it — and doing so does not take the
// app down.
//
//   ./scripts/preview.sh             # or preview.ps1 — Universal PDF is :5174
//   npm run test:panel-dodge         # in another terminal
//
// ⚠️ Why this exists (owner, 2026-09-04: "universal pdf — when i clicked the X
// draw tool", with a screenshot of the root ErrorBoundary). Picking ✗ from the
// open drawing panel armed a placement, the banner announcing it appeared under
// the toolbar, and FloatingPanel moved down to dodge it — from a dep-less
// layout effect that called setState. React dispatches that from inside the
// commit phase, where its eager bailout does not apply, so the effect ran
// again, dispatched again, and every commit scheduled the next: "Maximum update
// depth exceeded", and the error boundary replaced the whole document. The
// panel now writes left/top onto its own node and keeps them in a ref, so the
// dodge cannot schedule a render at all.
//
// The banner here is INJECTED rather than armed by picking ✓/✗, because whether
// any particular tool shows one is a product decision that has already flipped
// twice — what must not change is that a banner appearing under an open panel
// is survivable. A real React commit is still what triggers the re-place: the
// test clicks a colour inside the panel.
//
// Negative control (2026-09-04, run against a build of the pre-fix
// FloatingPanel): the three banner checks go red and the run then ABORTS at the
// colour assertion — there is no panel left to read, because the error boundary
// has replaced the document. That is the control working, not a flake.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../backoffice/universal-platform/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    let mod
    try {
      mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
    } catch {
      continue
    }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch {
      /* try the next one */
    }
  }
  console.error('No usable Playwright found. Install it in a sibling Universal app.')
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

async function testPdf() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText('Panel dodge test', { x: 60, y: 780, size: 20, font })
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
// A render loop surfaces here as well as on screen — keep both.
page.on('pageerror', (e) => failures.push('page error: ' + e.message.split('\n')[0]))

await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the preview server first.`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'dodge.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(500)

const crashed = async () => (await page.locator('h1:has-text("Something went wrong")').count()) > 0
const panel = page.locator('[data-toolbar-panel]').first()
const panelBox = async () => (await panel.count()) ? panel.boundingBox() : null

// ── The panel opens under its own button ────────────────────────────────────
console.log('\nthe drawing panel hangs off the button that opens it')
await page.click('button[aria-label*="drawing tools" i]')
await page.waitForTimeout(300)
const anchor = await page.locator('button[title^="Free draw"]').first().boundingBox()
const opened = await panelBox()
check('it is on screen', opened !== null && opened.height > 0)
check(
  'directly below the toolbar, not floating somewhere else',
  opened && opened.y > anchor.y && opened.y < anchor.y + 80,
  opened ? `panel top ${Math.round(opened.y)} vs button top ${Math.round(anchor.y)}` : 'no panel',
)
check(
  'and visible, not left hidden behind its own measuring pass',
  (await panel.evaluate((el) => getComputedStyle(el).visibility)) === 'visible',
)

// ── A banner appearing under an open panel ──────────────────────────────────
// Sized and placed like the real one: centred under the toolbar, in the strip
// the panel would otherwise occupy.
console.log('\na placement banner appearing while the panel is open')
await page.evaluate((top) => {
  const el = document.createElement('div')
  el.setAttribute('data-placement-hint', 'true')
  el.style.cssText = `position:fixed;left:50%;transform:translateX(-50%);top:${top}px;width:320px;height:48px;background:#fff;z-index:30`
  el.id = 'fake-placement-hint'
  document.body.appendChild(el)
}, Math.round(anchor.y + anchor.height + 20))
// A real commit is what re-places the panel — click a colour inside it.
await page.click('[data-toolbar-panel] button[title="Red"]')
await page.waitForTimeout(700)

check('the app is still running', !(await crashed()), 'the error boundary took over')
const hint = await page.locator('#fake-placement-hint').boundingBox()
const dodged = await panelBox()
check('the panel is still on screen', dodged !== null && dodged.height > 0)
check(
  'and has stepped BELOW the banner rather than over it',
  dodged && hint && dodged.y >= hint.y + hint.height,
  dodged && hint ? `panel top ${Math.round(dodged.y)} vs banner bottom ${Math.round(hint.y + hint.height)}` : 'missing box',
)
check(
  'the click that moved it still did its own job',
  (await page.locator('[data-toolbar-panel] button[title="Red"]').getAttribute('class')).includes('border-white'),
  'Red is not the selected colour',
)

// ── And back again when the banner goes ─────────────────────────────────────
console.log('\nand it comes back up when the banner goes')
await page.evaluate(() => document.getElementById('fake-placement-hint')?.remove())
await page.click('[data-toolbar-panel] button[title="Blue"]')
await page.waitForTimeout(500)
const back = await panelBox()
check('the app is still running', !(await crashed()))
check(
  'the panel is back under the toolbar',
  back && Math.abs(back.y - opened.y) < 2,
  back ? `panel top ${Math.round(back.y)} vs ${Math.round(opened.y)} when it opened` : 'no panel',
)

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
