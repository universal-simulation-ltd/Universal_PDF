// Word / OpenDocument import — browser-level regression check.
//
//   ./scripts/preview.sh   # in one terminal (Universal PDF is :5174)
//   npm run test:e2e       # in another
//
// ⚠️ 5174, NOT Vite's default 5173. This file said 5173 until 2026-08-25 while
// `scripts/preview.sh` and the port registry in `Docs_UNI_SIM/dev-preview.md`
// both say 5174 — so the documented way to start the app produced a server the
// documented way to test it could not reach, and the suite exited 2 saying
// "start the dev server first" while the dev server was running. Override with
// E2E_BASE_URL if you deliberately started it somewhere else.
//
// It converts each fixture through the real `convertOfficeFile`, reads the PDF
// back with the app's own pdf.js, and asserts on BOTH what came out:
//
//   • the block structure — headings are headings, the nested bullet is at
//     level 1, the table kept its header row, the link kept its href;
//   • the text in the finished PDF — every expected phrase is really on a page,
//     not merely in an intermediate model.
//
// `rich.docx` and `rich.odt` are the same document saved both ways (built from
// `fixtures/rich.html` with LibreOffice), so they also pin down the thing most
// worth pinning down: the two parsers must agree. If they ever diverge, the
// identical-structure assertion below fails before anyone notices in the wild.
//
// This repo has no test runner of its own, so Playwright is borrowed from a
// sibling repo that does — the suite's usual arrangement for a one-file spec.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

// Sibling repos that carry a Playwright install, newest-known first.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js'
]

// ⚠️ IMPORTING a candidate is not the same as being able to USE it, and the
// difference is the whole reason this loop launches rather than resolves.
// Playwright pins an exact browser revision, so a sibling whose package
// imports perfectly can still be paired with a revision that was never
// downloaded on this machine — on the Mac, 2026-08-20, Universal_Exports
// (1.60.0, wants chromium 1223) imported fine and then died on `.launch()`
// with "Executable doesn't exist", while a newer sibling had 1228 sitting
// right there. The first-that-imports rule picked the broken one every time
// and the repo's only test suite could not run at all.
async function loadPlaywright() {
  const problems = []
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    let mod
    try {
      mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
    } catch {
      continue // not installed here
    }
    try {
      // Prove the browser binary exists before committing to this candidate.
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
      '\n\nInstall it in a sibling Universal app (e.g. Universal_Beam), or run:\n' +
      '  npm i -D playwright && npx playwright install chromium'
  )
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

const EXPECTED_PHRASES = [
  'Quarterly Operations Review',
  'This paragraph has bold text',
  'link to Universal PDF',
  'Nested bullet two',
  'Run operator training',
  'Not started',
  'Final paragraph of the document'
]

const shapes = {}

for (const name of ['rich.docx', 'rich.odt']) {
  console.log(`\n${name}`)
  const b64 = readFileSync(join(HERE, 'fixtures', name)).toString('base64')

  const out = await page.evaluate(
    async ({ b64, name }) => {
      const bin = atob(b64)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)

      // The readers moved to @unisim/doc on 2026-08-20 and take a File rather
      // than an opened archive. The block SHAPE assertions below are unchanged
      // and are what proves the extraction preserved behaviour — the kind names
      // differ from the old local model ('heading'/'paragraph'/'list'/'rule'
      // rather than 'h1'/'p'/'ul'/'hr'), so the shape mapper below translates.
      // ⚠️ The served path, not the bare specifier. `page.evaluate` runs in the
      // browser, which has no bundler resolution — `import('@unisim/doc')`
      // fails with "Failed to resolve module specifier". Vite serves anything
      // under the project root, and node_modules is under it.
      const { readDocx, readOdt } = await import('/node_modules/@unisim/doc/dist/index.js')
      const read = name.endsWith('.odt') ? readOdt : readDocx
      const { blocks, title } = await read(new File([arr], name))

      const { convertOfficeFile } = await import('/src/lib/officeToPdf.ts')
      const conversion = await convertOfficeFile(new File([arr], name))
      const { loadPdf } = await import('/src/lib/pdfjs.ts')
      const doc = await loadPdf(new Uint8Array(await conversion.file.arrayBuffer())).promise

      let text = ''
      const links = []
      for (let p = 1; p <= doc.numPages; p++) {
        const pg = await doc.getPage(p)
        text += (await pg.getTextContent()).items.map((i) => i.str).join(' ') + '\n'
        for (const a of await pg.getAnnotations()) if (a.subtype === 'Link' && a.url) links.push(a.url)
      }
      return {
        title,
        format: conversion.format,
        pdfName: conversion.file.name,
        // A compact, comparable shape — enough to tell the two parsers apart if
        // they ever stop agreeing, without pinning down every run.
        // ⚠️ Translated back to the OLD kind names on purpose. Every assertion
        // below is the one that was written against the app's own model before
        // the extraction, so leaving them untouched is what makes this suite
        // evidence that @unisim/doc behaves the same rather than merely
        // evidence that it behaves.
        shape: blocks
          .filter((b) => b.kind !== 'pagesetup')
          .map((b) =>
            b.kind === 'table'
              ? `table(${(b.header ?? []).length}x${b.rows.length + 1})`
              : b.kind === 'list'
                ? `${b.ordered ? 'ol' : 'ul'}[${b.items.map((i) => i.level ?? 0).join('')}]`
                : b.kind === 'heading'
                  ? `h${b.level}`
                  : b.kind === 'paragraph'
                    ? 'p'
                    : b.kind === 'rule'
                      ? 'hr'
                      : b.kind
          ),
        // Each word and each space is its own PDF text item; collapse them.
        text: text.replace(/\s+/g, ' '),
        links: [...new Set(links)]
      }
    },
    { b64, name }
  )

  shapes[name] = out.shape.join(' ')

  check('title read from the document', out.title === 'Rich Fixture Document', out.title)
  check('named after the source file', out.pdfName === 'rich.pdf', out.pdfName)
  check(
    'structure: h1, h2s, h3s, both list kinds, table',
    out.shape.includes('h1') &&
      out.shape.filter((s) => s === 'h2').length === 3 &&
      out.shape.filter((s) => s === 'h3').length === 2 &&
      out.shape.some((s) => s.startsWith('ul[')) &&
      out.shape.some((s) => s.startsWith('ol[')),
    out.shape.join(' ')
  )
  // Five bullets: two top-level, two nested under the second, then back out.
  check('nested bullets kept their levels', out.shape.some((s) => s === 'ul[00110]'), out.shape.join(' '))
  check('table kept a header row + 3 body rows', out.shape.includes('table(3x4)'), out.shape.join(' '))
  check(
    'hyperlink survived into the PDF',
    out.links.includes('https://www.unisim.co.uk/pdf'),
    JSON.stringify(out.links)
  )
  check(
    'middle dot not flattened (UNI·SIM, not UNI*SIM)',
    out.text.includes('UNI·SIM'),
    out.text.slice(0, 0)
  )
  for (const phrase of EXPECTED_PHRASES) {
    check(`text on the page: ${JSON.stringify(phrase)}`, out.text.includes(phrase))
  }
}

console.log('\nboth formats')
check('the two parsers agree on structure', shapes['rich.docx'] === shapes['rich.odt'], `${shapes['rich.docx']} vs ${shapes['rich.odt']}`)

// ---- Page orientation -----------------------------------------------------
//
// James: "I imported a .doc file that had one page landscape and the rest
// portrait, I would like to preserve that."
//
// ⚠️ Asserted on the PAGE SIZES OF THE FINISHED PDF, not on the blocks the
// parser produced. Those are two different claims: the parser can emit a
// perfect `pagesetup` and the renderer still put it on the wrong page, or
// leave a blank sheet in front of it. Only the sizes pdf.js reads back are
// what the user actually gets — the same reason the Converter's naming tests
// assert `download.suggestedFilename()` rather than the store's computed name.
//
// Three fixtures carry the same three sections (portrait, landscape, portrait)
// said three different ways: hand-written OOXML, the same file re-saved by
// LibreOffice (which drops `w:orient` from the portrait sections entirely and
// writes it FIRST on the landscape one), and ODF, which does not have sections
// at all and expresses the change through master pages instead.
//
// ⚠️ These three do NOT discriminate between reading `w:orient` and reading the
// measurements — checked, 2026-08-20, by rewriting the parser to believe the
// label and watching all of them stay green. `orientation-contradictory.docx`
// below is the fixture that actually pins that rule down.
console.log('\npage orientation')
for (const name of ['orientation.docx', 'orientation-libre.docx', 'orientation.odt']) {
  const b64 = readFileSync(join(HERE, 'fixtures', name)).toString('base64')
  const out = await page.evaluate(async ({ b64, name }) => {
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const { convertOfficeFile } = await import('/src/lib/officeToPdf.ts')
    const conversion = await convertOfficeFile(new File([arr], name))
    const { loadPdf } = await import('/src/lib/pdfjs.ts')
    const doc = await loadPdf(new Uint8Array(await conversion.file.arrayBuffer())).promise
    const pages = []
    for (let p = 1; p <= doc.numPages; p++) {
      const vp = (await doc.getPage(p)).getViewport({ scale: 1 })
      const text = (await (await doc.getPage(p)).getTextContent()).items.map((i) => i.str).join(' ')
      pages.push({
        w: Math.round(vp.width),
        h: Math.round(vp.height),
        landscape: vp.width > vp.height,
        text: text.replace(/\s+/g, ' ').trim()
      })
    }
    return pages
  }, { b64, name })

  const shape = out.map((p) => `${p.landscape ? 'L' : 'P'}${p.w}x${p.h}`).join(' ')
  check(`${name}: three pages, one per section`, out.length === 3, shape)
  check(`${name}: portrait, landscape, portrait`,
    out.length === 3 && !out[0].landscape && out[1].landscape && !out[2].landscape, shape)
  // A4 at 595 x 842 pt. Not just "wider than tall" — a renderer that swapped in
  // some other paper would still satisfy that.
  check(`${name}: the landscape page is A4 on its side (842 x 595)`,
    out[1] && Math.abs(out[1].w - 842) <= 2 && Math.abs(out[1].h - 595) <= 2,
    out[1] && `${out[1].w} x ${out[1].h}`)
  check(`${name}: the portrait pages are upright A4 (595 x 842)`,
    out[0] && Math.abs(out[0].w - 595) <= 2 && Math.abs(out[0].h - 842) <= 2,
    out[0] && `${out[0].w} x ${out[0].h}`)
  // The blank-leading-page trap: a document that OPENS on a changed size must
  // resize its first page, not add one.
  check(`${name}: no blank page in front`, out[0] && /SECTION ONE/.test(out[0].text), out[0] && out[0].text.slice(0, 40))
  check(`${name}: the landscape page carries the landscape section's text`,
    out[1] && /SECTION TWO/.test(out[1].text) && !/SECTION ONE/.test(out[1].text),
    out[1] && out[1].text.slice(0, 40))
  check(`${name}: the last page is back to section three`,
    out[2] && /SECTION THREE/.test(out[2].text), out[2] && out[2].text.slice(0, 40))
}

// A section whose label and measurements disagree. The rule — the label decides
// which way round, the measurements decide the paper — is arbitrary enough that
// it needs to be written down somewhere that fails when someone changes it.
const contradictory = await page.evaluate(async ({ b64 }) => {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  const { convertOfficeFile } = await import('/src/lib/officeToPdf.ts')
  const conversion = await convertOfficeFile(new File([arr], 'orientation-contradictory.docx'))
  const { loadPdf } = await import('/src/lib/pdfjs.ts')
  const doc = await loadPdf(new Uint8Array(await conversion.file.arrayBuffer())).promise
  const vp = (await doc.getPage(1)).getViewport({ scale: 1 })
  return { w: Math.round(vp.width), h: Math.round(vp.height) }
}, { b64: readFileSync(join(HERE, 'fixtures', 'orientation-contradictory.docx')).toString('base64') })

check(
  'a section whose w:orient contradicts its w/h follows the LABEL (842 x 595)',
  Math.abs(contradictory.w - 842) <= 2 && Math.abs(contradictory.h - 595) <= 2,
  `${contradictory.w} x ${contradictory.h}`
)

// ---- Embedded pictures are drawn at the size their AUTHOR set ------------
//
// Backlog: "Embedded images from .docx/.odt — the parsers read text only."
// Half-stale by the time it was picked up (both readers already extracted the
// bitmaps and the writer already drew them) — the part that was still true is
// the SIZE. Every picture was drawn at its pixel count treated as points,
// clamped to the text column, so its resolution decided how big it appeared and
// the author's choice was ignored. A 600 dpi logo dropped in at half an inch
// filled the page.
//
// ⚠️ ASSERTED ON THE `cm` MATRIX IN THE FINISHED PDF, not on the block the
// reader produced. Those are different claims: the reader can carry a perfect
// `wp:extent` and the writer still draw at the old size, which is exactly the
// bug being fixed. pdf.js gives no image-placement API, and the writer emits
// uncompressed content streams (no /Filter — there is no deflate encoder in
// the package), so the operator can simply be read out of the bytes.
//
// The fixture's pixel counts and display sizes are far apart on purpose; see
// `fixtures/make-image-fixture.mjs`.
//
// ⚠️ NEEDS @unisim/doc >= 0.5.0, and says so rather than failing. The sizing
// lives in the package; this app installs it from npm by version. Publishing it
// needs a browser one-time password only James can complete (see the SDK item
// in the backlog), so between the code landing and the publish happening the
// installed copy is the old one — and a suite that went red for that would be
// reporting the publish queue, not a regression.
console.log('\nembedded picture sizing')
const sizingSupported = await page.evaluate(async () => {
  const mod = await import('/node_modules/@unisim/doc/dist/index.js')
  return typeof mod.emuToPoints === 'function'
})
if (!sizingSupported) {
  console.log('  – skipped: the installed @unisim/doc predates 0.5.0 (run packages/publish.sh doc minor)')
}
for (const name of sizingSupported ? ['image-size.docx', 'image-size.odt'] : []) {
  const b64 = readFileSync(join(HERE, 'fixtures', name)).toString('base64')
  const drawn = await page.evaluate(async ({ b64, name }) => {
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const { convertOfficeFile } = await import('/src/lib/officeToPdf.ts')
    const conversion = await convertOfficeFile(new File([arr], name))
    const bytes = new Uint8Array(await conversion.file.arrayBuffer())
    const pdf = new TextDecoder('latin1').decode(bytes)
    // `<w> 0 0 <h> <x> <y> cm` immediately before `/Im<n> Do` is how the writer
    // places every image, and the first two numbers are its size in points.
    return [...pdf.matchAll(/([\d.]+) 0 0 ([\d.]+) [-\d.]+ [-\d.]+ cm\s*\/Im\d+ Do/g)]
      .map((m) => ({ w: Number(m[1]), h: Number(m[2]) }))
  }, { b64, name })

  const near = (a, b) => a !== undefined && Math.abs(a - b) <= 1
  const shape = JSON.stringify(drawn)

  check(`${name}: both pictures made it onto the page`, drawn.length === 2, shape)
  // 1.5in x 1in = 108 x 72 pt. Its pixels are 300 x 200, so the old rule would
  // have drawn it at 300 x 200 — nearly three times too big.
  check(`${name}: a 300x200 px picture placed at 1.5in x 1in draws 108 x 72 pt`,
    near(drawn[0]?.w, 108) && near(drawn[0]?.h, 72), shape)
  // 0.5in = 36 pt. Its pixels are 2000 x 2000, so the old rule clamped it to
  // the full 451 pt text column — the high-resolution-logo case.
  check(`${name}: a 2000x2000 px logo placed at 0.5in draws 36 x 36 pt, not column width`,
    near(drawn[1]?.w, 36) && near(drawn[1]?.h, 36), shape)
  // Guards the fallback: a declared size must never be mistaken for the pixel
  // count, and 2000 pt would not fit on A4 in the first place.
  check(`${name}: no picture was drawn at its pixel count`,
    drawn.every((d) => d.w < 200), shape)
}

// A .doc is not a .docx, and the refusal has to say something useful.
const legacy = await page.evaluate(async () => {
  const bytes = new Uint8Array(520)
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  const { convertOfficeFile } = await import('/src/lib/officeToPdf.ts')
  try {
    await convertOfficeFile(new File([bytes], 'legacy.doc'))
    return '(no error)'
  } catch (err) {
    return String(err?.message ?? err)
  }
})
console.log('\nlegacy formats')
check('a .doc is refused with advice, not a shrug', /save it as \.docx/i.test(legacy), legacy)

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
