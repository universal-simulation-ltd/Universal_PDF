// A press-and-hold on a word, on a touch screen, selects it (James,
// 2026-10-20: "tap and hold doesn't consistently highlight text"). Dragging on
// carries the selection; a Copy pill copies it and puts the tool back; a tap
// off the words lets go too. A hold on EMPTY page still starts the box that
// selects several marks.
//
//   npm run dev                     # Universal PDF is :5174
//   node e2e/word-hold.e2e.mjs      # in another terminal
//
// Env: BASE (default http://localhost:5174/), PHONE=1 for the phone screens (?app),
//      PDF=<path> to hold on the first word of some other file's page 1 as well.
//
// Negative control (2026-10-20, run): with the hold's text check taken out of
// AnnotationLayer's startMarqueeHold, every word check goes red and the empty-
// page check stays green.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { keepAppModuleUrls } from './app-modules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]
let pw = null
for (const rel of PLAYWRIGHT_CANDIDATES) {
  try {
    const mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
    const probe = await mod.chromium.launch()
    await probe.close()
    pw = mod
    break
  } catch { /* try the next one */ }
}
if (!pw) {
  console.error('No Playwright found. Install it in a sibling Universal app.')
  process.exit(2)
}
const BASE = process.env.BASE ?? process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const PHONE = process.env.PHONE === '1'

const fails = []
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) fails.push(label)
}

// "Hello world" at a known place on page 1, and nothing in the lower half.
const FIX = join(HERE, 'fixtures')
mkdirSync(FIX, { recursive: true })
const PDF = join(FIX, 'word-hold.pdf')
{
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < 2; i++) doc.addPage([595, 842]).drawText('Hello world again', { x: 60, y: 742, size: 40, font })
  writeFileSync(PDF, Buffer.from(await doc.save()))
}

const browser = await pw.chromium.launch()
const context = await browser.newContext({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  permissions: ['clipboard-read', 'clipboard-write'],
})
await keepAppModuleUrls(context)
// The app's own copy of a module (see app-modules.mjs).
const appImport = `(globalThis.__appImport ?? ((p) => import(p)))`
let page = await context.newPage()
page.on('pageerror', (e) => fails.push('page error: ' + e.message))
try {
  await page.goto(BASE + (PHONE ? '?app' : ''), { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
let cdp = await context.newCDPSession(page)

async function open(file) {
  // The phone screens' desk has no file input in a browser: straight to the store.
  if (PHONE) {
    const bytes = [...readFileSync(file)]
    await page.evaluate(async ([src, bytes]) => {
      const { usePdfStore } = await eval(src)('/src/stores/pdfStore.ts')
      await usePdfStore.getState().loadFile(new File([new Uint8Array(bytes)], 'doc.pdf', { type: 'application/pdf' }))
    }, [appImport, bytes])
  } else {
    await page.locator('input[type=file]').first().setInputFiles(file)
  }
  await page.locator('[data-page-index="0"] canvas').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

// Page point (PDF points, top-left origin) → screen point on page 1.
const onPage = (x, y) => page.evaluate(([x, y]) => {
  const r = document.querySelector('[data-page-index="0"]').getBoundingClientRect()
  const s = r.width / 595
  return { x: Math.round(r.left + x * s), y: Math.round(r.top + y * s) }
}, [x, y])

const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function hold(p, ms = 650) {
  await touch('touchStart', [{ ...p, id: 1 }])
  await page.waitForTimeout(ms)
}
const lift = () => touch('touchEnd', [])
async function tap(p) {
  await touch('touchStart', [{ ...p, id: 1 }])
  await page.waitForTimeout(60)
  await lift()
}
const state = () => page.evaluate(async (SRC) => {
  const { useAnnotationStore } = await eval(SRC)('/src/stores/annotationStore.ts')
  const pill = document.querySelector('[data-testid="text-copy"]')
  return {
    tool: useAnnotationStore.getState().tool,
    selected: window.getSelection()?.toString() ?? '',
    pill: !!pill && getComputedStyle(pill.parentElement).visibility === 'visible',
  }
}, appImport)
const setTool = (t) => page.evaluate(async ([SRC, t]) => (await eval(SRC)('/src/stores/annotationStore.ts')).useAnnotationStore.getState().setTool(t), [appImport, t])

console.log(`\nUniversal PDF — press and hold a word${PHONE ? ' (phone screens)' : ''}`)
await open(PDF)
await setTool('select')
// "Hello" sits from x 60, its 40pt line from y ~70 to ~100.
const hello = await onPage(90, 88)
const again = await onPage(300, 88)
const empty = await onPage(300, 600)

await hold(hello)
let s = await state()
check(s.tool === 'selecttext' && s.selected === 'Hello', 'a hold on a word selects it', JSON.stringify(s))
check(s.pill, '…with a Copy button over it')
// Dragging on along the line takes the next words with it.
for (let i = 1; i <= 8; i++) {
  await touch('touchMove', [{ x: hello.x + ((again.x - hello.x) * i) / 8, y: hello.y, id: 1 }])
  await page.waitForTimeout(16)
}
await lift()
await page.waitForTimeout(200)
s = await state()
check(/^Hello world a/.test(s.selected), 'dragging on carries the selection along the line', JSON.stringify(s.selected))

await page.locator('[data-testid="text-copy"]').click({ timeout: 3000 }).catch(() => {})
await page.waitForTimeout(100)
const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
check(/^Hello world a/.test(clip), 'Copy puts the words on the clipboard', JSON.stringify(clip))
await page.waitForTimeout(900)
s = await state()
check(s.tool === 'select' && !s.selected && !s.pill, '…and puts Select back in hand', JSON.stringify(s))

// A tap off the words lets go of them too.
await hold(hello)
await lift()
await page.waitForTimeout(200)
await tap(empty)
await page.waitForTimeout(300)
s = await state()
check(s.tool === 'select' && !s.selected, 'a tap off the words lets go and puts Select back', JSON.stringify(s))

// A hold on empty page is still the box for selecting several marks.
await hold(empty)
s = await state()
await lift()
check(s.tool === 'select' && !s.selected, 'a hold on empty page selects no text and keeps Select', JSON.stringify(s))

// Fill on the phone hands you Text: a hold on a word still selects it, and
// lifting places no text box.
await setTool('text')
const count = () => page.evaluate(async (SRC) => (await eval(SRC)('/src/stores/annotationStore.ts')).useAnnotationStore.getState().annotations.length, appImport)
const before = await count()
await hold(hello)
await lift()
await page.waitForTimeout(200)
s = await state()
const after = await count()
check(s.tool === 'selecttext' && s.selected === 'Hello' && after === before, 'with Text in hand: the word is selected, no text box left behind',
  JSON.stringify({ ...s, before, after }))
await tap(empty)
await page.waitForTimeout(300)
s = await state()
check(s.tool === 'text', '…and letting go puts Text back', JSON.stringify(s))

if (process.env.PDF) {
  // A fresh page: a second file would open in a tab beside the first.
  await page.close()
  page = await context.newPage()
  page.on('pageerror', (e) => fails.push('page error: ' + e.message))
  await page.goto(BASE + (PHONE ? '?app' : ''), { waitUntil: 'load' })
  cdp = await context.newCDPSession(page)
  await open(process.env.PDF)
  await setTool('select')
  await page.waitForTimeout(1000)
  // A word on page 1, found through the page's own text layer (built by
  // switching Select text on for a moment).
  await setTool('selecttext')
  await page.waitForTimeout(1500)
  const first = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('[data-page-index="0"] .textLayer span')]
    const sp = spans.find((el) => /\p{L}{4,}/u.test(el.textContent) && el.getBoundingClientRect().width > 20)
    const r = sp.getBoundingClientRect()
    return { str: sp.textContent, x: Math.round(r.left + Math.min(r.width, 24) / 2), y: Math.round(r.top + r.height / 2) }
  })
  await setTool('select')
  await page.waitForTimeout(300)
  const pt = { x: first.x, y: first.y }
  await hold(pt)
  s = await state()
  await lift()
  check(s.tool === 'selecttext' && s.selected.length > 0 && first.str.includes(s.selected),
    `your PDF: a hold on "${first.str.slice(0, 30)}" selects a word of it`, JSON.stringify(s))
}

await browser.close()
if (fails.length) {
  console.log(`  ${fails.length} FAILED`)
  process.exit(1)
}
console.log('  all passed')
