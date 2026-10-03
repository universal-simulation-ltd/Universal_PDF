// What you type as a text box's link is what the link goes to — and nothing
// else gets in.
//
//   ./scripts/preview.sh             # in one terminal (Universal PDF is :5174)
//   npm run test:text-link-entry     # in another
//
// ⚠️ What this exists to stop coming back (2026-10-04):
//   • "example.com" was stored exactly as typed — a RELATIVE href, so the link
//     in the exported PDF went nowhere. It now becomes https://example.com/.
//   • "javascript:…" was accepted and written into the file's link. It is now
//     refused, with a message saying why.
//   • Pasting from a web page into a text box brought its markup along — links
//     of any scheme and remote images, which loaded from a third party the
//     moment they landed. A paste is now plain text.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

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
      return await mod.default.chromium.launch()
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

const browser = await loadPlaywright()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__stores, null, { timeout: 30000 })
} catch {
  console.error(`Could not reach a DEV build at ${BASE} — start it first (./scripts/preview.sh).`)
  await browser.close()
  process.exit(2)
}

await page.evaluate(async () => {
  const { PDFDocument } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
  const d = await PDFDocument.create()
  d.addPage([595, 842])
  await window.__stores.pdf.getState().loadFile(new File([await d.save()], 'links.pdf', { type: 'application/pdf' }))
})
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(800)

const reset = () =>
  page.evaluate(() => {
    const s = window.__stores.ann.getState()
    s.clearAll()
    s.add({ id: 'lnk', pageIndex: 0, type: 'text', x: 60, y: 100, text: 'Visit our site', color: '#000000', fontSize: 18 })
    s.setTool('select')
    s.setSelected('lnk')
  })
const links = () =>
  page.evaluate(() => {
    const a = window.__stores.ann.getState().annotations.find((x) => x.id === 'lnk')
    return (a?.runs ?? []).map((r) => r.link ?? null)
  })

/** Click the pill's link button and answer its prompt with `answer`; returns any alert text. */
async function addLink(answer) {
  let alerted = null
  const onDialog = async (d) => {
    if (d.type() === 'prompt') await d.accept(answer)
    else {
      alerted = d.message()
      await d.accept()
    }
  }
  page.on('dialog', onDialog)
  await page.locator('button[title="Add link"], button[title="Edit link"]').first().click()
  await page.waitForTimeout(400)
  page.off('dialog', onDialog)
  return alerted
}

console.log('\nA bare address becomes a full one')
await reset()
await page.waitForTimeout(300)
let alerted = await addLink('example.com')
let got = await links()
check('"example.com" links to https://example.com/', got.length > 0 && got.every((l) => l === 'https://example.com/'), JSON.stringify(got))
check('with no complaint', alerted === null, alerted)

console.log('\nAn email address becomes mailto:')
await reset()
await page.waitForTimeout(300)
await addLink('inbox@unisim.co.uk')
got = await links()
check('"inbox@unisim.co.uk" links to mailto:', got.length > 0 && got.every((l) => l === 'mailto:inbox@unisim.co.uk'), JSON.stringify(got))

console.log('\nA script link is refused, and says so')
await reset()
await page.waitForTimeout(300)
alerted = await addLink('javascript:alert(document.domain)')
got = await links()
check('no link is stored', got.every((l) => l === null), JSON.stringify(got))
check('and the user is told why', !!alerted && alerted.includes('javascript:alert'), alerted)

console.log('\nPasting from a web page pastes the words only')
await reset()
await page.waitForTimeout(300)
// Into edit mode the way a person gets there: double-click the text.
const box = await page.evaluate(() => {
  const stage = window.Konva.stages.find((s) => s.container().closest('[data-page-index="0"]'))
  const r = stage.container().getBoundingClientRect()
  const k = stage.scaleX()
  return { x: r.left + (60 + 30) * k, y: r.top + (100 + 9) * k }
})
await page.mouse.dblclick(box.x, box.y)
const editor = page.locator('.upd-text-editor')
await editor.waitFor({ timeout: 5000 }).catch(() => {})
check('the editor opened', (await editor.count()) === 1)
if ((await editor.count()) === 1) {
  const remote = []
  page.on('request', (r) => {
    if (r.url().startsWith('https://tracker.example.net/')) remote.push(r.url())
  })
  await editor.evaluate((el) => {
    el.focus()
    document.execCommand('selectAll')
    const dt = new DataTransfer()
    dt.setData('text/html', '<b>Bold</b> <a href="javascript:alert(1)">evil</a><img src="https://tracker.example.net/p.gif">')
    dt.setData('text/plain', 'Bold evil')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(300)
  const html = await editor.evaluate((el) => el.innerHTML)
  check('the pasted text is there', html.includes('Bold evil'), html)
  check('with no link, image or bold from the page', !/<a|<img|<b/i.test(html), html)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  got = await links()
  const a = await page.evaluate(() => window.__stores.ann.getState().annotations.find((x) => x.id === 'lnk'))
  check('the committed text has no link', got.every((l) => l === null) && a.text === 'Bold evil', JSON.stringify(a))
  check('and nothing was fetched from the pasted page', remote.length === 0, remote.join(', '))
}

await browser.close()
if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nAll checks passed.')
