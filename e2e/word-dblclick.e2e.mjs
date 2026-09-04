// Double-click a word with the Select tool → Select text, word highlighted.
//
//   ./scripts/preview.sh                              # or preview.ps1 — :5174
//   npm run test:word-dblclick                        # in another terminal
//
// Against a production build instead (what this was verified on — the built
// base path is /pdf/, so the build has to sit under a `pdf/` folder):
//
//   npm run build && mkdir -p srv && cp -r dist srv/pdf
//   python -m http.server 5174 --directory srv   # PDF's own registry port
//   E2E_BASE_URL=http://localhost:5174/pdf/ npm run test:word-dblclick
//
// What is pinned (owner, 2026-09-04: "if select tool is selected and then
// double click a word, autoswitch to select text tool and highlight that
// word"):
//
//   • The tool really changes — the toolbar's Select-group button reports
//     Select text afterwards, so the next drag selects text.
//   • The WORD is selected, not the line and not a stray character. The
//     assertion is window.getSelection().toString(), i.e. what Ctrl/⌘C copies.
//   • Word boundaries are the browser's: punctuation and spaces stop it.
//   • A double-click on BLANK page space leaves the tool alone — the switch is
//     a consequence of hitting text, not of double-clicking.
//   • A double-click ON an annotation belongs to the annotation: no switch.
//
// Negative control (2026-09-04, run): with AnnotationLayer's `onDblClick` body
// short-circuited to a no-op, the two checks under "double-clicking a word" go
// red (tool still "Select / move", selection "") and everything else stays
// green — including the blank-space pair, which is the point of having them.

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
  page.drawText('Double click selects one word.', { x: 60, y: 760, size: 24, font })
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
})

try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — serve the build first.`)
  await browser.close()
  process.exit(2)
}

await page.setInputFiles('input[type=file]', { name: 'words.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(800)

// The Select-group button carries the active tool's own title — that IS the
// tool indicator, and the desktop toolbar is the first one in the DOM.
const selectGroup = page.locator('button[title^="Select"]').first()
const groupTitle = () => selectGroup.getAttribute('title')
const selection = () => page.evaluate(() => (window.getSelection()?.toString() ?? ''))

// Pick a tool from the Select group's options panel. Both toolbars (desktop +
// the lg:hidden mobile one) render the panel, so every click is :visible-scoped.
async function pickTool(label) {
  await page.click('button[aria-label="Open select options"]:visible')
  await page.click(`button:has(div:text-is("${label}")):visible`)
  await page.waitForTimeout(400)
}

// Where the words are on screen: turn Select text on once to build the text
// layer, measure, then go back to Select. The page doesn't reflow, so the
// coordinates stay good for the double-clicks below.
await pickTool('Select text')
await page.waitForSelector('.pdf-text-select span', { timeout: 10000 })
const wordBox = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('.pdf-text-select span')]
  const span = spans.find((s) => /selects/.test(s.textContent ?? ''))
  if (!span) return null
  const text = span.textContent ?? ''
  const r = document.createRange()
  // Just the word "selects" inside the run, so the click lands mid-word.
  const start = text.indexOf('selects')
  r.setStart(span.firstChild, start)
  r.setEnd(span.firstChild, start + 'selects'.length)
  const b = r.getBoundingClientRect()
  const page0 = document.querySelector('[data-page-index="0"]').getBoundingClientRect()
  return {
    x: b.x + b.width / 2,
    y: b.y + b.height / 2,
    blankX: page0.x + page0.width / 2,
    blankY: page0.y + page0.height * 0.75,
  }
})
if (!wordBox) {
  console.error('Could not find the test word in the text layer.')
  await browser.close()
  process.exit(2)
}
await pickTool('Select')
await page.evaluate(() => window.getSelection()?.removeAllRanges())
check('back on the Select tool to start', /Select \/ move/.test(await groupTitle()), await groupTitle())

// ── The ask ─────────────────────────────────────────────────────────────────
console.log('\ndouble-clicking a word with the Select tool')
await page.mouse.dblclick(wordBox.x, wordBox.y)
await page.waitForTimeout(900)
check('it switches to the Select text tool', /Select text/.test(await groupTitle()), await groupTitle())
const picked = await selection()
check('and the word under the cursor is selected', picked === 'selects', JSON.stringify(picked))

// ── Blank space is not a word ───────────────────────────────────────────────
console.log('\ndouble-clicking blank page space')
await pickTool('Select')
await page.evaluate(() => window.getSelection()?.removeAllRanges())
await page.mouse.dblclick(wordBox.blankX, wordBox.blankY)
await page.waitForTimeout(900)
check('leaves the Select tool alone', /Select \/ move/.test(await groupTitle()), await groupTitle())
check('and selects nothing', (await selection()) === '')

// ── A double-click on an annotation belongs to the annotation ───────────────
console.log('\ndouble-clicking an annotation drawn over the text')
await page.click('button[title^="Highlighter"]:visible')
await page.mouse.move(wordBox.x - 40, wordBox.y)
await page.mouse.down()
await page.mouse.move(wordBox.x + 60, wordBox.y, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
await pickTool('Select')
await page.evaluate(() => window.getSelection()?.removeAllRanges())
await page.mouse.dblclick(wordBox.x, wordBox.y)
await page.waitForTimeout(900)
check('leaves the Select tool alone', /Select \/ move/.test(await groupTitle()), await groupTitle())
check('and selects no text', (await selection()) === '')

await browser.close()

console.log('')
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`)
  for (const f of failures) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('All checks passed.')
