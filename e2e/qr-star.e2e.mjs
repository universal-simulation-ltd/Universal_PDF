// A QR code designed in Universal QR must render in Universal PDF as the same
// picture. Specifically the STAR, which is the one arrangement where the two
// apps' shared design model had silently drifted apart.
//
//   ./scripts/preview.ps1     # or preview.sh — Universal PDF is :5174
//   npm run test:qr-star      # in another terminal
//
// WHAT DRIFTED. Universal QR grew `starPlacement` ('inside' | 'behind') and
// `starColor` on 2026-08-24; Universal PDF's hand-ported copy of the design
// model did not. `hydrate()` merges an incoming design over PDF's own
// DEFAULT_DESIGN, so the two unknown fields were dropped without a word and a
// star came out in the OLD arrangement — a tiny code inside a white plate —
// instead of the orange star it was designed as. No error, no warning: just a
// different picture from the one the user saved.
//
// Runs against `?mockauth=1` (the SDK's offline fixture world, dev builds
// only): the saved-design shelf this drives only renders for a signed-in user.
//
// Negative control (2026-08-28, run): `git stash`-ing the four qr source files
// back turns 5 of these 9 red. Measured either side —
//
//                     fixed                       stashed
//   imported design   star 28.6%, ink 18.0%, a255  star 0.0%, ink 10.3%, a0
//   Star preset       star 28.6%, ink 18.0%, a255  star 31.8%, ink 10.5%, a0
//
// The one colour assertion that does NOT move is "the Star preset puts orange
// in the picture", and it should not: the old preset was an orange PLATE, so
// there was orange either way. What separates the arrangements is the ink and
// the corner alpha, which is why those are asserted too. The imported design
// is the case where colour alone is decisive — it lost the orange entirely.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

// See office-import.e2e.mjs for why this launches a browser rather than
// trusting the first import that works.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

async function loadPlaywright() {
  const problems = []
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
    } catch (err) {
      problems.push(`  ${rel}\n    ${String(err).split('\n')[0]}`)
    }
  }
  console.error(
    'No usable Playwright found. Candidates that imported but could not launch:\n' +
      (problems.join('\n') || '  (none imported at all)') +
      '\n\nInstall it in a sibling Universal app, or run:\n' +
      '  npm i -D playwright && npx playwright install chromium',
  )
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

async function testPdf() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText('QR star test', { x: 60, y: 780, size: 20, font })
  return Buffer.from(await doc.save())
}

// Universal QR's own "Star" preset, as its saved-design writer stores it: the
// star stands BEHIND the code, white is the ground the code and its quiet zone
// sit on, and the brand orange is the star. Kept as a literal rather than
// imported from the app, so a change to PDF's copy of the presets cannot
// quietly change what this test claims Universal QR sends.
const QR_STAR_DESIGN = {
  name: 'unisim.co.uk',
  data: 'https://www.unisim.co.uk/James',
  size: 512,
  margin: 12,
  ecLevel: 'H',
  fgColor: '#000000',
  bgColor: '#ffffff',
  bgTransparent: false,
  useGradient: false,
  gradientColor: '#e05504',
  gradientRotation: 45,
  matchCornerColor: true,
  cornerColor: '#e05504',
  dotType: 'extra-rounded',
  cornerSquareType: 'extra-rounded',
  cornerDotType: 'dot',
  frameShape: 'star',
  starPlacement: 'behind',
  starColor: '#e05504',
  decorStyle: 'burst',
  matchDecorColor: true,
  decorColor: '#e05504',
  logoDataUrl: null,
  logoSize: 0.28,
  logoMargin: 6,
  hideBackgroundDots: true,
  unisimMark: true,
}

const STAR_ORANGE = [224, 85, 4]

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()

const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
// The shelf only renders for a signed-in user; `universal:mock_session` is the
// key mockAuth keeps its mode under, and 'james' is what its own sign-in writes.
await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})
// Universal QR and Universal PDF are the SAME ORIGIN (opensource.unisim.co.uk),
// so this shelf is literally the other app's localStorage — which is what makes
// a design authored there testable here with no network and no account.
await context.addInitScript((cfg) => {
  window.localStorage.setItem(
    'unisim.qr.designs.v1',
    JSON.stringify([
      { id: 'star', name: 'unisim.co.uk', config: cfg, thumbnail: '', createdAt: new Date().toISOString() },
    ]),
  )
}, QR_STAR_DESIGN)

const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'star.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })

/** Measure the dialog's own preview image. It reads the rendered PNG rather
 *  than a canvas of the test's own, so what is measured is the picture a user
 *  is actually looking at. */
async function previewStats() {
  const src = await page.locator('img[alt*="QR"]').first().getAttribute('src')
  return page.evaluate(
    ([dataUrl, target]) =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onerror = () => reject(new Error('preview did not load'))
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const { data } = ctx.getImageData(0, 0, c.width, c.height)
          let near = 0
          let dark = 0
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            if (data[i + 3] > 200) {
              if (Math.abs(r - target[0]) < 24 && Math.abs(g - target[1]) < 24 && Math.abs(b - target[2]) < 24) near++
              if (r < 60 && g < 60 && b < 60) dark++
            }
          }
          const at = (x, y) => data[(y * c.width + x) * 4 + 3]
          const total = data.length / 4
          resolve({
            starFraction: near / total,
            // Ink coverage. A code in FRONT of the star is 72% of the image
            // wide; one INSIDE it is 37%, which is a quarter of the area — so
            // the two arrangements cannot land near each other here. Measured
            // as area rather than as a bounding box, because the old
            // arrangement's burst decoration reaches the plate's rim and makes
            // any span measurement agree with both.
            darkFraction: dark / total,
            // Alpha in the corners. 'behind' fills the whole square with
            // bgColor and paints the star on top; every plate arrangement
            // clips to the silhouette instead and leaves the corners
            // transparent. One pixel each, and they disagree outright.
            cornerAlpha: Math.min(at(0, 0), at(c.width - 1, 0), at(0, c.height - 1), at(c.width - 1, c.height - 1)),
          })
        }
        img.src = dataUrl
      }),
    [src, STAR_ORANGE],
  )
}

// ── An imported Universal QR design renders as designed ──────────────────────
console.log('\na star designed in Universal QR arrives as the same picture')

await page.click('button[title="Add a QR code"]')
await page.waitForSelector('h2:has-text("Add a QR code")', { timeout: 5000 })
await page.waitForTimeout(500)
await page.locator('button[title*="unisim.co.uk"]').first().click()
await page.waitForTimeout(1800)

const imported = await previewStats()
console.log(`    (star ${(imported.starFraction * 100).toFixed(1)}%, ink ${(imported.darkFraction * 100).toFixed(1)}%, corner alpha ${imported.cornerAlpha})`)
check(
  'the star is drawn in its own colour, not left as an invisible white plate',
  imported.starFraction > 0.05,
  `only ${(imported.starFraction * 100).toFixed(1)}% of the image is #e05504`,
)
check(
  'the code stands in FRONT of the star rather than inside it',
  imported.darkFraction > 0.15,
  `ink covers ${(imported.darkFraction * 100).toFixed(1)}% of the image (inside-the-star is a quarter of the area)`,
)
check(
  'the whole square has a ground under it, not a clipped plate',
  imported.cornerAlpha > 200,
  `corner alpha ${imported.cornerAlpha} — the corners are transparent, so the star is being used as a plate`,
)

// ── PDF's own Star preset is Universal QR's ──────────────────────────────────
console.log("\nPDF's own Star chip draws that same arrangement")

await page.fill('input[placeholder="https://example.com"]', QR_STAR_DESIGN.data)
await page.waitForTimeout(700)
// The chip's own title (`<name> — <shape>`), not a text match: the document's
// rename button in the footer also says "star" for this fixture, and it is the
// first match on the page.
await page.click('button[title="Star — star"]')
await page.waitForTimeout(1800)

const preset = await previewStats()
console.log(`    (star ${(preset.starFraction * 100).toFixed(1)}%, ink ${(preset.darkFraction * 100).toFixed(1)}%, corner alpha ${preset.cornerAlpha})`)
check(
  'the Star preset puts orange in the picture',
  preset.starFraction > 0.05,
  `only ${(preset.starFraction * 100).toFixed(1)}% of the image is #e05504`,
)
check(
  'the Star preset draws the code in front of the star',
  preset.darkFraction > 0.15,
  `ink covers ${(preset.darkFraction * 100).toFixed(1)}% of the image`,
)
check(
  'the Star preset gives the code a ground rather than a clipped plate',
  preset.cornerAlpha > 200,
  `corner alpha ${preset.cornerAlpha}`,
)

// ── A placed code stays editable ─────────────────────────────────────────────
// The design has to survive placement, or double-tapping the code on the page
// falls through to the signature editor — which is what an ordinary picture
// gets, and what an account-saved code used to get.
console.log('\na placed code reopens the QR editor, not Signature options')

await page.click('button:has-text("Add to page")')
await page.waitForTimeout(1200)
const box = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
const at = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.35 }
await page.mouse.click(at.x, at.y)
await page.waitForTimeout(700)
await page.mouse.dblclick(at.x, at.y)
await page.waitForTimeout(900)

check('the QR editor opens', (await page.locator('h2:has-text("Edit this QR code")').count()) === 1)
// The modal's own heading, not a bare text match: the "What's new" panel
// carries the changelog entry ABOUT this bug, which says "Signature options"
// and matched a loose selector.
check('Signature options does not', (await page.locator('h2:has-text("Signature options")').count()) === 0)
check('the edit pill is on the selected code', (await page.locator('button[aria-label="Edit this QR code"]').count()) === 1)

await browser.close()

if (failures.length) {
  console.log(`\n${failures.length} failed:`)
  failures.forEach((f) => console.log(`  • ${f}`))
  process.exit(1)
}
console.log('\nall good.')
