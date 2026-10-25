// The phone's own pages and sheets in place of the website's dialogs —
// browser-level check.
//
//   ./scripts/preview.sh             # or preview.ps1 — Universal PDF is :5174
//   npm run test:phone-pages         # in another terminal
//
// What is pinned (the mobile-first pass, 2026-10-22: "restyle the borrowed
// website dialogs as phone pages or sheets", "review every popup"):
//
//   • Scan, Merge, Photos, OCR, Compare and the pages are pages of their own,
//     over the Desk or the document, and none of the website's dialogs mounts.
//   • Send to sign is a sheet, and sharing does not wait for a "Sign here" box;
//     after it, the "Sent." moment. Done after blacking out: "Blacked out.".
//   • A tap on a Sign here box opens the Sign page, which fills that box.
//   • Scan asks before throwing scanned pages away, on the page, by any road.
//   • Pages (James, 2026-10-25; was "Split or reorder pages"): moves, pages
//     taken out (one, or several selected) and turns are all staged until
//     "Apply changes"; Undo steps back; never every page; leaving with changes
//     staged asks first. A tap on a page opens it large: move, turn, take out,
//     Confirm back to the Pages page. Applied, a turned page is turned in the
//     file itself (/Rotate) and its marks turn with it.
//   • No alert(), confirm() or prompt() anywhere: a message is the line at the
//     foot, a question a sheet, a locked PDF's password a sheet.

import { dirname, join } from 'node:path'
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
const json = (v) => JSON.stringify(v)

const playwright = await loadPlaywright()
const browser = await playwright[process.env.E2E_BROWSER || 'chromium'].launch()
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true })
await keepAppModuleUrls(context)
// Any browser box at all is a failure: count them, and answer so nothing hangs.
await context.addInitScript(() => {
  window.__boxes = []
  window.alert = (m) => { window.__boxes.push(['alert', String(m)]) }
  window.confirm = (m) => { window.__boxes.push(['confirm', String(m)]); return true }
  window.prompt = (m) => { window.__boxes.push(['prompt', String(m)]); return null }
})
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
if (process.env.E2E_CONSOLE) page.on('console', (m) => console.log('   [console]', m.type(), m.text()))
try {
  await page.goto(`${BASE}?app`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.waitForTimeout(1200)
const mod = (path, src, arg) =>
  page.evaluate(
    async ({ path, src, arg }) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
      // eslint-disable-next-line no-new-func
      return new Function('m', 'arg', src)(m, arg)
    },
    { path, src, arg },
  )
const nav = (src) => mod('/src/native/nav.ts', `const n = m.useNav.getState(); ${src}`)
const screens = () => nav('return n.screens')
const top = async () => (await screens()).at(-1) ?? null
const heading = () => page.locator('h1').last().innerText().catch(() => '')
const websiteDialogs = () =>
  page.locator('[data-send-for-signature], [data-compare-dialog], [data-testid="scan-photo-input"], .fixed.inset-0.bg-black\\/50').count()
const job = (src) => mod('/src/native/jobs.ts', src)

console.log('\nthe jobs from the Desk are pages over the tabs')
for (const [d, screen, words] of [
  ["{ kind: 'merge' }", 'merge', /together/],
  ["{ kind: 'convert', mode: 'images-to-pdf' }", 'photos', /PDF/],
  ["{ kind: 'scan', source: 'photo' }", 'scan', /paper/],
]) {
  await job(`m.openJob(${d})`)
  await page.waitForTimeout(400)
  check(`${screen}: its own page`, (await top()) === screen && words.test(await heading()), `${await top()} / ${await heading()}`)
  check(`${screen}: no website dialog`, (await websiteDialogs()) === 0)
  await page.locator('.np-page-enter header button').first().click()
  await page.waitForTimeout(400)
  check(`${screen}: the back link goes back to the Desk`, (await screens()).length === 0, json(await screens()))
}

console.log('\nScan asks before throwing scanned pages away, on the page')
await page.evaluate(async () => {
  const c = document.createElement('canvas')
  c.width = 60
  c.height = 80
  c.getContext('2d').fillRect(10, 10, 20, 20)
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg'))
  const jpeg = new Uint8Array(await blob.arrayBuffer())
  const scan = await (globalThis.__appImport ?? ((p) => import(p)))('/src/lib/scan.ts')
  const jobs = await (globalThis.__appImport ?? ((p) => import(p)))('/src/native/jobs.ts')
  jobs.openJob({ kind: 'scan', source: 'camera', pages: [await scan.pageFromJpeg(jpeg)] })
})
await page.waitForTimeout(500)
check('the scanned page is on the page', (await page.locator('ol img').count()) === 1)
await nav('return n') // settle
await mod('/src/native/nav.ts', 'return m.goBack()')
await page.waitForTimeout(300)
check('going back asks first, and stays', (await top()) === 'scan' && (await page.getByText('Keep scanning').count()) === 1)
await page.getByRole('button', { name: 'Keep scanning' }).click()
await page.waitForTimeout(200)
await mod('/src/native/nav.ts', 'return m.goBack()')
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Throw them away' }).click()
await page.waitForTimeout(400)
check('"Throw them away" goes', (await screens()).length === 0, json(await screens()))

console.log('\na document: What else opens pages, not dialogs')
await job("return m.runJob('example')")
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(800)
await mod('/src/stores/annotationStore.ts', 'm.useAnnotationStore.getState().resetDocument()')
const openMore = async () => {
  await page.getByRole('button', { name: 'What else', exact: true }).click()
  await page.waitForTimeout(400)
}
for (const [row, screen] of [
  ['Pages', 'pages'],
  ['Make the text searchable', 'ocr'],
  ['Spot the difference', 'compare'],
  ['Add another PDF to it', 'merge'],
  ['Turn the pages into pictures', 'photos'],
]) {
  await openMore()
  await page.getByRole('button', { name: row, exact: true }).click()
  await page.waitForTimeout(500)
  check(`${row} → the ${screen} page`, (await top()) === screen, json(await screens()))
  check(`${row}: no website dialog`, (await websiteDialogs()) === 0)
  if (screen === 'merge') check('Merge starts with this document on the pile', (await page.locator('ol li').count()) === 1)
  await nav('n.pop()')
  await page.waitForTimeout(300)
}

console.log('\nPages: moves, take-outs and turns are staged until applied')
await nav("n.push('pages')")
await page.waitForTimeout(800)
const pdf = (src) => mod('/src/stores/pdfStore.ts', `const s = m.usePdfStore.getState(); ${src}`)
const before = await pdf('return s.numPages')
const shown = () => page.locator('ol li:not([hidden])').evaluateAll((els) => els.map((el) => Number(el.dataset.thumbPage)))
const applyBtn = page.getByRole('button', { name: 'Apply changes' })
await page.getByRole('button', { name: /Move page 1 down/i }).first().click()
await page.waitForTimeout(200)
check('a move is staged, with the button to apply it', (await applyBtn.count()) === 1 && json(await shown()) === json([1, 0, 2]), json(await shown()))
await page.getByRole('button', { name: 'Delete page 3', exact: true }).click()
await page.waitForTimeout(200)
check('taking a page out is staged too, with a move staged', json(await shown()) === json([1, 0]), json(await shown()))
check('…and stays on the Pages page, the file untouched', (await top()) === 'pages' && (await pdf('return s.numPages')) === before)
await page.getByRole('button', { name: 'Undo', exact: true }).click()
await page.waitForTimeout(200)
check('Undo puts the page back', json(await shown()) === json([1, 0, 2]), json(await shown()))
await page.getByRole('button', { name: 'Put them back' }).click()
await page.waitForTimeout(200)
check('Put them back drops every change', json(await shown()) === json([0, 1, 2]) && (await applyBtn.count()) === 0, json(await shown()))

console.log('\nPages: select several and take them out together, never all')
await page.getByRole('button', { name: 'Select', exact: true }).click()
for (const n of [1, 2, 3]) await page.getByRole('button', { name: `Page ${n}`, exact: true }).click()
const takeOut = page.locator('[data-pages-take-out]')
check('every page picked: refused', (await takeOut.isDisabled()) && /One page has to stay/.test(await takeOut.innerText()), await takeOut.innerText())
await page.getByRole('button', { name: 'Page 3', exact: true }).click()
check('two picked: "Take out 2 pages"', (await takeOut.isEnabled()) && (await takeOut.innerText()) === 'Take out 2 pages', await takeOut.innerText())
await takeOut.click()
await page.waitForTimeout(200)
check('both go at once, staged', json(await shown()) === json([2]) && (await pdf('return s.numPages')) === before, json(await shown()))
await page.getByRole('button', { name: 'Undo', exact: true }).click()
await page.waitForTimeout(200)
check('one Undo brings both back', json(await shown()) === json([0, 1, 2]), json(await shown()))

console.log('\nPages: leaving with changes staged asks first')
await page.getByRole('button', { name: /Move page 1 down/i }).first().click()
await page.waitForTimeout(150)
await mod('/src/native/nav.ts', 'return m.goBack()')
await page.waitForTimeout(400)
const ask = page.locator('[data-phone-dialog="confirm"]')
check('Back asks, and stays', (await top()) === 'pages' && (await ask.getByText(/without applying/).count()) === 1)
await ask.getByRole('button', { name: 'Keep editing' }).click()
await page.waitForTimeout(400)
check('"Keep editing" keeps the changes', (await top()) === 'pages' && json(await shown()) === json([1, 0, 2]), json(await shown()))
await page.getByRole('button', { name: 'Put them back' }).click()
await page.waitForTimeout(200)

console.log('\nPages: a tap opens the page large, to move, turn or take out')
// A mark on page 2, to see it turn with its page.
await mod('/src/stores/annotationStore.ts', "m.useAnnotationStore.getState().add({ id: 'turnme', type: 'rect', pageIndex: 1, x: 10, y: 20, width: 100, height: 40, color: '#000000' })")
await page.getByRole('button', { name: 'Page 2', exact: true }).click()
await page.waitForTimeout(800)
const viewer = page.locator('[data-page-viewer]')
check('the page viewer, over the Pages page', (await top()) === 'page-view' && (await viewer.locator('h1').innerText()) === 'Page 2 of 3', `${await top()} / ${await viewer.locator('h1').innerText().catch(() => '')}`)
check('…showing the page large', await viewer.locator('img').evaluate((img) => img.getBoundingClientRect().width > 250).catch(() => false))
console.log('\nthe page viewer: pinch to look closer, pan, double-tap back')
// Real multi-finger touches need CDP (Chromium); WebKit runs the wheel half.
const cdp = await context.newCDPSession(page).catch(() => null)
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
const stage = viewer.locator('[data-page-stage]')
const sb = await stage.boundingBox()
const cx = sb.x + sb.width / 2
const cy = sb.y + sb.height / 2
const zoomOf = async () => Number(await stage.getAttribute('data-zoom'))
const panOf = () => stage.evaluate((el) => el.firstElementChild?.style.transform ?? '')
const title = () => viewer.locator('h1').innerText()
async function drag(x0, y0, dx, dy, steps = 10) {
  await touch('touchStart', [{ x: x0, y: y0, id: 1 }])
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps, id: 1 }])
    await page.waitForTimeout(16)
  }
  await touch('touchEnd', [])
  await page.waitForTimeout(250)
}
async function pinch(from, to, steps = 10) {
  await touch('touchStart', [{ x: cx - from, y: cy, id: 1 }, { x: cx + from, y: cy, id: 2 }])
  for (let i = 1; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps
    await touch('touchMove', [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }])
    await page.waitForTimeout(16)
  }
  await touch('touchEnd', [])
  await page.waitForTimeout(300)
}
async function doubleTap(x, y) {
  for (let i = 0; i < 2; i++) {
    await touch('touchStart', [{ x, y, id: 1 }])
    await touch('touchEnd', [])
    await page.waitForTimeout(90)
  }
  await page.waitForTimeout(350)
}
const naturalW = () => viewer.locator('img').evaluate((img) => img.naturalWidth)
if (cdp) {
const w0 = await naturalW()
await pinch(40, 130)
check('two fingers apart zoom in', (await zoomOf()) > 2.5, String(await zoomOf()))
const before2 = await panOf()
await drag(cx, cy, -90, 0)
check('zoomed in, one finger pans the page', (await panOf()) !== before2 && (await title()) === 'Page 2 of 3', `${before2} → ${await panOf()} / ${await title()}`)
await drag(cx + 100, cy, -220, 0)
check('…and a long swipe does not turn to the next page', (await title()) === 'Page 2 of 3', await title())
await page.waitForTimeout(1500)
const w1 = await naturalW()
const px = await viewer.locator('img').evaluate((img) => img.naturalWidth * img.naturalHeight)
check('settled, the page is drawn again sharper', w1 > w0 * 1.5, `${w0} → ${w1}`)
check('…within 8 MP', px <= 8_000_000, String(px))
await doubleTap(cx, cy)
check('a double tap goes back to the whole page', (await zoomOf()) === 1, String(await zoomOf()))
await doubleTap(cx - 40, cy - 60)
check('…and another zooms in where it lands', (await zoomOf()) > 2, String(await zoomOf()))
await doubleTap(cx, cy)
await drag(cx + 100, cy, -200, 0)
check('at the whole page, a swipe goes to the next page', (await title()) === 'Page 3 of 3', await title())
await drag(cx - 100, cy, 200, 0)
check('…and back', (await title()) === 'Page 2 of 3', await title())
} else console.log('  (touch gestures: Chromium only — the wheel below runs here)')
// A WheelEvent as a trackpad pinch sends it (ctrlKey); dispatched, as mobile
// WebKit has no wheel to drive.
const wheel = (deltaX, deltaY, ctrlKey) =>
  stage.evaluate((el, a) => el.dispatchEvent(new WheelEvent('wheel', { ...a, bubbles: true, cancelable: true })), { deltaX, deltaY, ctrlKey, clientX: cx, clientY: cy })
await wheel(0, -150, true)
await page.waitForTimeout(300)
check('a trackpad pinch (ctrl + wheel) zooms on the web', (await zoomOf()) > 1.5, String(await zoomOf()))
await wheel(0, 120, false)
await page.waitForTimeout(200)
check('…and the wheel then pans', (await zoomOf()) > 1.5 && /translate\(0px, 0px\)/.test(await panOf()) === false, await panOf())
const actionsShown = await viewer.locator('[data-view-action="turn"]').isVisible()
check('the buttons stay on screen while zoomed', actionsShown)
await viewer.locator('[data-view-action="turn"]').click()
await page.waitForTimeout(300)
check('Turn goes back to the whole page', (await zoomOf()) === 1, String(await zoomOf()))
check('Turn turns the picture a quarter', /rotate\(90deg\)/.test(await viewer.locator('img').getAttribute('style')))
await viewer.locator('[data-view-action="earlier"]').click()
await page.waitForTimeout(200)
check('Earlier moves it, and the viewer follows it', (await viewer.locator('h1').innerText()) === 'Page 1 of 3')
await viewer.getByRole('button', { name: 'Confirm' }).click()
await page.waitForTimeout(500)
check('Confirm: back on the Pages page with it staged', (await top()) === 'pages' && json(await shown()) === json([1, 0, 2]) && (await applyBtn.count()) === 1, json(await shown()))
check('…the file still untouched', (await pdf('return s.numPages')) === before && (await pdf('return s.doc.getPage(2).then((p) => p.rotate)')) === 0)
await page.getByRole('button', { name: 'Page 3', exact: true }).click()
await page.waitForTimeout(600)
await viewer.locator('[data-view-action="out"]').click()
await page.waitForTimeout(200)
check('Take out in the viewer: one page fewer there', (await viewer.locator('h1').innerText()) === 'Page 2 of 2', await viewer.locator('h1').innerText())
await mod('/src/native/nav.ts', 'return m.goBack()')
await page.waitForTimeout(500)
check('Back from the viewer drops its changes, without asking', (await top()) === 'pages' && json(await shown()) === json([1, 0, 2]) && (await ask.count()) === 0, json(await shown()))

console.log('\nPages: applied, the page is turned in the file, and its mark with it')
await applyBtn.click()
for (let i = 0; i < 60 && (await pdf('return s.numPages')) === before && (await applyBtn.count()) > 0; i++) await page.waitForTimeout(250)
await page.waitForTimeout(500)
check('page 1 of the file is the old page 2, turned (/Rotate 90)', (await pdf('return s.doc.getPage(1).then((p) => p.rotate)')) === 90)
check('…the others are not', (await pdf('return s.doc.getPage(2).then((p) => p.rotate)')) === 0)
check('…still three pages, and the staging cleared', (await pdf('return s.numPages')) === before && (await applyBtn.count()) === 0)
const mark = await mod('/src/stores/annotationStore.ts', "return m.useAnnotationStore.getState().annotations.find((a) => a.id === 'turnme')")
check('its mark went with it, turned', mark && mark.pageIndex === 0 && mark.rotation === 90, json(mark))
check('…and the Pages page stayed open', (await top()) === 'pages')
await mod('/src/stores/pdfStore.ts', 'return m.usePdfStore.getState().undoDocument()')
await page.waitForTimeout(800)
check('the document Undo puts it all back', (await pdf('return s.doc.getPage(2).then((p) => p.rotate)')) === 0 && (await mod('/src/stores/annotationStore.ts', "return m.useAnnotationStore.getState().annotations.find((a) => a.id === 'turnme')?.pageIndex")) === 1)
await mod('/src/stores/annotationStore.ts', 'm.useAnnotationStore.getState().resetDocument()')
await nav('n.pop()')
await page.waitForTimeout(300)

console.log('\nSend to sign: a sheet, and Share does not wait for a box')
await openMore()
await page.getByRole('button', { name: /Send to sign/ }).first().click()
await page.waitForTimeout(400)
check('the Send to sign sheet', (await nav('return n.sheet')) === 'send-sign')
check('"Sign here" is in hand to put boxes down', (await mod('/src/stores/annotationStore.ts', 'return m.useAnnotationStore.getState().tool')) === 'sigfield')
const share = page.locator('.np-sheet [data-sfs-share]')
check('Share is not disabled with no box', await share.isEnabled())
check('it says they can sign anywhere', (await page.getByText(/No box yet/).count()) === 1)
const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
await share.click()
check('the file is handed over', !!(await dl))
await page.waitForTimeout(600)
check('then the "Sent." moment', (await top()) === 'sent' && /Sent\./.test(await heading()), `${await top()} / ${await heading()}`)
await page.getByRole('button', { name: 'Keep going' }).click()
await page.waitForTimeout(400)

console.log('\nDone after blacking out: "Blacked out."')
await mod('/src/stores/annotationStore.ts', "const s = m.useAnnotationStore.getState(); s.setSelected(null); s.setTool('redact')")
await nav("n.openSheet('markup')")
await page.waitForTimeout(400)
await mod('/src/stores/annotationStore.ts', "m.useAnnotationStore.getState().add({ id: 'r1', type: 'redact', pageIndex: 0, x: 60, y: 100, width: 160, height: 18 })")
await page.getByRole('button', { name: 'Done' }).first().click()
await page.waitForTimeout(500)
check('the moment shows', (await top()) === 'blacked' && /Blacked out\./.test(await heading()), `${await top()} / ${await heading()}`)
await page.getByRole('button', { name: 'Keep going' }).click()
await page.waitForTimeout(300)
await mod('/src/stores/annotationStore.ts', 'm.useAnnotationStore.getState().resetDocument()')

console.log('\na tap on a Sign here box: the Sign page fills that box')
await mod('/src/stores/annotationStore.ts', "m.useAnnotationStore.getState().add({ id: 'box1', type: 'sigfield', pageIndex: 0, x: 60, y: 600, width: 200, height: 60 })")
await mod('/src/stores/signatureStore.ts', "m.useSignatureStore.getState().startSigningField('box1')")
await page.waitForTimeout(500)
check('the Sign page, not the website pad', (await top()) === 'sign' && (await page.locator('.fixed.inset-0.bg-black\\/50').count()) === 0)
await page.getByRole('tab', { name: 'Type' }).click()
await page.getByPlaceholder('Type your name').first().fill('Sam Taylor')
await page.getByRole('button', { name: 'Put it in the box' }).click()
await page.waitForTimeout(800)
check('the box is signed', await mod('/src/stores/annotationStore.ts', "return !!m.useAnnotationStore.getState().annotations.find((a) => a.id === 'box1')?.signed"))
check('and the "Signed." moment follows', (await top()) === 'signed', json(await screens()))
check('the pad request is put down', !(await mod('/src/stores/signatureStore.ts', 'return m.useSignatureStore.getState().padOpen')))
await nav('n.clearScreens()')
await page.waitForTimeout(300)

console.log('\nmessages and questions are the phone\'s own')
await mod('/src/stores/tabStore.ts', "return m.openFiles([new File([new Uint8Array([1, 2, 3])], 'broken.pdf', { type: 'application/pdf' })])")
await page.waitForTimeout(600)
check('a failed open is the line at the foot', !!(await nav('return n.toast')), String(await nav('return n.toast')))
const asked = mod('/src/lib/notice.ts', "return m.askText('Link for this text', 'https://')")
await page.waitForTimeout(400)
// The kit's phonePrompt (SDK phone kit), through the PhoneDialogHost NativeApp mounts.
const askSheet = page.locator('[data-phone-dialog="prompt"]')
check('a question is a sheet', (await askSheet.getByText('Link for this text').count()) >= 1)
await askSheet.locator('input').fill('https://example.com')
await askSheet.getByRole('button', { name: 'Done' }).click()
check('and its answer comes back', (await asked) === 'https://example.com')
check('no alert, confirm or prompt was ever raised', (await page.evaluate(() => window.__boxes.length)) === 0, json(await page.evaluate(() => window.__boxes)))

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n` + failures.map((f) => `  • ${f}`).join('\n'))
  process.exit(1)
}
console.log('\nall passed')
