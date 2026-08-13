// Word / OpenDocument import — browser-level regression check.
//
//   npm run dev            # in one terminal
//   npm run test:e2e       # in another
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
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173/'

// Sibling repos that carry a Playwright install, newest-known first.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js'
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    try {
      return (await import(pathToFileURL(join(HERE, rel)).href)).default
    } catch {
      /* try the next one */
    }
  }
  console.error(
    'Playwright not found. Install it in a sibling Universal app (e.g. Universal_Beam),\n' +
      'or run: npm i -D playwright && npx playwright install chromium'
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

      const { openZip } = await import('/src/lib/unzip.ts')
      const zip = await openZip(arr.buffer)
      const parser = name.endsWith('.odt')
        ? (await import('/src/lib/odtToBlocks.ts')).odtToBlocks
        : (await import('/src/lib/docxToBlocks.ts')).docxToBlocks
      const { blocks, title } = await parser(zip)

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
        shape: blocks.map((b) =>
          b.kind === 'table'
            ? `table(${b.header.length}x${b.rows.length + 1})`
            : b.kind === 'ul' || b.kind === 'ol'
              ? `${b.kind}[${b.items.map((i) => i.level ?? 0).join('')}]`
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
