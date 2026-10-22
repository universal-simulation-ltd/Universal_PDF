// The export's three copies — as it is, compressed, flattened — and the rule
// that hides any of them that would barely change the size (James, 2026-10-22:
// "on export show default, compressed and flatten images — hide if the
// difference is too small").
//
//   ./scripts/preview.sh             # or preview.ps1 — Universal PDF is :5174
//   npm run test:export-variants     # in another terminal
//
// Two documents, on both surfaces (the website's Export dialog and the phone's
// Share page):
//
//   • a one-page TEXT letter — nothing to compress, and turning it into a
//     picture only makes it bigger, so there must be ONE file and no choice;
//   • a PHOTO-HEAVY document — four pages, each a full-bleed photo far denser
//     than the page needs, so Flattened must be offered and must really be
//     smaller when downloaded.

import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepAppModuleUrls } from './app-modules.mjs'

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

// Built in the page, with the app's own pdf-lib and the browser's JPEG
// encoder, and handed back as base64 for setInputFiles.
async function makePdf(page, kind) {
  return page.evaluate(async (kind) => {
    const { PDFDocument, StandardFonts } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
    const d = await PDFDocument.create()
    if (kind === 'text') {
      const f = await d.embedFont(StandardFonts.Helvetica)
      const pg = d.addPage([595, 842])
      pg.drawText('Dear Sam, this letter has nothing in it worth compressing.', { x: 40, y: 780, size: 12, font: f })
    } else {
      for (let i = 0; i < 4; i++) {
        // Noise over a gradient at 2400 x 3400 and JPEG 0.95: a photo far
        // denser than an A4 page needs, which is what flattening is for.
        const c = document.createElement('canvas')
        c.width = 2400
        c.height = 3400
        const ctx = c.getContext('2d')
        const img = ctx.createImageData(c.width, c.height)
        for (let p = 0; p < img.data.length; p += 4) {
          const y = Math.floor(p / 4 / c.width)
          img.data[p] = (y / 14 + Math.random() * 90) | 0
          img.data[p + 1] = (120 + Math.random() * 90) | 0
          img.data[p + 2] = (200 - y / 20 + Math.random() * 50) | 0
          img.data[p + 3] = 255
        }
        ctx.putImageData(img, 0, 0)
        const jpeg = await new Promise((r) => c.toBlob((b) => r(b.arrayBuffer()), 'image/jpeg', 0.95))
        const im = await d.embedJpg(jpeg)
        d.addPage([595, 842]).drawImage(im, { x: 0, y: 0, width: 595, height: 842 })
      }
    }
    const bytes = await d.save()
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s)
  }, kind)
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

// ── The website's Export dialog ─────────────────────────────────────────────

async function openOnWeb(kind) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (./scripts/preview.sh).`)
    await browser.close()
    process.exit(2)
  }
  const b64 = await makePdf(page, kind)
  const size = Buffer.from(b64, 'base64').byteLength
  await page.setInputFiles('input[type=file]', { name: `${kind}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(b64, 'base64') })
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 60000 })
  await page.getByRole('button', { name: /export/i }).first().click()
  await page.waitForSelector('text=Export PDF', { timeout: 15000 })
  await page.locator('text=/Building export…|Compressing…/').first().waitFor({ state: 'detached', timeout: 120000 }).catch(() => {})
  return { context, page, size }
}

console.log('\nWebsite · a text letter: one file, no choice')
{
  const { context, page } = await openOnWeb('text')
  // Long enough for the estimate to land, so a late-arriving tab would show.
  await page.waitForTimeout(2500)
  check('no tab strip', (await page.getByRole('tablist').count()) === 0)
  const dl = page.getByRole('button', { name: /^Download/ }).first()
  check('the button is plain Download', (await dl.innerText()).trim() === 'Download', JSON.stringify(await dl.innerText()))
  check('and it says why there is no smaller copy',
    (await page.getByText(/there are no images here to compress/).count()) === 1)
  await context.close()
}

console.log('\nWebsite · a photo-heavy document: Flattened is offered, and is smaller')
{
  const { context, page, size } = await openOnWeb('photos')
  const flatTab = page.getByRole('tab', { name: /Flattened/ })
  const appeared = await flatTab.waitFor({ state: 'visible', timeout: 120000 }).then(() => true).catch(() => false)
  check('a Flattened tab', appeared)
  const tabs = await page.getByRole('tab').allInnerTexts()
  check('Original comes first', /^Original/.test(tabs[0] ?? ''), JSON.stringify(tabs))
  check('the default selection is NOT Flattened — the text layer is never given away by default',
    (await flatTab.getAttribute('aria-selected')) !== 'true')
  if (appeared) {
    await flatTab.click()
    const dl = page.getByRole('button', { name: 'Download Flattened' })
    const enabled = await page
      .waitForFunction(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Download Flattened')
        return b && !b.disabled
      }, null, { timeout: 180000 })
      .then(() => true)
      .catch(() => false)
    check('the button names the flattened copy, and comes ready', enabled)
    check('the panel says what it costs', (await page.getByText(/text can no longer be selected/).count()) === 1)
    await page.screenshot({ path: join(HERE, '..', 'e2e-export-variants-web.png') })
    if (enabled) {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dl.click()])
      const bytes = await readFile(await download.path())
      check('the downloaded file is at least 20% smaller than the original',
        bytes.byteLength <= size * 0.8, `${bytes.byteLength} vs ${size}`)
    }
  }
  await context.close()
}

// ── The phone's Share page ──────────────────────────────────────────────────

async function openOnPhone(kind) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await keepAppModuleUrls(context)
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  await page.goto(`${BASE}?app`, { waitUntil: 'load' })
  const b64 = await makePdf(page, kind)
  await page.evaluate(async ({ b64, kind }) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const imp = globalThis.__appImport ?? ((p) => import(p))
    const { usePdfStore } = await imp('/src/stores/pdfStore.ts')
    await usePdfStore.getState().loadFile(new File([bytes], `${kind}.pdf`, { type: 'application/pdf' }))
    const { useNav } = await imp('/src/native/nav.ts')
    useNav.getState().push('share')
  }, { b64, kind })
  await page.getByText('how big?').waitFor({ timeout: 30000 })
  return { context, page }
}

const slipTitles = (page) =>
  page.locator('input[name="np-size"]').evaluateAll((els) => els.map((e) => e.closest('label')?.innerText.split('\n')[0] ?? ''))

console.log('\nPhone · a text letter: one slip')
{
  const { context, page } = await openOnPhone('text')
  await page.waitForFunction(() => !document.body.innerText.includes('weighing it…'), null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const titles = await slipTitles(page)
  check('only As it is', titles.length === 1 && /As it is/.test(titles[0]), JSON.stringify(titles))
  await context.close()
}

console.log('\nPhone · a photo-heavy document: a Flattened slip')
{
  const { context, page } = await openOnPhone('photos')
  const ok = await page
    .waitForFunction(() => [...document.querySelectorAll('input[name="np-size"]')].some((e) => /Flattened/.test(e.closest('label')?.innerText ?? '') && /pages as pictures/.test(e.closest('label')?.innerText ?? '')), null, { timeout: 180000 })
    .then(() => true)
    .catch(() => false)
  const titles = await slipTitles(page)
  check('a Flattened slip with its size', ok, JSON.stringify(titles))
  check('As it is is still picked by default',
    await page.locator('input[name="np-size"]').first().isChecked())
  await page.screenshot({ path: join(HERE, '..', 'e2e-export-variants-phone.png') })
  await context.close()
}

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
