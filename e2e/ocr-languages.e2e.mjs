// OCR in the reader's language — Japanese, Chinese, Korean and the rest.
//
//   npm run dev                       # or serve a build; set E2E_BASE_URL
//   npm run test:ocr-languages        # needs the network: the models come
//                                     # from jsDelivr on first use
//
// What is pinned (James, 2026-10-04: "OCR for Japanese, Chinese and Korean
// scans … a language picker in the OCR flow that defaults to the document or
// UI language"):
//
//   • The OCR dialog asks which language to read BEFORE it downloads anything,
//     and starts on the document's own /Lang when it has one, otherwise on the
//     app's language.
//   • A Japanese scan read as Japanese comes out with Japanese text that can be
//     found and copied. ⚠️ Before this, the text layer was Helvetica, which can
//     only encode Latin-1: every CJK character was silently DROPPED, so even a
//     perfect read left nothing to search. Turkish lost ğ ş ı İ the same way —
//     the Turkish scan below is the check for that.
//   • English still works, and its words still have spaces between them.
//
// The "scans" are real pictures of text, drawn by the browser and embedded in
// a PDF as images with no text at all, so the only way any text gets into the
// output is OCR.

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

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()

// ── Fixtures: pictures of text, as image-only PDFs ──────────────────────────
async function textPicture(lines, fontFamily) {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  const png = await p.evaluate(
    ({ lines, fontFamily }) => {
      const c = document.createElement('canvas')
      c.width = 1700
      c.height = 2200
      const g = c.getContext('2d')
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.fillStyle = '#111'
      g.font = `64px ${fontFamily}`
      lines.forEach((l, i) => g.fillText(l, 150, 300 + i * 130))
      return c.toDataURL('image/png').split(',')[1]
    },
    { lines, fontFamily },
  )
  await ctx.close()
  return Buffer.from(png, 'base64')
}

async function scanPdf(png, lang) {
  const { PDFDocument, PDFString, PDFName } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const img = await doc.embedPng(png)
  const page = doc.addPage([612, 792])
  page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 })
  if (lang) doc.catalog.set(PDFName.of('Lang'), PDFString.of(lang))
  return Buffer.from(await doc.save())
}

async function pdfText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise
  let out = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    out += tc.items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join('')
  }
  await doc.destroy()
  return out
}

// ── Driving the app ─────────────────────────────────────────────────────────
async function openOcr(page, name, pdf) {
  await page.setInputFiles('input[type=file]', { name, mimeType: 'application/pdf', buffer: pdf })
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(500)
  // `$="Profile"` would miss the French label ("… · Profil").
  await page.hover('button[aria-label*="Profil"]')
  await page.waitForTimeout(400)
  await page.locator('button[aria-haspopup="true"][aria-expanded]').filter({ hasText: /Advanced|Avancé/ }).first().click()
  await page.waitForTimeout(200)
  await page.locator('text=/Make searchable \\(OCR\\)|Rendre interrogeable/').first().click()
  await page.waitForSelector('[data-testid="ocr-language"]', { timeout: 10000 })
  // The document's /Lang is read asynchronously; give it a moment to land.
  await page.waitForTimeout(800)
}

async function runOcr(page, model) {
  if (model) await page.selectOption('[data-testid="ocr-language"]', model)
  await page.getByRole('button', { name: 'Make searchable', exact: true }).click()
  const done = page.getByRole('button', { name: /Download$/ })
  try {
    await done.waitFor({ timeout: 180000 })
  } catch (e) {
    const shot = join(HERE, '..', 'e2e-ocr-failure.png')
    await page.screenshot({ path: shot })
    console.log(`    no result — screenshot at ${shot}`)
    throw e
  }
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), done.click()])
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  return readFileSync(path)
}

async function freshPage(locale = 'en-GB') {
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 }, locale, acceptDownloads: true })
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`    console: ${m.text().slice(0, 300)}`)
  })
  try {
    await page.goto(BASE, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  return { context, page }
}

const strip = (s) => s.replace(/\s+/g, '')

// ── Japanese, defaulted from the document's /Lang ───────────────────────────
console.log('\na Japanese scan that says it is Japanese')
{
  const png = await textPicture(['日本語の文書を検索できます', '東京都千代田区'], '"Hiragino Sans", "Noto Sans CJK JP", sans-serif')
  const pdf = await scanPdf(png, 'ja-JP')
  check('the fixture has no text of its own', strip(await pdfText(pdf)) === '')
  const { context, page } = await freshPage()
  await openOcr(page, 'jp-scan.pdf', pdf)
  check(
    'the picker starts on 日本語, from the document’s /Lang',
    (await page.inputValue('[data-testid="ocr-language"]')) === 'jpn',
    await page.inputValue('[data-testid="ocr-language"]'),
  )
  const out = await runOcr(page, null)
  const text = strip(await pdfText(out))
  console.log(`    read: ${text}`)
  check('the output carries Japanese text', /[぀-ヿ一-鿿]{6,}/.test(text), text)
  check('including whole words from the scan', /日本語/.test(text) && /検索/.test(text), text)
  check('and the address line', /東京/.test(text) && /千代田/.test(text), text)

  // Find lands ON the word in the picture. Tesseract's Japanese WORD boxes
  // drift by up to a character, so the layer is laid out per line; this is
  // the check that it is. 検索 is characters 7–8 of a 64 px line that starts
  // at x = 150 on a 1700 px scan.
  await page.getByRole('button', { name: 'Open searchable PDF' }).click()
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.keyboard.press('Control+f')
  await page.waitForTimeout(300)
  await page.keyboard.type('検索')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-search-active]', { timeout: 10000 }).catch(() => {})
  const geo = await page.evaluate(() => {
    const hit = document.querySelector('[data-search-active]')?.getBoundingClientRect()
    const pg = document.querySelector('[data-page-index="0"] canvas')?.getBoundingClientRect()
    return hit && pg ? { from: (hit.left - pg.left) / pg.width, to: (hit.right - pg.left) / pg.width } : null
  })
  const want = { from: (150 + 7 * 64) / 1700, to: (150 + 9 * 64) / 1700 }
  check(
    'Find highlights 検索 where it is on the scan',
    !!geo && Math.abs(geo.from - want.from) < 0.012 && Math.abs(geo.to - want.to) < 0.012,
    JSON.stringify({ geo, want }),
  )
  await context.close()
}

// ── Chinese (both scripts) and Korean ───────────────────────────────────────
const CJK = [
  { name: 'Simplified Chinese, from /Lang zh-CN', lang: 'zh-CN', model: null, expect: 'chi_sim',
    lines: ['简体中文文档可以搜索', '北京市海淀区'], font: '"PingFang SC", "Noto Sans CJK SC", sans-serif', words: ['中文', '搜索', '北京'] },
  { name: 'Traditional Chinese, from /Lang zh-TW', lang: 'zh-TW', model: null, expect: 'chi_tra',
    lines: ['繁體中文文件可以搜尋', '臺北市中正區'], font: '"PingFang TC", "Noto Sans CJK TC", sans-serif', words: ['繁體', '搜尋', '臺北'] },
  { name: 'Korean, picked by hand', lang: null, model: 'kor', expect: 'eng',
    lines: ['한국어 문서를 검색할 수 있습니다', '서울특별시 종로구'], font: '"Apple SD Gothic Neo", "Noto Sans CJK KR", sans-serif', words: ['한국어', '검색', '서울'] },
]
for (const c of CJK) {
  console.log(`\n${c.name}`)
  const png = await textPicture(c.lines, c.font)
  const pdf = await scanPdf(png, c.lang)
  const { context, page } = await freshPage()
  await openOcr(page, 'cjk-scan.pdf', pdf)
  const start = await page.inputValue('[data-testid="ocr-language"]')
  check(`the picker starts on ${c.expect}`, start === c.expect, start)
  const text = strip(await pdfText(await runOcr(page, c.model)))
  console.log(`    read: ${text}`)
  for (const w of c.words) check(`finds “${w}”`, text.includes(w), text)
  await context.close()
}

// ── Turkish, chosen by hand ─────────────────────────────────────────────────
console.log('\na Turkish scan keeps ğ ş ı İ (Helvetica used to drop them)')
{
  const png = await textPicture(['Güneşli ağaçların ışığı', 'İstanbul Büyükşehir'], 'Arial, Helvetica, sans-serif')
  const pdf = await scanPdf(png, null)
  const { context, page } = await freshPage()
  await openOcr(page, 'tr-scan.pdf', pdf)
  check(
    'with no /Lang, the picker starts on the app’s language',
    (await page.inputValue('[data-testid="ocr-language"]')) === 'eng',
  )
  const out = await runOcr(page, 'tur')
  const text = await pdfText(out)
  console.log(`    read: ${text.replace(/\s+/g, ' ').trim()}`)
  check('ğ, ş and ı survive', /ğ/.test(text) && /ş/.test(text) && /ı/.test(text), text)
  check('and İ', /İ/.test(text), text)
  await context.close()
}

// ── English, unchanged ──────────────────────────────────────────────────────
console.log('\nan English scan still reads, with its spaces')
{
  const png = await textPicture(['Quarterly invoice for services', 'Total due within thirty days'], 'Arial, Helvetica, sans-serif')
  const pdf = await scanPdf(png, 'en-GB')
  const { context, page } = await freshPage()
  await openOcr(page, 'en-scan.pdf', pdf)
  const out = await runOcr(page, null)
  const text = (await pdfText(out)).replace(/\s+/g, ' ')
  console.log(`    read: ${text.trim()}`)
  check('the words are there', /Quarterly invoice/i.test(text) && /thirty days/i.test(text), text)
  await context.close()
}

// ── The app's language is the fallback ──────────────────────────────────────
console.log('\nin a French browser, a scan with no /Lang starts on Français')
{
  const png = await textPicture(['Bonjour'], 'Arial, sans-serif')
  const pdf = await scanPdf(png, null)
  const { context, page } = await freshPage('fr-FR')
  await page.waitForTimeout(800)
  await openOcr(page, 'fr-scan.pdf', pdf)
  check(
    'the picker starts on fra',
    (await page.inputValue('[data-testid="ocr-language"]')) === 'fra',
    await page.inputValue('[data-testid="ocr-language"]'),
  )
  const labels = await page.locator('[data-testid="ocr-language"] option').allInnerTexts()
  check('and offers 日本語, 简体中文, 繁體中文 and 한국어', ['日本語', '简体中文', '繁體中文', '한국어'].every((l) => labels.includes(l)), labels.join(', '))
  await context.close()
}

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
