// The app's own PDF *layout engine*: a small block model (headings, paragraphs,
// lists, quotes, code, rules, tables) laid out onto pdf-lib pages with real,
// selectable text — so Find, copy-paste, redact-by-search and OCR-free text
// extraction all work on what comes out.
//
// It started life inside `markdownToPdf.ts` and still serves it. It is a
// separate module because Markdown is no longer the only thing that produces
// these blocks: `docxToBlocks.ts` and `odtToBlocks.ts` target the same model, so
// a Word or OpenDocument import is laid out by exactly the same code — and any
// improvement here lands on all three at once.

import {
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFPage,
  PDFString,
  PageSizes,
  StandardFonts,
  rgb
} from 'pdf-lib'

type RGB = ReturnType<typeof rgb>

// ---- Palette --------------------------------------------------------------
const ORANGE = rgb(0.92, 0.34, 0.06)
const SLATE_900 = rgb(0.06, 0.09, 0.16)
const SLATE_700 = rgb(0.2, 0.25, 0.33)
const SLATE_600 = rgb(0.34, 0.39, 0.46)
const SLATE_400 = rgb(0.58, 0.64, 0.72)
const SLATE_300 = rgb(0.79, 0.82, 0.86)
const SLATE_200 = rgb(0.89, 0.91, 0.93)
const SLATE_50 = rgb(0.97, 0.98, 0.98)
const CODE_BG = rgb(0.97, 0.98, 1.0)
const CODE_BORDER = rgb(0.89, 0.92, 0.96)
const CODE_FG = rgb(0.78, 0.16, 0.32)
const LINK = rgb(0.15, 0.39, 0.92)

// ---- Layout ---------------------------------------------------------------
const MARGIN = { top: 64, right: 56, bottom: 56, left: 56 }
const BASE_SIZE = 11
const BASE_LINE = 1.45
const PARA_GAP = 8
const LIST_GAP = 4
const H1_SIZE = 24, H1_TOP = 18, H1_BOT = 4
const H2_SIZE = 17, H2_TOP = 16, H2_BOT = 4
const H3_SIZE = 13, H3_TOP = 12, H3_BOT = 2
const CODE_INLINE_SIZE = 10
const CODE_BLOCK_SIZE = 9.5
const CODE_BLOCK_LINE = 1.4
const TABLE_SIZE = 10
const TABLE_PAD_X = 8
const TABLE_PAD_Y = 5
const BULLET_INDENT = 18
const QUOTE_INDENT = 18
/** Each nesting level of a list steps in by this much. */
const NEST_INDENT = 16

// ---- Types ----------------------------------------------------------------
export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  link?: string
}

export interface ListItem {
  runs: Run[]
  /** 0 for a top-level item; each step in is one more. */
  level?: number
}

export type Block =
  | { kind: 'h1' | 'h2' | 'h3'; runs: Run[] }
  | { kind: 'p'; runs: Run[] }
  | { kind: 'ul' | 'ol'; items: ListItem[] }
  | { kind: 'quote'; runs: Run[] }
  | { kind: 'code'; text: string }
  | { kind: 'hr' }
  | { kind: 'pagebreak' }
  // A change of paper for everything that follows, in PDF points. Emitted by
  // the office importers when a document changes section — a Word file with one
  // landscape page in the middle of a portrait report is the ordinary case.
  // It is an instruction rather than a property of the document because that is
  // how the source formats model it: orientation belongs to a section, and a
  // section runs until the next section break.
  | { kind: 'pagesetup'; width: number; height: number }
  | { kind: 'table'; header: Run[][]; rows: Run[][][] }

export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter'

export type Orientation = 'portrait' | 'landscape'

export interface BuildOptions {
  title?: string
  paperSize?: PaperSize
  /**
   * Which way round the paper starts. Defaults to portrait.
   *
   * Only the STARTING orientation — a document that carries its own page setup
   * (anything imported from Word or ODF) overrides this the moment it says so,
   * because that file already knows which of its pages are landscape and this
   * setting does not.
   */
  orientation?: Orientation
  showPageNumbers?: boolean
}

const SIZE_MAP: Record<PaperSize, [number, number]> = {
  A3: PageSizes.A3,
  A4: PageSizes.A4,
  A5: PageSizes.A5,
  Letter: PageSizes.Letter
}

// ---- Sanitisation ---------------------------------------------------------
// Standard 14 fonts use WinAnsi encoding. Map common Unicode niceties to
// safe ASCII equivalents and drop anything else outside WinAnsi range so
// pdf-lib's drawText doesn't throw on a single stray glyph.
const REPLACEMENTS: Record<string, string> = {
  '‘': "'", '’': "'",
  '“': '"', '”': '"',
  '–': '-', '—': '-',
  '…': '...',
  '•': '*',
  ' ': ' ',
  '​': '',
  '→': '->', '←': '<-',
  '✓': 'v', '✔': 'v',
  '✗': 'x', '✘': 'x',
  '▶': '>', '◀': '<',
  '▪': '-', '▫': '-',
  '✅': '[ok]', '❌': '[x]'
}

// Glyphs Markdown wants flattened because they read as list markers in pasted
// text, but which are perfectly drawable and worth keeping in an imported
// document. U+00B7 is WinAnsi 0xB7, so it survives the range check below —
// without this split, every "UNI·SIM" imported from Word came out "UNI*SIM".
const MARKDOWN_ONLY_REPLACEMENTS: Record<string, string> = {
  '·': '*'
}

export interface SanitizeOptions {
  /** Also flatten the bullet-ish glyphs Markdown treats as list markers. */
  markdownGlyphs?: boolean
}

export function sanitize(input: string, options: SanitizeOptions = {}): string {
  let out = ''
  for (const ch of input) {
    if (options.markdownGlyphs) {
      const mdRep = MARKDOWN_ONLY_REPLACEMENTS[ch]
      if (mdRep !== undefined) { out += mdRep; continue }
    }
    const rep = REPLACEMENTS[ch]
    if (rep !== undefined) { out += rep; continue }
    const code = ch.codePointAt(0) ?? 0
    if (code === 9 || code === 10 || code === 13) { out += ch; continue }
    if (code >= 32 && code <= 126) { out += ch; continue }
    if (code >= 160 && code <= 255) { out += ch; continue }
    // Box-drawing characters: degrade to ASCII art so diagrams stay readable.
    if (code >= 0x2500 && code <= 0x257f) {
      if (code === 0x2500 || code === 0x2501 || code === 0x2550) { out += '-'; continue }
      if (code === 0x2502 || code === 0x2503 || code === 0x2551) { out += '|'; continue }
      out += '+'; continue
    }
    if (code >= 0x25a0 && code <= 0x25ff) { out += '#'; continue }
    out += '?'
  }
  return out
}

// ---- Tokens + wrap --------------------------------------------------------
interface Token {
  run: Run
  text: string
  width: number
  isSpace: boolean
  size: number
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  boldItalic: PDFFont
  mono: PDFFont
  monoBold: PDFFont
}

// ---- Renderer -------------------------------------------------------------
class Renderer {
  pdf: PDFDocument
  pages: PDFPage[] = []
  page!: PDFPage
  pageWidth = 0
  y = 0
  fonts: Fonts
  size: [number, number]

  constructor(pdf: PDFDocument, size: [number, number], fonts: Fonts) {
    this.pdf = pdf
    this.size = size
    this.fonts = fonts
    this.newPage()
  }

  get contentWidth() {
    return this.pageWidth - MARGIN.left - MARGIN.right
  }

  newPage() {
    this.page = this.pdf.addPage(this.size)
    this.pages.push(this.page)
    const { width, height } = this.page.getSize()
    this.pageWidth = width
    this.y = height - MARGIN.top
  }

  ensure(needed: number) {
    if (this.y - needed < MARGIN.bottom) this.newPage()
  }

  /** True while nothing has been drawn on the current page yet. */
  get pageIsEmpty() {
    return this.y === this.page.getSize().height - MARGIN.top
  }

  /**
   * Change the paper for this page onward.
   *
   * ⚠️ Resizing an untouched page rather than adding one is the whole reason
   * this isn't just `size = …; newPage()`. A document whose FIRST section is
   * landscape emits its page setup before any content, and the constructor has
   * already opened a page — adding another would leave a blank portrait sheet
   * in front of every landscape document. Once anything has been drawn the page
   * is committed and the new paper starts a new sheet, which is also what a
   * section break means.
   */
  setPageSize(width: number, height: number) {
    const [w, h] = this.size
    if (Math.abs(w - width) < 0.5 && Math.abs(h - height) < 0.5) return
    this.size = [width, height]
    if (this.pageIsEmpty) {
      this.page.setSize(width, height)
      this.pageWidth = width
      this.y = height - MARGIN.top
    } else {
      this.newPage()
    }
  }

  fontForRun(r: Run): PDFFont {
    if (r.code) return r.bold ? this.fonts.monoBold : this.fonts.mono
    if (r.bold && r.italic) return this.fonts.boldItalic
    if (r.bold) return this.fonts.bold
    if (r.italic) return this.fonts.italic
    return this.fonts.regular
  }

  tokenize(runs: Run[], baseSize: number): Token[] {
    const out: Token[] = []
    for (const run of runs) {
      const font = this.fontForRun(run)
      const size = run.code ? Math.min(CODE_INLINE_SIZE, baseSize) : baseSize
      // Sanitise here rather than trusting every caller: Markdown pre-cleans its
      // whole source before parsing, but blocks built from a Word or ODF file
      // arrive carrying whatever glyphs the author used, and one un-encodable
      // character would otherwise throw mid-draw.
      const parts = sanitize(run.text).split(/(\s+)/).filter((p) => p.length > 0)
      for (const p of parts) {
        const isSpace = /^\s+$/.test(p)
        out.push({ run, text: p, width: font.widthOfTextAtSize(p, size), isSpace, size })
      }
    }
    return out
  }

  hardBreak(tok: Token, maxWidth: number): Token[] {
    if (tok.width <= maxWidth || tok.isSpace) return [tok]
    const font = this.fontForRun(tok.run)
    const out: Token[] = []
    let s = tok.text
    while (s.length) {
      let n = 1
      while (n < s.length && font.widthOfTextAtSize(s.slice(0, n + 1), tok.size) <= maxWidth) n++
      const head = s.slice(0, n)
      out.push({ ...tok, text: head, width: font.widthOfTextAtSize(head, tok.size) })
      s = s.slice(n)
    }
    return out
  }

  wrap(tokens: Token[], maxWidth: number): Token[][] {
    const broken: Token[] = []
    for (const t of tokens) broken.push(...this.hardBreak(t, maxWidth))
    const lines: Token[][] = []
    let line: Token[] = []
    let lineW = 0
    for (const tok of broken) {
      if (lineW + tok.width > maxWidth && line.length > 0) {
        while (line.length && line[line.length - 1].isSpace) {
          const removed = line.pop()
          if (removed) lineW -= removed.width
        }
        lines.push(line)
        line = []
        lineW = 0
        if (tok.isSpace) continue
      }
      line.push(tok)
      lineW += tok.width
    }
    if (line.length) lines.push(line)
    return lines
  }

  drawTokens(tokens: Token[], baseline: number, x: number, color: RGB) {
    let cx = x
    for (const tok of tokens) {
      if (tok.run.code) {
        this.page.drawRectangle({
          x: cx - 1,
          y: baseline - 2,
          width: tok.width + 2,
          height: tok.size + 4,
          color: CODE_BG,
          borderColor: CODE_BORDER,
          borderWidth: 0.5
        })
      }
      cx += tok.width
    }
    cx = x
    for (const tok of tokens) {
      const font = this.fontForRun(tok.run)
      const c = tok.run.code ? CODE_FG : tok.run.link ? LINK : color
      this.page.drawText(tok.text, { x: cx, y: baseline, size: tok.size, font, color: c })
      if (tok.run.link && !tok.isSpace) {
        this.page.drawLine({
          start: { x: cx, y: baseline - 1.5 },
          end: { x: cx + tok.width, y: baseline - 1.5 },
          thickness: 0.5,
          color: LINK
        })
        this.addLinkAnnotation(cx, baseline - 2, cx + tok.width, baseline + tok.size, tok.run.link)
      }
      cx += tok.width
    }
  }

  addLinkAnnotation(x1: number, y1: number, x2: number, y2: number, url: string) {
    const dict = this.pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x1, y1, x2, y2],
      Border: [0, 0, 0],
      A: this.pdf.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(url) })
    })
    const ref = this.pdf.context.register(dict)
    const annotsKey = PDFName.of('Annots')
    const existing = this.page.node.lookup(annotsKey)
    if (existing instanceof PDFArray) {
      existing.push(ref)
    } else {
      this.page.node.set(annotsKey, this.pdf.context.obj([ref]))
    }
  }

  drawRuns(
    runs: Run[],
    baseSize: number,
    color: RGB,
    x = MARGIN.left,
    maxWidth = this.contentWidth,
    lineHeightMul = BASE_LINE
  ) {
    const tokens = this.tokenize(runs, baseSize)
    const lines = this.wrap(tokens, maxWidth)
    const lineHeight = baseSize * lineHeightMul
    for (const line of lines) {
      this.ensure(lineHeight)
      this.y -= lineHeight
      this.drawTokens(line, this.y + (lineHeight - baseSize) * 0.25, x, color)
    }
  }

  renderHeading(runs: Run[], size: number, top: number, bot: number, withRule: boolean) {
    this.y -= top
    this.drawRuns(runs, size, SLATE_900, MARGIN.left, this.contentWidth, 1.2)
    if (withRule) {
      this.y -= 4
      this.ensure(3)
      this.page.drawRectangle({
        x: MARGIN.left,
        y: this.y,
        width: 36,
        height: 2.5,
        color: ORANGE
      })
      this.page.drawRectangle({
        x: MARGIN.left + 36,
        y: this.y + 0.75,
        width: this.contentWidth - 36,
        height: 1,
        color: SLATE_200
      })
      this.y -= 3
    }
    this.y -= bot
  }

  renderList(items: ListItem[], ordered: boolean) {
    this.y -= PARA_GAP
    const lineHeight = BASE_SIZE * BASE_LINE
    // Ordered lists number per level, and a level restarts each time the list
    // steps back out to it — so "1, 2, 3" under a sub-list doesn't continue
    // from where the parent left off.
    const counters: number[] = []
    for (let i = 0; i < items.length; i++) {
      const level = Math.max(0, Math.min(items[i].level ?? 0, 5))
      counters.length = Math.max(counters.length, level + 1)
      for (let l = level + 1; l < counters.length; l++) counters[l] = 0
      counters[level] = (counters[level] ?? 0) + 1

      const indent = level * NEST_INDENT
      const x = MARGIN.left + indent + BULLET_INDENT
      const maxWidth = this.contentWidth - indent - BULLET_INDENT
      const tokens = this.tokenize(items[i].runs, BASE_SIZE)
      const lines = this.wrap(tokens, maxWidth)
      for (let li = 0; li < lines.length; li++) {
        this.ensure(lineHeight)
        this.y -= lineHeight
        const baseline = this.y + (lineHeight - BASE_SIZE) * 0.25
        if (li === 0) {
          const marker = ordered ? `${counters[level]}.` : '*'
          const markerColor = ordered ? SLATE_600 : ORANGE
          this.page.drawText(marker, {
            x: MARGIN.left + indent + (ordered ? 0 : 4),
            y: baseline,
            size: BASE_SIZE,
            font: this.fonts.bold,
            color: markerColor
          })
        }
        this.drawTokens(lines[li], baseline, x, SLATE_700)
      }
      if (i < items.length - 1) this.y -= LIST_GAP
    }
  }

  renderQuote(runs: Run[]) {
    this.y -= PARA_GAP
    const x = MARGIN.left + QUOTE_INDENT
    const maxWidth = this.contentWidth - QUOTE_INDENT
    const tokens = this.tokenize(runs, BASE_SIZE)
    const lines = this.wrap(tokens, maxWidth)
    if (lines.length === 0) return
    const lineHeight = BASE_SIZE * BASE_LINE
    let segPage = this.page
    let segStartY = this.y
    const drawBar = (endY: number) => {
      if (segStartY - endY <= 0) return
      segPage.drawRectangle({
        x: MARGIN.left,
        y: endY - 2,
        width: 3,
        height: segStartY - endY + 4,
        color: ORANGE
      })
    }
    for (const line of lines) {
      if (this.y - lineHeight < MARGIN.bottom) {
        drawBar(this.y)
        this.newPage()
        segPage = this.page
        segStartY = this.y
      }
      this.y -= lineHeight
      const baseline = this.y + (lineHeight - BASE_SIZE) * 0.25
      this.drawTokens(line, baseline, x, SLATE_600)
    }
    drawBar(this.y)
  }

  renderCodeBlock(text: string) {
    this.y -= PARA_GAP
    const font = this.fonts.mono
    const pad = 10
    const maxWidth = this.contentWidth - 2 * pad
    const raw = sanitize(text).split('\n')
    const wrapped: string[] = []
    for (const r of raw) {
      let s = r
      if (font.widthOfTextAtSize(s, CODE_BLOCK_SIZE) <= maxWidth) {
        wrapped.push(s)
        continue
      }
      while (s.length) {
        let n = 1
        while (n < s.length && font.widthOfTextAtSize(s.slice(0, n + 1), CODE_BLOCK_SIZE) <= maxWidth) n++
        wrapped.push(s.slice(0, n))
        s = s.slice(n)
        if (s.length) s = '  ' + s
      }
    }
    const lh = CODE_BLOCK_SIZE * CODE_BLOCK_LINE
    let idx = 0
    while (idx < wrapped.length) {
      const remaining = this.y - MARGIN.bottom - 2 * pad
      const fit = Math.max(1, Math.floor(remaining / lh))
      const take = Math.min(fit, wrapped.length - idx)
      const chunkHeight = take * lh + 2 * pad
      if (this.y - chunkHeight < MARGIN.bottom) {
        this.newPage()
        continue
      }
      this.page.drawRectangle({
        x: MARGIN.left,
        y: this.y - chunkHeight,
        width: this.contentWidth,
        height: chunkHeight,
        color: CODE_BG,
        borderColor: CODE_BORDER,
        borderWidth: 0.5
      })
      let cursorY = this.y - pad
      for (let i = 0; i < take; i++) {
        cursorY -= lh
        this.page.drawText(wrapped[idx + i], {
          x: MARGIN.left + pad,
          y: cursorY + lh * 0.2,
          size: CODE_BLOCK_SIZE,
          font,
          color: SLATE_900
        })
      }
      this.y -= chunkHeight
      idx += take
    }
  }

  renderHr() {
    this.y -= PARA_GAP
    this.ensure(8)
    this.y -= 6
    this.page.drawRectangle({
      x: MARGIN.left,
      y: this.y,
      width: this.contentWidth,
      height: 0.6,
      color: SLATE_200
    })
    this.y -= 4
  }

  // An author's explicit page break. Skipped when the current page is still
  // untouched, so a document that opens with one — or has two in a row — does
  // not produce a blank page.
  renderPageBreak() {
    if (this.y >= this.page.getSize().height - MARGIN.top) return
    this.newPage()
  }

  renderTable(header: Run[][], rows: Run[][][]) {
    this.y -= PARA_GAP
    const cols = Math.max(header.length, ...rows.map((r) => r.length), 1)
    if (cols === 0) return

    const naturals = new Array(cols).fill(0)
    const mins = new Array(cols).fill(0)
    const allRows = [header, ...rows]
    for (const row of allRows) {
      for (let c = 0; c < cols; c++) {
        const cell = row[c] ?? []
        const tokens = this.tokenize(cell, TABLE_SIZE)
        let natural = 0
        let maxTok = 0
        for (const t of tokens) {
          natural += t.width
          if (!t.isSpace) maxTok = Math.max(maxTok, t.width)
        }
        naturals[c] = Math.max(naturals[c], natural)
        mins[c] = Math.max(mins[c], maxTok)
      }
    }

    const padTotal = TABLE_PAD_X * 2 * cols
    const inner = this.contentWidth - padTotal
    let widths: number[]
    const totalNatural = naturals.reduce((a, b) => a + b, 0)
    if (totalNatural <= inner) {
      widths = naturals.map((n) => n + TABLE_PAD_X * 2)
      const slack = this.contentWidth - widths.reduce((a, b) => a + b, 0)
      if (slack > 0) {
        const each = slack / cols
        widths = widths.map((w) => w + each)
      }
    } else {
      const scale = inner / totalNatural
      widths = naturals.map((n, c) => Math.max(mins[c], n * scale) + TABLE_PAD_X * 2)
      const total = widths.reduce((a, b) => a + b, 0)
      if (total > this.contentWidth) {
        const k = this.contentWidth / total
        widths = widths.map((w) => w * k)
      }
    }

    const renderRow = (row: Run[][], isHeader: boolean) => {
      const cellLines: Token[][][] = []
      for (let c = 0; c < cols; c++) {
        const cell = (row[c] ?? []).map((r) => (isHeader ? { ...r, bold: true } : r))
        const tokens = this.tokenize(cell, TABLE_SIZE)
        const lines = this.wrap(tokens, widths[c] - TABLE_PAD_X * 2)
        cellLines.push(lines.length ? lines : [[]])
      }
      const rowLines = Math.max(1, ...cellLines.map((l) => l.length))
      const lh = TABLE_SIZE * 1.4
      const rowHeight = rowLines * lh + TABLE_PAD_Y * 2
      this.ensure(rowHeight)

      if (isHeader) {
        this.page.drawRectangle({
          x: MARGIN.left,
          y: this.y - rowHeight,
          width: this.contentWidth,
          height: rowHeight,
          color: SLATE_50
        })
      }

      let cx = MARGIN.left
      for (let c = 0; c < cols; c++) {
        const lines = cellLines[c]
        let baseline = this.y - TABLE_PAD_Y
        for (let li = 0; li < lines.length; li++) {
          baseline -= lh
          this.drawTokens(
            lines[li],
            baseline + lh * 0.2,
            cx + TABLE_PAD_X,
            isHeader ? SLATE_900 : SLATE_700
          )
        }
        cx += widths[c]
      }

      this.page.drawRectangle({
        x: MARGIN.left,
        y: this.y - rowHeight,
        width: this.contentWidth,
        height: 0.5,
        color: SLATE_200
      })

      this.y -= rowHeight
    }

    this.ensure(0.5)
    this.page.drawRectangle({
      x: MARGIN.left,
      y: this.y,
      width: this.contentWidth,
      height: 0.5,
      color: SLATE_300
    })
    renderRow(header, true)
    for (const r of rows) renderRow(r, false)
  }

  renderBlock(block: Block) {
    switch (block.kind) {
      case 'h1':
        this.renderHeading(block.runs, H1_SIZE, H1_TOP, H1_BOT, true)
        break
      case 'h2':
        this.renderHeading(block.runs, H2_SIZE, H2_TOP, H2_BOT, false)
        break
      case 'h3':
        this.renderHeading(block.runs, H3_SIZE, H3_TOP, H3_BOT, false)
        break
      case 'p':
        this.y -= PARA_GAP
        this.drawRuns(block.runs, BASE_SIZE, SLATE_700)
        break
      case 'ul':
        this.renderList(block.items, false)
        break
      case 'ol':
        this.renderList(block.items, true)
        break
      case 'quote':
        this.renderQuote(block.runs)
        break
      case 'code':
        this.renderCodeBlock(block.text)
        break
      case 'hr':
        this.renderHr()
        break
      case 'pagebreak':
        this.renderPageBreak()
        break
      case 'pagesetup':
        this.setPageSize(block.width, block.height)
        break
      case 'table':
        this.renderTable(block.header, block.rows)
        break
    }
  }

  drawPageNumbers() {
    const total = this.pages.length
    for (let i = 0; i < total; i++) {
      const p = this.pages[i]
      const txt = `${i + 1} / ${total}`
      const w = this.fonts.regular.widthOfTextAtSize(txt, 9)
      p.drawText(txt, {
        x: p.getSize().width - MARGIN.right - w,
        y: 30,
        size: 9,
        font: this.fonts.regular,
        color: SLATE_400
      })
    }
  }
}

// ---- Entry point ----------------------------------------------------------
/** Lay a block document out onto a fresh PDF and return its bytes. */
export async function blocksToPdf(blocks: Block[], options: BuildOptions = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
    monoBold: await pdf.embedFont(StandardFonts.CourierBold)
  }
  const [paperW, paperH] = SIZE_MAP[options.paperSize ?? 'A4']
  const size: [number, number] =
    options.orientation === 'landscape' ? [paperH, paperW] : [paperW, paperH]
  const renderer = new Renderer(pdf, size, fonts)
  const body = blocks.length ? blocks : [{ kind: 'p', runs: [{ text: '(Empty document)' }] } as Block]
  for (const block of body) renderer.renderBlock(block)
  if (options.showPageNumbers !== false) renderer.drawPageNumbers()
  if (options.title) pdf.setTitle(options.title)
  pdf.setCreator('Universal PDF')
  return pdf.save()
}

/** Trim an arbitrary title down to something safe to use as a file name. */
export function safeFilename(s: string): string {
  const cleaned = s.replace(/[^a-z0-9-_ ]/gi, '').trim().slice(0, 60).replace(/\s+/g, '-')
  return cleaned || 'document'
}
