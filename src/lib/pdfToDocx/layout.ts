// PDF → Word, the middle step (James, 2026-10-18: "Export to Word (.docx)").
// A PDF has no paragraphs: it has words placed on a page. This turns the words
// pdf.js reads off each page (lib/pdfToDocx/extract.ts) into the headings and
// paragraphs a Word document is made of; docx.ts writes them out.
//
// What it does and doesn't attempt, on purpose:
//   • Lines are rebuilt from words on one baseline; paragraphs from lines
//     that follow each other closely at the same size; a line that is clearly
//     bigger than the body text is a heading (the biggest size Heading 1).
//   • Bold and italic come from the font's name.
//   • A list keeps its own bullet or number as typed, set with a hanging
//     indent — never renumbered, so "3." stays "3.".
//   • Columns, tables and pictures are not rebuilt: the words come out in the
//     order the PDF stores them. A page with no text (a scan) comes across as
//     a picture of the page instead, so nothing is silently lost.
//
// Imports nothing at run time, so scripts/pdfToDocx.test.mjs runs it under
// Node's type-stripping.

/** A piece of text as read off the page: y down from the top, in points. */
export interface TextBit {
  str: string
  x: number
  /** The baseline. */
  y: number
  width: number
  size: number
  bold: boolean
  italic: boolean
  /** pdf.js says the line ends after this piece. */
  eol: boolean
}

export interface DocxRun {
  text: string
  bold?: boolean
  italic?: boolean
}

export interface Line {
  x: number
  y: number
  endX: number
  size: number
  runs: DocxRun[]
}

export type DocxBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: DocxRun[] }
  | { kind: 'paragraph'; runs: DocxRun[]; listItem?: boolean }
  | { kind: 'picture'; png: Uint8Array; widthPt: number; heightPt: number }
  | { kind: 'pagebreak' }

export interface DocxDoc {
  pageWidthPt: number
  pageHeightPt: number
  /** The body text size, in points: the Normal style's. */
  bodySizePt: number
  blocks: DocxBlock[]
}

export interface PageRead {
  width: number
  height: number
  bits: TextBit[]
  /** A picture of the page, for a page with no text to speak of. */
  picture?: Uint8Array
}

const lineText = (l: Pick<Line, 'runs'>) => l.runs.map((r) => r.text).join('')

/** Words on one baseline become a line; pdf.js's own line ends are kept. */
export function linesFromBits(bits: TextBit[]): Line[] {
  const lines: Line[] = []
  let cur: (Line & { closed: boolean }) | null = null
  for (const b of bits) {
    if (!b.str) {
      if (b.eol && cur) cur.closed = true
      continue
    }
    const blank = !b.str.trim()
    const size = Math.max(b.size, cur?.size ?? 0)
    const sameLine =
      cur && !cur.closed && Math.abs(b.y - cur.y) <= 0.45 * size && b.x >= cur.endX - 0.5 * size
    if (cur && sameLine) {
      const last = cur.runs[cur.runs.length - 1]
      const gap = b.x - cur.endX
      if (gap > 0.2 * b.size && !/\s$/.test(last.text) && !/^\s/.test(b.str)) {
        cur.runs.push({ text: ' ', bold: last.bold, italic: last.italic })
      }
      cur.runs.push({ text: b.str, bold: b.bold, italic: b.italic })
      cur.endX = Math.max(cur.endX, b.x + b.width)
      if (!blank) cur.size = Math.max(cur.size, b.size)
    } else if (!blank) {
      cur = { x: b.x, y: b.y, endX: b.x + b.width, size: b.size, runs: [{ text: b.str, bold: b.bold, italic: b.italic }], closed: false }
      lines.push(cur)
    }
    if (b.eol && cur) cur.closed = true
  }
  return lines.map(({ x, y, endX, size, runs }) => ({ x, y, endX, size, runs: tidyRuns(runs) }))
}

/** Join neighbouring runs that look the same, and trim the line's ends. */
export function tidyRuns(runs: DocxRun[]): DocxRun[] {
  // A space between a bold word and a plain one belongs to the plain text, or
  // Word shows a bold space (and an underlined one, were it underlined).
  const moved = runs.map((r) => ({ ...r }))
  for (let i = 0; i < moved.length - 1; i++) {
    const r = moved[i]
    const next = moved[i + 1]
    const trail = /\s+$/.exec(r.text)?.[0]
    if (trail && trail !== r.text && (r.bold || r.italic) && !(next.bold && next.italic)) {
      r.text = r.text.slice(0, -trail.length)
      next.text = trail + next.text
    }
  }
  const out: DocxRun[] = []
  for (const r of moved) {
    const prev = out[out.length - 1]
    if (prev && !!prev.bold === !!r.bold && !!prev.italic === !!r.italic) prev.text += r.text
    else out.push({ text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}) })
  }
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '')
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '')
  }
  return out.filter((r) => r.text)
}

const half = (n: number) => Math.round(n * 2) / 2

/** The size most of the text is set in. */
export function bodySize(lines: Line[]): number {
  const weight = new Map<number, number>()
  for (const l of lines) {
    const k = half(l.size)
    weight.set(k, (weight.get(k) ?? 0) + lineText(l).length)
  }
  let best = 11
  let most = -1
  for (const [k, w] of weight) if (w > most) [best, most] = [k, w]
  return best
}

// A bullet or a number at the start of a line, as typed.
const LIST_START = /^\s*(?:[•◦▪▫●○■□‣⁃∙·\-–—*]|\(?\d{1,3}[.)]|\(?[a-z][)])\s+\S/

/** Headings are lines clearly bigger than the body: the biggest size is level 1. */
function headingLevels(lines: Line[], body: number): Map<number, 1 | 2 | 3> {
  const sizes = [...new Set(lines.filter((l) => isHeadingSize(l, body)).map((l) => half(l.size)))].sort((a, b) => b - a)
  return new Map(sizes.map((s, i) => [s, (Math.min(i, 2) + 1) as 1 | 2 | 3]))
}

function isHeadingSize(l: Line, body: number): boolean {
  return l.size >= body * 1.2 && lineText(l).length <= 150
}

/** Append `next` to `runs` across a line break: a space, or a word hyphenated over the break rejoined. */
function joinLine(runs: DocxRun[], next: DocxRun[]): DocxRun[] {
  const out = runs.map((r) => ({ ...r }))
  const last = out[out.length - 1]
  if (last && /\p{L}-$/u.test(last.text) && /^\p{Ll}/u.test(next[0]?.text ?? '')) {
    last.text = last.text.slice(0, -1)
  } else if (last) {
    last.text += ' '
  }
  return tidyRuns([...out, ...next])
}

/** Every page's lines → blocks, with a page break between pages. */
export function buildDocx(pages: PageRead[]): DocxDoc {
  const pageLines = pages.map((p) => linesFromBits(p.bits))
  const all = pageLines.flat()
  const body = bodySize(all)
  const levels = headingLevels(all, body)
  const blocks: DocxBlock[] = []

  pages.forEach((page, pi) => {
    if (pi > 0) blocks.push({ kind: 'pagebreak' })
    const lines = pageLines[pi]
    const chars = lines.reduce((n, l) => n + lineText(l).trim().length, 0)
    if (chars < 3 && page.picture) {
      blocks.push({ kind: 'picture', png: page.picture, widthPt: page.width, heightPt: page.height })
      return
    }
    type Open = { block: DocxBlock & { runs: DocxRun[] }; last: Line; left: number }
    let open: Open | null = null
    const flush = () => {
      if (open) blocks.push(open.block)
      open = null
    }
    for (const line of lines) {
      const level = isHeadingSize(line, body) ? levels.get(half(line.size)) : undefined
      const listStart = !level && LIST_START.test(lineText(line))
      const o = open as Open | null
      const gap = o ? line.y - o.last.y : 0
      const sameKind =
        o &&
        (level
          ? o.block.kind === 'heading' && o.block.level === level
          : o.block.kind === 'paragraph' && !listStart)
      const follows =
        o &&
        sameKind &&
        gap > 0 &&
        gap <= Math.max(line.size, o.last.size) * 1.75 &&
        Math.abs(line.size - o.last.size) <= 0.75 &&
        // A first line set in from the paragraph's left edge starts a new one.
        !(o.block.kind === 'paragraph' && !o.block.listItem && line.x > o.left + line.size * 1.2) &&
        // A list item's own wrapped lines are set in past its bullet.
        !(o.block.kind === 'paragraph' && o.block.listItem && line.x <= o.left + 2)
      if (o && follows) {
        o.block.runs = joinLine(o.block.runs, line.runs)
        o.last = line
        if (!(o.block.kind === 'paragraph' && o.block.listItem)) o.left = Math.min(o.left, line.x)
        continue
      }
      flush()
      const block: DocxBlock & { runs: DocxRun[] } = level
        ? { kind: 'heading', level, runs: line.runs }
        : listStart
          ? { kind: 'paragraph', runs: line.runs, listItem: true }
          : { kind: 'paragraph', runs: line.runs }
      open = { block, last: line, left: line.x }
    }
    flush()
  })

  const first = pages[0] ?? { width: 595, height: 842 }
  return { pageWidthPt: first.width, pageHeightPt: first.height, bodySizePt: body, blocks }
}
