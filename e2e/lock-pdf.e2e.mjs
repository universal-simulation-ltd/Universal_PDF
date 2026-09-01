// Locking a PDF — in a real browser, through the real dialog.
//
//   ./scripts/preview.sh      # Universal PDF is :5174
//   npm run test:lock         # in another terminal
//
// ⚠️ WHY THIS EXISTS WHEN `npm run test:encrypt` IS ALREADY GREEN. That suite
// runs under Node, where `crypto.subtle` is always present and always allowed.
// A browser's is not: it is undefined outside a secure context, and no amount
// of Node testing would find that. Everything in `pdfCrypto.ts` rests on
// WebCrypto, so the encryption has to be shown working in a page before it can
// be believed — and then shown reachable from the buttons a user actually has.
//
// Negative control (2026-09-01, run): removing the `lockIncomplete(lock)` term
// from the Download button's `disabled` turns "and Download is disabled until a
// password is typed" and "a mismatched confirmation keeps Download disabled"
// red — i.e. the app would hand out a file locked with a half-typed password.

import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
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
      // Imported but cannot launch — try the next.
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

/**
 * Is this visible within `timeout`?
 *
 * ⚠️ NOT `locator.isVisible({ timeout })`. That option is ignored — isVisible
 * answers immediately about the current DOM — so every "did the app react?"
 * check written with it races React's re-render and passes or fails on
 * machine speed. Two checks here did exactly that before this helper existed.
 */
async function visible(locator, timeout = 15000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

async function waitReady(page, timeout = 120000) {
  await page
    .locator('text=/Building export…|Compressing…/')
    .first()
    .waitFor({ state: 'detached', timeout })
    .catch(() => {})
}

// ⚠️ Since 2026-09-01 the flatten checkbox and the lock fields sit behind a
// COLLAPSED "Advanced exports" disclosure, so neither is in the DOM when the
// dialog opens. Every assertion below about either of them has to open it
// first — a suite that skipped this would fail with "checkbox not on screen",
// which is exactly what the section is supposed to make true by default.
async function openAdvanced(page) {
  const trigger = page.getByRole('button', { name: /Advanced exports/i })
  await trigger.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  if (!(await trigger.count())) return false
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  return true
}

const SENTENCE = 'Only the password holder should read this.'

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
let page = await browser.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (./scripts/preview.sh).`)
  await browser.close()
  process.exit(2)
}

// ── 1. The cryptography, in the page ────────────────────────────────────────
console.log('\nAES-256 in a browser, not in Node')

const crypto = await page.evaluate(async (sentence) => {
  const { PDFDocument, StandardFonts } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
  const { encryptPdf, decryptPdf } = await import('/src/lib/pdfEncrypt.ts')
  const pdfjsLib = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'

  const src = await PDFDocument.create()
  const font = await src.embedFont(StandardFonts.Helvetica)
  src.addPage([595, 842]).drawText(sentence, { x: 60, y: 700, size: 14, font })
  const plain = await src.save()

  const hasSubtle = typeof globalThis.crypto?.subtle !== 'undefined'
  const t0 = performance.now()
  const locked = await encryptPdf(plain, 'a-real-password')
  const lockMs = Math.round(performance.now() - t0)

  async function open(bytes, password) {
    try {
      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0), password }).promise
      const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join('')
      return { ok: true, text }
    } catch (e) {
      return { ok: false, name: e?.name ?? String(e) }
    }
  }

  const noPassword = await open(locked.bytes, undefined)
  const withPassword = await open(locked.bytes, 'a-real-password')
  const unlocked = await decryptPdf(locked.bytes, 'a-real-password')
  const afterUnlock = await open(unlocked, undefined)

  return {
    hasSubtle,
    lockMs,
    refusedWithout: !noPassword.ok,
    refusalName: noPassword.name,
    openedWith: withPassword.ok && withPassword.text.includes(sentence),
    unlockedOpens: afterUnlock.ok && afterUnlock.text.includes(sentence),
  }
}, SENTENCE)

check('crypto.subtle is available in the page', crypto.hasSubtle)
check('a locked PDF is refused with no password', crypto.refusedWithout, crypto.refusalName)
check('the right password opens it and the text is intact', crypto.openedWith)
check('decryptPdf gives back an ordinary PDF', crypto.unlockedOpens)
// ⚠️ Algorithm 2.B is deliberately slow, and it runs on the UI thread. If this
// ever creeps into seconds the export button needs to move off it — the number
// is printed rather than asserted tightly because it is hardware-dependent.
check(`locking is fast enough to do inline (${crypto.lockMs} ms)`, crypto.lockMs < 3000, `${crypto.lockMs} ms`)

// ── 2. The dialog ───────────────────────────────────────────────────────────
console.log('\nthe Lock control in the export dialog')

const pdf = await page.evaluate(async (sentence) => {
  const { PDFDocument, StandardFonts } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText(sentence, { x: 60, y: 700, size: 14, font })
  return Array.from(await doc.save())
}, SENTENCE)

await page.setInputFiles('input[type=file]', {
  name: 'lockme.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(pdf),
})
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })

await page.getByRole('button', { name: /export/i }).first().click()
await page.waitForSelector('text=Export PDF', { timeout: 15000 })
await waitReady(page)

check('the export dialog collapses flatten and lock behind "Advanced exports"',
  await openAdvanced(page))

const lockBox = page.getByRole('checkbox', { name: /Lock with a password/i })
check('the export dialog offers "Lock with a password"', (await lockBox.count()) > 0)

const downloadBtn = page.getByRole('button', { name: /Download|Locking/ }).first()
// ⚠️ Waited, not sampled. The dialog disables its controls while it builds the
// export, and on a one-page document that flag clears in tens of milliseconds
// — so reading `isEnabled()` the instant `waitReady` returns is a coin flip.
// It flipped during the negative-control run below, which is how it was found.
await downloadBtn.waitFor({ state: 'visible' })
let enabledAtStart = false
for (let i = 0; i < 40 && !enabledAtStart; i++) {
  enabledAtStart = await downloadBtn.isEnabled()
  if (!enabledAtStart) await page.waitForTimeout(100)
}
check('Download is enabled before the lock is switched on', enabledAtStart)

await lockBox.check()
check('ticking it reveals the Password / PIN choice', await page.getByRole('button', { name: 'PIN', exact: true }).isVisible())
check('and Download is disabled until a password is typed', !(await downloadBtn.isEnabled()))

// ⚠️ The property that matters most: a MISMATCHED confirm must not export. A
// locked file whose password is a typo is unopenable by everyone including the
// person who made it.
await page.getByPlaceholder('Password', { exact: true }).fill('correct horse battery')
await page.getByPlaceholder('Confirm password').fill('correct horse batteru')
check('a mismatched confirmation keeps Download disabled', !(await downloadBtn.isEnabled()))
check('and says the two do not match', await visible(page.locator('text=/do not match/')))

await page.getByPlaceholder('Confirm password').fill('correct horse battery')
check('matching them enables Download', await downloadBtn.isEnabled())

// The strength note has to be visible and honest.
check('a strength note is shown', await visible(page.locator('text=/brute force|Nobody is brute-forcing/')))
check('the no-recovery warning is visible without hunting for it', await visible(page.locator('text=/There is no reset/')))

// PIN mode
await page.getByRole('button', { name: 'PIN', exact: true }).click()
check('switching to PIN clears the fields', (await page.getByPlaceholder('PIN', { exact: true }).inputValue()) === '')
await page.getByPlaceholder('PIN', { exact: true }).fill('12ab34')
check('a PIN box refuses letters as you type', (await page.getByPlaceholder('PIN', { exact: true }).inputValue()) === '1234')
await page.getByPlaceholder('PIN', { exact: true }).fill('4913')
await page.getByPlaceholder('Confirm PIN').fill('4913')
check('a 4-digit PIN is allowed through', await downloadBtn.isEnabled())
check('but is called weak to its face', await visible(page.locator('text=/Weak|Guessable/')))

// ── 3. The download really is locked ────────────────────────────────────────
console.log('\nthe file that comes out')

const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
await downloadBtn.click()
const download = await downloadPromise
const path = await download.path()
const bytes = await (await import('node:fs/promises')).readFile(path)

const verdict = await page.evaluate(async (arr) => {
  const pdfjsLib = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'
  const data = new Uint8Array(arr)
  let refused = false
  try {
    await pdfjsLib.getDocument({ data: data.slice(0) }).promise
  } catch {
    refused = true
  }
  let opened = false
  try {
    const doc = await pdfjsLib.getDocument({ data: data.slice(0), password: '4913' }).promise
    opened = doc.numPages === 1
  } catch {
    opened = false
  }
  return { refused, opened }
}, Array.from(bytes))

check('the downloaded file will not open without the PIN', verdict.refused)
check('and does open with it', verdict.opened)

// ── 4. Opening a locked PDF asks for the password ───────────────────────────
console.log('\nreopening a locked document')

// ⚠️ A FRESH PAGE, not `page.reload()`. The first document was unencrypted, so
// it went into recents and put its slug in the URL hash — a reload restores it,
// which means the app is no longer on the landing page and
// `input[type=file]` matches a different input entirely (the signature
// importer). A cold page is also the honest test: this is how somebody
// receiving a locked PDF actually arrives.
await page.close()
page = await browser.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', {
  name: 'locked.pdf',
  mimeType: 'application/pdf',
  buffer: bytes,
})
check('a locked PDF raises the password prompt', await visible(page.locator('text=This PDF is locked')))

await page.getByLabel('Password or PIN').fill('0000')
await page.getByRole('button', { name: 'Unlock' }).click()
check('a wrong password is reported, not swallowed', await visible(page.locator('text=/does not open this PDF/')))

await page.getByLabel('Password or PIN').fill('4913')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
check('the right password opens the document for editing', await visible(page.locator('[data-page-index="0"] canvas').first()))
check('and the prompt is gone', (await page.locator('text=This PDF is locked').count()) === 0)

console.log('\nopening a document THIS APP DID NOT LOCK')

// ⚠️ Every check above locks a file with our own code and then opens it again,
// so all of them would still pass if `decryptPdf` only understood its own
// output — which, until 2026-09-01, is exactly what it did. This fixture was
// written by LibreOffice 26.2 (PDF 2.0, AES-256 revision 6, password
// `hunter2`); regenerating it is documented in `scripts/pdfEncrypt.test.mjs`.
// It belongs HERE as well as in that suite because this is the path a real
// recipient takes — the drop zone, the prompt, the browser's own WebCrypto.
const foreign = new Uint8Array(fs.readFileSync(join(HERE, '../scripts/fixtures/libreoffice-aes256-r6.pdf')))

await page.close()
page = await browser.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', {
  name: 'from-libreoffice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(foreign),
})
check('a PDF locked by another app raises the prompt', await visible(page.locator('text=This PDF is locked')))
await page.getByLabel('Password or PIN').fill('hunter2')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
check('and it opens and renders', await visible(page.locator('[data-page-index="0"] canvas').first()))

// ⚠️ The older schemes are refused BY DESIGN — they key every object
// separately and that algorithm is not implemented. What matters in the UI is
// that the refusal does not read like a wrong password, or the recipient
// retypes a correct one all afternoon. This fixture is LibreOffice's DEFAULT
// export (PDF 1.7 → RC4-128), so it is the likeliest such file to arrive.
const oldScheme = new Uint8Array(fs.readFileSync(join(HERE, '../scripts/fixtures/libreoffice-rc4-128.pdf')))
await page.close()
page = await browser.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.setInputFiles('input[type=file]', {
  name: 'old-scheme.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(oldScheme),
})
await page.getByLabel('Password or PIN').fill('hunter2')
await page.getByRole('button', { name: 'Unlock' }).click()
check(
  'an unsupported scheme says so, rather than blaming the password',
  await visible(page.locator('text=/older encryption scheme/'))
)

await browser.close()
console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} failed:\n  - ${failures.join('\n  - ')}`}\n`)
process.exit(failures.length === 0 ? 0 : 1)
