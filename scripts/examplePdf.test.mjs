// The example PDF — the three-page feature tour — in every language.
//
//   npm run test:example
//
// What is pinned (James, 2026-10-18: "update the example PDF with all the new
// features explained"): it is written in the app's language; no translation
// runs off a page, into the footer or over the form; the six form fields keep
// their names; three pages, each saying "n of 3"; and Turkish, which Helvetica
// can't spell, gets the Unicode face rather than question marks.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

import { makeBasicTranslator, registerLanguages } from '../src/i18n/runtime.ts'
import { buildExamplePdf, EXAMPLE_PAGES } from '../src/lib/examplePdf.ts'
import { de } from '../src/i18n/de/index.ts'
import { es } from '../src/i18n/es/index.ts'
import { fr } from '../src/i18n/fr/index.ts'
import { it as itLang } from '../src/i18n/it/index.ts'
import { ptBR } from '../src/i18n/pt-BR/index.ts'
import { ptPT } from '../src/i18n/pt-PT/index.ts'
import { tr } from '../src/i18n/tr/index.ts'

registerLanguages({ de, es, fr, it: itLang, 'pt-BR': ptBR, 'pt-PT': ptPT, tr })
const LANGS = ['en', 'de', 'es', 'fr', 'it', 'pt-PT', 'pt-BR', 'tr']
const FONT = new URL('../public/fonts/LiberationSans-Regular.ttf', import.meta.url)
const loadUnicodeFont = async () => new Uint8Array(readFileSync(FONT))
const FIELDS = ['example_name', 'example_email', 'example_company', 'example_date', 'example_role', 'example_phone']

/** Every font a page's text is drawn in, by BaseFont name. */
function pageFonts(page) {
  const res = page.node.Resources()
  const fonts = res?.lookupMaybe(PDFName.of('Font'), PDFDict)
  if (!fonts) return []
  return fonts.keys().map((k) => fonts.lookup(k, PDFDict).lookup(PDFName.of('BaseFont')).toString())
}

for (const lang of LANGS) {
  test(`${lang}: fits on its pages and keeps the form`, async () => {
    const built = await buildExamplePdf({ t: makeBasicTranslator(lang), loadUnicodeFont })
    assert.deepEqual(built.overflows, [], built.overflows.join('\n'))
    const doc = await PDFDocument.load(built.bytes)
    assert.equal(doc.getPageCount(), EXAMPLE_PAGES)
    assert.deepEqual(doc.getForm().getFields().map((f) => f.getName()).sort(), [...FIELDS].sort())
    // The fields sit exactly where they always have, whatever the language
    // (pdf-lib grows each widget by its 1pt border).
    const rects = Object.fromEntries(doc.getForm().getFields().map((f) => {
      const r = f.acroField.getWidgets()[0].getRectangle()
      return [f.getName(), [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100)]
    }))
    assert.deepEqual(rects, {
      example_name: [59.5, 566.39, 201, 19],
      example_email: [279.5, 566.39, 216, 19],
      example_company: [59.5, 506.39, 201, 19],
      example_date: [279.5, 506.39, 216, 19],
      example_role: [59.5, 446.39, 201, 19],
      example_phone: [279.5, 446.39, 216, 19],
    })
    // Each field is named in the language, on its widget, where pdf.js reads it.
    const tu = doc.getForm().getTextField('example_name').acroField.getWidgets()[0].dict.lookup(PDFName.of('TU'))
    assert.equal(tu?.decodeText(), makeBasicTranslator(lang)('example.f_name'))
    // Turkish needs the Unicode face; everything else stays in Helvetica.
    assert.equal(built.unicodeFont, lang === 'tr')
    if (lang === 'tr') assert.ok(pageFonts(doc.getPage(0)).some((f) => /Liberation/.test(f)), pageFonts(doc.getPage(0)).join())
  })
}

test('a translation too long for its page is caught', async () => {
  const en = makeBasicTranslator('en')
  const t = Object.assign((key, vars) => (key === 'example.bo_body' ? en(key, vars).repeat(12) : en(key, vars)), { plural: en.plural, lang: 'en' })
  const built = await buildExamplePdf({ t, loadUnicodeFont })
  assert.ok(built.overflows.some((o) => /page 1/.test(o)), built.overflows.join('\n'))
})

test('without the Unicode face, Turkish folds to Latin letters rather than failing', async () => {
  const built = await buildExamplePdf({ t: makeBasicTranslator('tr'), loadUnicodeFont: async () => null })
  assert.equal(built.unicodeFont, false)
  assert.deepEqual(built.overflows, [])
  const doc = await PDFDocument.load(built.bytes)
  assert.equal(doc.getPageCount(), EXAMPLE_PAGES)
  // Drawn, not refused: the page content carries the folded words.
  const contents = doc.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents]
  const text = streams.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '')).join('')
  assert.ok(text.length > 1000)
})
