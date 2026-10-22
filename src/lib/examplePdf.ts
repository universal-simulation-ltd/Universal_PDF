// ---------------------------------------------------------------------------
// The example PDF: a three-page feature tour, made on the device with pdf-lib
// in the app's language (James, 2026-10-18: "update the example PDF with all
// the new features explained").
//
// Every word of it must be true in the phone app AND on the website, so the
// text says "tap or click" and each section ends with a small "where" line
// built from the app's OWN button names (`phone.*`, `viewer.toolbar.*`,
// `menu.*`), so a renamed button can never leave the tour pointing at nothing.
// Each page leaves room to try things: a line to highlight, a box for a sticky
// note (running off the page edge, so a note can hang over it), made-up
// details to black out, the form, blank lines for Text, a box to sign in and
// one for a picture or a QR code.
//
// ⚠️ THE FORM FIELDS ARE FIXED. `example_name` … `example_phone` sit exactly
// where they always have, whatever the language, and the page count stays 3.
//
// FONTS. Helvetica (WinAnsi) spells English, German, Spanish, French, Italian
// and Portuguese. Turkish needs ğ ş ı İ, which WinAnsi cannot encode, so a
// language whose strings don't fit draws everything in the Liberation Sans the
// app already ships for exports (`fallbackFont.ts`, fetched on demand, 350 KB,
// subset to a few KB here), with bold faked by a thin outline (text rendering
// mode 2). If that font can't be had (offline on the very first try on the
// website), the letters are folded to their nearest Latin-1 form (ş → s)
// rather than failing: a slightly mis-spelt tour beats no tour.
//
// `scripts/examplePdf.test.mjs` builds it in every language and fails if any
// text runs off the page, into the footer, or over the form.
// ---------------------------------------------------------------------------
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PageSizes,
  StandardFonts,
  TextRenderingMode,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineWidth,
  setStrokingColor,
  setTextRenderingMode,
  type Color,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import { getT, type BasicTranslator, type MessageKey, type Messages, type Vars } from '../i18n/runtime.ts'
import { en } from '../i18n/en/index.ts'
import { EXAMPLE_PAGES } from './exampleMeta.ts'

const ORANGE = rgb(0.92, 0.34, 0.06)
const ORANGE_LIGHT = rgb(1, 0.93, 0.85)
const SLATE_900 = rgb(0.06, 0.09, 0.16)
const SLATE_600 = rgb(0.34, 0.39, 0.46)
const SLATE_400 = rgb(0.58, 0.64, 0.72)
const SLATE_200 = rgb(0.89, 0.91, 0.93)
const SLATE_50 = rgb(0.97, 0.98, 0.99)
const YELLOW_50 = rgb(1, 0.98, 0.86)
const YELLOW_400 = rgb(0.9, 0.78, 0.35)
const BLUE_50 = rgb(0.94, 0.97, 1)
const BLUE_400 = rgb(0.38, 0.65, 0.98)
const WHITE = rgb(1, 1, 1)

export { EXAMPLE_PAGES }
const LEFT = 50
/** Nothing but the footer goes below this. */
const FLOOR = 80
const FOOTER_Y = 60

type ExampleKey = keyof Messages['example']

/** The app's own button and menu names the "where" lines are built from. */
const LABELS = [
  'phone.tool_markup', 'phone.mk_highlight', 'phone.mk_pen', 'phone.mk_shape', 'phone.mk_note', 'phone.mk_blackout',
  'phone.mk_text', 'phone.mk_picture', 'phone.mk_qr', 'phone.tool_sign', 'phone.tool_pages', 'phone.more_title',
  'viewer.toolbar.tool_highlighter', 'viewer.toolbar.tool_free_draw', 'viewer.toolbar.tool_sticky_note',
  'viewer.toolbar.tool_add_text', 'viewer.toolbar.upload_image', 'viewer.toolbar.add_qr_code', 'viewer.toolbar.export',
  'menu.actions', 'menu.redact', 'menu.free_draw', 'menu.advanced', 'menu.page_numbers', 'menu.word', 'menu.view',
  'menu.pages', 'sign.menu_sign',
] as const satisfies readonly MessageKey[]

export interface ExampleOptions {
  /** The language to write it in; the app's own by default. */
  t?: BasicTranslator
  /** The TrueType face for alphabets Helvetica can't spell; null when there is none to be had. */
  loadUnicodeFont?: () => Promise<Uint8Array | null>
}

export interface BuiltExample {
  bytes: Uint8Array
  /** Text that did not fit where it was meant to go, for the test. Empty when the layout is sound. */
  overflows: string[]
  /** Whether the Unicode face was embedded. */
  unicodeFont: boolean
}

/** Can Helvetica's WinAnsi encoding spell this? */
function encodable(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text)
    return true
  } catch {
    return false
  }
}

/** Every character WinAnsi can't spell, folded to its nearest Latin-1 letter. */
function foldTo(font: PDFFont, text: string): string {
  let out = ''
  for (const ch of text) {
    if (encodable(font, ch)) out += ch
    else {
      const folded = ch === 'ı' ? 'i' : ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
      out += folded && encodable(font, folded) ? folded : '?'
    }
  }
  return out
}

export async function buildExamplePdf(opts: ExampleOptions = {}): Promise<BuiltExample> {
  const t = opts.t ?? getT()
  // French puts a narrow no-break space before ? and :, which WinAnsi lacks;
  // its plain no-break space keeps the words together just the same.
  const thin = (s: string) => s.replace(/[\u2007\u2009\u202f]/g, '\u00a0')
  const E = (k: ExampleKey, vars?: Vars) => thin(t(`example.${k}` as MessageKey, vars))
  const T = (k: (typeof LABELS)[number]) => thin(t(k))

  const pdf = await PDFDocument.create()
  pdf.setTitle(E('header'))
  pdf.setLanguage(t.lang)
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const form = pdf.getForm()

  // One font for the whole document: Helvetica when every string of this
  // language fits it, otherwise the Unicode face for all of it, so a page never
  // mixes two typefaces.
  const everything = [
    ...(Object.keys(en.example) as ExampleKey[]).map((k) => E(k, { n: 1, total: EXAMPLE_PAGES })),
    ...LABELS.map((k) => T(k)),
  ].join(' ')
  let regular: PDFFont = helv
  let bold: PDFFont = helvBold
  let fakeBold = false
  let fold = (s: string) => s
  let unicodeFont = false
  if (!encodable(helv, everything)) {
    const bytes = opts.loadUnicodeFont ? await opts.loadUnicodeFont().catch(() => null) : null
    let face: PDFFont | null = null
    if (bytes) {
      try {
        const { default: fontkit } = await import('@pdf-lib/fontkit')
        pdf.registerFontkit(fontkit)
        face = await pdf.embedFont(bytes, { subset: true })
      } catch {
        face = null
      }
    }
    if (face) {
      regular = face
      bold = face
      fakeBold = true
      unicodeFont = true
    } else {
      fold = (s) => foldTo(helv, s)
    }
  }

  const overflows: string[] = []
  const W = PageSizes.A4[0]
  const H = PageSizes.A4[1]
  const RIGHT = W - 50
  const CONTENT = RIGHT - LEFT

  // ── text ──────────────────────────────────────────────────────────────────
  interface TextStyle {
    size: number
    bold?: boolean
    color?: Color
  }
  const fontOf = (s: TextStyle) => (s.bold ? bold : regular)
  const widthOf = (text: string, s: TextStyle) => fontOf(s).widthOfTextAtSize(fold(text), s.size)

  function draw(page: PDFPage, text: string, x: number, y: number, s: TextStyle) {
    const color = s.color ?? SLATE_900
    const font = fontOf(s)
    const embolden = s.bold && fakeBold
    if (embolden) page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(s.size * 0.055), setStrokingColor(color))
    page.drawText(fold(text), { x, y, size: s.size, font, color })
    if (embolden) page.pushOperators(popGraphicsState())
  }

  /** The words broken into lines no wider than `width`. */
  function wrap(text: string, width: number, s: TextStyle): string[] {
    const lines: string[] = []
    let line = ''
    // Split on single spaces, so a run of them (the gap round the · in a
    // "where" line) survives inside a line; a line never starts with one.
    for (const word of text.trim().split(' ')) {
      if (!line && !word) continue
      const next = line ? `${line} ${word}` : word
      if (!line || widthOf(next, s) <= width) {
        line = next
        continue
      }
      lines.push(line.trimEnd())
      line = word
    }
    if (line) lines.push(line.trimEnd())
    return lines
  }

  /** The largest size up to `s.size` at which `text` fits on one line of `width`. */
  function fitSize(text: string, width: number, s: TextStyle, min = 6): number {
    let size = s.size
    while (size > min && widthOf(text, { ...s, size }) > width) size -= 0.25
    return size
  }

  function check(what: string, page: number, y: number, floor = FLOOR) {
    if (y < floor) overflows.push(`${t.lang} page ${page}: "${what}" runs down to y=${y.toFixed(1)}, below ${floor}`)
  }

  /**
   * A paragraph from `y` (the first baseline) down; returns the baseline of the
   * line AFTER it, so the next block can start there.
   */
  function para(page: PDFPage, pageNum: number, text: string, x: number, y: number, width: number, s: TextStyle, lead = s.size * 1.38, floor = FLOOR): number {
    const lines = wrap(text, width, s)
    for (const l of lines) {
      if (widthOf(l, s) > width + 0.5) overflows.push(`${t.lang} page ${pageNum}: the word "${l}" is wider than its column`)
      draw(page, l, x, y, s)
      check(l, pageNum, y, floor)
      y -= lead
    }
    return y
  }

  // ── furniture ─────────────────────────────────────────────────────────────
  function newPage(pageNum: number, subtitle: string, title: string, tip: string) {
    const page = pdf.addPage(PageSizes.A4)
    page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: SLATE_900 })
    page.drawCircle({ x: 55, y: H - 35, size: 13, color: ORANGE })
    page.drawText('U', { x: 50, y: H - 41, size: 16, font: helvBold, color: WHITE })
    const head = E('header')
    draw(page, head, 80, H - 32, { size: fitSize(head, RIGHT - 80, { size: 16, bold: true }), bold: true, color: WHITE })
    draw(page, subtitle, 80, H - 52, { size: fitSize(subtitle, RIGHT - 80, { size: 9 }), color: rgb(0.82, 0.86, 0.91) })

    draw(page, title, LEFT, H - 110, { size: fitSize(title, CONTENT, { size: 22, bold: true }), bold: true })
    page.drawLine({ start: { x: LEFT, y: H - 124 }, end: { x: RIGHT, y: H - 124 }, thickness: 1, color: SLATE_200 })

    const label = E('page_of', { n: pageNum, total: EXAMPLE_PAGES })
    const labelW = widthOf(label, { size: 9, bold: true })
    draw(page, label, RIGHT - labelW, FOOTER_Y, { size: 9, bold: true, color: SLATE_400 })
    const tipRoom = CONTENT - labelW - 16
    draw(page, tip, LEFT, FOOTER_Y, { size: fitSize(tip, tipRoom, { size: 9 }), color: SLATE_400 })
    page.drawLine({ start: { x: LEFT, y: FOOTER_Y + 14 }, end: { x: RIGHT, y: FOOTER_Y + 14 }, thickness: 0.5, color: SLATE_200 })
    return page
  }

  const BODY: TextStyle = { size: 10, color: SLATE_600 }
  const WHERE: TextStyle = { size: 8, color: SLATE_400 }
  const path = (...parts: string[]) => parts.join(' › ')
  const whereBoth = (phone: string, web: string) => E('where_both', { phone, web })
  const whereWeb = (web: string) => E('where_web', { web })

  /** A section: an orange tick, a bold title, the words, and where to find it. Returns the y after it. */
  function section(page: PDFPage, pageNum: number, y: number, title: string, body: string, where: string | null, x = LEFT, width = CONTENT): number {
    page.drawRectangle({ x, y: y - 2, width: 3, height: 13, color: ORANGE })
    draw(page, title, x + 10, y, { size: fitSize(title, width - 10, { size: 12, bold: true }), bold: true })
    check(title, pageNum, y)
    y -= 16
    y = para(page, pageNum, body, x + 10, y, width - 10, BODY)
    if (where) y = para(page, pageNum, where, x + 10, y + 2, width - 10, WHERE, 11) - 2
    return y
  }

  /** A small "Try it here" tag over a practice area. */
  function tryTag(page: PDFPage, x: number, y: number) {
    const label = E('try_here')
    const s: TextStyle = { size: 7.5, bold: true, color: ORANGE }
    const w = widthOf(label, s) + 10
    page.drawRectangle({ x, y: y - 3.5, width: w, height: 12, color: WHITE, borderColor: ORANGE, borderWidth: 0.75 })
    draw(page, label, x + 5, y, s)
    return w
  }

  // ==========================================================================
  // Page 1 — welcome, and mark it up
  // ==========================================================================
  {
    const n = 1
    const page = newPage(n, E('p1_sub'), E('p1_title'), E('p1_tip'))
    let y = H - 146
    y = para(page, n, E('p1_intro'), LEFT, y, CONTENT, { size: 10.5, color: SLATE_600 }, 15)

    // The contents, on a light orange card.
    y -= 6
    const toc = [E('p1_toc1'), E('p1_toc2'), E('p1_toc3')]
    const tagW = Math.max(...[1, 2, 3].map((i) => widthOf(E('page_tag', { n: i }), { size: 9.5, bold: true }))) + 12
    const tocLines = toc.map((line) => wrap(line, CONTENT - 28 - tagW, { size: 9.5 }))
    const cardH = 30 + tocLines.reduce((h, ls) => h + ls.length * 13 + 3, 0)
    page.drawRectangle({ x: LEFT, y: y - cardH, width: CONTENT, height: cardH, color: ORANGE_LIGHT, borderColor: ORANGE, borderWidth: 0.75 })
    draw(page, E('p1_contents'), LEFT + 14, y - 17, { size: 11, bold: true })
    let ty = y - 34
    tocLines.forEach((ls, i) => {
      draw(page, E('page_tag', { n: i + 1 }), LEFT + 14, ty, { size: 9.5, bold: true, color: ORANGE })
      for (const l of ls) {
        draw(page, l, LEFT + 14 + tagW, ty, { size: 9.5 })
        ty -= 13
      }
      ty -= 3
    })
    y -= cardH + 26

    // Highlight, pen and shapes — and a line to highlight.
    y = section(
      page, n, y, E('hl_title'), E('hl_body'),
      whereBoth(
        path(T('phone.tool_markup'), [T('phone.mk_highlight'), T('phone.mk_pen'), T('phone.mk_shape')].join(', ')),
        [T('viewer.toolbar.tool_highlighter'), T('viewer.toolbar.tool_free_draw')].join(', '),
      ),
    )
    y -= 8
    tryTag(page, LEFT + 10, y)
    y -= 20
    const hl = E('hl_line')
    const hlSize = fitSize(hl, CONTENT - 10, { size: 13 })
    draw(page, hl, LEFT + 10, y, { size: hlSize })
    check(hl, n, y)
    y -= 34

    // Sticky notes: the words on the left, a yellow box on the right that runs
    // off the page edge, so a note can be dragged half off it.
    const noteBoxX = 372
    const noteTop = y + 12
    const after = section(
      page, n, y, E('note_title'), E('note_body'),
      whereBoth(path(T('phone.tool_markup'), T('phone.mk_note')), T('viewer.toolbar.tool_sticky_note')),
      LEFT, noteBoxX - LEFT - 18,
    )
    const noteH = Math.max(110, noteTop - after)
    page.drawRectangle({ x: noteBoxX, y: noteTop - noteH, width: W - noteBoxX + 2, height: noteH, color: YELLOW_50, borderColor: YELLOW_400, borderWidth: 1, borderDashArray: [4, 3] })
    tryTag(page, noteBoxX + 10, noteTop - 18)
    para(page, n, E('note_area'), noteBoxX + 10, noteTop - 38, W - noteBoxX - 24, { size: 9, color: SLATE_600 }, 12)
    y = Math.min(after, noteTop - noteH) - 22

    // Black out, over made-up details.
    y = section(
      page, n, y, E('bo_title'), E('bo_body'),
      whereBoth(path(T('phone.tool_markup'), T('phone.mk_blackout')), path(T('menu.actions'), T('menu.redact'), T('menu.free_draw'))),
    )
    y -= 6
    const rows: [string, string][] = [[E('bo_name'), 'Sam Taylor'], [E('bo_account'), '12-34-56  8765 4321']]
    const labW = Math.max(...rows.map(([l]) => widthOf(`${l}:`, { size: 10.5, bold: true }))) + 10
    const boxH = 22 + rows.length * 18
    page.drawRectangle({ x: LEFT + 10, y: y - boxH, width: CONTENT - 10, height: boxH, color: SLATE_50, borderColor: SLATE_200, borderWidth: 1 })
    tryTag(page, LEFT + 20, y - 14)
    let ry = y - 34
    for (const [l, v] of rows) {
      draw(page, `${l}:`, LEFT + 20, ry, { size: 10.5, bold: true, color: SLATE_600 })
      draw(page, v, LEFT + 20 + labW, ry, { size: 10.5 })
      ry -= 18
    }
    check('black-out box', n, y - boxH)
  }

  // ==========================================================================
  // Page 2 — the form, Text anywhere, page numbers, Word
  // ==========================================================================
  {
    const n = 2
    const page = newPage(n, E('p2_sub'), E('p2_title'), E('p2_tip'))
    // Where it has always been (A4 is 841.89 high): the fields must not move.
    const formTop = H - 207
    const formH = 220
    // The intro has the two lines above the form; a long translation gets a
    // smaller size rather than running into it.
    const intro = E('p2_intro')
    let introSize = 10.5
    while (introSize > 8 && wrap(intro, CONTENT, { size: introSize }).length > 2) introSize -= 0.25
    para(page, n, intro, LEFT, H - 146, CONTENT, { size: introSize, color: SLATE_600 }, introSize * 1.45, formTop + 4)

    page.drawRectangle({ x: LEFT, y: formTop - formH, width: CONTENT, height: formH, borderColor: SLATE_200, borderWidth: 1, color: WHITE })
    page.drawRectangle({ x: LEFT, y: formTop - 24, width: CONTENT, height: 24, color: BLUE_50 })
    const head = E('form_head')
    draw(page, head, 60, formTop - 17, { size: fitSize(head, CONTENT - 20, { size: 10, bold: true }), bold: true })

    function addField(name: string, label: string, fx: number, fy: number, fw: number) {
      draw(page, label, fx, fy + 22, { size: fitSize(label, fw, { size: 9, bold: true }), bold: true, color: SLATE_600 })
      const field = form.createTextField(`example_${name}`)
      // Its spoken / shown name (`/TU`): the viewer labels an empty field with
      // it, which otherwise reads "example_name". On the field for readers that
      // look there, and on its widget, which is the only place pdf.js looks.
      field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(label))
      field.addToPage(page, { x: fx, y: fy, width: fw, height: 18, borderColor: BLUE_400, borderWidth: 1, backgroundColor: BLUE_50 })
      for (const w of field.acroField.getWidgets()) w.dict.set(PDFName.of('TU'), PDFHexString.fromText(label))
    }
    let fy = formTop - 50
    addField('name', E('f_name'), 60, fy - 18, 200)
    addField('email', E('f_email'), 280, fy - 18, 215)
    fy -= 60
    addField('company', E('f_company'), 60, fy - 18, 200)
    addField('date', E('f_date'), 280, fy - 18, 215)
    fy -= 60
    addField('role', E('f_role'), 60, fy - 18, 200)
    addField('phone', E('f_phone'), 280, fy - 18, 215)

    let y = formTop - formH - 34
    // Text anywhere, with two blank lines to write on.
    y = section(
      page, n, y, E('text_title'), E('text_body'),
      whereBoth(path(T('phone.tool_markup'), T('phone.mk_text')), T('viewer.toolbar.tool_add_text')),
    )
    y -= 8
    tryTag(page, LEFT + 10, y)
    y -= 26
    const lines = [E('text_line1'), E('text_line2')]
    const lw = Math.max(...lines.map((l) => widthOf(`${l}:`, { size: 10, bold: true }))) + 8
    const lineEnd = LEFT + 10 + Math.min(CONTENT - 10, lw + 260)
    for (const l of lines) {
      draw(page, `${l}:`, LEFT + 10, y, { size: 10, bold: true, color: SLATE_600 })
      page.drawLine({ start: { x: LEFT + 10 + lw, y: y - 2 }, end: { x: lineEnd, y: y - 2 }, thickness: 0.75, color: SLATE_400 })
      check(l, n, y)
      y -= 26
    }
    y -= 10

    // Page numbers and Export to Word, side by side: both the website's for now.
    const colW = (CONTENT - 24) / 2
    const pn = section(page, n, y, E('pn_title'), E('pn_body'), whereWeb(path(T('menu.actions'), T('menu.advanced'), T('menu.page_numbers'))), LEFT, colW)
    const wd = section(page, n, y, E('word_title'), E('word_body'), whereWeb(path(T('menu.actions'), T('menu.advanced'), T('menu.word'))), LEFT + colW + 24, colW)
    check('page numbers / Word', n, Math.min(pn, wd) + 10)
  }

  // ==========================================================================
  // Page 3 — sign, pictures, pages, the whole file
  // ==========================================================================
  {
    const n = 3
    const page = newPage(n, E('p3_sub'), E('p3_title'), E('p3_tip'))
    let y = H - 150
    y = section(page, n, y, E('sign_title'), E('sign_body'), whereBoth(T('phone.tool_sign'), T('sign.menu_sign')))
    y -= 10

    // A box to sign in, and room for a picture or a QR code beside it.
    const boxH = 104
    const sigW = 290
    const sigX = LEFT + 10
    page.drawRectangle({ x: sigX, y: y - boxH, width: sigW, height: boxH, color: WHITE, borderColor: SLATE_200, borderWidth: 1 })
    tryTag(page, sigX + 10, y - 16)
    const sh = E('sign_here')
    draw(page, sh, sigX + 12, y - boxH + 14, { size: fitSize(sh, sigW - 24, { size: 9, bold: true }), bold: true, color: SLATE_600 })
    page.drawLine({ start: { x: sigX + 12, y: y - boxH + 30 }, end: { x: sigX + sigW - 14, y: y - boxH + 30 }, thickness: 0.75, color: SLATE_400 })
    page.drawText('×', { x: sigX + 12, y: y - boxH + 34, size: 14, font: helv, color: SLATE_400 })

    const picX = sigX + sigW + 16
    const picW = RIGHT - picX
    page.drawRectangle({ x: picX, y: y - boxH, width: picW, height: boxH, color: ORANGE_LIGHT, borderColor: ORANGE, borderWidth: 1, borderDashArray: [4, 3] })
    // A little landscape, the universal "picture goes here".
    const cx = picX + picW / 2
    page.drawRectangle({ x: cx - 30, y: y - 62, width: 60, height: 40, color: WHITE, borderColor: ORANGE, borderWidth: 1 })
    page.drawCircle({ x: cx - 16, y: y - 32, size: 5, color: rgb(1, 0.8, 0.3) })
    page.drawSvgPath('M0 0 L16 -14 L28 -6 L42 -18 L60 -4 L60 0 Z', { x: cx - 30, y: y - 62, color: ORANGE })
    para(page, n, E('pic_area'), picX + 10, y - 78, picW - 20, { size: 8.5, color: SLATE_600 }, 11, y - boxH)
    y -= boxH + 26

    y = section(page, n, y, E('every_title'), E('every_body'), null)
    y -= 12
    y = section(
      page, n, y, E('pic_title'), E('pic_body'),
      whereBoth(
        `${path(T('phone.tool_markup'), T('phone.mk_picture'))} / ${T('phone.mk_qr')}`,
        [T('viewer.toolbar.upload_image'), T('viewer.toolbar.add_qr_code')].join('   ·   '),
      ),
    )
    y -= 12
    y = section(page, n, y, E('pages_title'), E('pages_body'), whereBoth(T('phone.tool_pages'), path(T('menu.actions'), T('menu.view'), T('menu.pages'))))
    y -= 12

    // The whole-file tools, in two columns.
    y = section(
      page, n, y, E('file_title'), E('file_body'),
      whereBoth(T('phone.more_title'), [path(T('menu.actions'), T('menu.advanced')), T('viewer.toolbar.export')].join('   ·   ')),
    )
    y -= 4
    const tools: [ExampleKey, ExampleKey][] = [
      ['tool_compress', 'tool_compress_note'],
      ['tool_merge', 'tool_merge_note'],
      ['tool_lock', 'tool_lock_note'],
      ['tool_ocr', 'tool_ocr_note'],
      ['tool_compare', 'tool_compare_note'],
      ['tool_send', 'tool_send_note'],
    ]
    const colW = (CONTENT - 10 - 20) / 2
    for (let i = 0; i < tools.length; i += 2) {
      let rowBottom = y
      for (let c = 0; c < 2; c++) {
        const [name, note] = tools[i + c]
        const x = LEFT + 10 + c * (colW + 20)
        page.drawCircle({ x: x + 2, y: y + 3.5, size: 2, color: ORANGE })
        draw(page, E(name), x + 10, y, { size: fitSize(E(name), colW - 10, { size: 10, bold: true }), bold: true })
        check(E(name), n, y)
        const end = para(page, n, E(note), x + 10, y - 12, colW - 10, { size: 9, color: SLATE_600 }, 11.5)
        rowBottom = Math.min(rowBottom, end)
      }
      y = rowBottom - 6
    }
  }

  const bytes = await pdf.save()
  return { bytes, overflows, unicodeFont }
}

/** The example in the app's language, with the app's own fallback face for Turkish. */
export async function createExamplePdfBytes(): Promise<Uint8Array> {
  const { loadFallbackFont } = await import('./fallbackFont')
  return (await buildExamplePdf({ loadUnicodeFont: loadFallbackFont })).bytes
}

export async function createExamplePdfFile(): Promise<File> {
  const bytes = await createExamplePdfBytes()
  return new File([bytes as BlobPart], 'Universal-PDF-example.pdf', { type: 'application/pdf' })
}
