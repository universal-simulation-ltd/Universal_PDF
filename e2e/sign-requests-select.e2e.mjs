// Send to sign ▸ "Your sign requests": select several, then act
// (Docs_UNI_SIM/new-universal-app.md §2; SDK useSelection / SelectCheckbox /
// SelectionBar). See src/components/SendToSignDialog.tsx.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:sign-requests-select # in another terminal
//
// Signed in by seeding the SDK's session (as profile-identity does) and the
// network stubbed: /rest/v1/pdf_sign_requests answers three requests — two
// waiting, one completed — and records every DELETE.
//
// What is pinned:
//   • a tick box on each request that can still be revoked; the completed one
//     has none (its certificate is the record); Select all, nothing ticked;
//   • ticking shows the count, Delete selected (the danger rank: each request
//     goes for good — links dead, stored copy deleted) and Clear;
//   • Select all ticks the two waiting ones only;
//   • Delete selected asks first, in the app's words ("…links stop
//     working…"); Cancel deletes nothing; OK sends one DELETE per ticked
//     request and none for the completed one.
// Negative control: before anything is ticked there is no Delete selected.

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
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch {
      /* next */
    }
  }
  console.error('No usable Playwright (with Chromium) found. Install it in a sibling Universal app.')
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

const UID = '00000000-0000-4000-8000-000000000001'
const now = Date.now()
const day = 86_400_000
const request = (id, doc_name, status) => ({
  id,
  org_id: null,
  upload_id: `up-${id}`,
  created_by_id: UID,
  recipient_email: 'signer@example.com',
  sender_email: 'james@unisim.co.uk',
  doc_name,
  status,
  cert_id: status === 'completed' ? `cert-${id}` : null,
  original_sha256: null,
  latest_sha256: null,
  signed_at: null,
  expires_at: new Date(now + 20 * day).toISOString(),
  created_at: new Date(now - day).toISOString(),
})
let rows = [
  request('r1', 'Lease.pdf', 'pending'),
  request('r2', 'Invoice.pdf', 'partially_signed'),
  request('r3', 'Contract.pdf', 'completed'),
]
const deleted = []

const session = {
  access_token: 'stub-access',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(now / 1000) + 3600,
  refresh_token: 'stub-refresh',
  user: {
    id: UID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'james@unisim.co.uk',
    email_confirmed_at: new Date(now - 30 * day).toISOString(),
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(now - 30 * day).toISOString(),
    is_anonymous: false,
  },
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await keepAppModuleUrls(context)
await context.addInitScript((s) => window.localStorage.setItem('universal-suite-auth', JSON.stringify(s)), session)
await context.route('**/rest/v1/**', async (route) => {
  const req = route.request()
  const url = new URL(req.url())
  const table = url.pathname.split('/rest/v1/')[1]
  if (table === 'pdf_sign_requests' && req.method() === 'DELETE') {
    const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '')
    deleted.push(id)
    rows = rows.filter((r) => r.id !== id)
    return route.fulfill({ status: 204, body: '' })
  }
  let body = []
  if (table === 'pdf_sign_requests') {
    // The one-row read before a delete (latest_storage_path) wants an object.
    if (url.searchParams.get('select') === 'latest_storage_path') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json({ latest_storage_path: null }) })
    }
    body = rows
  } else if (table === 'profiles') body = [{ id: UID, display_name: 'Jim Original', avatar_url: null, locale: 'en' }]
  await route.fulfill({ status: 200, contentType: 'application/json', body: json(body) })
})
await context.route('**/storage/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
await context.route('**/functions/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await context.route('**/auth/v1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: json({ user: session.user, session }) }),
)

const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
try {
  await page.goto(BASE, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}
await page.waitForTimeout(1500)
await page.evaluate(async () => {
  const { usePdfStore } = await (globalThis.__appImport ?? ((p) => import(p)))('/src/stores/pdfStore.ts')
  usePdfStore.getState().setSendToSignOpen(true)
})
await page.waitForSelector('[data-sign-request]', { timeout: 15000 }).catch(() => {})

const LIST = 'li[data-sign-request]'
const read = () =>
  page.evaluate((sel) => {
    const bar = document.querySelector('.u-sel-bar')
    return {
      rows: [...document.querySelectorAll(sel)].map((li) => ({
        id: li.getAttribute('data-sign-request'),
        box: li.querySelector('input[type=checkbox]') ? li.querySelector('input[type=checkbox]').checked : null,
      })),
      bar: bar?.textContent ?? null,
      buttons: bar ? [...bar.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
      danger: !!bar?.querySelector('.u-btn--danger'),
    }
  }, LIST)

console.log('\nthe list, before anything is ticked')
let s = await read()
check('three requests listed', s.rows.length === 3, json(s))
check('a tick box on the two waiting ones, none on the completed one', json(s.rows.map((r) => r.box)) === json([false, false, null]), json(s.rows))
check('the bar says only "Select all"', s.bar === 'Select all', json(s.bar))
check('negative control: no Delete selected yet', !s.danger)

console.log('\nticking one')
await page.click(`${LIST}[data-sign-request="r2"] input[type=checkbox]`)
s = await read()
check('"1 selected", Delete selected (danger rank) and Clear', s.bar?.startsWith('1 selected') && json(s.buttons) === json(['Delete selected', 'Clear']) && s.danger, json(s))

console.log('\nSelect all')
await page.click('.u-sel-bar .u-sel-all input')
s = await read()
check('ticks the two waiting ones only', json(s.rows.map((r) => r.box)) === json([true, true, null]) && s.bar?.startsWith('2 selected'), json(s))

console.log('\nDelete selected asks first')
let asked = ''
page.once('dialog', (d) => { asked = d.message(); void d.dismiss() })
await page.click('.u-sel-bar .u-btn--danger')
await page.waitForTimeout(300)
check('in the app’s words: links stop working, cannot be undone', asked.startsWith('Delete 2 sign requests?') && asked.includes('links stop working') && asked.includes('cannot be undone'), json(asked))
check('Cancel deletes nothing', deleted.length === 0, json(deleted))
page.once('dialog', (d) => void d.accept())
await page.click('.u-sel-bar .u-btn--danger')
await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 1, LIST, { timeout: 5000 }).catch(() => {})
s = await read()
check('OK deletes each ticked request, one DELETE each', json([...deleted].sort()) === json(['r1', 'r2']), json(deleted))
check('the completed one stays, and with nothing left to tick the bar goes', s.rows.length === 1 && s.rows[0].id === 'r3' && s.bar === null, json(s))

await browser.close()
console.log(failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
