// OpenDocument Text (.odt) → the shared block model in `blockPdf.ts`.
//
// An .odt is a ZIP of ODF XML, and like the Word importer next door this reads
// a handful of parts:
//
//   content.xml   the body, plus the "automatic" styles generated for it
//   styles.xml    named styles and the list styles that say bullet vs number
//   meta.xml      the document title, when the author set one
//
// Two things about ODF regularly catch people out, and both are handled here:
//
//   • A heading is not always <text:h>. LibreOffice writes plenty of headings as
//     an ordinary <text:p> whose style merely *descends from* "Heading 1", so
//     the parent chain has to be resolved before deciding what a paragraph is.
//   • Style names are escaped: "Heading_20_1" is "Heading 1". Comparing the raw
//     name against "heading 1" silently matches nothing.
//
// As with Word, page layout is not attempted — the document is re-typeset in
// the house style and the import banner says so.

import type { Block, ListItem, Run } from './blockPdf'
import {
  attr,
  child,
  children,
  descendant,
  descendants,
  OfficeParseError,
  parseXml,
  type OfficeDocument
} from './officeXml'
import type { ZipArchive } from './unzip'

// ---- Style names ----------------------------------------------------------
/** ODF escapes anything outside [A-Za-z0-9] in a style name as `_XX_` hex. */
function decodeOdfName(name: string): string {
  return name.replace(/_([0-9a-fA-F]{2})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

interface StyleInfo {
  name: string
  parent?: string
  bold?: boolean
  italic?: boolean
  /** The list style a paragraph style attaches, when it declares one. */
  listStyle?: string
  pageBreakBefore?: boolean
}

function readStyleElement(el: Element): StyleInfo | null {
  const name = attr(el, 'name')
  if (!name) return null
  const text = child(el, 'text-properties')
  const paragraph = child(el, 'paragraph-properties')
  const weight = text ? attr(text, 'font-weight') : null
  const posture = text ? attr(text, 'font-style') : null
  const breakBefore = paragraph ? attr(paragraph, 'break-before') : null
  return {
    name,
    parent: attr(el, 'parent-style-name') ?? undefined,
    // `fo:font-weight` is "bold", "normal" or a number — 600 and up is bold.
    bold: weight === null ? undefined : weight === 'bold' || Number(weight) >= 600,
    italic: posture === null ? undefined : posture === 'italic' || posture === 'oblique',
    listStyle: attr(el, 'list-style-name') ?? undefined,
    pageBreakBefore: breakBefore === null ? undefined : breakBefore === 'page'
  }
}

function collectStyles(docs: (Document | null)[]): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>()
  for (const doc of docs) {
    if (!doc) continue
    for (const el of descendants(doc, 'style')) {
      const info = readStyleElement(el)
      // content.xml's automatic styles are read after styles.xml's named ones and
      // are the more specific of the two, so let them win on a name clash.
      if (info) styles.set(info.name, info)
    }
  }
  return styles
}

/** Follow a style's parent chain for the first definite value of one property. */
function resolve<K extends keyof StyleInfo>(
  styles: Map<string, StyleInfo>,
  styleName: string | undefined,
  key: K
): StyleInfo[K] | undefined {
  let current = styleName
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const style = styles.get(current)
    if (!style) return undefined
    if (style[key] !== undefined) return style[key]
    current = style.parent
  }
  return undefined
}

/**
 * The heading level a paragraph style implies, walking up the parent chain —
 * this is what catches the <text:p> that is really a Heading 1.
 */
function styleHeadingLevel(styles: Map<string, StyleInfo>, styleName: string | undefined): number | null {
  let current = styleName
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const m = /^heading\s*([1-9])$/.exec(decodeOdfName(current).trim().toLowerCase())
    if (m) return Number(m[1])
    const style = styles.get(current)
    if (!style) return null
    current = style.parent
  }
  return null
}

function headingKind(level: number): 'h1' | 'h2' | 'h3' {
  return level <= 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
}

// ---- List styles ----------------------------------------------------------
/** list style name → (0-based level → true when numbered rather than bulleted). */
type ListStyles = Map<string, Map<number, boolean>>

function collectListStyles(docs: (Document | null)[]): ListStyles {
  const lists: ListStyles = new Map()
  for (const doc of docs) {
    if (!doc) continue
    for (const el of descendants(doc, 'list-style')) {
      const name = attr(el, 'name')
      if (!name) continue
      const levels = lists.get(name) ?? new Map<number, boolean>()
      for (const lvl of children(el)) {
        // ODF names the level styles by what they draw: …-style-bullet,
        // …-style-number and …-style-image. Levels are 1-based here.
        const level = Number(attr(lvl, 'level') ?? '1') - 1
        if (lvl.localName === 'list-level-style-number') levels.set(level, true)
        else if (lvl.localName?.startsWith('list-level-style')) levels.set(level, false)
      }
      lists.set(name, levels)
    }
  }
  return lists
}

// ---- Inline text ----------------------------------------------------------
interface RunContext {
  styles: Map<string, StyleInfo>
  bold?: boolean
  italic?: boolean
  link?: string
}

const LINE_BREAK = '\n'

/** Flatten one paragraph's inline content into runs. */
function inlineRuns(el: Element, ctx: RunContext): Run[] {
  const runs: Run[] = []
  const push = (text: string, context: RunContext) => {
    if (!text) return
    const run: Run = { text }
    if (context.bold) run.bold = true
    if (context.italic) run.italic = true
    if (context.link) run.link = context.link
    runs.push(run)
  }

  const walk = (node: Node, context: RunContext) => {
    for (const childNode of Array.from(node.childNodes)) {
      if (childNode.nodeType === Node.TEXT_NODE) {
        push(childNode.nodeValue ?? '', context)
        continue
      }
      if (childNode.nodeType !== Node.ELEMENT_NODE) continue
      const element = childNode as Element
      switch (element.localName) {
        case 's': {
          // A run of spaces, collapsed by XML rules and restored by a count.
          const count = Number(attr(element, 'c') ?? '1')
          push(' '.repeat(Math.max(1, Math.min(count, 200))), context)
          break
        }
        case 'tab':
          push('\t', context)
          break
        case 'line-break':
          push(LINE_BREAK, context)
          break
        case 'soft-page-break':
          // Where the *previous* layout happened to break — a hint about a page
          // size this document no longer has, not something the author asked for.
          break
        case 'note':
        case 'annotation':
          break // footnotes and comments are not body text
        case 'a': {
          const href = attr(element, 'href') ?? undefined
          walk(element, { ...context, link: href ?? context.link })
          break
        }
        case 'span': {
          const styleName = attr(element, 'style-name') ?? undefined
          walk(element, {
            ...context,
            bold: resolve(context.styles, styleName, 'bold') ?? context.bold,
            italic: resolve(context.styles, styleName, 'italic') ?? context.italic
          })
          break
        }
        default:
          walk(element, context)
      }
    }
  }

  walk(el, ctx)
  return runs
}

function paragraphRuns(p: Element, styles: Map<string, StyleInfo>): Run[] {
  const styleName = attr(p, 'style-name') ?? undefined
  return inlineRuns(p, {
    styles,
    bold: resolve(styles, styleName, 'bold'),
    italic: resolve(styles, styleName, 'italic')
  })
}

function splitOnBreaks(runs: Run[]): Run[][] {
  const out: Run[][] = []
  let current: Run[] = []
  for (const run of runs) {
    const parts = run.text.split(LINE_BREAK)
    parts.forEach((part, i) => {
      if (i > 0) {
        out.push(current)
        current = []
      }
      if (part) current.push({ ...run, text: part })
    })
  }
  out.push(current)
  return out
}

function isBlank(runs: Run[]): boolean {
  return runs.every((r) => !r.text.trim())
}

// ---- Lists ----------------------------------------------------------------
interface FlatItem {
  runs: Run[]
  level: number
  ordered: boolean
}

/**
 * Flatten a (possibly nested) `text:list` into items carrying their depth. Only
 * the outermost list names a style; the nested ones inherit it, which is why the
 * style name is threaded down rather than re-read at each level.
 */
function flattenList(
  list: Element,
  styles: Map<string, StyleInfo>,
  listStyles: ListStyles,
  inheritedStyleName: string | undefined,
  level: number,
  out: FlatItem[]
) {
  const styleName = attr(list, 'style-name') ?? inheritedStyleName
  const levels = styleName ? listStyles.get(styleName) : undefined
  // An unlisted level falls back to level 0's kind, then to a bullet — better a
  // bullet than a number nobody asked for.
  const ordered = levels?.get(level) ?? levels?.get(0) ?? false

  for (const item of children(list)) {
    if (item.localName !== 'list-item' && item.localName !== 'list-header') continue
    let first = true
    for (const node of children(item)) {
      if (node.localName === 'list') {
        flattenList(node, styles, listStyles, styleName, level + 1, out)
        continue
      }
      if (node.localName !== 'p' && node.localName !== 'h') continue
      for (const runs of splitOnBreaks(paragraphRuns(node, styles))) {
        if (isBlank(runs)) continue
        out.push({ runs, level, ordered })
        first = false
      }
      // A list item whose only paragraph was empty still occupies a bullet.
      if (first) {
        out.push({ runs: [{ text: '' }], level, ordered })
        first = false
      }
    }
  }
}

/** Group flattened items into `ul`/`ol` blocks, splitting where the kind changes. */
function listBlocks(items: FlatItem[]): Block[] {
  const blocks: Block[] = []
  let current: { ordered: boolean; items: ListItem[] } | null = null
  for (const item of items) {
    if (!current || current.ordered !== item.ordered) {
      if (current?.items.length) blocks.push({ kind: current.ordered ? 'ol' : 'ul', items: current.items })
      current = { ordered: item.ordered, items: [] }
    }
    current.items.push({ runs: item.runs, level: item.level })
  }
  if (current?.items.length) blocks.push({ kind: current.ordered ? 'ol' : 'ul', items: current.items })
  return blocks
}

// ---- Tables ---------------------------------------------------------------
function readTable(table: Element, styles: Map<string, StyleInfo>): Block | null {
  const rows: Run[][][] = []
  const collectRows = (el: Element) => {
    for (const node of children(el)) {
      // Rows can sit inside header/row-group wrappers, so recurse rather than
      // only looking at direct children.
      if (node.localName === 'table-row') {
        const cells: Run[][] = []
        for (const cell of children(node)) {
          if (cell.localName !== 'table-cell' && cell.localName !== 'covered-table-cell') continue
          const runs: Run[] = []
          for (const p of descendants(cell, 'p')) {
            const cellRuns = paragraphRuns(p, styles)
            if (runs.length && cellRuns.length) runs.push({ text: ' ' })
            runs.push(...cellRuns.map((r) => ({ ...r, text: r.text.replace(/[\n\t]/g, ' ') })))
          }
          cells.push(runs)
        }
        if (cells.length) rows.push(cells)
        continue
      }
      if (node.localName?.startsWith('table-') || node.localName === 'table') collectRows(node)
    }
  }
  collectRows(table)
  if (!rows.length) return null
  return { kind: 'table', header: rows[0], rows: rows.slice(1) }
}

// ---- Body -----------------------------------------------------------------
// ---- Page setup -----------------------------------------------------------
//
// ODF says orientation in a different place from Word, and via one more hop.
// `styles.xml` holds `style:page-layout` elements (the paper) and
// `style:master-page` elements (a named page design pointing at one), and a
// paragraph moves the document onto a new master page by using a style that
// carries `style:master-page-name`.
//
// ⚠️ And the sense is the OPPOSITE of Word's. Word's `sectPr` rides on the LAST
// paragraph of the section it describes; ODF's master-page-name rides on the
// FIRST paragraph of the new one. Reading them the same way puts every change
// one page out.
//
// The document opens on the master page named "Standard" — ODF's fixed default
// name — falling back to whichever master page is declared first for producers
// that use another.

const UNIT_TO_POINTS: Record<string, number> = {
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  in: 72,
  pt: 1,
  pc: 12,
  px: 0.75
}

/** `21.001cm` -> 595.3pt. Null for anything that is not a length we know. */
function lengthToPoints(value: string | null): number | null {
  if (!value) return null
  const m = /^(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)$/i.exec(value.trim())
  if (!m) return null
  const n = Number(m[1])
  if (!isFinite(n) || n <= 0) return null
  return n * UNIT_TO_POINTS[m[2].toLowerCase()]
}

interface PageSetup {
  width: number
  height: number
}

/** Master page name -> the paper it uses. */
function collectPageSetups(stylesDoc: Document | null): {
  byMaster: Map<string, PageSetup>
  firstMaster: string | null
} {
  const byMaster = new Map<string, PageSetup>()
  let firstMaster: string | null = null
  if (!stylesDoc) return { byMaster, firstMaster }

  const layouts = new Map<string, PageSetup>()
  for (const layout of descendants(stylesDoc, 'page-layout')) {
    const name = attr(layout, 'name')
    const props = child(layout, 'page-layout-properties')
    if (!name || !props) continue
    let width = lengthToPoints(attr(props, 'page-width'))
    let height = lengthToPoints(attr(props, 'page-height'))
    if (width === null || height === null) continue
    // `style:print-orientation` is advisory — LibreOffice writes already-swapped
    // width/height alongside it, and omits it entirely for portrait. Trust the
    // measurements; use the label only to repair a file that contradicts itself.
    const orient = attr(props, 'print-orientation')?.toLowerCase()
    if (orient === 'landscape' && height > width) [width, height] = [height, width]
    if (orient === 'portrait' && width > height) [width, height] = [height, width]
    layouts.set(name, { width, height })
  }

  for (const master of descendants(stylesDoc, 'master-page')) {
    const name = attr(master, 'name')
    const layoutName = attr(master, 'page-layout-name')
    if (!name || !layoutName) continue
    const setup = layouts.get(layoutName)
    if (!setup) continue
    if (firstMaster === null) firstMaster = name
    byMaster.set(name, setup)
  }
  return { byMaster, firstMaster }
}

/** Paragraph style name -> the master page it switches to, if any. */
function collectStyleMasterPages(docs: (Document | null)[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const doc of docs) {
    if (!doc) continue
    for (const style of descendants(doc, 'style')) {
      const name = attr(style, 'name')
      const master = attr(style, 'master-page-name')
      // An EMPTY master-page-name is meaningful in ODF and means "no change" —
      // LibreOffice writes it on styles that merely inherit. Treating it as a
      // switch would restart the page on ordinary paragraphs.
      if (name && master) out.set(name, master)
    }
  }
  return out
}

function bodyToBlocks(
  body: Element,
  styles: Map<string, StyleInfo>,
  listStyles: ListStyles,
  pageSetups: Map<string, PageSetup>,
  openingMaster: string | null,
  styleMasterPages: Map<string, string>
): Block[] {
  const blocks: Block[] = []

  // The paper the document opens on, emitted before any content so the renderer
  // resizes its first page rather than leaving a blank one in front of it.
  const opening = openingMaster ? pageSetups.get(openingMaster) : undefined
  if (opening) blocks.push({ kind: 'pagesetup', width: opening.width, height: opening.height })

  let currentMaster = openingMaster
  const applyMasterPage = (styleName: string | undefined) => {
    if (!styleName) return
    const master = styleMasterPages.get(styleName)
    if (!master || master === currentMaster) return
    const setup = pageSetups.get(master)
    currentMaster = master
    if (setup) blocks.push({ kind: 'pagesetup', width: setup.width, height: setup.height })
  }

  const handle = (el: Element) => {
    switch (el.localName) {
      case 'p':
      case 'h': {
        const styleName = attr(el, 'style-name') ?? undefined
        // A master-page switch IS a page break, and a stronger one, so it is
        // applied first and the ordinary break is not also emitted.
        const before = blocks.length
        applyMasterPage(styleName)
        if (blocks.length === before && resolve(styles, styleName, 'pageBreakBefore')) {
          blocks.push({ kind: 'pagebreak' })
        }
        const outline = attr(el, 'outline-level')
        const level =
          el.localName === 'h'
            ? Number(outline ?? '1') || 1
            : styleHeadingLevel(styles, styleName)
        for (const runs of splitOnBreaks(paragraphRuns(el, styles))) {
          if (isBlank(runs)) continue
          if (level) blocks.push({ kind: headingKind(level), runs })
          else if (decodeOdfName(styleName ?? '').toLowerCase().includes('quotation')) {
            blocks.push({ kind: 'quote', runs })
          } else blocks.push({ kind: 'p', runs })
        }
        break
      }
      case 'list': {
        const flat: FlatItem[] = []
        flattenList(el, styles, listStyles, undefined, 0, flat)
        blocks.push(...listBlocks(flat))
        break
      }
      case 'table':
        {
          const table = readTable(el, styles)
          if (table) blocks.push(table)
        }
        break
      case 'sequence-decls':
      case 'forms':
      case 'tracked-changes':
        break
      case 'section':
      case 'text-box':
      case 'frame':
        // Wrappers that hold ordinary body content — descend into them.
        for (const node of children(el)) handle(node)
        break
      default:
        break
    }
  }

  for (const el of children(body)) handle(el)
  return blocks
}

// ---- Entry point ----------------------------------------------------------
async function readTitle(zip: ZipArchive): Promise<string | undefined> {
  const xml = await zip.readText('meta.xml')
  if (!xml) return undefined
  try {
    const title = descendant(parseXml(xml), 'title')?.textContent?.trim()
    return title || undefined
  } catch {
    return undefined
  }
}

/** The archive is opened by `officeToPdf.ts`, which needs it to tell the formats apart. */
export async function odtToBlocks(zip: ZipArchive): Promise<OfficeDocument> {
  const contentXml = await zip.readText('content.xml')
  if (!contentXml) {
    throw new OfficeParseError('That .odt has no content part — it may be damaged.')
  }
  const stylesXml = await zip.readText('styles.xml')

  const content = parseXml(contentXml)
  let stylesDoc: Document | null = null
  if (stylesXml) {
    try {
      stylesDoc = parseXml(stylesXml)
    } catch {
      stylesDoc = null // Losing the stylesheet costs formatting, not the import.
    }
  }

  const styles = collectStyles([stylesDoc, content])
  const listStyles = collectListStyles([stylesDoc, content])
  const { byMaster, firstMaster } = collectPageSetups(stylesDoc)
  // ODF's default master page is named "Standard"; fall back to whichever was
  // declared first for producers that name theirs something else.
  const openingMaster = byMaster.has('Standard') ? 'Standard' : firstMaster
  const styleMasterPages = collectStyleMasterPages([stylesDoc, content])

  // `office:body` wraps an `office:text`; go via the body rather than hunting
  // for the first element named "text", which several ODF namespaces also use.
  const bodyEl = descendant(content, 'body')
  const body = bodyEl ? child(bodyEl, 'text') : null
  if (!body) throw new OfficeParseError('That .odt has no readable body.')

  return {
    blocks: bodyToBlocks(body, styles, listStyles, byMaster, openingMaster, styleMasterPages),
    title: await readTitle(zip)
  }
}
