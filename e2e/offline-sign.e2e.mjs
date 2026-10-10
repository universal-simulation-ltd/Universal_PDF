// Signing a "Send to sign" request offline, and the copy going back later.
//
//   npm run dev                       # or serve a build; set E2E_BASE_URL
//   npm run test:offline-sign
//
// What is pinned (James, 2026-10-04: "Offline signing of a Send-to-sign
// request inside the PWA. Let a signer open, sign and queue the submission
// offline, and sync when back online."):
//
//   • A request opened once opens again with no connection (from this device).
//   • "Finish & send back" with no connection keeps the signed copy and says
//     so — nothing is sent, nothing is lost.
//   • Back online, it goes by itself, with the hash of the version it was
//     signed on (baseSha256), and the page lands on "Your signature is in".
//   • If another party signed in between, the server's `stale_version` is
//     shown as such, with a way to the latest version — never a silent
//     overwrite of their signature.
//   • A copy left waiting is sent when Universal PDF itself starts again.
//   • Verification codes are never touched by any of it (the 5-try limit).
//
// The Edge Function is stood in for by Playwright routes: "offline" is a
// network failure on the function (and navigator.onLine = false), which is
// what supabase-js sees with no connection. The app shell itself stays on
// the dev server.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
  doc.addPage([595, 842]).drawText('Please sign below.', { x: 60, y: 760, size: 20, font })
  return Buffer.from(await doc.save())
}
const pdf = await testPdf()
const pdfSha = createHash('sha256').update(pdf).digest('hex')

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

/** A context whose Edge Function is ours to switch on and off. */
async function world() {
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 } })
  const state = { offline: false, submitAnswer: { ok: true, status: 'completed', completed: true, cert_id: 'cert-1' }, calls: [] }
  await context.route('**/functions/v1/pdf-sign-request', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}')
    state.calls.push(body)
    if (state.offline) return route.abort('internetdisconnected')
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (body.action === 'begin') return json(200, { ok: true, docName: 'Lease.pdf', requireVerification: false })
    if (body.action === 'load') return json(200, { ok: true, docName: 'Lease.pdf', signedUrl: 'https://rygfxgalojojppxmhddo.supabase.co/storage/v1/object/sign/hosted-uploads/test/lease.pdf?token=t' })
    if (body.action === 'submit') {
      const a = state.submitAnswer
      return json(a.ok ? 200 : 409, a)
    }
    return json(400, { ok: false, error: 'unexpected action ' + body.action })
  })
  await context.route('https://rygfxgalojojppxmhddo.supabase.co/storage/**', (route) =>
    state.offline ? route.abort('internetdisconnected') : route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf }),
  )
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  page.on('dialog', (d) => d.accept())
  const setOffline = async (off) => {
    state.offline = off
    await page.evaluate((off) => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !off })
      window.dispatchEvent(new Event(off ? 'offline' : 'online'))
    }, off)
  }
  return { context, page, state, setOffline }
}

const finish = (page) => page.getByRole('button', { name: /Finish & send back/ }).click()

// ── Open online once, then offline ──────────────────────────────────────────
console.log('\na request opened once opens again with no connection')
let w = await world()
try {
  await w.page.goto(`${BASE}?signdoc=tok-1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await w.page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
check('it opens online', true)
await w.page.waitForTimeout(500)
w.state.offline = true
await w.page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
await w.page.reload({ waitUntil: 'load' })
await w.page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 }).catch(() => {})
check('and opens again offline, from this device', (await w.page.locator('[data-page-index="0"] canvas').count()) > 0)
check('saying signing will be sent later', (await w.page.locator('[data-sign-offline-banner]').count()) === 1)

// ── Sign offline: queued, nothing sent ──────────────────────────────────────
console.log('\n"Finish & send back" offline keeps the signed copy')
const before = w.state.calls.filter((c) => c.action === 'submit').length
await finish(w.page)
await w.page.waitForSelector('[data-sign-queued]', { timeout: 15000 }).catch(() => {})
check('the page says it is waiting to send', (await w.page.locator('[data-sign-queued="queued"]').count()) === 1)
check('and nothing was submitted', w.state.calls.filter((c) => c.action === 'submit').length === before)
check('no code was ever asked for or checked', !w.state.calls.some((c) => c.action === 'verify' || c.action === 'request_code'))

// ── Back online: it goes ────────────────────────────────────────────────────
console.log('\nback online, it goes by itself')
await w.setOffline(false)
await w.page.waitForSelector('text=Fully signed', { timeout: 15000 }).catch(() => {})
const submits = w.state.calls.filter((c) => c.action === 'submit')
check('one submission went', submits.length === 1, `${submits.length}`)
check('carrying the hash of the version signed', submits[0]?.baseSha256 === pdfSha, `${submits[0]?.baseSha256} vs ${pdfSha}`)
check('and a real PDF', Buffer.from(submits[0]?.pdfBase64 ?? '', 'base64').subarray(0, 5).toString() === '%PDF-')
check('the page lands on "Fully signed"', (await w.page.locator('text=Fully signed').count()) === 1)
// Retention (platform 0262): a completed copy is kept 7 years, and the page says until when.
check('and says how long the signed copy is kept', (await w.page.getByText(/certificate until .+ \(7 years\)/).count()) === 1)
const leftover = await w.page.evaluate(async () => {
  const { listQueued } = await import('/src/lib/signQueue.ts')
  return (await listQueued()).length
})
check('and the queue is empty again', leftover === 0, `${leftover}`)
await w.context.close()

// ── Stale: somebody else signed meanwhile ───────────────────────────────────
console.log('\nif another party signed in between, it says so instead of overwriting')
w = await world()
await w.page.goto(`${BASE}?signdoc=tok-2`, { waitUntil: 'load' })
await w.page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await w.page.waitForTimeout(400)
await w.setOffline(true)
await finish(w.page)
await w.page.waitForSelector('[data-sign-queued="queued"]', { timeout: 15000 }).catch(() => {})
w.state.submitAnswer = { ok: false, code: 'stale_version', error: 'Someone else signed this document after you opened it.' }
await w.setOffline(false)
await w.page.waitForSelector('[data-sign-queued="stale"]', { timeout: 15000 }).catch(() => {})
check('the page shows the stale state', (await w.page.locator('[data-sign-queued="stale"]').count()) === 1)
check('with a way to the latest version', (await w.page.getByRole('button', { name: 'Open the latest version' }).count()) === 1)
check('and the copy can still be downloaded', (await w.page.getByRole('button', { name: 'Download your copy' }).count()) === 1)
await w.context.close()

// ── Left waiting: Universal PDF sends it when it starts ─────────────────────
console.log('\na copy left waiting is sent when Universal PDF starts again')
w = await world()
await w.page.goto(`${BASE}?signdoc=tok-3`, { waitUntil: 'load' })
await w.page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await w.page.waitForTimeout(400)
await w.setOffline(true)
await finish(w.page)
await w.page.waitForSelector('[data-sign-queued="queued"]', { timeout: 15000 }).catch(() => {})
w.state.offline = false
await w.page.goto(BASE, { waitUntil: 'load' })
await w.page.waitForSelector('[data-sign-queue-sent]', { timeout: 15000 }).catch(() => {})
check('the app sends it and says so', /Lease\.pdf was sent back/.test(await w.page.locator('[data-sign-queue-sent]').innerText().catch(() => '')))
check('as a submit for that link', w.state.calls.some((c) => c.action === 'submit' && c.token === 'tok-3'))
await w.context.close()

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
