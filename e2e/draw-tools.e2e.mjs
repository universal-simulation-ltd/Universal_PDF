// The drawing tools' colour bar and the two Tune this app switches.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:draw-tools           # in another terminal
//
// What is pinned here (James, 2026-10-13):
//
//   • The highlighter has no dropdown. While it is armed the colour bar beside
//     it shows its two colours and a size slider, and a stroke takes that size.
//   • The pen's dropdown has the shapes on one line and the stroke on the
//     next, and no colours.
//   • A colour picked from the bar's rainbow becomes a shortcut, newest first,
//     two at most, each tool its own pair.
//   • "Don't confirm annotations": a stroke is left unselected, so there is no
//     Colour pill or ✓.
//   • "Stay on the last tool": with the highlighter armed, pressing on an
//     existing mark draws over it instead of selecting it, and ✓ keeps the
//     tool. Off (the default), both drop back to Select as before.
//   • Reset to defaults puts all of it back.

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

const { PDFDocument } = await import('pdf-lib')
const doc = await PDFDocument.create()
doc.addPage([595, 842])
const pdf = Buffer.from(await doc.save())

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
await context.addInitScript(() => {
  window.localStorage.setItem('universal:mock_session', 'james')
  window.localStorage.removeItem('universal-pdf-tool-prefs')
})
try {
  await page.goto(`${BASE}?mockauth=1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.setInputFiles('input[type=file]', { name: 'notes.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(700)

const store = (fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('s', 'arg', src)(useAnnotationStore.getState(), arg)
    },
    { src: fn, arg },
  )
const prefs = (fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const { useToolPrefs } = await import('/src/stores/toolPrefsStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('p', 'arg', src)(useToolPrefs.getState(), arg)
    },
    { src: fn, arg },
  )
const json = (v) => JSON.stringify(v)

const canvasBox = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
const k = canvasBox.width / 595
const sx = (x) => Math.round(canvasBox.x + x * k)
const sy = (y) => Math.round(canvasBox.y + y * k)
async function stroke(x1, y1, x2, y2) {
  await page.mouse.move(sx(x1), sy(y1))
  await page.mouse.down()
  await page.mouse.move(sx((x1 + x2) / 2), sy((y1 + y2) / 2 + 4), { steps: 6 })
  await page.mouse.move(sx(x2), sy(y2), { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}
const highlighter = page.getByRole('button', { name: 'Highlighter', exact: true }).first()
const bar = page.locator('button[aria-label="Open colours"]').first().locator('xpath=..')
const confirmBtn = page.getByRole('button', { name: 'Confirm and deselect' })

// ── The toolbar ──────────────────────────────────────────────────────────────
console.log('\nthe highlighter and its colour bar')
await store('s.resetDocument(); s.setTool("select")')
check('only the pen has a drawing-tools dropdown now', (await page.getByRole('button', { name: 'Open drawing tools' }).count()) === 1)
await highlighter.click()
await page.waitForTimeout(200)
check('the highlighter is armed, in its first colour', json(await store('return [s.tool, s.color]')) === json(['highlight', '#eab308']))
check('the bar shows its two colours', (await bar.getByRole('button', { name: 'Yellow' }).count()) === 1 && (await bar.getByRole('button', { name: 'Green' }).count()) === 1)
const size = page.getByRole('slider', { name: 'Highlighter size' })
check('…and a size slider', (await size.count()) === 1)
await size.fill('30')
check('the slider sets the highlighter\'s width', (await store('return s.highlightWidth')) === 30)
await stroke(100, 200, 300, 200)
const hl = (await store('return s.annotations')).at(-1)
// Widths are display pixels over the zoom; the page canvas is the zoom.
check('a stroke takes that width', hl && Math.abs(hl.strokeWidth * k - 30) < 0.5, json({ w: hl?.strokeWidth, k }))
await page.screenshot({ path: join(process.env.SHOTS ?? '.', 'draw-tools-highlighter.png'), clip: { x: 0, y: 0, width: 1400, height: 120 } }).catch(() => {})

console.log('\nthe pen\'s dropdown')
await page.getByRole('button', { name: 'Free draw', exact: true }).first().click()
await page.waitForTimeout(150)
check('the pen picks up its first colour', (await store('return s.color')) === '#000000')
await page.getByRole('button', { name: 'Open drawing tools' }).click()
await page.waitForTimeout(250)
const sheet = page.getByRole('slider', { name: 'Stroke' }).locator('xpath=../..')
check('no colours in it', (await sheet.getByRole('button', { name: 'Red' }).count()) === 0 && (await sheet.getByRole('button', { name: 'Black' }).count()) === 0)
const shapesRow = await sheet.getByRole('button', { name: 'Tick' }).boundingBox()
const strokeRow = await page.getByRole('slider', { name: 'Stroke' }).boundingBox()
check('the stroke is on the line under the shapes', shapesRow && strokeRow && strokeRow.y > shapesRow.y + shapesRow.height - 2, json({ shapesRow, strokeRow }))
await page.keyboard.press('Escape')

console.log('\na custom colour becomes a shortcut')
const pick = async (hex) => {
  await bar.locator('input[type=color]').first().evaluate((el, v) => {
    // Through the native setter: React ignores a value it didn't see change.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, hex)
  await page.waitForTimeout(200)
}
await pick('#ff00aa')
check('the pen draws in it', (await store('return s.color')) === '#ff00aa')
check('it is the pen\'s first shortcut; white drops out', json(await prefs('return p.penColours')) === json(['#ff00aa', '#000000']))
await pick('#000000')
check('picking a shortcut again leaves the pair as it is', json(await prefs('return p.penColours')) === json(['#ff00aa', '#000000']))
await highlighter.click()
await page.waitForTimeout(150)
check('the highlighter keeps its own pair', json(await prefs('return p.highlightColours')) === json(['#eab308', '#16a34a']))
await pick('#00ccff')
check('…and pins to it', json(await prefs('return p.highlightColours')) === json(['#00ccff', '#eab308']))
await store('s.setSelected(null); s.setTool("select")')
await page.getByRole('button', { name: 'Free draw', exact: true }).first().click()
await highlighter.click()
await page.waitForTimeout(150)
check('picking up the highlighter again takes the newest colour', (await store('return s.color')) === '#00ccff')

// ── The switches, off (the default) ──────────────────────────────────────────
console.log('\nboth switches off (the default)')
await store('s.resetDocument(); s.setTool("highlight")')
await stroke(100, 300, 300, 300)
check('a stroke is selected, with its ✓', (await store('return s.selectedId')) !== null && (await confirmBtn.count()) === 1)
await confirmBtn.click()
await page.waitForTimeout(200)
check('✓ drops back to Select', (await store('return s.tool')) === 'select')
await store('s.setTool("highlight"); s.setSelected(null)')
await stroke(200, 300, 220, 420)
check('pressing on a mark selects it and drops to Select', (await store('return [s.tool, s.annotations.length]')).join() === 'select,1')

// ── Don't confirm annotations ────────────────────────────────────────────────
console.log('\n"Don\'t confirm annotations"')
await prefs('p.setNoConfirm(true)')
await store('s.resetDocument(); s.setTool("highlight")')
await stroke(100, 300, 300, 300)
check('a stroke is left unselected', (await store('return s.selectedId')) === null && (await store('return s.annotations.length')) === 1)
check('no ✓ or Colour pill comes up', (await confirmBtn.count()) === 0 && (await page.getByText('Colour', { exact: true }).count()) === 0)
await stroke(100, 500, 300, 500)
check('the next stroke follows straight on', (await store('return s.annotations.length')) === 2)
await prefs('p.setNoConfirm(false)')

// ── Stay on the last tool ────────────────────────────────────────────────────
console.log('\n"Stay on the last tool"')
await prefs('p.setStayOnTool(true)')
await store('s.resetDocument(); s.setTool("highlight")')
await stroke(100, 300, 300, 300)
await confirmBtn.click()
await page.waitForTimeout(200)
check('✓ deselects but keeps the highlighter', json(await store('return [s.tool, s.selectedId]')) === json(['highlight', null]))
await stroke(200, 300, 220, 420)
check('pressing on a mark draws over it', json(await store('return [s.tool, s.annotations.length]')) === json(['highlight', 2]))

// ── Reset to defaults ────────────────────────────────────────────────────────
console.log('\nreset to defaults')
await prefs('p.setNoConfirm(true); p.reset()')
check('both switches off, the shortcuts back to the defaults', json(await prefs('return [p.stayOnTool, p.noConfirm, p.penColours, p.highlightColours]')) === json([false, false, ['#000000', '#ffffff'], ['#eab308', '#16a34a']]))

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
