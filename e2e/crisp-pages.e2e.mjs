// The page you are looking at is drawn at your screen's resolution — however
// long the document is.
//
//   ./scripts/preview.sh      # in one terminal (Universal PDF is :5174)
//   npm run test:crisp        # in another
//
// ⚠️ What this exists to stop coming back. `renderBudget` divides a fixed
// canvas allowance between the pages that hold canvases, and that used to be
// EVERY page of the document. So the longer the document, the smaller each
// page's share — and past ~40 pages the share no longer covered even one page
// at 1:1, `layerPixelRatio` fell to 1, and the whole document was drawn at half
// the linear resolution of a short one on a retina screen. Reported as "the
// quality is clearly visible between low and high page counts in my downloads",
// and confirmed on those files: page 1 of a 6-page PDF had 1190 backing pixels
// across 595 CSS, the same page of a 251-page PDF had 595.
//
// The fix is not a bigger allowance — it is that a page outside the band around
// the reader now holds NO bitmap, so the allowance is shared between the ~25
// pages that are actually held rather than with hundreds nobody is looking at.
// On the 251-page file that is 5 megapixels of canvas where it used to be 131,
// and the visible page is twice as sharp.
//
// Asserted here, at deviceScaleFactor 2:
//
//   • page 1 of a long document is drawn at the same ratio as page 1 of a short
//     one, and that ratio is the device's;
//   • the document does NOT hold a bitmap per page;
//   • scrolling to the far end draws it there, at the same ratio;
//   • a long document is no longer pinned to a 100% zoom ceiling.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const LONG = 250
const SHORT = 5
// Must match `MAX_RETAINED_PAGES` in src/lib/renderBudget.ts.
const MAX_RETAINED_PAGES = 25

// ⚠️ Pick a Playwright whose chromium build is actually downloaded — see the
// note in progressive-load.e2e.mjs.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js'
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    try {
      const mod = await import(pathToFileURL(join(HERE, rel)).href)
      if (!mod.default?.chromium) continue
      const browser = await mod.default.chromium.launch()
      return { browser }
    } catch {
      continue
    }
  }
  console.error('No usable Playwright + chromium found — see the candidate list above.')
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

try {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(String(res.status))
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  process.exit(2)
}

const { PDFDocument, StandardFonts } = await import(
  pathToFileURL(join(ROOT, 'node_modules/pdf-lib/cjs/index.js')).href
).then((m) => m.default ?? m)

async function makePdf(pages) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = pdf.addPage([595, 842])
    p.drawText(`Page ${i + 1}`, { x: 40, y: 790, size: 24, font })
    for (let l = 0; l < 30; l++) {
      p.drawText(`${l} the quick brown fox jumps over the lazy dog`, { x: 40, y: 750 - l * 20, size: 10, font })
    }
  }
  return Buffer.from(await pdf.save()).toString('base64')
}

const [longB64, shortB64] = await Promise.all([makePdf(LONG), makePdf(SHORT)])

const { browser } = await loadPlaywright()
// deviceScaleFactor 2 — a retina Mac, where a 1× bitmap is visibly soft.
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })

// What the viewer is holding, once it has stopped changing.
const SETTLE = `
  async function settled() {
    const live = () => [...document.querySelectorAll('[data-page-index] canvas')]
      .filter((c) => c.width > 1 && !(c.width === 300 && c.height === 150))
    const deadline = performance.now() + 60000
    let last = -1, stable = 0
    while (performance.now() < deadline && stable < 8) {
      const n = live().reduce((a, c) => a + c.width * c.height, 0)
      if (n === last) stable++; else { stable = 0; last = n }
      await new Promise((r) => setTimeout(r, 100))
    }
    return live()
  }
`

async function open(b64) {
  return page.evaluate(async ({ b64, SETTLE }) => {
    // eslint-disable-next-line no-eval
    eval(SETTLE)
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const { usePdfStore } = await import('/src/stores/pdfStore.ts')
    usePdfStore.getState().reset()
    await usePdfStore.getState().loadFile(new File([bytes], 'doc.pdf', { type: 'application/pdf' }))
    // eslint-disable-next-line no-undef
    const live = await settled()
    const first = document.querySelector('[data-page-index="0"] canvas')
    return {
      pages: usePdfStore.getState().numPages,
      held: live.length,
      megapixels: +(live.reduce((a, c) => a + c.width * c.height, 0) / 1e6).toFixed(1),
      page1Ratio: first && first.width > 1
        ? +(first.width / first.getBoundingClientRect().width).toFixed(2)
        : 0,
      dpr: window.devicePixelRatio
    }
  }, { b64, SETTLE })
}

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('input[type=file]'), { timeout: 30000 })

  console.log(`\nA ${SHORT}-page document — the case that was always sharp`)
  const short = await open(shortB64)
  console.log(`  ${short.held} pages held, ${short.megapixels} MP, page 1 at ${short.page1Ratio}×`)
  check('page 1 is drawn at the screen\'s pixel ratio', short.page1Ratio === short.dpr, `${short.page1Ratio}× on a ${short.dpr}× screen`)

  console.log(`\nA ${LONG}-page document — the case that was not`)
  const long = await open(longB64)
  console.log(`  ${long.held} pages held, ${long.megapixels} MP, page 1 at ${long.page1Ratio}×`)
  check(
    'page 1 is drawn at the SAME ratio as in the short document',
    long.page1Ratio === short.page1Ratio,
    `${long.page1Ratio}× against ${short.page1Ratio}×`
  )
  check(
    'and the document does not hold a bitmap per page',
    long.held <= MAX_RETAINED_PAGES && long.held < LONG,
    `${long.held} of ${LONG} pages held`
  )

  console.log('\nScrolling to the far end')
  await page.evaluate((i) => {
    document.querySelector(`[data-page-index="${i}"]`)?.scrollIntoView({ block: 'center' })
  }, LONG - 1)
  const far = await page.evaluate(async ({ i, SETTLE }) => {
    // eslint-disable-next-line no-eval
    eval(SETTLE)
    // eslint-disable-next-line no-undef
    const live = await settled()
    const el = document.querySelector(`[data-page-index="${i}"] canvas`)
    const firstEl = document.querySelector('[data-page-index="0"] canvas')
    return {
      held: live.length,
      ratio: el && el.width > 1 ? +(el.width / el.getBoundingClientRect().width).toFixed(2) : 0,
      page1StillHoldsPixels: !!firstEl && firstEl.width > 1
    }
  }, { i: LONG - 1, SETTLE })
  console.log(`  ${far.held} pages held, last page at ${far.ratio}×`)
  check('the last page is drawn there, at full resolution', far.ratio === short.page1Ratio, `${far.ratio}×`)
  check('and page 1, far behind now, has given its pixels up', !far.page1StillHoldsPixels)
  check('the total held is still bounded', far.held <= MAX_RETAINED_PAGES, `${far.held} pages`)

  console.log('\nThe zoom ceiling is no longer set by the document\'s length')
  const ceiling = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^\d+%$/.test(b.textContent.trim()))
    return btn ? btn.textContent.trim() : null
  })
  // Zoom in until the + button gives up, and read what it stopped at.
  const maxLabel = await page.evaluate(async () => {
    const plus = document.querySelector('button[aria-label="Zoom in"]')
    if (!plus) return null
    for (let i = 0; i < 60 && !plus.disabled; i++) {
      plus.click()
      await new Promise((r) => setTimeout(r, 60))
    }
    const btn = [...document.querySelectorAll('button')].find((b) => /^\d+%$/.test(b.textContent.trim()))
    return btn ? parseInt(btn.textContent, 10) : null
  })
  console.log(`  opened at ${ceiling}, zoomed in as far as ${maxLabel}%`)
  check(
    'a long document can be zoomed past 100%',
    typeof maxLabel === 'number' && maxLabel > 100,
    `stopped at ${maxLabel}%`
  )
} finally {
  await browser.close().catch(() => {})
}

console.log(failures.length ? `\n${failures.length} failed.` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
