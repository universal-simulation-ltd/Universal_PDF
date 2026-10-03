// A PDF whose fonts aren't embedded still shows its words — Japanese, Chinese
// and Korean included — and the throwaway documents behind export no longer
// take the viewer's document down with them.
//
//   ./scripts/preview.sh       # in one terminal (Universal PDF is :5174)
//   npm run test:font-data     # in another
//
// ⚠️ What this exists to stop coming back (2026-10-04). pdf.js was given no
// `cMapUrl` and no `standardFontDataUrl`, so a CJK font named but not embedded
// — common in PDFs produced in Japan, China and Korea — was dropped with a
// console warning and the page showed NO TEXT at all where the words should
// be. ZapfDingbats (a form check box's tick) only drew by luck of a fallback.
// Both now come from `pdfjs/<version>/` in the build (`pdfjsData()` in
// vite.config.ts), wired in `openPdf` (src/lib/pdfjs.ts).
//
// The fixture is built here, byte by byte: no generator embeds-nothing on
// purpose, and pdf-lib cannot write a Type0 font without embedding one.
//
// Asserted:
//   • the CJK line paints pixels (it painted none before);
//   • the CMaps and the Dingbats face were fetched from the app's own origin;
//   • pdf.js logged no "cMapUrl" / "standardFontDataUrl" warning;
//   • a throwaway document (what export, compress and convert open) can be
//     destroyed while the viewer's document is still loading, and the viewer's
//     document survives it — which used to fail with "Worker was destroyed".

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

/** 400×200pt: "日本語" in a non-embedded KozMinPr6N on UniJIS-UCS2-H, then four ZapfDingbats ticks. */
function fixture() {
  const objs = []
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  objs[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R ' +
    '/Resources << /Font << /F1 5 0 R /F2 7 0 R >> >> >>'
  const content = 'BT /F1 36 Tf 40 120 Td <65E5672C8A9E> Tj ET\nBT /F2 36 Tf 40 50 Td (4444) Tj ET\n'
  objs[4] = `<< /Length ${content.length} >>\nstream\n${content}endstream`
  objs[5] =
    '<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPr6N-Regular /Encoding /UniJIS-UCS2-H ' +
    '/DescendantFonts [6 0 R] >>'
  objs[6] =
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPr6N-Regular ' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> /FontDescriptor 8 0 R /DW 1000 >>'
  objs[7] = '<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>'
  objs[8] =
    '<< /Type /FontDescriptor /FontName /KozMinPr6N-Regular /Flags 6 /FontBBox [-437 -340 1147 1317] ' +
    '/ItalicAngle 0 /Ascent 1317 /Descent -349 /CapHeight 742 /StemV 80 >>'
  let out = '%PDF-1.7\n'
  const offsets = []
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1').toString('base64')
}

try {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(String(res.status))
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  process.exit(2)
}

const browser = await loadPlaywright()
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
const warnings = []
page.on('console', (m) => {
  if (/cMapUrl|standardFontDataUrl|Worker was destroyed|Transport destroyed/.test(m.text())) warnings.push(m.text())
})
const fetched = []
page.on('request', (r) => {
  if (/\/pdfjs\/[^/]+\/(cmaps|standard_fonts)\//.test(r.url())) fetched.push(new URL(r.url()))
})

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('input[type=file]'), { timeout: 30000 })

  console.log('\nA PDF with a non-embedded Japanese font')
  await page.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const { usePdfStore } = await import('/src/stores/pdfStore.ts')
    await usePdfStore.getState().loadFile(new File([bytes], 'cjk.pdf', { type: 'application/pdf' }))
  }, fixture())
  await page.waitForFunction(
    () => {
      const c = document.querySelector('[data-page-index="0"] canvas')
      return !!c && c.width > 1 && !(c.width === 300 && c.height === 150)
    },
    { timeout: 20000 }
  )
  await page.waitForTimeout(800)

  // Dark pixels in the band the CJK line occupies (top 20–60% of the page):
  // nothing at all was drawn there before the fix.
  const ink = await page.evaluate(() => {
    const c = document.querySelector('[data-page-index="0"] canvas')
    const ctx = c.getContext('2d')
    const y0 = Math.floor(c.height * 0.2)
    const h = Math.floor(c.height * 0.4)
    const { data } = ctx.getImageData(0, y0, c.width, h)
    let dark = 0
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) dark++
    return dark
  })
  check('the Japanese line is drawn', ink > 200, `${ink} dark pixels in its band`)
  const origin = new URL(BASE).origin
  check(
    'the CMap came from the app itself',
    fetched.some((u) => u.origin === origin && u.pathname.endsWith('/cmaps/UniJIS-UCS2-H.bcmap')),
    fetched.map(String).join(', ') || 'nothing fetched'
  )
  check(
    'and so did the Dingbats face',
    fetched.some((u) => u.origin === origin && /\/standard_fonts\/FoxitDingbats\.pfb$/.test(u.pathname))
  )

  console.log('\nThrowaway documents no longer take the shared worker with them')
  const race = await page.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const { openPdf } = await import('/src/lib/pdfjs.ts')
    // A throwaway (what export/compress open) is up; a second document starts
    // loading; the throwaway is destroyed before the second has finished.
    const throwaway = await openPdf(bytes.slice()).promise
    const second = openPdf(bytes.slice()).promise
    const destroying = throwaway.destroy()
    try {
      const doc = await second
      const p = await doc.getPage(1)
      const ok = p.getViewport({ scale: 1 }).width === 400
      await destroying
      // And a third, after the destroy has fully landed.
      const third = await openPdf(bytes.slice()).promise
      const ok3 = third.numPages === 1
      await third.destroy()
      await doc.destroy()
      return { ok: ok && ok3 }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }, fixture())
  check('a document loading beside a destroyed one still opens', race.ok, race.error)

  check('pdf.js never asked for font data it lacked, or lost its worker', warnings.length === 0, warnings.join(' | '))
} finally {
  await browser.close()
}

if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nAll passed')
