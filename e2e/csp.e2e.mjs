// The Content-Security-Policy, against the PRODUCTION build, with the headers
// Cloudflare Pages would send.
//
//   npm run build
//   npm run test:csp
//
// Serves dist/ under /pdf/ exactly as `public/_redirects` lays it out, with the
// `/*` block of `public/_headers` on every response — plus a `report-uri` on
// the policy so violations from WORKERS (pdf.js, tesseract), which a page
// listener can't hear, are caught too. Then walks the flows that reach for
// anything outside the bundle and fails on any violation at all:
//
//   landing (the SDK, Supabase), open a PDF (pdf.js worker, CMaps), a link
//   warning, Compare (all three views), OCR (tesseract worker + WASM core from
//   ./ocr, the model from jsDelivr), the QR designer, the signature pad,
//   Export (download), Present, and the public certificate page (its iframe).
//
// It checks whichever of Content-Security-Policy / -Report-Only carries the
// policy, so it holds before and after the switch to enforcing.

import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = process.env.CSP_DIST ?? join(HERE, '..', 'dist')

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

// ── The headers Pages would send ────────────────────────────────────────────
const headerLines = readFileSync(process.env.CSP_HEADERS ?? join(HERE, '..', 'public', '_headers'), 'utf8').split('\n')
const pageHeaders = {}
let inAll = false
for (const raw of headerLines) {
  if (raw.startsWith('#') || !raw.trim()) continue
  if (!raw.startsWith(' ')) {
    inAll = raw.trim() === '/*'
    continue
  }
  if (!inAll) continue
  const at = raw.indexOf(':')
  pageHeaders[raw.slice(0, at).trim()] = raw.slice(at + 1).trim()
}
const policyHeader = Object.keys(pageHeaders).find((k) => /^Content-Security-Policy/.test(k) && /default-src/.test(pageHeaders[k]))
if (!policyHeader) {
  console.error('No Content-Security-Policy with default-src in public/_headers')
  process.exit(2)
}
const reports = []
const TYPES = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
}
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/__csp-report') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        reports.push(JSON.parse(body)['csp-report'] ?? JSON.parse(body))
      } catch {
        reports.push({ raw: body })
      }
      res.writeHead(204).end()
    })
    return
  }
  if (!url.pathname.startsWith('/pdf/')) return res.writeHead(404).end()
  let rel = normalize(decodeURIComponent(url.pathname.slice('/pdf/'.length))).replace(/^(\.\.[/\\])+/, '')
  let file = join(DIST, rel)
  if (!rel || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  const headers = { ...pageHeaders, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }
  headers[policyHeader] = `${pageHeaders[policyHeader]}; report-uri /__csp-report`
  delete headers['Strict-Transport-Security']
  res.writeHead(200, headers)
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(Number(process.env.CSP_PORT ?? 0), '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}/pdf/`
console.log(`serving ${DIST} at ${BASE} with ${policyHeader}`)

async function makePdf(lines) {
  const { PDFDocument, PDFName, PDFString, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  lines.forEach((l, i) => page.drawText(l, { x: 60, y: 760 - i * 30, size: 18, font }))
  const annot = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [58, 756, 300, 782], Border: [0, 0, 0],
    A: doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of('http://bank.example@10.1.2.3/') }),
  }))
  page.node.set(PDFName.of('Annots'), doc.context.obj([annot]))
  return Buffer.from(await doc.save())
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true })
const events = []
await context.exposeBinding('__cspViolation', ({ page }, v) => events.push({ ...v, page: page?.url() }))
await context.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__cspViolation?.({ directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile, sample: e.sample }),
  )
})
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

const step = async (label, fn) => {
  const before = events.length + reports.length
  try {
    await fn()
  } catch (e) {
    failures.push(`${label}: ${e.message.split('\n')[0]}`)
  }
  await page.waitForTimeout(600)
  const n = events.length + reports.length - before
  check(`${label} — no CSP violation`, n === 0, JSON.stringify([...events, ...reports].slice(-n)))
}

const pdfA = await makePdf(['Visit the bank', 'The rent is £900.'])
const pdfB = await makePdf(['Visit the bank', 'The rent is £950.'])
const menu = async (section, row) => {
  await page.hover('button[aria-label*="Profil"]')
  await page.waitForTimeout(400)
  const s = page.locator('button[aria-haspopup="true"][aria-expanded]').filter({ hasText: section }).first()
  if ((await s.getAttribute('aria-expanded')) !== 'true') await s.click()
  await page.waitForTimeout(200)
  await page.locator(`text=${row}`).first().click()
}

// A clean slate for each tool, so one dialog left open can't hide the next.
const fresh = async () => {
  await page.goto(BASE, { waitUntil: 'load' })
  await page.setInputFiles('input[type=file]', { name: 'a.pdf', mimeType: 'application/pdf', buffer: pdfA })
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(500)
}

console.log('')
await step('landing page', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
})
await step('open a PDF', async () => {
  await page.setInputFiles('input[type=file]', { name: 'a.pdf', mimeType: 'application/pdf', buffer: pdfA })
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
})
await step('a link warning', async () => {
  await page.locator('[data-pdf-link]').first().click()
  await page.waitForSelector('[data-link-warning]', { timeout: 5000 })
  await page.keyboard.press('Escape')
})
await step('Compare, all three views', async () => {
  await menu('Advanced', 'Compare with another PDF')
  await page.setInputFiles('[data-compare-input]', { name: 'b.pdf', mimeType: 'application/pdf', buffer: pdfB })
  await page.waitForSelector('[data-compare-changed]', { timeout: 20000 })
  await page.click('[data-compare-mode="overlay"]')
  await page.waitForSelector('[data-compare-ratio]', { timeout: 10000 })
  await page.click('[data-compare-mode="text"]')
  await page.waitForSelector('[data-compare-text]', { timeout: 10000 })
  await page.keyboard.press('Escape')
})
await step('OCR (worker, WASM core, model from jsDelivr)', async () => {
  await menu('Advanced', 'Make searchable (OCR)')
  await page.waitForSelector('[data-testid="ocr-language"]', { timeout: 10000 })
  await page.getByRole('button', { name: 'Make searchable', exact: true }).click()
  // The document already has text: "Run OCR anyway" makes it really run.
  await page.getByRole('button', { name: 'Run OCR anyway' }).click({ timeout: 60000 })
  await page.getByRole('button', { name: /Download$/ }).waitFor({ timeout: 120000 })
  await page.getByRole('button', { name: 'Done' }).click()
})
await step('the QR designer', async () => {
  await fresh()
  await page.click('button[title="Add a QR code"]')
  await page.waitForSelector('h2:has-text("Add a QR code")', { timeout: 10000 })
  await page.fill('input[placeholder="https://example.com"]', 'https://unisim.co.uk')
  await page.waitForTimeout(900)
  await page.keyboard.press('Escape')
})
await step('the signature pad', async () => {
  await fresh()
  await page.click('button[aria-label="Sign"]')
  await page.click('button:has-text("+ Draw new")')
  await page.waitForTimeout(800)
  await page.keyboard.press('Escape')
})
await step('Export (download)', async () => {
  await fresh()
  await page.click('button:has-text("Export"):visible')
  const dl = page.getByRole('button', { name: /^Download/ }).first()
  await dl.waitFor({ timeout: 15000 })
  await Promise.all([page.waitForEvent('download', { timeout: 20000 }), dl.click()])
  await page.keyboard.press('Escape')
})
await step('Present', async () => {
  await fresh()
  await page.click('button:has-text("Present"):visible')
  await page.waitForTimeout(1200)
  await page.keyboard.press('Escape')
})
await step('the sign-in dialog', async () => {
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  // Hover, not click: the pill opens on mouseenter and a click toggles it shut.
  await page.hover('button[aria-label$="Profile"]')
  await page.waitForTimeout(600)
  await page.locator('[role=menuitem]:has-text("Sign in")').first().click({ timeout: 10000 })
  await page.waitForSelector('text=Email me a code', { timeout: 10000 })
  await page.locator('text=Apple, Google or Microsoft').first().click()
  await page.waitForSelector('text=Continue with Google', { timeout: 10000 })
  // Not pressed: it leaves for Google. (A top-level navigation, which the
  // policy doesn't govern; Google's own sign-in script, when the SDK uses it,
  // is allowed from accounts.google.com/gsi/.)
})
await step('the certificate page and its iframe', async () => {
  await context.route('**/functions/v1/pdf-sign-request', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true, docName: 'Lease.pdf',
        signedUrl: 'https://rygfxgalojojppxmhddo.supabase.co/storage/v1/object/sign/test/lease.pdf?token=x',
        events: [], parties: [],
      }),
    }),
  )
  await context.route('**/rest/v1/rpc/verify_pdf_sign_cert', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, bytes_available: true, doc_name: 'Lease.pdf', status: 'completed', parties: [], events: [] }),
    }),
  )
  await context.route('https://rygfxgalojojppxmhddo.supabase.co/storage/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: pdfA }),
  )
  await page.goto(`${BASE}?cert=cert-1`, { waitUntil: 'networkidle' })
  await page.waitForSelector('iframe', { timeout: 15000 })
  await page.waitForTimeout(2000)
})

await browser.close()
server.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
