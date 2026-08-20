// Word (.docx) → the shared block model in `blockPdf.ts`.
//
// A .docx is a ZIP of OOXML. Everything this needs is in five parts:
//
//   word/document.xml            the body: paragraphs, runs, tables
//   word/styles.xml              style ids → their real names + inherited bold/italic
//   word/numbering.xml           which list is bulleted and which is numbered
//   word/_rels/document.xml.rels hyperlink targets, referenced by id from the body
//   docProps/core.xml            the document title, when the author set one
//
// What this deliberately does NOT attempt: Word's *page layout*. Floating
// shapes, text boxes, columns, headers/footers, exact page breaks and the
// author's fonts are all dropped, and the result is re-typeset in the house
// style. That is the honest ceiling for an on-device converter, and the import
// banner says so rather than implying a faithful copy.

import type { Block, ListItem, Run } from './blockPdf'
import {
  attr,
  child,
  children,
  descendant,
  descendants,
  isOn,
  OfficeParseError,
  parseXml,
  type OfficeDocument
} from './officeXml'
import type { ZipArchive } from './unzip'

// ---- Styles ---------------------------------------------------------------
interface StyleInfo {
  id: string
  /** The canonical name — "heading 1" even when the styleId is localised. */
  name: string
  basedOn?: string
  bold?: boolean
  italic?: boolean
}

function readStyles(xml: string | null): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>()
  if (!xml) return styles
  let doc: Document
  try {
    doc = parseXml(xml)
  } catch {
    return styles // A damaged stylesheet costs formatting, not the import.
  }
  for (const el of descendants(doc, 'style')) {
    const id = attr(el, 'styleId')
    if (!id) continue
    const rPr = child(el, 'rPr')
    const bold = rPr ? boolProp(rPr, 'b') : undefined
    const italic = rPr ? boolProp(rPr, 'i') : undefined
    styles.set(id, {
      id,
      name: (attr(child(el, 'name') ?? el, 'val') ?? id).toLowerCase(),
      basedOn: attr(child(el, 'basedOn') ?? el, 'val') ?? undefined,
      bold,
      italic
    })
  }
  return styles
}

function boolProp(rPr: Element, localName: string): boolean | undefined {
  const el = child(rPr, localName)
  if (!el) return undefined
  return isOn(attr(el, 'val'))
}

/** Walk a style's `basedOn` chain for an inherited bold/italic, cycles included. */
function inheritedFlag(
  styles: Map<string, StyleInfo>,
  styleId: string | undefined,
  flag: 'bold' | 'italic'
): boolean | undefined {
  let current = styleId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const style = styles.get(current)
    if (!style) return undefined
    if (style[flag] !== undefined) return style[flag]
    current = style.basedOn
  }
  return undefined
}

// ---- Headings -------------------------------------------------------------
// Word's own styles are Title/Subtitle and Heading 1–9; the block model has
// three levels, so anything deeper than 3 folds into h3 rather than silently
// becoming body text.
function headingKind(name: string): 'h1' | 'h2' | 'h3' | null {
  if (name === 'title') return 'h1'
  const m = /^heading\s*([1-9])$/.exec(name)
  if (!m) return null
  const level = Number(m[1])
  return level <= 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
}

function styleName(styles: Map<string, StyleInfo>, styleId: string | undefined): string {
  if (!styleId) return ''
  return styles.get(styleId)?.name ?? styleId.toLowerCase()
}

// ---- Numbering ------------------------------------------------------------
/** numId → (list level → true when that level is numbered rather than bulleted). */
type Numbering = Map<string, Map<number, boolean>>

function readNumbering(xml: string | null): Numbering {
  const numbering: Numbering = new Map()
  if (!xml) return numbering
  let doc: Document
  try {
    doc = parseXml(xml)
  } catch {
    return numbering
  }
  // abstractNumId → level → ordered?
  const abstract = new Map<string, Map<number, boolean>>()
  for (const el of descendants(doc, 'abstractNum')) {
    const id = attr(el, 'abstractNumId')
    if (!id) continue
    const levels = new Map<number, boolean>()
    for (const lvl of children(el, 'lvl')) {
      const ilvl = Number(attr(lvl, 'ilvl') ?? '0')
      const fmt = attr(child(lvl, 'numFmt') ?? lvl, 'val') ?? 'bullet'
      levels.set(ilvl, fmt !== 'bullet' && fmt !== 'none')
    }
    abstract.set(id, levels)
  }
  for (const el of descendants(doc, 'num')) {
    const numId = attr(el, 'numId')
    const abstractId = attr(child(el, 'abstractNumId') ?? el, 'val')
    if (!numId || !abstractId) continue
    numbering.set(numId, abstract.get(abstractId) ?? new Map())
  }
  return numbering
}

// ---- Relationships --------------------------------------------------------
function readRelationships(xml: string | null): Map<string, string> {
  const rels = new Map<string, string>()
  if (!xml) return rels
  let doc: Document
  try {
    doc = parseXml(xml)
  } catch {
    return rels
  }
  for (const el of descendants(doc, 'Relationship')) {
    const id = attr(el, 'Id')
    const target = attr(el, 'Target')
    if (!id || !target) continue
    // Only external targets are worth turning into a clickable link; an internal
    // one points at another part of the package, which the PDF has no notion of.
    if ((attr(el, 'TargetMode') ?? '') === 'External') rels.set(id, target)
  }
  return rels
}

// ---- Runs -----------------------------------------------------------------
interface RunContext {
  styles: Map<string, StyleInfo>
  rels: Map<string, string>
  /** Bold/italic the paragraph's own style already applies to every run in it. */
  paragraphBold?: boolean
  paragraphItalic?: boolean
}

/**
 * The text inside one `w:r`. Word scatters it across `w:t`, tabs and symbols,
 * and a run can also carry a break — which the caller needs to see, so it is
 * emitted as a newline and split on later.
 */
function runText(r: Element): string {
  let out = ''
  const walk = (el: Element) => {
    for (const node of Array.from(el.children)) {
      switch (node.localName) {
        case 't':
          out += node.textContent ?? ''
          break
        case 'tab':
          out += '\t'
          break
        case 'br':
          // A page break is a break too; the paragraph splitter tells them apart
          // by the marker, so keep the distinction here.
          out += attr(node, 'type') === 'page' ? PAGE_BREAK_MARKER : '\n'
          break
        case 'cr':
          out += '\n'
          break
        case 'noBreakHyphen':
          out += '-'
          break
        case 'rPr':
          break // properties, not content
        default:
          walk(node)
      }
    }
  }
  walk(r)
  return out
}

/**
 * Carries "a page break was here" through a run's text until `splitOnBreaks`
 * picks it out again. A NUL is used because it cannot appear in document text,
 * so it can never collide with something the author actually wrote.
 */
const PAGE_BREAK_MARKER = '\u0000'

function buildRun(r: Element, ctx: RunContext, link?: string): Run | null {
  const text = runText(r)
  if (!text) return null
  const rPr = child(r, 'rPr')
  const rStyleId = rPr ? attr(child(rPr, 'rStyle') ?? rPr, 'val') ?? undefined : undefined
  // Direct formatting wins over the character style, which wins over whatever
  // the paragraph style contributes.
  const bold =
    (rPr ? boolProp(rPr, 'b') : undefined) ??
    inheritedFlag(ctx.styles, rStyleId, 'bold') ??
    ctx.paragraphBold
  const italic =
    (rPr ? boolProp(rPr, 'i') : undefined) ??
    inheritedFlag(ctx.styles, rStyleId, 'italic') ??
    ctx.paragraphItalic
  const run: Run = { text }
  if (bold) run.bold = true
  if (italic) run.italic = true
  if (link) run.link = link
  return run
}

/** Every run in a paragraph, following hyperlinks and skipping deleted text. */
function paragraphRuns(p: Element, ctx: RunContext): Run[] {
  const runs: Run[] = []
  const walk = (el: Element, link?: string) => {
    for (const node of Array.from(el.children)) {
      switch (node.localName) {
        case 'pPr':
          break
        case 'del':
          // Text struck out under tracked changes is not in the document any
          // more — Word only still shows it because the change is unaccepted.
          break
        case 'r': {
          const run = buildRun(node, ctx, link)
          if (run) runs.push(run)
          break
        }
        case 'hyperlink': {
          const id = attr(node, 'id')
          walk(node, (id ? ctx.rels.get(id) : undefined) ?? link)
          break
        }
        case 'tbl':
          break // a nested table is handled by the caller, not flattened into text
        default:
          // Content controls, smart tags, bookmarks, revision marks and maths
          // all wrap runs without changing them — descend and keep going.
          walk(node, link)
      }
    }
  }
  walk(p)
  return runs
}

// ---- Paragraph ------------------------------------------------------------
interface Paragraph {
  runs: Run[]
  styleName: string
  outlineLevel?: number
  numId?: string
  ilvl: number
}

function readParagraph(p: Element, styles: Map<string, StyleInfo>, rels: Map<string, string>): Paragraph {
  const pPr = child(p, 'pPr')
  const styleId = pPr ? attr(child(pPr, 'pStyle') ?? pPr, 'val') ?? undefined : undefined
  const name = styleName(styles, styleId)
  const numPr = pPr ? child(pPr, 'numPr') : null
  const outline = pPr ? attr(child(pPr, 'outlineLvl') ?? pPr, 'val') : null
  const ctx: RunContext = {
    styles,
    rels,
    paragraphBold: inheritedFlag(styles, styleId, 'bold'),
    paragraphItalic: inheritedFlag(styles, styleId, 'italic')
  }
  return {
    runs: paragraphRuns(p, ctx),
    styleName: name,
    outlineLevel: outline === null ? undefined : Number(outline),
    numId: numPr ? attr(child(numPr, 'numId') ?? numPr, 'val') ?? undefined : undefined,
    ilvl: numPr ? Number(attr(child(numPr, 'ilvl') ?? numPr, 'val') ?? '0') : 0
  }
}

/** Split a paragraph's runs on the breaks Word put inside it. */
function splitOnBreaks(runs: Run[]): { runs: Run[]; pageBreakBefore: boolean }[] {
  const out: { runs: Run[]; pageBreakBefore: boolean }[] = []
  let current: Run[] = []
  let pageBreakBefore = false
  const flush = () => {
    out.push({ runs: current, pageBreakBefore })
    current = []
    pageBreakBefore = false
  }
  for (const run of runs) {
    const parts = run.text.split(/(\n|\u0000)/)
    for (const part of parts) {
      if (part === '\n') { flush(); continue }
      if (part === PAGE_BREAK_MARKER) { flush(); pageBreakBefore = true; continue }
      if (part) current.push({ ...run, text: part })
    }
  }
  flush()
  return out.filter((seg, i) => seg.runs.length > 0 || seg.pageBreakBefore || i === 0)
}

function isBlank(runs: Run[]): boolean {
  return runs.every((r) => !r.text.trim())
}

// ---- Tables ---------------------------------------------------------------
function readTable(tbl: Element, styles: Map<string, StyleInfo>, rels: Map<string, string>): Block | null {
  const rows: Run[][][] = []
  for (const tr of children(tbl, 'tr')) {
    const cells: Run[][] = []
    for (const tc of children(tr, 'tc')) {
      // A cell is a stack of paragraphs (and possibly nested tables); the block
      // model's cells are a single run of text, so join them with a space.
      const runs: Run[] = []
      for (const p of descendants(tc, 'p')) {
        const paragraph = readParagraph(p, styles, rels)
        if (runs.length && paragraph.runs.length) runs.push({ text: ' ' })
        runs.push(...paragraph.runs.map((r) => ({ ...r, text: r.text.replace(/[\n\t\u0000]/g, ' ') })))
      }
      cells.push(runs)
    }
    if (cells.length) rows.push(cells)
  }
  if (!rows.length) return null
  // The renderer draws a header band, and a Word table's first row nearly always
  // is one. Where it isn't, the cost is one shaded row rather than lost content.
  return { kind: 'table', header: rows[0], rows: rows.slice(1) }
}

// ---- Body -----------------------------------------------------------------
// ---- Section page setup ---------------------------------------------------
//
// Word models orientation per SECTION, not per page, and it stores the section
// break in a peculiar place: `w:sectPr` sits inside the `w:pPr` of the LAST
// paragraph of the section it describes, while the final section's properties
// hang off the end of `w:body`. So the setup for the section you are currently
// reading is always the NEXT `sectPr` you will meet, and the body-level one is
// the setup for whatever is left over.
//
// ⚠️ Sizes are in twentieths of a point (twips), not points — 11906 twips is
// A4's 595.3pt, not a page a hundred and sixty feet wide.
//
// `w:orient` is advisory and Word writes it alongside already-swapped w/h. We
// trust w/h and use `orient` only to repair a file that disagrees with itself,
// which LibreOffice has been known to produce.
const TWIPS_PER_POINT = 20

interface PageSetup {
  width: number
  height: number
}

function readSectPr(sectPr: Element): PageSetup | null {
  const pgSz = child(sectPr, 'pgSz')
  if (!pgSz) return null
  const w = Number(attr(pgSz, 'w'))
  const h = Number(attr(pgSz, 'h'))
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null
  let width = w / TWIPS_PER_POINT
  let height = h / TWIPS_PER_POINT
  const orient = attr(pgSz, 'orient')?.toLowerCase()
  if (orient === 'landscape' && height > width) [width, height] = [height, width]
  if (orient === 'portrait' && width > height) [width, height] = [height, width]
  return { width, height }
}

/** The `sectPr` a paragraph carries, i.e. "this paragraph ends a section". */
function paragraphSectPr(p: Element): PageSetup | null {
  const pPr = child(p, 'pPr')
  const sectPr = pPr && child(pPr, 'sectPr')
  return sectPr ? readSectPr(sectPr) : null
}

/**
 * The setup the document OPENS with.
 *
 * The first section's properties are on the last paragraph of that section —
 * which may be a long way down — or, in the common single-section document, on
 * the body itself.
 */
function firstSectionSetup(body: Element): PageSetup | null {
  for (const el of children(body)) {
    if (el.localName === 'p') {
      const setup = paragraphSectPr(el)
      if (setup) return setup
    }
  }
  const trailing = child(body, 'sectPr')
  return trailing ? readSectPr(trailing) : null
}

/**
 * The setup for the section that STARTS after `afterParagraph`.
 *
 * Walks on to the next paragraph carrying a `sectPr`; if there is none, the
 * remainder of the document is the final section, whose properties live on the
 * body itself.
 */
function nextSectionSetup(body: Element, afterParagraph: Element): PageSetup | null {
  let seen = false
  for (const el of children(body)) {
    if (el === afterParagraph) {
      seen = true
      continue
    }
    if (!seen || el.localName !== 'p') continue
    const setup = paragraphSectPr(el)
    if (setup) return setup
  }
  const trailing = child(body, 'sectPr')
  return trailing ? readSectPr(trailing) : null
}

function bodyToBlocks(
  body: Element,
  styles: Map<string, StyleInfo>,
  numbering: Numbering,
  rels: Map<string, string>
): Block[] {
  const blocks: Block[] = []
  // The paper the document opens on. Emitted before anything is drawn so the
  // renderer resizes its first page instead of leaving a blank one in front.
  const opening = firstSectionSetup(body)
  if (opening) blocks.push({ kind: 'pagesetup', width: opening.width, height: opening.height })
  // Consecutive numbered paragraphs are one list, so they share numbering and
  // spacing instead of becoming a stack of one-item lists.
  let list: { ordered: boolean; items: ListItem[] } | null = null
  const flushList = () => {
    if (list && list.items.length) blocks.push({ kind: list.ordered ? 'ol' : 'ul', items: list.items })
    list = null
  }

  for (const el of children(body)) {
    if (el.localName === 'tbl') {
      flushList()
      const table = readTable(el, styles, rels)
      if (table) blocks.push(table)
      continue
    }
    if (el.localName !== 'p') continue

    const paragraph = readParagraph(el, styles, rels)
    const pPr = child(el, 'pPr')
    if (pPr && child(pPr, 'pageBreakBefore')) {
      flushList()
      blocks.push({ kind: 'pagebreak' })
    }

    if (paragraph.numId) {
      const ordered = numbering.get(paragraph.numId)?.get(paragraph.ilvl) ?? false
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push({ runs: paragraph.runs, level: paragraph.ilvl })
      continue
    }
    flushList()

    const heading =
      headingKind(paragraph.styleName) ??
      // A custom style can still declare its outline level, which is how Word
      // itself decides what belongs in the navigation pane.
      (paragraph.outlineLevel !== undefined && paragraph.outlineLevel <= 8
        ? headingKind(`heading ${paragraph.outlineLevel + 1}`)
        : null)

    for (const segment of splitOnBreaks(paragraph.runs)) {
      if (segment.pageBreakBefore) blocks.push({ kind: 'pagebreak' })
      if (isBlank(segment.runs)) continue
      if (heading) {
        blocks.push({ kind: heading, runs: segment.runs })
      } else if (paragraph.styleName.includes('quote')) {
        blocks.push({ kind: 'quote', runs: segment.runs })
      } else {
        blocks.push({ kind: 'p', runs: segment.runs })
      }
    }

    // This paragraph carrying a `sectPr` means it ENDED a section, so the setup
    // it holds has already been applied — what follows belongs to the next one.
    // The next section's paper is the next `sectPr` after this paragraph, or
    // the body's own if this was the last break.
    if (paragraphSectPr(el)) {
      const next = nextSectionSetup(body, el)
      if (next) blocks.push({ kind: 'pagesetup', width: next.width, height: next.height })
    }
  }
  flushList()
  return blocks
}

// ---- Entry point ----------------------------------------------------------
async function readTitle(zip: ZipArchive): Promise<string | undefined> {
  const xml = await zip.readText('docProps/core.xml')
  if (!xml) return undefined
  try {
    const title = descendant(parseXml(xml), 'title')?.textContent?.trim()
    return title || undefined
  } catch {
    return undefined
  }
}

/** The archive is opened by `officeToPdf.ts`, which needs it to tell the formats apart. */
export async function docxToBlocks(zip: ZipArchive): Promise<OfficeDocument> {
  const documentXml = await zip.readText('word/document.xml')
  if (!documentXml) {
    throw new OfficeParseError('That .docx has no document part — it may be damaged.')
  }
  const [stylesXml, numberingXml, relsXml] = await Promise.all([
    zip.readText('word/styles.xml'),
    zip.readText('word/numbering.xml'),
    zip.readText('word/_rels/document.xml.rels')
  ])

  const styles = readStyles(stylesXml)
  const numbering = readNumbering(numberingXml)
  const rels = readRelationships(relsXml)

  const doc = parseXml(documentXml)
  const body = descendant(doc, 'body')
  if (!body) throw new OfficeParseError('That .docx has no readable body.')

  return { blocks: bodyToBlocks(body, styles, numbering, rels), title: await readTitle(zip) }
}
