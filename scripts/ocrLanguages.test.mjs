// Which Tesseract model a language tag reads with.
//
//   npm run test:ocr-langs

import assert from 'node:assert/strict'
import test from 'node:test'
import { OCR_LANGUAGES, defaultOcrLanguage, ocrLanguageFor } from '../src/lib/ocrLanguages.ts'

test('the app languages map to their models', () => {
  assert.equal(ocrLanguageFor('en-GB'), 'eng')
  assert.equal(ocrLanguageFor('fr'), 'fra')
  assert.equal(ocrLanguageFor('pt-BR'), 'por')
  assert.equal(ocrLanguageFor('pt_PT'), 'por')
  assert.equal(ocrLanguageFor('tr-TR'), 'tur')
})

test('Japanese and Korean', () => {
  assert.equal(ocrLanguageFor('ja-JP'), 'jpn')
  assert.equal(ocrLanguageFor('ko'), 'kor')
})

test('Chinese splits by script, then by region', () => {
  assert.equal(ocrLanguageFor('zh'), 'chi_sim')
  assert.equal(ocrLanguageFor('zh-CN'), 'chi_sim')
  assert.equal(ocrLanguageFor('zh-Hans-HK'), 'chi_sim')
  assert.equal(ocrLanguageFor('zh-Hant'), 'chi_tra')
  assert.equal(ocrLanguageFor('zh-TW'), 'chi_tra')
  assert.equal(ocrLanguageFor('zh-HK'), 'chi_tra')
})

test('unknown or empty is null', () => {
  assert.equal(ocrLanguageFor('xx'), null)
  assert.equal(ocrLanguageFor(''), null)
  assert.equal(ocrLanguageFor(null), null)
})

test('the default is the document, then the app, then English', () => {
  assert.equal(defaultOcrLanguage('ja', 'fr'), 'jpn')
  assert.equal(defaultOcrLanguage(null, 'de'), 'deu')
  assert.equal(defaultOcrLanguage('xx-YY', 'tr'), 'tur')
  assert.equal(defaultOcrLanguage(null, 'xx'), 'eng')
})

test('every model the picker offers is one ocrLanguageFor can land on, or English', () => {
  const codes = new Set(OCR_LANGUAGES.map((l) => l.code))
  for (const tag of ['en', 'fr', 'es', 'it', 'de', 'pt', 'tr', 'ja', 'ko', 'zh', 'zh-TW']) {
    assert.ok(codes.has(ocrLanguageFor(tag)), tag)
  }
})

import { joinLineWords, laysOutByLine } from '../src/lib/ocrLanguages.ts'

test('Japanese and Chinese lay out per line; Korean and Latin per word', () => {
  assert.equal(laysOutByLine('jpn'), true)
  assert.equal(laysOutByLine('chi_tra+eng'), true)
  assert.equal(laysOutByLine('kor'), false)
  assert.equal(laysOutByLine('eng'), false)
})

test('a CJK line joins without spaces, but keeps them around Latin words', () => {
  assert.equal(joinLineWords(['简体', '中', '文', '文档']), '简体中文文档')
  assert.equal(joinLineWords(['PDF', 'を', '検索']), 'PDF を検索')
  assert.equal(joinLineWords(['Universal', 'PDF', 'で']), 'Universal PDF で')
  assert.equal(joinLineWords(['', ' 日本 ', '語']), '日本語')
})
