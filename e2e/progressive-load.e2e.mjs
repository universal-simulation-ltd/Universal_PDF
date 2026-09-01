// A long PDF has to LOOK open straight away.
//
//   ./scripts/preview.sh              # in one terminal (Universal PDF is :5174)
//   npm run test:progressive-load     # in another
//
// ⚠️ What this exists to stop coming back. The viewer mounts a `PdfPage` for
// every page of the document at once, and every one of them used to (a) ask
// pdf.js to rasterize it in the same tick and (b) mount its interactive layers
// — a Konva annotation stage, the selectable text overlay, the form fields.
// Measured on a 400-page file before the fix:
//
//     document in the store   0.09 s
//     page 1 painted          7.68 s
//     ALL 400 painted         7.68 s     ← the same instant
//
// So the viewer sat blank for eight seconds and then filled in all at once,
// and the eight seconds were spent on 399 pages nobody was looking at. After:
// page 1 at 0.18 s, pages 1-4 at 0.26 s, the lot at 2.45 s.
//
// The timings themselves are machine-specific and are NOT asserted. What is
// asserted are the two properties that produce them, either of which failing
// brings the eight seconds back:
//
//   • page 1 has pixels while the far end of the document still does not —
//     i.e. the document stopped arriving in one lump (`renderQueue`);
//   • a page far from the reader carries no interactive layers OR bitmap until
//     they approach it, and carries both once they arrive (`PdfPage`'s
//     `active`).
//
// ⚠️ THIS SPEC USED TO ASSERT "and the rest do follow — none are abandoned",
// i.e. that all 200 pages end up painted. That is deliberately no longer true
// (2026-09-01): a page outside the band around the reader now holds no bitmap,
// which is what lets the pages you ARE looking at be drawn at the screen's full
// pixel ratio however long the document is — see `crisp-pages.e2e.mjs`. What
// replaces it is the claim that actually matters to a reader: the page arrives
// when you get there.
//
// ⚠️ AND THE PREDICATE HAD TO CHANGE WITH IT. `painted()` used to mean "this
// canvas is not 300×150", the untouched default. A RELEASED canvas is 0×0, and
// that passed the old test — so with windowing in place every unpainted page
// read as painted and this spec cheerfully asserted the opposite of the truth.
// It tests `width > 1`.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const PAGES = 200

// ⚠️ Pick a Playwright whose chromium build is actually downloaded — the repos
// this borrows from span three versions wanting three different revisions, and
// only some are in ~/Library/Caches/ms-playwright. The symptom of choosing
// wrong is "Executable doesn't exist at …chromium_headless_shell-XXXX".
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
      return { pw: mod.default, browser }
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

// A document long enough for the old behaviour to be unmistakable, built here
// rather than committed: 200 pages of real content is a fixture nobody wants in
// the repo, and pdf-lib is already a dependency.
const { PDFDocument, StandardFonts } = await import(
  pathToFileURL(join(ROOT, 'node_modules/pdf-lib/cjs/index.js')).href
).then((m) => m.default ?? m)
const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
for (let i = 0; i < PAGES; i++) {
  const p = pdf.addPage([595, 842])
  p.drawText(`Page ${i + 1}`, { x: 40, y: 790, size: 24, font })
  for (let l = 0; l < 40; l++) {
    p.drawText(`${l} the quick brown fox jumps over the lazy dog 0123456789`, {
      x: 40, y: 750 - l * 17, size: 10, font
    })
  }
}
const b64 = Buffer.from(await pdf.save()).toString('base64')

const { browser } = await loadPlaywright()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('input[type=file]'), { timeout: 30000 })

  console.log('\nA 200-page document opens')
  const load = await page.evaluate(async ({ b64, PAGES }) => {
    // ⚠️ NOT `canvas.width > 0`: an untouched <canvas> reports the default
    // 300x150, so every page would look painted the instant React mounts it.
    // The backing store is only sized in PdfPage's final blit.
    // ⚠️ `width > 1` as well as "not the 300×150 default": a page whose bitmap
    // has been released is 0×0, and 0×0 is not painted either.
    const painted = (i) => {
      const el = document.querySelector(`[data-page-index="${i}"] canvas`)
      return !!el && el.width > 1 && !(el.width === 300 && el.height === 150)
    }
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const { usePdfStore } = await import('/src/stores/pdfStore.ts')
    const file = new File([bytes], 'long.pdf', { type: 'application/pdf' })

    // ⚠️ Not awaited before watching starts: `loadFile` keeps working past the
    // point where it puts the document in the store, so awaiting it first hides
    // every paint in the meantime — which is all of the interesting ones.
    const done = usePdfStore.getState().loadFile(file)

    const deadline = performance.now() + 120000
    let firstPaintedWithLastStillBlank = null
    while (performance.now() < deadline) {
      if (painted(0)) {
        firstPaintedWithLastStillBlank = !painted(PAGES - 1)
        break
      }
      await new Promise((r) => setTimeout(r, 10))
    }
    // Let the first screenful settle, then count what is actually held. The
    // whole document is NOT expected to paint — see the note at the top.
    await new Promise((r) => setTimeout(r, 1500))
    const held = Array.from({ length: PAGES }, (_, i) => i).filter(painted).length
    await done.catch(() => {})
    return {
      firstPaintedWithLastStillBlank,
      held,
      numPages: usePdfStore.getState().numPages
    }
  }, { b64, PAGES })

  check('all 200 pages are there', load.numPages === PAGES, `got ${load.numPages}`)
  check(
    'page 1 has pixels while the last page still has none',
    load.firstPaintedWithLastStillBlank === true,
    load.firstPaintedWithLastStillBlank === null
      ? 'page 1 never painted at all'
      : 'the whole document still arrives in one lump'
  )
  check(
    'and the document does not hold a bitmap for all 200 — the far ones wait',
    load.held > 0 && load.held < PAGES,
    `${load.held} of ${PAGES} held`
  )

  console.log('\nOnly the pages near the reader carry their interactive layers')
  // Konva renders its stage into a `div.konvajs-content`, so that is the
  // presence test for the annotation layer.
  const layerAt = (i) =>
    page.evaluate(
      (i) => !!document.querySelector(`[data-page-index="${i}"] .konvajs-content`),
      i
    )
  check('the page being read has one', await layerAt(0))
  check('a page 150 further on does not', !(await layerAt(150)))

  console.log('\nScrolling to it brings them with you')
  await page.evaluate(() => {
    document.querySelector('[data-page-index="150"]')?.scrollIntoView({ block: 'center' })
  })
  await page.waitForFunction(
    () => !!document.querySelector('[data-page-index="150"] .konvajs-content'),
    { timeout: 15000 }
  ).catch(() => {})
  check('page 151 now has its annotation layer', await layerAt(150))
  check('and page 1, far behind now, has given its up', !(await layerAt(0)))

  // The bitmap follows the same band, and is the half the reader actually sees.
  const paintedAt = (i) =>
    page.evaluate((i) => {
      const el = document.querySelector(`[data-page-index="${i}"] canvas`)
      return !!el && el.width > 1 && !(el.width === 300 && el.height === 150)
    }, i)
  await page.waitForFunction(
    (i) => {
      const el = document.querySelector(`[data-page-index="${i}"] canvas`)
      return !!el && el.width > 1 && !(el.width === 300 && el.height === 150)
    },
    150,
    { timeout: 15000 }
  ).catch(() => {})
  check('and its bitmap arrived with it', await paintedAt(150))
  check('while page 1 has released its own', !(await paintedAt(0)))
} finally {
  await browser.close().catch(() => {})
}

console.log(failures.length ? `\n${failures.length} failed.` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
