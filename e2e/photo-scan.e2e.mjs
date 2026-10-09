// Photo to PDF: a photo of a page goes in, a flat page comes out.
//
//   ./scripts/preview.sh             # or preview.ps1 — Universal PDF is :5174
//   npm run test:photo-scan          # in another terminal
//
// What is pinned (owner, 2026-10-03: scanning is the phone apps' camera, and
// on the web "let them import a photo to do it, in advanced — won't be used by
// most people"):
//
//   • The tool is under the advanced options on the landing page, and the
//     camera's "Scan a document" pill is NOT on the page in a browser.
//   • A picked photo opens the corner editor with the corners ALREADY on the
//     sheet (owner, 2026-10-03: "it also needs to crop the photo to the
//     document and offer a manual crop in case it gets it wrong"). A photo
//     with no sheet in it says so and leaves the corners to the user.
//   • "Adjust crop" on a page reopens the editor with the corners it was cut
//     with, and adding from there replaces the page. Corners that cross over
//     are refused before anything is made.
//   • With the corners on the paper, the page that comes out IS the paper: its
//     corners are white (not the dark desk around it), the dark bar printed
//     near the top of the sheet is near the top of the page, and the bottom of
//     the page is blank.
//   • Black & white leaves ink and paper and nothing in between.
//   • Paper defaults from the locale (en-GB → A4), and "Create PDF" opens the
//     result as "Scan YYYY-MM-DD HH.MM.pdf".
//
// The photo is synthetic, drawn in the page: a dark desk with a white sheet in
// perspective on it and one black bar across the sheet's top. Its corners are
// known, so the test can put the handles on them.
//
// Negative control (2026-10-03, run): with `flattenPhoto` sampling the photo
// at the output coordinates directly (no homography), "its corners are white",
// "the rest of the page is blank", "the bar is still there" and "the paper is
// clean white" go red; the rest stay green. An earlier version measured the
// corners on a black & white page and stayed green under the same control —
// see the note above the colour page.

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

// The sheet's corners in the photo: TL, TR, BR, BL.
const PHOTO = { w: 1600, h: 1200 }
const SHEET = [
  { x: 470, y: 150 },
  { x: 1130, y: 190 },
  { x: 1200, y: 1080 },
  { x: 400, y: 1040 },
]

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
page.on('dialog', (d) => {
  failures.push('unexpected dialog: ' + d.message())
  void d.dismiss()
})

try {
  await page.goto(BASE, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

// Draw the photo in the page and bring it back as PNG bytes.
const photo = Buffer.from(
  await page.evaluate(
    async ({ PHOTO, SHEET }) => {
      const c = document.createElement('canvas')
      c.width = PHOTO.w
      c.height = PHOTO.h
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#3a3026' // a wooden desk
      ctx.fillRect(0, 0, PHOTO.w, PHOTO.h)
      const path = (pts) => {
        ctx.beginPath()
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.closePath()
      }
      ctx.fillStyle = '#f4f2ec'
      path(SHEET)
      ctx.fill()
      // A point on the sheet at (u, v) ∈ [0,1]², by bilinear interpolation —
      // close enough to the true perspective point for a bar this thick.
      const at = (u, v) => {
        const top = { x: SHEET[0].x + (SHEET[1].x - SHEET[0].x) * u, y: SHEET[0].y + (SHEET[1].y - SHEET[0].y) * u }
        const bot = { x: SHEET[3].x + (SHEET[2].x - SHEET[3].x) * u, y: SHEET[3].y + (SHEET[2].y - SHEET[3].y) * u }
        return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v }
      }
      ctx.fillStyle = '#111111'
      path([at(0.15, 0.1), at(0.85, 0.1), at(0.85, 0.16), at(0.15, 0.16)])
      ctx.fill()
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    { PHOTO, SHEET },
  ),
)

console.log('\nthe tool is under advanced options, and the camera pill is phone-only')
check('no "Scan a document" pill in a browser', (await page.locator('button:has-text("Scan a document")').count()) === 0)
await page.click('button[aria-label="Show more tools"]')
const pill = page.locator('button:has-text("Photo to PDF")')
check('"Photo to PDF" is in the advanced options', (await pill.count()) === 1)
await pill.click()
await page.waitForSelector('#scan-dialog-title')
check('A4 is the default paper for en-GB', true) // asserted once a page exists (the control is hidden until then)

await page.setInputFiles('[data-testid="scan-photo-input"]', { name: 'letter.png', mimeType: 'image/png', buffer: photo })
const overlay = page.locator('[data-testid="scan-crop-overlay"]')
await overlay.waitFor({ timeout: 10000 })
check('a picked photo opens the corner editor', await page.locator('h2:has-text("Line up the corners")').isVisible())

async function cornerScreen(i) {
  return page.evaluate((i) => {
    const svg = document.querySelector('[data-testid="scan-crop-overlay"]')
    const r = svg.getBoundingClientRect()
    const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number)
    const c = svg.querySelector(`[data-corner="${i}"] circle`)
    return { x: r.left + (Number(c.getAttribute('cx')) / w) * r.width, y: r.top + (Number(c.getAttribute('cy')) / h) * r.height }
  }, i)
}
async function dragCorner(i, to) {
  const from = await cornerScreen(i)
  const box = await overlay.boundingBox()
  const tx = box.x + (to.x / PHOTO.w) * box.width
  const ty = box.y + (to.y / PHOTO.h) * box.height
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + tx) / 2, (from.y + ty) / 2, { steps: 4 })
  await page.mouse.move(tx, ty, { steps: 4 })
  await page.mouse.up()
}

const addPage = page.locator('button:has-text("Add page")')
const hint = page.locator('[data-testid="scan-crop-hint"]')
const corners = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-corner] circle:last-child')].map((c) => ({
      x: Number(c.getAttribute('cx')),
      y: Number(c.getAttribute('cy')),
    })),
  )
const worstOff = (got) => Math.max(...got.map((c, i) => Math.hypot(c.x - SHEET[i].x, c.y - SHEET[i].y)))

console.log('\nthe page is found on its own')
check('the editor says it found the page', (await hint.getAttribute('data-found')) === 'found', await hint.innerText())
const auto = await corners()
check(
  'and the corners start on the sheet’s corners (within 2% of the photo)',
  worstOff(auto) < 0.02 * PHOTO.w,
  `worst ${worstOff(auto).toFixed(1)} px: ${JSON.stringify(auto.map((c) => [Math.round(c.x), Math.round(c.y)]))}`,
)
// ⚠️ In COLOUR. Black & white is no use for checking where the crop landed:
// its threshold is local, so a plain desk comes out as white as the paper and
// a page cropped to include the desk would still pass "corners are white".
await addPage.click()
await page.waitForSelector('ol img', { timeout: 15000 })
check('one page in the list', (await page.locator('ol > li').count()) === 1)
check('A4 is the default paper for en-GB', (await page.locator('button[aria-pressed="true"]:has-text("A4")').count()) === 1)

console.log('\nthe page that comes out is the paper')
const pixels = await readPage(0)
check('its corners are white, not desk', pixels.corners < 0.05, JSON.stringify(pixels))
check('the bar near the top of the sheet is near the top of the page', pixels.bar > 0.8, JSON.stringify(pixels))
check('the rest of the page is blank', pixels.bottom < 0.02, JSON.stringify(pixels))

console.log('\n"Adjust crop" goes back to the photo, with the corners where they were')
await page.click('button[aria-label="Adjust the crop of page 1"]')
await overlay.waitFor({ timeout: 10000 })
check('the editor says this is an adjustment', (await hint.getAttribute('data-found')) === 'editing')
const again = await corners()
check(
  'with the same corners',
  again.every((c, i) => Math.hypot(c.x - auto[i].x, c.y - auto[i].y) < 1),
  JSON.stringify(again),
)
check('and Cancel instead of Skip photo', (await page.locator('button:has-text("Skip photo")').count()) === 0)

console.log('\ncorners that cross over are refused')
await dragCorner(0, { x: 1300, y: 1100 }) // top-left dragged past bottom-right
check('"Add page" is disabled', await addPage.isDisabled())
check('and the editor says why', await page.locator('text=The corners cross over').isVisible())

console.log('\nmoving the corners by hand and adding replaces the page, not adds one')
for (let i = 0; i < 4; i++) await dragCorner(i, SHEET[i])
check('"Add page" is enabled again', await addPage.isEnabled())
await addPage.click()
await page.waitForSelector('ol img', { timeout: 15000 })
check('still one page', (await page.locator('ol > li').count()) === 1)
const redone = await readPage(0)
check('and it is still the paper', redone.corners < 0.05 && redone.bar > 0.8, JSON.stringify(redone))

console.log('\nblack & white turns the page into pure ink and paper')
await page.setInputFiles('[data-testid="scan-photo-input"]', { name: 'letter-2.png', mimeType: 'image/png', buffer: photo })
await overlay.waitFor({ timeout: 10000 })
await page.click('button:has-text("Black & white")')
await addPage.click()
await page.waitForFunction(() => document.querySelectorAll('ol > li').length === 2, null, { timeout: 15000 })
const bw = await readPage(1)
check('the bar is still there', bw.bar > 0.8, JSON.stringify(bw))
check('the paper is clean white', bw.bottom === 0, JSON.stringify(bw))
check('nothing is left in between ink and paper', bw.midtones < 0.03, JSON.stringify(bw))

console.log('\na photo with no page in it says so, and leaves the corners to you')
const desk = Buffer.from(
  await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 1200
    c.height = 900
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#3a3026'
    ctx.fillRect(0, 0, 1200, 900)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }),
)
await page.setInputFiles('[data-testid="scan-photo-input"]', { name: 'desk.png', mimeType: 'image/png', buffer: desk })
await overlay.waitFor({ timeout: 10000 })
check('the editor says it could not find the page', (await hint.getAttribute('data-found')) === 'missed', await hint.innerText())
await page.click('button:has-text("Skip photo")')
await page.waitForSelector('ol img')
check('skipping it adds nothing', (await page.locator('ol > li').count()) === 2)

async function readPage(n) {
  return page.evaluate(async (n) => {
  const img = document.querySelectorAll('ol img')[n]
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  const dark = (x0, y0, x1, y1) => {
    let n = 0
    let all = 0
    for (let y = Math.floor(y0 * c.height); y < Math.floor(y1 * c.height); y++)
      for (let x = Math.floor(x0 * c.width); x < Math.floor(x1 * c.width); x++) {
        const i = (y * c.width + x) * 4
        all++
        if (data[i] < 100) n++
      }
    return n / all
  }
  return {
    w: c.width,
    h: c.height,
    corners: Math.max(dark(0, 0, 0.04, 0.04), dark(0.96, 0, 1, 0.04), dark(0.96, 0.96, 1, 1), dark(0, 0.96, 0.04, 1)),
    bar: dark(0.25, 0.115, 0.75, 0.145),
    bottom: dark(0.1, 0.5, 0.9, 0.95),
    // JPEG blurs a hard edge a little, so "pure" means "almost all pixels
    // within reach of 0 or 255".
    midtones: (() => {
      let n = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] > 60 && data[i] < 195) n++
      return n / (data.length / 4)
    })(),
  }
  }, n)
}

console.log('\n"Create PDF" opens the scan')
await page.click('button:has-text("Create PDF")')
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
check('the dialog closed', (await page.locator('#scan-dialog-title').count()) === 0)
const named = await page.evaluate(() => /Scan \d{4}-\d{2}-\d{2} \d{2}\.\d{2}/.test(document.body.innerText))
check('it is named "Scan YYYY-MM-DD HH.MM"', named)
const ratio = await page.evaluate(() => {
  const c = document.querySelector('[data-page-index="0"] canvas')
  return c.width / c.height
})
check('the page keeps the sheet’s shape', Math.abs(ratio - pixels.w / pixels.h) < 0.02, `${ratio} vs ${pixels.w / pixels.h}`)

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`)
  process.exit(1)
}
console.log('\nall good')
