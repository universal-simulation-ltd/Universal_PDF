// A redacted circle redacts the INSIDE of the circle — not the square round it.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:redact-circle        # in another terminal
//
// What is pinned (owner, 2026-10-12: "when a circle is redacted, redact the
// inside of the circle (same behaviour as a fill would do)"):
//
//   • The Redact button on a selected circle used to swap it for an ordinary
//     redaction BOX the size of the circle's bounding square, so the corners
//     outside the curve were blacked out too — on screen and in the file.
//   • Now the redaction keeps the circle: on screen it is drawn as an ellipse,
//     the exported page is black inside the circle and untouched in the
//     corners of its square, and the bucket turns it back into a filled
//     circle rather than a box.
//
// Negative control (run 2026-10-12): with the `shape: 'ellipse'` spread taken
// out of the Redact button, four checks go red — the redaction is not
// remembered as an ellipse, the stage shows a black Rect, the corner of the
// square exports black ([0,0,0]), and the bucket brings back a box. "Black
// inside the circle" stays green, because a box covers that too.

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
      const probe = await mod[process.env.E2E_BROWSER || 'chromium'].launch()
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

// A blank page: anything dark in the export is the redaction, so a pixel test
// reads the shape of the block directly.
async function testPdf() {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright[process.env.E2E_BROWSER || 'chromium'].launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'circle.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)

// The annotation nodes on page 1's stage, by Konva class.
const nodes = () =>
  page.evaluate(() => {
    const out = []
    for (const stage of window.Konva?.stages ?? []) {
      for (const n of stage.find('Shape')) {
        if (!n.id()) continue
        out.push({ cls: n.getClassName(), fill: n.fill() })
      }
    }
    return out
  })

// ── Draw a circle and redact it ──────────────────────────────────────────────
console.log('\nthe Redact button on a circle keeps it a circle')
const drawBtn = page.locator('button[title^="Free draw"]:visible').first()
const circleBtn = page.locator('button[title="Circle"]:visible').first()
for (let attempt = 0; attempt < 3 && !(await circleBtn.count()); attempt++) {
  await drawBtn.click()
  await page.waitForTimeout(250)
}
check('the Circle tool is reachable', (await circleBtn.count()) > 0)
await circleBtn.click()
await page.waitForTimeout(300)

const box = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
await page.mouse.move(Math.round(box.x + 220), Math.round(box.y + 220))
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(450)
check('a circle landed on the page', (await nodes()).some((n) => n.cls === 'Ellipse'))

await page.locator('button[aria-label="Redact this area"]').first().click()
await page.waitForTimeout(450)

const after = await nodes()
const redacted = await page.evaluate(async () => {
  const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
  return useAnnotationStore.getState().annotations
})
const r = redacted.find((a) => a.type === 'redact')
check('the circle became a redaction', !!r, JSON.stringify(redacted))
check('…remembered as an ellipse', r?.shape === 'ellipse', JSON.stringify(r))
check(
  'drawn as a circle on screen, not a box',
  !after.some((n) => n.cls === 'Rect') && after.some((n) => n.cls === 'Shape' && n.fill === '#000000'),
  JSON.stringify(after),
)

// ── Export it and read the pixels ────────────────────────────────────────────
console.log('\nthe exported page is black inside the circle only')
const pixels = await page.evaluate(
  async ({ src, r }) => {
    const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
    const { openPdf } = await import('/src/lib/pdfjs.ts')
    const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
    const out = await buildAnnotatedPdfBytes(bytes.buffer, [r], 1)
    const doc = await openPdf(out).promise
    const p = await doc.getPage(1)
    const vp = p.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')
    await p.render({ canvasContext: ctx, viewport: vp }).promise
    const at = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]
    const res = {
      centre: at(r.x + r.width / 2, r.y + r.height / 2),
      // 10% in from the corner of the square: inside the box, outside the curve.
      corner: at(r.x + r.width * 0.1, r.y + r.height * 0.1),
      // Just inside the curve on the diagonal, so a block shrunk to the
      // inscribed square would fail too.
      rim: at(r.x + r.width * 0.2, r.y + r.height * 0.2),
    }
    void doc.destroy()
    return res
  },
  { src: pdf.toString('base64'), r },
)
const dark = (px) => px.every((c) => c < 60)
const light = (px) => px.every((c) => c > 200)
check('black inside the circle', dark(pixels.centre), JSON.stringify(pixels.centre))
check('black right out to the curve', dark(pixels.rim), JSON.stringify(pixels.rim))
check('the corner of its square is left alone', light(pixels.corner), JSON.stringify(pixels.corner))

// ── …and the bucket takes it back to a filled circle ─────────────────────────
console.log('\nthe bucket turns it back into a filled circle')
await page.locator('button[aria-label="Turn this redaction into a filled shape"]').first().click()
await page.waitForTimeout(450)
const back = await page.evaluate(async () => {
  const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
  return useAnnotationStore.getState().annotations
})
check(
  'a filled ellipse, not a box',
  back.length === 1 && back[0].type === 'ellipse' && back[0].filled === true,
  JSON.stringify(back),
)

await browser.close()

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
