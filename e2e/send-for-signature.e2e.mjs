// Send for signature with no account: real PDF signature fields, round trip.
//
//   npm run dev                       # or serve a build; set E2E_BASE_URL
//   npm run test:send-for-signature
//
// What is pinned (James, 2026-10-12: signing needs no account; the plain
// route — place "Sign here" boxes, share the PDF — is the default everywhere,
// and the certified route is the optional upgrade on the website and in the
// desktop app — the phone apps and the extension have no sign-in):
//
//   1. The export writes each unsigned box as a REAL signature field
//      (AcroForm /FT /Sig, a widget with its own appearance), at the box, on
//      a plain page and on a /Rotate 90 page — so Acrobat, Preview and the
//      rest can sign it. The legacy catalog key is no longer written.
//   2. Opening such a file gives the boxes back, at the same place, asking
//      for the same name/date/live lines. Another app's empty /Sig field
//      opens as a box too.
//   3. Signing a box and exporting bakes the signature and removes that
//      field; the other one stays a field.
//   4. In the app, on the web: place a box, Send for signature, download,
//      reopen the downloaded file, tap the box, draw, save, export — and the
//      result carries the signature and no empty field. The certified route
//      is offered beside it.
//   5. As the phone app (faked Capacitor shell, phone-sized): no certified
//      route, no sign-in anywhere, a Share button — and no Supabase auth call
//      at all, here or in (4)'s shell-free equivalent below.
//
// The desktop app (Electron) is the website's case: sign-in and the certified
// route in the app. A faked `window.desktop` would not be Electron, so that is
// checked in real Electron, not here.
//
// Negative control (2026-10-12, run): with `addSignatureFields(...)` removed
// from buildAnnotatedPdfBytes, checks 1, 2 and 4's "the downloaded file has a
// signature field" go red; with `noAccounts: accountsOff()` forced to false in
// main.tsx, 5's "no sign-in row anywhere" goes red. The website's own Actions
// menu is also checked to offer "Sign in", so that selector is known to match.
//
// ⚠️ Restart the dev server after editing src/ mid-run: Vite then serves the
// edited modules as `?t=…`, and `import('/src/stores/…')` from a test gets a
// second copy of the store that the app is not using.
//
// E2E_KEEP=<path> keeps the PDF the sender downloaded, to try in other apps.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  ...(process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE] : []),
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
      const url = rel.startsWith('/') ? pathToFileURL(rel).href : pathToFileURL(join(HERE, rel)).href
      mod = (await import(url)).default
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
  console.error('No usable Playwright found. Install it in a sibling Universal app, or set PLAYWRIGHT_MODULE.')
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

const { PDFDocument, StandardFonts, PDFName, PDFArray, PDFDict, PDFAcroSignature } = await import('pdf-lib')

async function testPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([595, 842]).drawText('Please sign below.', { x: 60, y: 760, size: 20, font })
  return Buffer.from(await doc.save())
}

/** The signature fields in `bytes`, as pdf-lib sees them. */
async function sigFieldsIn(bytes) {
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.catalog.getAcroForm()
  if (!form) return []
  return form.getAllFields()
    .filter(([f]) => f instanceof PDFAcroSignature)
    .map(([f]) => {
      const w = f.getWidgets()[0]
      return {
        name: f.getFullyQualifiedName(),
        rect: w.getRectangle(),
        hasAppearance: !!w.dict.lookupMaybe(PDFName.of('AP'), PDFDict),
        signed: !!f.dict.get(PDFName.of('V')),
      }
    })
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

// Every request to Supabase's auth endpoints, per page.
function watchAuth(page) {
  const calls = []
  page.on('request', (r) => {
    if (/\/auth\/v1\//.test(r.url())) calls.push(r.url())
  })
  return calls
}

// ── 1–3: the export and the reader, in the page against the app's modules ──
const context = await browser.newContext({ viewport: { width: 1300, height: 950 }, acceptDownloads: true })
await context.addInitScript(() => {
  try { localStorage.setItem('unisim:default-view:pdf:page-scroll', 'vertical') } catch { /* no storage */ }
})
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
const webAuth = watchAuth(page)
try {
  await page.goto(BASE, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

console.log('\nthe export writes real signature fields, and reading them gives the boxes back')
const mod = await page.evaluate(async () => {
  const { PDFDocument, StandardFonts, PDFName, PDFString, degrees } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
  const { buildAnnotatedPdfBytes, readEmbeddedSigFields } = await import('/src/lib/export.ts')
  const pdfjsLib = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'

  const src = await PDFDocument.create()
  const font = await src.embedFont(StandardFonts.Helvetica)
  src.addPage([595, 842]).drawText('Lease', { x: 60, y: 760, size: 20, font })
  // A landscape scan: portrait MediaBox turned a quarter. The reader sees 842 x 595.
  const turned = src.addPage([595, 842])
  turned.setRotation(degrees(90))
  const srcBytes = await src.save()

  const boxes = [
    { type: 'sigfield', id: 'a', pageIndex: 0, x: 60, y: 600, width: 220, height: 70, requireName: true, requireDate: true },
    { type: 'sigfield', id: 'b', pageIndex: 1, x: 500, y: 400, width: 200, height: 60, requireLive: true },
  ]
  const out = await buildAnnotatedPdfBytes(srcBytes.slice(0).buffer, boxes, 1)

  const check = await PDFDocument.load(out)
  const legacyKey = !!check.catalog.get(PDFName.of('UPDFSigFields'))

  // What pdf.js — the engine in Firefox and in this app — makes of them.
  const doc = await pdfjsLib.getDocument({ data: out.slice(0) }).promise
  const seen = []
  for (let i = 1; i <= doc.numPages; i++) {
    for (const a of await (await doc.getPage(i)).getAnnotations()) {
      if (a.fieldType === 'Sig') seen.push({ page: i - 1, name: a.fieldName, rect: a.rect, tooltip: a.alternativeText })
    }
  }
  await doc.destroy()

  const back = await readEmbeddedSigFields(out.slice(0).buffer)

  // Sign box "a" and export again from the exported file.
  const ink = document.createElement('canvas')
  ink.width = 300; ink.height = 100
  const ctx = ink.getContext('2d')
  ctx.lineWidth = 6; ctx.strokeStyle = '#1e3a8a'
  ctx.beginPath(); ctx.moveTo(10, 80); ctx.bezierCurveTo(80, 0, 160, 120, 290, 20); ctx.stroke()
  const signedBoxes = back.map((b) => b.requireName
    ? { ...b, signed: { src: ink.toDataURL('image/png'), width: 300, height: 100 } }
    : b)
  const signedOut = await buildAnnotatedPdfBytes(out.slice(0).buffer, signedBoxes, 1)
  const doc2 = await pdfjsLib.getDocument({ data: signedOut.slice(0) }).promise
  const p1 = await doc2.getPage(1)
  const ops = await p1.getOperatorList()
  const drawsImage = ops.fnArray.some((fn) => fn === pdfjsLib.OPS.paintImageXObject)
  const sigAfter = []
  for (let i = 1; i <= doc2.numPages; i++) {
    for (const a of await (await doc2.getPage(i)).getAnnotations()) if (a.fieldType === 'Sig') sigAfter.push(i - 1)
  }
  await doc2.destroy()

  // Another app's empty signature field: no appearance, no Universal PDF key.
  const foreign = await PDFDocument.create()
  const fp = foreign.addPage([595, 842])
  const widget = foreign.context.obj({
    Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of('ClientSignature'),
    Rect: [100, 100, 300, 160], F: 4, P: fp.ref,
  })
  const wref = foreign.context.register(widget)
  fp.node.set(PDFName.of('Annots'), foreign.context.obj([wref]))
  foreign.catalog.getOrCreateAcroForm().addField(wref)
  const foreignBack = await readEmbeddedSigFields((await foreign.save()).buffer)

  return {
    out: Array.from(out),
    legacyKey,
    seen,
    back,
    signedOut: Array.from(signedOut),
    drawsImage,
    sigAfter,
    foreignBack,
  }
})

const exported = Uint8Array.from(mod.out)
const fields = await sigFieldsIn(exported)
check('two signature fields in the AcroForm', fields.length === 2, JSON.stringify(fields))
check('each has its own appearance (the outline and caption)', fields.every((f) => f.hasAppearance))
check('none is signed yet', fields.every((f) => !f.signed))
const fA = fields.find((f) => Math.abs(f.rect.x - 60) < 0.5)
check('box a sits where it was placed (x 60, y 842-670=172, 220 x 70)',
  fA && Math.abs(fA.rect.y - 172) < 0.5 && Math.abs(fA.rect.width - 220) < 0.5 && Math.abs(fA.rect.height - 70) < 0.5,
  JSON.stringify(fA?.rect))
// On the /Rotate 90 page the reader's (500, 400, 200 x 60) is user space
// x = 400..460, y = 500..700 (portrait MediaBox 595 x 842).
const fB = fields.find((f) => f !== fA)
check('box b on the turned page is turned into the page’s own space (60 x 200 at 400,500)',
  fB && Math.abs(fB.rect.x - 400) < 0.5 && Math.abs(fB.rect.y - 500) < 0.5 && Math.abs(fB.rect.width - 60) < 0.5 && Math.abs(fB.rect.height - 200) < 0.5,
  JSON.stringify(fB?.rect))
check('the legacy UPDFSigFields key is no longer written', !mod.legacyKey)
check('pdf.js sees both as signature widgets', mod.seen.length === 2, JSON.stringify(mod.seen))
check('with "Please sign here" as the tooltip', mod.seen.some((s) => /Please sign here/.test(s.tooltip ?? '')), JSON.stringify(mod.seen))

const a = mod.back.find((b) => b.requireName)
const b = mod.back.find((b) => b.requireLive)
check('reopening gives both boxes back', mod.back.length === 2, JSON.stringify(mod.back))
check('box a back at its place', a && Math.abs(a.x - 60) < 0.5 && Math.abs(a.y - 600) < 0.5 && Math.abs(a.width - 220) < 0.5 && Math.abs(a.height - 70) < 0.5, JSON.stringify(a))
check('box b back at its place on the turned page', b && b.pageIndex === 1 && Math.abs(b.x - 500) < 0.5 && Math.abs(b.y - 400) < 0.5 && Math.abs(b.width - 200) < 0.5 && Math.abs(b.height - 60) < 0.5, JSON.stringify(b))
check('asking for the same lines (name + date; live)', a?.requireDate && !a?.requireLive && b?.requireLive && !b?.requireName)
check('locked to their field, marked as ours', mod.back.every((x) => x.locked && x.fieldName && x.fieldLook === 'ours'))

const signedFields = await sigFieldsIn(Uint8Array.from(mod.signedOut))
check('signing box a and exporting leaves ONE field (b)', signedFields.length === 1 && mod.sigAfter.join() === '1', JSON.stringify(mod.sigAfter))
check('and the signature is drawn on page 1', mod.drawsImage)

check('another app’s empty signature field opens as a box', mod.foreignBack.length === 1, JSON.stringify(mod.foreignBack))
const fb = mod.foreignBack[0]
check('at its place (100, 842-160=682, 200 x 60), drawing its own outline',
  fb && Math.abs(fb.x - 100) < 0.5 && Math.abs(fb.y - 682) < 0.5 && Math.abs(fb.width - 200) < 0.5 && fb.fieldLook === 'other' && fb.fieldName === 'ClientSignature',
  JSON.stringify(fb))

// ── 4: the whole route in the app, on the web ───────────────────────────────
console.log('\non the web: place a box, send for signature, reopen, sign, export')
await page.setInputFiles('input[type=file]', { name: 'lease.pdf', mimeType: 'application/pdf', buffer: await testPdf() })
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(800)

await page.getByRole('button', { name: 'Sign', exact: true }).first().click()
await page.getByRole('button', { name: 'Request' }).click()
await page.getByRole('button', { name: 'Place signature box' }).click()
const canvas = page.locator('[data-page-index="0"] canvas').first()
const box = await canvas.boundingBox()
await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.7)
await page.mouse.down()
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
const placed = await page.evaluate(async () => {
  const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
  return useAnnotationStore.getState().annotations.filter((x) => x.type === 'sigfield')
})
check('a box is on the page', placed.length === 1, JSON.stringify(placed))

await page.getByRole('button', { name: 'Sign', exact: true }).first().click()
await page.getByRole('button', { name: 'Request' }).click()
// The menu's button (the box's own ✉️✍️ affordance opens the same dialog).
await page.locator('button', { hasText: 'Send for signature' }).click()
await page.waitForSelector('[data-send-for-signature]')
check('the certified route is offered beside it, on the web', (await page.locator('[data-sfs-certified]').count()) === 1)
const dl = page.getByRole('button', { name: 'Download PDF' })
await dl.waitFor({ state: 'visible' })
await page.waitForFunction(() => !document.querySelector('[data-sfs-download]')?.hasAttribute('disabled'), null, { timeout: 15000 })
const [download] = await Promise.all([page.waitForEvent('download'), dl.click()])
const sentPath = await download.path()
const sent = readFileSync(sentPath)
if (process.env.E2E_KEEP) writeFileSync(process.env.E2E_KEEP, sent)
const sentFields = await sigFieldsIn(sent)
check('the downloaded file has a signature field', sentFields.length === 1, JSON.stringify(sentFields))
check('the dialog says what to do next', (await page.getByText('Now send the file').count()) === 1)
// The upgrade opens today's route, retitled; signed out, it asks the SENDER for a Universal ID.
await page.getByRole('button', { name: 'Certified signature…' }).click()
await page.getByRole('heading', { name: 'Certified signature' }).waitFor({ timeout: 10000 })
check('“Certified signature…” opens the certified route on the web', true)
check('which asks the sender (only) for a Universal ID', (await page.getByRole('button', { name: /Universal ID/ }).count()) >= 1)
await page.getByRole('button', { name: 'Close' }).last().click()

// The recipient: a fresh browser, no account, the file they were sent.
const recipient = await browser.newContext({ viewport: { width: 1300, height: 950 } })
await recipient.addInitScript(() => {
  try { localStorage.setItem('unisim:default-view:pdf:page-scroll', 'vertical') } catch { /* no storage */ }
})
const rp = await recipient.newPage()
rp.on('pageerror', (e) => failures.push('recipient page error: ' + e.message))
const recipientAuth = watchAuth(rp)
await rp.goto(BASE, { waitUntil: 'load' })
await rp.setInputFiles('input[type=file]', { name: 'lease-v2.pdf', mimeType: 'application/pdf', buffer: sent })
await rp.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
let reopened = []
for (let i = 0; i < 30 && reopened.length === 0; i++) {
  await rp.waitForTimeout(200)
  reopened = await rp.evaluate(async () => {
    const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
    return useAnnotationStore.getState().annotations.filter((x) => x.type === 'sigfield')
  })
}
check('reopened, the box is there to sign', reopened.length === 1 && reopened[0].locked && reopened[0].fieldLook === 'ours', JSON.stringify(reopened))
const sentBox = placed[0]
check('at the same place', reopened[0] && Math.abs(reopened[0].x - sentBox.x) < 0.5 && Math.abs(reopened[0].y - sentBox.y) < 0.5)

// Tap it: the pad opens (a locked box signs on the first tap).
const rcanvas = rp.locator('[data-page-index="0"] canvas').first()
const rbox = await rcanvas.boundingBox()
const k = rbox.width / 595
await rp.mouse.click(rbox.x + (reopened[0].x + reopened[0].width / 2) * k, rbox.y + (reopened[0].y + reopened[0].height / 2) * k)
const padArea = rp.locator('.border-dashed.bg-slate-50 canvas').first()
await padArea.waitFor({ state: 'visible', timeout: 5000 })
check('tapping the box opens the signature pad', true)
const pb = await padArea.boundingBox()
await rp.mouse.move(pb.x + pb.width * 0.2, pb.y + pb.height * 0.6)
await rp.mouse.down()
for (let i = 1; i <= 12; i++) await rp.mouse.move(pb.x + pb.width * (0.2 + i * 0.05), pb.y + pb.height * (0.6 - Math.sin(i / 2) * 0.2))
await rp.mouse.up()
await rp.getByRole('button', { name: 'Save', exact: true }).click()
await rp.waitForTimeout(800)
const signedNow = await rp.evaluate(async () => {
  const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
  return useAnnotationStore.getState().annotations.filter((x) => x.type === 'sigfield' && x.signed).length
})
check('the box is signed', signedNow === 1)
const finalBytes = Uint8Array.from(await rp.evaluate(async () => {
  const { currentPdfBytes } = await import('/src/lib/hostedStore.ts')
  return Array.from((await currentPdfBytes()).bytes)
}))
const finalFields = await sigFieldsIn(finalBytes)
check('the signed export has no empty signature field left', finalFields.length === 0, JSON.stringify(finalFields))
const finalPdf = await PDFDocument.load(finalBytes)
const xobjects = finalPdf.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
check('and carries the signature as a picture on the page', !!xobjects && xobjects.keys().length > 0)
check('no Supabase auth call from the recipient, who has no account', recipientAuth.length === 0, recipientAuth.join(', '))
await recipient.close()
// The sender's page is the website with no one signed in: the SDK may look for
// a session, but nothing here needs one.
console.log(`  (the sender's website page made ${webAuth.length} auth call(s) — informational)`)
// The control for (5): on the website, signed out, the same menu DOES offer
// "Sign in" — so its absence in the phone app below means something.
await page.getByRole('button', { name: /Actions/ }).first().click()
await page.waitForTimeout(600)
check('on the website the Actions menu still offers “Sign in”', (await page.getByText(/Sign in/).count()) > 0)
await context.close()

// ── 5: as the phone app ─────────────────────────────────────────────────────
console.log('\nas the phone app: no account anywhere, Share instead of the certified route')
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await phone.addInitScript(() => {
  // ⚠️ Faked as the iOS bridge, not just `window.Capacitor.isNativePlatform`:
  // @capacitor/core is loaded at start-up and rebuilds that global from what
  // it finds, and the bridge's message handler is what makes it say "ios".
  // Plugin calls go nowhere, which is fine for what is checked here.
  window.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } }
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }
  try { localStorage.setItem('unisim:default-view:pdf:page-scroll', 'vertical') } catch { /* no storage */ }
})
const pp = await phone.newPage()
// The faked bridge answers no plugin, which Capacitor reports as a page error.
pp.on('pageerror', (e) => { if (!/plugin is not implemented/.test(e.message)) failures.push('phone page error: ' + e.message) })
const phoneAuth = watchAuth(pp)
const phoneRequests = []
pp.on('request', (r) => { if (/supabase\.co/.test(r.url())) phoneRequests.push(r.url()) })
await pp.goto(BASE, { waitUntil: 'load' })
// A phone shell holds its start screen while it asks the OS for a handed-over
// PDF; the fake never answers, so wait for that hold to give up first, or it
// lands on top of the document opened below and takes it away.
await pp.getByText('Drop a PDF here').waitFor({ timeout: 30000 }).catch(() => {})
await pp.waitForTimeout(500)
await pp.evaluate(async () => {
  const { usePdfStore } = await import('/src/stores/pdfStore.ts')
  const { PDFDocument } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
  const d = await PDFDocument.create()
  d.addPage([595, 842])
  const bytes = await d.save()
  await usePdfStore.getState().loadFile(new File([bytes], 'phone.pdf', { type: 'application/pdf' }))
  const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
  useAnnotationStore.getState().add({ type: 'sigfield', id: 'p1', pageIndex: 0, x: 60, y: 600, width: 200, height: 60 })
})
// The page itself may sit behind the loading hold (the faked bridge answers
// no plugin), which does not matter to anything checked here.
await pp.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 }).catch(() => {})
// Opened from the store, and again if the shell's start-up (which closes a
// tab's dialogs as it settles) shut it in the meantime.
for (let i = 0; i < 10 && (await pp.locator('[data-send-for-signature]').count()) === 0; i++) {
  await pp.evaluate(async () => {
    const { usePdfStore } = await import('/src/stores/pdfStore.ts')
    usePdfStore.getState().setSendForSignatureOpen(true)
  })
  await pp.waitForSelector('[data-send-for-signature]', { timeout: 2000 }).catch(() => {})
}
check('the dialog offers Share', (await pp.locator('[data-sfs-share]').count()) === 1)
check('and no certified route, nor a link out', (await pp.locator('[data-sfs-certified], [data-send-for-signature] a[href]').count()) === 0)
check('the certified dialog cannot be mounted', await pp.evaluate(async () => {
  const { usePdfStore } = await import('/src/stores/pdfStore.ts')
  usePdfStore.getState().setSendForSignatureOpen(false)
  usePdfStore.getState().setSendToSignOpen(true)
  await new Promise((r) => setTimeout(r, 500))
  return !document.body.textContent.includes('Certified signature')
}))
// The profile pill: no "Sign in" row.
await pp.evaluate(async () => {
  const { usePdfStore } = await import('/src/stores/pdfStore.ts')
  usePdfStore.getState().setSendToSignOpen(false)
})
const pill = pp.getByRole('button', { name: /Actions/ }).first()
await pill.click().catch(() => {})
await pp.waitForTimeout(600)
check('the Actions menu opens', (await pp.getByText(/Tune this app/).count()) > 0)
check('no sign-in row anywhere', (await pp.getByText(/Sign in/).count()) === 0)
check('no Supabase auth call from the phone app', phoneAuth.length === 0, phoneAuth.join(', '))
check('no Supabase request at all from the phone app', phoneRequests.length === 0, phoneRequests.join(', '))
await phone.close()

await browser.close()

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n` + failures.map((f) => `  • ${f}`).join('\n'))
  process.exit(1)
}
console.log('\nAll send-for-signature checks passed.')
