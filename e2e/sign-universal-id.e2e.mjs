// Opening a "Send to sign" link while signed in with the Universal ID it was
// sent to: no emailed code.
//
//   npm run dev                       # or serve a build; set E2E_BASE_URL
//   npm run test:sign-universal-id
//
// What is pinned:
//
//   • Protected link, the server says the signed-in account matches, no PIN:
//     the app asks `verify_universal_id` by itself, never asks for a code, the
//     document opens with that session, and the panel says they were verified
//     by their Universal ID.
//   • Protected link, no match: the emailed-code page, exactly as before, and
//     `verify_universal_id` is never called.
//   • Match but the sender set a PIN: a one-step page with just the PIN, sent
//     with `verify_universal_id`; no code.
//   • Match, but the server refuses after all: the emailed-code page.
//   • Open link, match: opens as before, with a line saying the signature is
//     recorded as verified by their Universal ID.
//   • The certificate names the method.
//
// The decision is the server's (platform 0338) — the Edge Function is stood in
// for by Playwright routes here, as in offline-sign.e2e.mjs.

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
const SESSION = '11111111-2222-4333-8444-555555555555'

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

/** A context whose Edge Function answers as `opts` says. */
async function world(opts) {
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 } })
  const calls = []
  await context.route('**/functions/v1/pdf-sign-request', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}')
    calls.push(body)
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (body.action === 'begin') {
      return json(200, {
        ok: true, docName: 'Lease.pdf', requireVerification: opts.protected, hasPin: !!opts.pin,
        maskedEmail: 'j••••@e••••.com', role: 'recipient', alreadySigned: false, completed: false,
        universalIdMatch: opts.match,
      })
    }
    if (body.action === 'verify_universal_id') {
      if (opts.refuse) return json(403, { ok: false, code: 'universal_id_mismatch', error: 'Your account is not the address this document was sent to. Use the emailed code instead.' })
      if (opts.pin && body.pin !== opts.pin) return json(403, { ok: false, code: 'bad_credentials', error: 'That PIN did not match. 4 tries left.', triesLeft: 4 })
      return json(200, { ok: true, session: SESSION, verifiedVia: opts.pin ? 'universal_id+pin' : 'universal_id', expiresInMinutes: 240 })
    }
    if (body.action === 'load') {
      if (opts.protected && body.session !== SESSION) return json(403, { ok: false, code: 'verification_required', error: 'Verify your email address first.' })
      return json(200, { ok: true, docName: 'Lease.pdf', signedUrl: 'https://rygfxgalojojppxmhddo.supabase.co/storage/v1/object/sign/hosted-uploads/test/lease.pdf?token=t' })
    }
    return json(400, { ok: false, error: 'unexpected action ' + body.action })
  })
  await context.route('https://rygfxgalojojppxmhddo.supabase.co/storage/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf }),
  )
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  return { context, page, calls }
}

const opened = (page) => page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 }).then(() => true).catch(() => false)
const actions = (calls) => calls.map((c) => c.action)

// ── Protected, matching account, no PIN ─────────────────────────────────────
console.log('\nprotected link, signed in with the matching Universal ID')
let w = await world({ protected: true, match: true })
try {
  await w.page.goto(`${BASE}?signdoc=tok-uid-1`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
check('the document opens', await opened(w.page))
check('verify_universal_id was asked, once', actions(w.calls).filter((a) => a === 'verify_universal_id').length === 1, actions(w.calls).join(','))
check('no code was asked for or checked', !w.calls.some((c) => c.action === 'request_code' || c.action === 'verify'))
check('the load carried the session it gave', w.calls.some((c) => c.action === 'load' && c.session === SESSION))
await w.page.locator('[data-sign-universal-id]').first().waitFor({ timeout: 10000 }).catch(() => {})
check('the panel says they were verified by their Universal ID', /Verified by your Universal ID/.test(await w.page.locator('[data-sign-universal-id]').innerText().catch(() => '')))
await w.context.close()

// ── Protected, no match ─────────────────────────────────────────────────────
console.log('\nprotected link, not signed in (or a different account)')
w = await world({ protected: true, match: false })
await w.page.goto(`${BASE}?signdoc=tok-uid-2`, { waitUntil: 'load' })
await w.page.getByRole('button', { name: 'Email me a code' }).waitFor({ timeout: 15000 }).catch(() => {})
check('the emailed-code page, as before', (await w.page.getByRole('button', { name: 'Email me a code' }).count()) === 1)
check('verify_universal_id never called', !actions(w.calls).includes('verify_universal_id'))
check('and no Universal ID step', (await w.page.locator('[data-gate-universal-id]').count()) === 0)
await w.context.close()

// ── Protected, matching account, PIN set ────────────────────────────────────
console.log('\nprotected link with a PIN, signed in with the matching Universal ID')
w = await world({ protected: true, match: true, pin: '4321' })
await w.page.goto(`${BASE}?signdoc=tok-uid-3`, { waitUntil: 'load' })
await w.page.locator('[data-gate-universal-id]').waitFor({ timeout: 15000 }).catch(() => {})
check('a one-step page with just the PIN', (await w.page.locator('[data-gate-universal-id]').count()) === 1 && (await w.page.locator('#sr-uid-pin').count()) === 1)
check('it says no emailed code is needed', /don’t need an emailed code/.test(await w.page.locator('[data-gate-universal-id]').innerText().catch(() => '')))
check('and no code field', (await w.page.locator('#sr-code').count()) === 0)
check('nothing was asked before the press', !actions(w.calls).includes('verify_universal_id'))
await w.page.fill('#sr-uid-pin', '0000')
await w.page.getByRole('button', { name: 'Open the document' }).click()
await w.page.getByRole('alert').waitFor({ timeout: 10000 }).catch(() => {})
check('a wrong PIN is said, and the page stays', (await w.page.locator('[data-gate-universal-id]').count()) === 1 && /did not match/.test(await w.page.getByRole('alert').innerText().catch(() => '')))
await w.page.fill('#sr-uid-pin', '4321')
await w.page.getByRole('button', { name: 'Open the document' }).click()
check('the right PIN opens the document', await opened(w.page))
check('sent with verify_universal_id, never a code', w.calls.some((c) => c.action === 'verify_universal_id' && c.pin === '4321') && !actions(w.calls).includes('request_code'))
await w.context.close()

// ── Match, but the server refuses ───────────────────────────────────────────
console.log('\nthe server refuses the account after all')
w = await world({ protected: true, match: true, refuse: true })
await w.page.goto(`${BASE}?signdoc=tok-uid-4`, { waitUntil: 'load' })
await w.page.getByRole('button', { name: 'Email me a code' }).waitFor({ timeout: 15000 }).catch(() => {})
check('falls back to the emailed-code page', (await w.page.getByRole('button', { name: 'Email me a code' }).count()) === 1)
check('the document did not open', (await w.page.locator('[data-page-index="0"] canvas').count()) === 0)
await w.context.close()

// ── Open link, matching account ─────────────────────────────────────────────
console.log('\nopen link, signed in with the matching Universal ID')
w = await world({ protected: false, match: true })
await w.page.goto(`${BASE}?signdoc=tok-uid-5`, { waitUntil: 'load' })
check('opens as before', await opened(w.page))
check('without verify_universal_id', !actions(w.calls).includes('verify_universal_id'))
await w.page.locator('[data-sign-universal-id]').first().waitFor({ timeout: 10000 }).catch(() => {})
check('saying the signature is recorded as verified by it', /recorded as verified/.test(await w.page.locator('[data-sign-universal-id]').innerText().catch(() => '')))
await w.context.close()

// ── The certificate names the method ────────────────────────────────────────
console.log('\nthe certificate names the method')
{
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 } })
  await context.route('**/rest/v1/rpc/verify_pdf_sign_cert', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ok: true, doc_name: 'Lease.pdf', status: 'partially_signed', created_at: '2026-11-21T10:00:00Z',
      original_sha256: 'a'.repeat(64), latest_sha256: 'b'.repeat(64), bytes_available: false, retain_until: null,
      parties: [{ role: 'recipient', email: 'jane@example.com', status: 'signed', signed_at: '2026-11-21T10:05:00Z' }],
      events: [
        { action: 'verified', actor_email: 'jane@example.com', occurred_at: '2026-11-21T10:01:00Z', method: 'universal_id' },
        { action: 'signature', actor_email: 'jane@example.com', occurred_at: '2026-11-21T10:05:00Z', pdf_sha256: 'b'.repeat(64), method: 'universal_id' },
        { action: 'verified', actor_email: 'sam@example.com', occurred_at: '2026-11-21T11:01:00Z', method: 'email_code+pin' },
      ],
    }),
  }))
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  await page.goto(`${BASE}?cert=${'c'.repeat(32)}`, { waitUntil: 'load' })
  await page.getByText('Verified by Universal ID').first().waitFor({ timeout: 15000 }).catch(() => {})
  check('the verified row says Universal ID', (await page.getByText('Verified by Universal ID', { exact: true }).count()) === 2)
  check('the signature row carries it too', (await page.locator('[data-cert-method]').count()) === 1)
  check('an emailed code with PIN says so', (await page.getByText('Verified by emailed code and PIN', { exact: true }).count()) === 1)
  await context.close()
}

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
