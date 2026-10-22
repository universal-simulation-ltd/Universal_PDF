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
  ['Split or reorder pages', 'pages'],
  ['Make the text searchable', 'ocr'],
  ['Spot the difference', 'compare'],
  ['Add another PDF to it', 'merge'],
  ['Turn the pages into pictures', 'photos'],
]) {
  await openMore()
  await page.getByRole('button', { name: row }).click()
  await page.waitForTimeout(500)
  check(`${row} → the ${screen} page`, (await top()) === screen, json(await screens()))
  check(`${row}: no website dialog`, (await websiteDialogs()) === 0)
  if (screen === 'merge') check('Merge starts with this document on the pile', (await page.locator('ol li').count()) === 1)
  await nav('n.pop()')
  await page.waitForTimeout(300)
}

console.log('\nthe pages page moves a page, and asks before taking one out')
await nav("n.push('pages')")
await page.waitForTimeout(600)
const before = await mod('/src/stores/pdfStore.ts', 'return m.usePdfStore.getState().numPages')
await page.getByRole('button', { name: /Move page 1 down/i }).first().click()
await page.waitForTimeout(200)
check('a move is staged, with the button to apply it', (await page.getByRole('button', { name: /Apply|order/i }).count()) >= 1)
check('no taking out while a move is staged', await page.locator('li button[style*="180, 35, 24"]').first().isDisabled())
await nav('n.pop()')
await page.waitForTimeout(300)
check('leaving drops the staged move', (await mod('/src/stores/pdfStore.ts', 'return m.usePdfStore.getState().numPages')) === before)

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
check('a question is a sheet', (await page.locator('.np-sheet').getByText('Link for this text').count()) >= 1)
await page.locator('.np-sheet input').last().fill('https://example.com')
await page.locator('.np-sheet').getByRole('button', { name: 'Done' }).last().click()
check('and its answer comes back', (await asked) === 'https://example.com')
check('no alert, confirm or prompt was ever raised', (await page.evaluate(() => window.__boxes.length)) === 0, json(await page.evaluate(() => window.__boxes)))

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n` + failures.map((f) => `  • ${f}`).join('\n'))
  process.exit(1)
}
console.log('\nall passed')
