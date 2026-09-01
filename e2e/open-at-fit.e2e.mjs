// A document must not be seen at the wrong zoom on its way in.
//
//   ./scripts/preview.sh       # in one terminal (Universal PDF is :5174)
//   npm run test:open-fit      # in another
//
// ⚠️ What this exists to stop coming back. Two separate faults put a
// half-arrived document on screen, and a LANDSCAPE page on a phone is where
// both are unmissable — at 100% it is more than twice the width of the screen:
//
//   • The viewer opens at 100% and only then works out the fit-to-screen zoom,
//     because that needs `getPage(1)` and so lands a microtask later. Page 1
//     was rasterized at 100% first, shown, and then snapped out to fit. (See
//     `fittedDoc` in PdfViewer: the pages are not mounted until the zoom is
//     known, so page 1 is rasterized ONCE, at the zoom it is read at.)
//
//   • The "Loading PDF…" placeholder was rendered *instead of* the viewer, so
//     the `firstPaint` hold — which waits for page 1 to be PAINTED, by a
//     `PdfPage` that only exists while the viewer is mounted — could never be
//     satisfied by a paint. Its 1.2s deadline was the only thing that ever
//     released it, and the viewer then mounted and drew its empty page frames
//     afterwards: the exact stage the hold was added to hide. (See App.tsx: the
//     placeholder is an overlay over the mounted viewer.)
//
// Asserted here, on a landscape page in a phone-sized viewport:
//
//   • the page-1 canvas is NEVER seen at 100% — the only width it ever has is
//     the fitted one;
//   • the placeholder is still up until page 1 has pixels, so nothing empty is
//     ever on screen.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
// A4 landscape, in points. Wider than any phone at 100% (842pt × 96/72 =
// 1123 CSS px against a 390px screen), which is what makes the fault visible.
const PAGE_W = 842
const PAGE_H = 595

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

const { PDFDocument, StandardFonts } = await import(
  pathToFileURL(join(ROOT, 'node_modules/pdf-lib/cjs/index.js')).href
).then((m) => m.default ?? m)
const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
for (let i = 0; i < 3; i++) {
  const p = pdf.addPage([PAGE_W, PAGE_H])
  p.drawText(`Landscape page ${i + 1}`, { x: 40, y: PAGE_H - 60, size: 24, font })
}
const b64 = Buffer.from(await pdf.save()).toString('base64')

const { browser } = await loadPlaywright()
// A phone, because that is where a landscape page at 100% overflows.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('input[type=file]'), { timeout: 30000 })

  console.log('\nA landscape PDF opens on a phone-sized screen')
  const seen = await page.evaluate(async ({ b64 }) => {
    // ⚠️ NOT `canvas.width > 0`: an untouched <canvas> reports the default
    // 300x150. The backing store is only sized in PdfPage's final blit.
    const canvasOf = () => document.querySelector('[data-page-index="0"] canvas')
    const painted = () => {
      const el = canvasOf()
      return !!el && !(el.width === 300 && el.height === 150)
    }
    const placeholderUp = () =>
      [...document.querySelectorAll('div')].some((d) => d.textContent === 'Loading PDF…')

    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const { usePdfStore } = await import('/src/stores/pdfStore.ts')
    const file = new File([bytes], 'landscape.pdf', { type: 'application/pdf' })

    // ⚠️ Not awaited before watching starts: `loadFile` keeps working past the
    // point where it puts the document in the store, so awaiting it first hides
    // every paint in the meantime — which is all of the interesting ones.
    const done = usePdfStore.getState().loadFile(file)

    // Every distinct CSS width the page-1 canvas is ever laid out at, in order.
    const widths = []
    // What was on screen at the first tick the placeholder was gone.
    // ⚠️ Only counted once it has been SEEN up: the first tick or two of this
    // loop are before `loadFile` has even set `loading`, and a "no placeholder"
    // read there is the landing page, not a lifted hold.
    let sawPlaceholder = false
    let paintedWhenPlaceholderWent = null
    const deadline = performance.now() + 30000
    while (performance.now() < deadline) {
      const el = canvasOf()
      if (el) {
        const w = Math.round(el.getBoundingClientRect().width)
        if (w && widths[widths.length - 1] !== w) widths.push(w)
      }
      if (placeholderUp()) sawPlaceholder = true
      else if (sawPlaceholder && paintedWhenPlaceholderWent === null) {
        paintedWhenPlaceholderWent = painted()
      }
      if (paintedWhenPlaceholderWent !== null && widths.length && painted()) {
        // Give any late re-fit a chance to show up in `widths` before stopping.
        await new Promise((r) => setTimeout(r, 500))
        const el2 = canvasOf()
        if (el2) {
          const w = Math.round(el2.getBoundingClientRect().width)
          if (w && widths[widths.length - 1] !== w) widths.push(w)
        }
        break
      }
      await new Promise((r) => requestAnimationFrame(r))
    }
    await done.catch(() => {})
    return { widths, paintedWhenPlaceholderWent, viewport: window.innerWidth }
  }, { b64 })

  const hundredPct = Math.round(PAGE_W * (96 / 72))
  console.log(`  canvas widths seen: ${seen.widths.join(' → ')} (100% would be ${hundredPct}, screen is ${seen.viewport})`)

  check(
    'page 1 is never painted at 100% — it arrives already fitted',
    seen.widths.length > 0 && !seen.widths.some((w) => Math.abs(w - hundredPct) <= 2),
    seen.widths.length ? `saw ${seen.widths.join(', ')}` : 'page 1 never painted at all'
  )
  check(
    'and it is never re-laid-out on the way in — one width, not two',
    seen.widths.length === 1,
    `${seen.widths.length} widths: ${seen.widths.join(', ')}`
  )
  check(
    'it fits the screen',
    seen.widths.length > 0 && seen.widths[0] <= seen.viewport,
    `${seen.widths[0]}px on a ${seen.viewport}px screen`
  )
  check(
    'the placeholder holds until page 1 has pixels — no empty page frames',
    seen.paintedWhenPlaceholderWent === true,
    seen.paintedWhenPlaceholderWent === null
      ? 'the placeholder was never seen, or never went away'
      : 'the placeholder lifted onto a blank page frame'
  )
} finally {
  await browser.close().catch(() => {})
}

console.log(failures.length ? `\n${failures.length} failed.` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
