// Scan to sign, step 2 (universal-platform 0306), on the desktop side, in a
// real browser against the real Realtime relay. A port of Universal
// Signatures' e2e/phone-attest.e2e.mjs.
//
//   ./scripts/preview.sh                   # Universal PDF on :5174
//   npm run test:phone-attest              # in another terminal
//
// Plays the UNI·SIM Hub phone: joins the pad's `mobile-sig:<token>` channel
// (the token read from the page's own Realtime join) and broadcasts a
// signature with the right PIN — bare base64, this app's dialect — three ways.
// The attestation lookup is mocked (a real row needs a signed-in Hub) and
// answers like the real RPC would.
//   1. No `attest` (this app's own phone page, an older Hub): received, no line.
//   2. `attest` whose record is for another image: received, no line.
//   3. `attest` whose record matches this channel and image: the pad says
//      "Signed by … via Universal ID" with a Check link to app.unisim.co.uk,
//      and so does the new entry in the Sign menu — until it is deleted.

import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const SUPABASE_URL = 'https://rygfxgalojojppxmhddo.supabase.co'

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

// Two different real PNGs (a 2×2 red and a 2×2 blue square).
const RED = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8DwnwEIGGEMACgAA/2N7ohyAAAAAElFTkSuQmCC'
const BLUE = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNkYPj/nwEIGGEMAB/0A/3aLDy4AAAAAElFTkSuQmCC'
const sha = (b) => createHash('sha256').update(b).digest('hex')
const CERT = 'c0ffee00c0ffee00c0ffee00c0ffee00'

async function testPdf() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText('Please sign below.', { x: 60, y: 760, size: 20, font })
  return Buffer.from(await doc.save())
}

const { createClient } = await import('@supabase/supabase-js')
const { chromium } = await loadPlaywright()
const browser = await chromium.launch()
const pdf = await testPdf()

function row(tok, b64) {
  return {
    ok: true, cert_id: CERT, signer_email: 'hub.signer@example.com', app: 'pdf',
    channel_sha256: sha(tok), png_sha256: sha(Buffer.from(b64, 'base64')), signed_at: '2026-10-22T14:07:00+00:00',
  }
}

async function sendAsPhone(anonKey, tok, pin, b64, attest) {
  const sb = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } })
  const ch = sb.channel(`mobile-sig:${tok}`, { config: { broadcast: { self: false } } })
  await new Promise((resolve, reject) => ch.subscribe((s) => (s === 'SUBSCRIBED' ? resolve() : s === 'CHANNEL_ERROR' && reject(new Error(s)))))
  const payload = { pin, signature: b64 }
  if (attest) payload.attest = attest
  await ch.send({ type: 'broadcast', event: 'signature', payload })
  setTimeout(() => { void sb.removeChannel(ch) }, 1000)
}

try {
  for (const round of ['no attest', 'attest for another image', 'matching attest']) {
    console.log(round)
    // A fresh browser profile each round: an empty signature library.
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    let token = null
    let anonKey = null
    page.on('websocket', (ws) => {
      const k = new URL(ws.url()).searchParams.get('apikey')
      if (k) anonKey = k
      ws.on('framesent', (f) => {
        const m = /realtime:mobile-sig:([0-9a-f]+)/.exec(String(f.payload))
        if (m) token = m[1]
      })
    })
    let rpcBody = { ok: false }
    let rpcCalls = 0
    await page.route('**/rest/v1/rpc/verify_phone_sign_attestation*', (r) => {
      rpcCalls += 1
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rpcBody) })
    })

    try {
      await page.goto(BASE, { waitUntil: 'load' })
    } catch {
      console.error(`Could not reach ${BASE} — start the dev server first (./scripts/preview.sh).`)
      await browser.close()
      process.exit(2)
    }
    await page.setInputFiles('input[type=file]', { name: 'attest.pdf', mimeType: 'application/pdf', buffer: pdf })
    await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
    await page.click('button[aria-label="Sign"]')
    await page.click('button:has-text("+ Draw new")')
    const pad = page.locator('div.fixed.inset-0:has(button[aria-pressed])').first()
    await pad.getByRole('button', { name: 'Send to sign' }).first().click()
    await page.getByText('Scan with your phone, then enter this PIN:').waitFor({ timeout: 10000 })
    for (let i = 0; i < 100 && (!token || !anonKey); i++) await page.waitForTimeout(100)
    const pin = await page.evaluate(() => {
      const el = [...document.querySelectorAll('p')].find((p) => /^\d{6}$/.test(p.textContent.trim()))
      return el?.textContent.trim()
    })
    check('pad shows a PIN and joins a channel', !!pin && !!token && !!anonKey, `pin=${pin} token=${token} key=${!!anonKey}`)
    if (!pin || !token || !anonKey) { await context.close(); continue }

    rpcBody = round === 'attest for another image' ? row(token, BLUE) : row(token, RED)
    await sendAsPhone(anonKey, token, pin, RED, round === 'no attest' ? undefined : CERT)
    await page.getByText('Signature received ✓').waitFor({ timeout: 10000 }).catch(() => {})
    check('received', await page.getByText('Signature received ✓').isVisible())
    const line = page.getByTestId('phone-attested')
    if (round === 'matching attest') {
      await line.waitFor({ timeout: 5000 }).catch(() => {})
      check('lookup made once', rpcCalls === 1, String(rpcCalls))
      check('pad shows the signed-by line', await line.isVisible())
      const text = (await line.textContent()) ?? ''
      check('names the signer via Universal ID', /Signed by hub\.signer@example\.com via Universal ID · /.test(text), text)
      const href = await line.getByRole('link').getAttribute('href')
      check('Check links to the hub', href === `https://app.unisim.co.uk/check?attest=${CERT}`, href)
      if (process.env.E2E_SHOT) await line.locator('..').screenshot({ path: process.env.E2E_SHOT })
    } else {
      await page.waitForTimeout(1500)
      check(round === 'no attest' ? 'no lookup' : 'lookup made', round === 'no attest' ? rpcCalls === 0 : rpcCalls === 1, String(rpcCalls))
      check('no signed-by line in the pad', (await line.count()) === 0)
    }

    // The pad closes by itself and the signature is in the library.
    await page.getByText('Scan with your phone, then enter this PIN:').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
    check('pad closed', !(await page.getByText('Scan with your phone, then enter this PIN:').isVisible()))
    await page.keyboard.press('Escape') // drop the armed signature tool
    await page.click('button[aria-label="Sign"]')
    const entryLine = page.getByTestId('phone-attested-entry')
    if (round === 'matching attest') {
      await entryLine.waitFor({ timeout: 5000 }).catch(() => {})
      check('library entry shows the signed-by line', await entryLine.isVisible())
      const href = await entryLine.getByRole('link').getAttribute('href').catch(() => null)
      check('entry Check links to the hub', href === `https://app.unisim.co.uk/check?attest=${CERT}`, href)
      if (process.env.E2E_SHOT_ENTRY) await entryLine.locator('../..').screenshot({ path: process.env.E2E_SHOT_ENTRY })
      // Delete the signature: the record goes with it.
      await page.locator('button[aria-label^="Delete"]').first().click()
      await page.waitForTimeout(300)
      check('deleted with its signature', (await entryLine.count()) === 0)
    } else {
      check('no signed-by line in the library', (await entryLine.count()) === 0)
    }
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))
    await context.close()
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
process.exit(0)
