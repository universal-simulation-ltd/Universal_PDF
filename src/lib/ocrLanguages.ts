// Which language OCR reads a scan in.
//
// Tesseract reads one script/language per model, and reading a Japanese scan
// with the English model produces confident nonsense — so the OCR dialog asks,
// defaulting to the document's own language (its /Lang, when the PDF says) and
// otherwise to the app's.
//
// Every model is DATA, fetched on demand from the same place as the English one
// always was — tesseract.js's default, jsDelivr's `@tesseract.js-data/<code>`
// packages (the "best_int" LSTM models, 0.7–3 MB each) — then cached by
// tesseract (IndexedDB) and the service worker. Nothing ships in the app.
//
// ⚠️ This file imports NOTHING, so `scripts/ocrLanguages.test.mjs` can load it
// under Node's type-stripping.

export interface OcrLanguage {
  /** Tesseract's model name. */
  code: string
  /** The language's name in itself — the picker shows these, untranslated, so
   *  a reader finds their own language whatever the app is set to. */
  label: string
}

export const OCR_LANGUAGES: readonly OcrLanguage[] = [
  { code: 'eng', label: 'English' },
  { code: 'fra', label: 'Français' },
  { code: 'spa', label: 'Español' },
  { code: 'ita', label: 'Italiano' },
  { code: 'deu', label: 'Deutsch' },
  { code: 'por', label: 'Português' },
  { code: 'tur', label: 'Türkçe' },
  { code: 'jpn', label: '日本語' },
  { code: 'chi_sim', label: '简体中文' },
  { code: 'chi_tra', label: '繁體中文' },
  { code: 'kor', label: '한국어' },
]

const BY_BASE: Record<string, string> = {
  en: 'eng',
  fr: 'fra',
  es: 'spa',
  it: 'ita',
  de: 'deu',
  pt: 'por',
  tr: 'tur',
  ja: 'jpn',
  ko: 'kor',
}

/**
 * The Tesseract model for a BCP 47 tag (`ja-JP`, `zh-Hant-TW`, `pt-BR`), or
 * null for a language there is no model for here.
 *
 * Chinese is split by SCRIPT, not country: `zh-Hant`, or Taiwan, Hong Kong and
 * Macau without a script, read Traditional; everything else Simplified.
 */
export function ocrLanguageFor(tag: string | null | undefined): string | null {
  if (!tag) return null
  const parts = tag.trim().replace(/_/g, '-').toLowerCase().split('-').filter(Boolean)
  if (parts.length === 0) return null
  const [base, ...rest] = parts
  if (base === 'zh') {
    if (rest.includes('hant')) return 'chi_tra'
    if (rest.includes('hans')) return 'chi_sim'
    if (rest.some((p) => p === 'tw' || p === 'hk' || p === 'mo')) return 'chi_tra'
    return 'chi_sim'
  }
  return BY_BASE[base] ?? null
}

/** The picker's starting choice: the document's language, then the app's, then English. */
export function defaultOcrLanguage(documentLang: string | null | undefined, uiLang: string): string {
  return ocrLanguageFor(documentLang) ?? ocrLanguageFor(uiLang) ?? 'eng'
}


/**
 * True when `models` (`'jpn'`, `'chi_sim+eng'`…) reads Japanese or Chinese —
 * scripts written without spaces, whose text layer is laid out per LINE.
 *
 * ⚠️ Tesseract's LSTM gives Japanese and Chinese WORD boxes that drift by up
 * to a character (measured 2026-10-04: 検索 boxed at 479–567 px where the
 * glyphs sit at 430–522), while the LINE box is right. Laying each word on its
 * own box put a search highlight one character off; spreading the line's text
 * evenly across the line's box puts it on the glyphs, because these scripts
 * are set in equal-width cells. Korean and Latin word boxes are accurate and
 * stay per word.
 */
export function laysOutByLine(models: string): boolean {
  return models.split('+').some((m) => m === 'jpn' || m === 'chi_sim' || m === 'chi_tra')
}

const CJK_CHAR = /[⺀-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/

/**
 * One line's words as one string: no space between two CJK characters (the
 * script has none — Tesseract's own line text inserts them, which would stop
 * "検索" matching across a word boundary), a space anywhere else (a Latin word
 * inside a Japanese line keeps its spacing).
 */
export function joinLineWords(words: string[]): string {
  let out = ''
  for (const raw of words) {
    const w = raw.trim()
    if (!w) continue
    if (out && !(CJK_CHAR.test(out[out.length - 1]) && CJK_CHAR.test(w[0]))) out += ' '
    out += w
  }
  return out
}
