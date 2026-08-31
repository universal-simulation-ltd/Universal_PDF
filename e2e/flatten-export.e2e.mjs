// "Flatten pages to images" in the export dialog — the checkbox added
// 2026-08-31, and the thing it actually has to deliver.
//
//   ./scripts/preview.sh        # or preview.ps1 — Universal PDF is :5174
//   npm run test:flatten        # in another terminal
//
// ── Why this file exists ─────────────────────────────────────────────────────
//
// Flattening was always IMPLEMENTED — 'balanced' and 'strong' rasterise every
// page — but it was only ever OFFERED when it would save ≥20% AND ≥100 KB, so
// on a text document it was present, functional and unreachable. That is the
// document somebody wants flattened ("nobody can copy or edit what I signed"),
// and the reason has nothing to do with file size.
//
// Two things had to change and BOTH are load-bearing, which is why both are
// pinned here:
//
//   1. The control is reachable on a text-only PDF at all.
//   2. `compressPdf` keeps the rasterised bytes even when they are BIGGER.
//      Its default is to hand back the lossless save in that case — correct
//      when the ask is "make this smaller", and silently the OPPOSITE of what
//      was asked when the ask is "make this uneditable". Without the new
//      `keepRasterEvenIfBigger`, ticking the box on a text document returns a
//      file whose text is still perfectly selectable, and nothing says so.
//      That is the one failure worse than not shipping the feature, because it
//      is invisible and it is precisely backwards.
//
// ⚠️ The assertion that matters is NOT "the checkbox is checked" — it is that
// the produced BYTES have no text left in them. So the flattened output is
// re-opened with pdf.js and its text content read back: a flattened page must
// yield no text and must carry an image, and the un-flattened one must still
// yield the sentence that was put in. A UI-only test would pass just as
// happily against a checkbox wired to nothing.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

// Sibling repos that carry a Playwright install. See office-import.e2e.mjs for
// why this launches a browser rather than trusting the first import that works.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

async function loadPlaywright() {
  const problems = []
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
    } catch (err) {
      problems.push(`  ${rel}\n    ${String(err).split('\n')[0]}`)
    }
  }
  console.error(
    'No usable Playwright found. Candidates that imported but could not launch:\n' +
      (problems.join('\n') || '  (none imported at all)') +
      '\n\nInstall it in a sibling Universal app, or run:\n' +
      '  npm i -D playwright && npx playwright install chromium',
  )
  process.exit(2)
}

// The modal disables its controls while a pass is running (`building ||
// compressing`), exactly as the strength buttons always have. On a tiny
// document those flags flip in tens of milliseconds, so Playwright can find the
// checkbox enabled, decide to click, and land on it a moment after React has
// disabled it again — "Clicking the checkbox did not change its state". Waiting
// for the dialog to settle is what a person does anyway.
async function waitReady(page, timeout = 120000) {
  await page
    .locator('text=/Building export…|Compressing…/')
    .first()
    .waitFor({ state: 'detached', timeout })
    .catch(() => {})
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

const SENTENCE = 'Flattening removes this sentence from the text layer.'

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (./scripts/preview.sh).`)
  await browser.close()
  process.exit(2)
}

console.log('\nFlatten pages to images — the bytes, not the checkbox')

// Everything below runs inside the page, against the app's own modules over
// Vite's served paths. `page.evaluate` has no bundler resolution, so bare
// specifiers would fail — see office-import.e2e.mjs for the same note.
const out = await page.evaluate(async (sentence) => {
  const { PDFDocument, StandardFonts } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
  const { compressPdf } = await import('/src/lib/export.ts')
  const pdfjsLib = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'

  // A TEXT-ONLY PDF: no images at all, so rasterising it can only ever make it
  // bigger. This is exactly the document the old size gate refused to offer
  // flattening for, and exactly the one somebody signs.
  const src = await PDFDocument.create()
  const font = await src.embedFont(StandardFonts.Helvetica)
  const pg = src.addPage([595, 842])
  pg.drawText(sentence, { x: 60, y: 700, size: 14, font })
  const srcBytes = await src.save()

  async function inspect(bytes) {
    const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise
    const p = await doc.getPage(1)
    const text = (await p.getTextContent()).items.map((i) => i.str).join('').trim()
    const ops = await p.getOperatorList()
    const drawsImage = ops.fnArray.some(
      (fn) => fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject,
    )
    return { text, drawsImage, size: bytes.byteLength }
  }

  const before = await inspect(srcBytes)

  // (a) The DEFAULT behaviour, unchanged: asked to compress, and rasterising
  //     would inflate it, so the lossless bytes come back and the text lives.
  const sized = await compressPdf(srcBytes.slice(0).buffer, 'x.pdf', 'balanced', () => {}, false)
  const sizedOut = await inspect(sized.bytes)

  // (b) The NEW behaviour the checkbox uses: keep the raster whatever it costs.
  const flat = await compressPdf(srcBytes.slice(0).buffer, 'x.pdf', 'balanced', () => {}, true)
  const flatOut = await inspect(flat.bytes)

  return {
    before,
    sized: { ...sizedOut, fellBack: sized.fellBackToLossless === true },
    flat: { ...flatOut, fellBack: flat.fellBackToLossless === true },
  }
}, SENTENCE)

console.log('\n  The document going in')
check('the source PDF really has the sentence in its text layer',
  out.before.text.includes(SENTENCE), JSON.stringify(out.before.text))
check('and no image, so rasterising it can only inflate it', !out.before.drawsImage)

console.log('\n  Compressing for SIZE still falls back (unchanged)')
check('it reports the fallback', out.sized.fellBack)
check('and the text survives, because that is the right call when asked for a smaller file',
  out.sized.text.includes(SENTENCE))

console.log('\n  Flattening keeps the raster whatever it weighs')
check('it does NOT report a fallback', !out.flat.fellBack)
check('THE TEXT LAYER IS GONE', out.flat.text === '',
  `pdf.js still read ${JSON.stringify(out.flat.text.slice(0, 60))}`)
check('the page is drawn as an image instead', out.flat.drawsImage)
check('and it is indeed bigger — which is why the default refuses it',
  out.flat.size > out.before.size, `${out.flat.size} vs ${out.before.size}`)

// ── The control itself ───────────────────────────────────────────────────────
//
// ⚠️ Asserted against the REAL modal on a REAL document, not by reading the
// source: the whole bug was that the control existed and could not be reached.
console.log('\n  The checkbox is reachable on that same text-only document')
async function openTextPdf(pages, lines) {
  return page.evaluate(async ({ sentence, pages, lines }) => {
    const { PDFDocument, StandardFonts } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
    const d = await PDFDocument.create()
    const f = await d.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < pages; i++) {
      const pg = d.addPage([595, 842])
      // Enough lines that a rasterised page is a real JPEG rather than mostly
      // white — a blank page compresses to almost nothing and would make every
      // size comparison below meaningless.
      for (let line = 0; line < lines; line++) {
        pg.drawText(`${line}. ${sentence}`, { x: 40, y: 800 - line * 22, size: 11, font: f })
      }
    }
    const bytes = await d.save()
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'text-only.pdf', { type: 'application/pdf' }))
    const input = document.querySelector('input[type=file]')
    if (!input) return 'no file input on the landing page'
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, { sentence: SENTENCE, pages, lines })
}

// One page, one line — the smallest honest version of "a document somebody
// signs". Rasterising it can only inflate it, which is the case the size gate
// used to refuse to offer flattening for.
const uiOk = await openTextPdf(1, 1)

if (uiOk !== true) {
  check('a PDF can be opened in the app', false, String(uiOk))
} else {
  const exportBtn = page.getByRole('button', { name: /export|download|save/i }).first()
  await exportBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  if (await exportBtn.count()) await exportBtn.click()

  const box = page.getByRole('checkbox', { name: /Flatten pages to images/i })
  await box.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  check('the flatten checkbox is on screen for a text-only PDF', (await box.count()) > 0)
  if (await box.count()) {
    check('and it starts unticked — the text layer is never given away by default',
      !(await box.isChecked()))
    await waitReady(page)
    await box.check()
    check('ticking it selects the flattened variant', await box.isChecked())
    // The strength row belongs to the checkbox and appears with it.
    // ⚠️ NO strength row here, and that is correct rather than a miss. This
    // document flattens to ~23 KB, where Maximum saves single-digit KB over
    // Balanced — `worthOffering` calls that no choice at all, which is the same
    // rule that has always governed the levels. One button is not a choice.
    // The row IS asserted, on a document big enough to earn it, further down.
    // ⚠️ NO strength row here, and that is correct rather than a miss. This
    // document flattens to ~23 KB, where Maximum saves single-digit KB over
    // Balanced — `worthOffering` calls that no choice at all, which is the same
    // rule that has always governed the levels. One button is not a choice.
    // The row IS asserted, on a document big enough to earn it, further down.
    check('no image-quality row on a document too small for the levels to differ',
      (await page.getByText('Image quality').count()) === 0)

    // The tab is renamed for what it HOLDS. A flattened file is routinely
    // bigger, so "Compressed" would be a false claim about size — and the old
    // "no savings" badge, with the tab disabled behind it, made the checkbox
    // unusable on exactly the documents it was added for.
    await waitReady(page)
    const tabs = await page.locator('[role=tablist]').first().innerText()
    check('the second tab is named Flattened, not Compressed',
      /Flattened/.test(tabs) && !/Compressed/.test(tabs), JSON.stringify(tabs))
    check('it owns up to the size rather than claiming "no savings"',
      !/no savings/.test(tabs), JSON.stringify(tabs))
    check('and the tab is reachable — not disabled for having saved nothing',
      await page.getByRole('tab', { name: /Flattened/ }).isEnabled())

    await waitReady(page)
    await box.uncheck()
    await waitReady(page)
    check('unticking it puts the raster controls away again',
      (await page.getByText('Image quality').count()) === 0)
    // ⓘ The variant TABS may legitimately vanish here too: with flattening off,
    // a text-only PDF that the lossless pass cannot shrink has genuinely one
    // file to download, and `compressionPointless` has always hidden the strip
    // in that case. Not asserted either way — it is pre-existing behaviour this
    // change deliberately leaves alone.
  }
}

// ── And where the levels DO differ, the choice is offered ────────────────────
console.log('\n  A document big enough for Balanced vs Maximum to matter')
{
  await page.goto(BASE, { waitUntil: 'networkidle' })
  const ok = await openTextPdf(8, 34)
  if (ok !== true) {
    check('a 24-page PDF can be opened in the app', false, String(ok))
  } else {
    const exportBtn2 = page.getByRole('button', { name: /export|download|save/i }).first()
    await exportBtn2.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
    if (await exportBtn2.count()) await exportBtn2.click()
    const box2 = page.getByRole('checkbox', { name: /Flatten pages to images/i })
    await box2.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {})
    if (!(await box2.count())) {
      check('the flatten checkbox is on screen', false)
    } else {
      // ⚠️ NO "≈ N smaller" here, deliberately. Flattening TEXT inflates it,
      // and `flattenSaving` is null for a negative — "· 240 KB bigger" beside
      // a checkbox reads as an argument against ticking it, when size is not
      // what it is for. The hint is proved present on a scan below.
      await waitReady(page)
      await box2.check()
      await page.getByText('Image quality').waitFor({ timeout: 90000 }).catch(() => {})
      check('the image-quality choice appears once the levels differ',
        (await page.getByText('Image quality').count()) > 0)
      check('and it offers Maximum beside Balanced',
        (await page.getByRole('button', { name: /^Balanced$/ }).count()) > 0 &&
          (await page.getByRole('button', { name: /^Maximum$/ }).count()) > 0)
      check('but still no saving hint, because flattening TEXT makes it bigger',
        (await page.getByText(/≈.*smaller/).count()) === 0)
    }
  }
}

// ── The scan: the case where flattening IS also a saving ─────────────────────
console.log('\n  A scan, where flattening genuinely shrinks the file')
{
  await page.goto(BASE, { waitUntil: 'networkidle' })
  const ok = await page.evaluate(async () => {
    const { PDFDocument } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
    // ⚠️ A SCAN, and getting this fixture right took two goes. The first was a
    // page of pure random noise, on the reasoning that noise does not compress
    // so the file would be big. It is big — and it is JPEG's worst case at
    // BOTH ends, so re-encoding it saved nothing and the app correctly said
    // "no savings". The fixture was measuring itself, not the feature.
    //
    // What a scanner actually produces is high-RESOLUTION, low-frequency
    // content: paper tone, gentle shading, bands of dark text. The saving comes
    // from the resolution drop — 2400×3400 rendered down onto an A4 page — not
    // from the quality setting. Measured with this fixture: 2.72 MB in, ~803 KB
    // estimated at Balanced, a ~2 MB saving, comfortably past the ≥20% AND
    // ≥100 KB bar the hint needs.
    const W = 2400
    const H = 3400
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(W, H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const paper = 200 + 40 * Math.sin(x / 90) * Math.cos(y / 130)
        const grain = (Math.random() - 0.5) * 25
        const textLine = y % 60 < 14 && x % 1900 > 120 ? -150 : 0
        const v = Math.max(0, Math.min(255, paper + grain + textLine))
        img.data[i] = v
        img.data[i + 1] = v
        img.data[i + 2] = v
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
    const jpg = new Uint8Array(await blob.arrayBuffer())

    const d = await PDFDocument.create()
    const embedded = await d.embedJpg(jpg)
    for (let i = 0; i < 3; i++) {
      const pg = d.addPage([595, 842])
      pg.drawImage(embedded, { x: 0, y: 0, width: 595, height: 842 })
    }
    const bytes = await d.save()
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'scan.pdf', { type: 'application/pdf' }))
    const input = document.querySelector('input[type=file]')
    if (!input) return 'no file input on the landing page'
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })
  if (ok !== true) {
    check('a scan-like PDF can be opened in the app', false, String(ok))
  } else {
    const btn = page.getByRole('button', { name: /export|download|save/i }).first()
    await btn.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
    if (await btn.count()) await btn.click()
    const box3 = page.getByRole('checkbox', { name: /Flatten pages to images/i })
    await box3.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {})
    if (!(await box3.count())) {
      check('the flatten checkbox is on screen for a scan', false)
    } else {
      // The estimate is measured from ONE sampled page and multiplied out, so
      // it lands long before the real rasterising pass finishes.
      await page.getByText(/≈.*smaller/).first().waitFor({ timeout: 120000 }).catch(() => {})
      check('the checkbox names the saving it would make',
        (await page.getByText(/≈.*smaller/).count()) > 0)
      check('and it is still UNTICKED — a saving is an offer, never a default',
        !(await box3.isChecked()))
    }
  }
}

await browser.close()

if (failures.length) {
  console.log(`\n${failures.length} failed:\n  - ${failures.join('\n  - ')}\n`)
  process.exit(1)
}
console.log('\nAll checks passed.\n')
