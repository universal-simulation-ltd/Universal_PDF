// Markdown → the shared block model in `blockPdf.ts`, which does the laying
// out. This file is the *parser* half only: everything about fonts, wrapping,
// pagination and the house look lives next door, so a Word or ODF import gets
// exactly the same treatment (see `officeToPdf.ts`).

import {
  blocksToPdf,
  safeFilename,
  sanitize,
  type Block,
  type BuildOptions,
  type ListItem,
  type Orientation,
  type PaperSize,
  type Run
} from './blockPdf'

export type { BuildOptions, Orientation, PaperSize }

// ---- Inline parser --------------------------------------------------------
function parseInline(text: string): Run[] {
  const runs: Run[] = []
  const RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = RE.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('**') || tok.startsWith('__')) {
      runs.push({ text: tok.slice(2, -2), bold: true })
    } else if (tok[0] === '*' || tok[0] === '_') {
      runs.push({ text: tok.slice(1, -1), italic: true })
    } else if (tok[0] === '`') {
      runs.push({ text: tok.slice(1, -1), code: true })
    } else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
      if (lm) runs.push({ text: lm[1], link: lm[2] })
    }
    last = m.index + tok.length
  }
  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs.length ? runs : [{ text }]
}

function parseTableRow(line: string): Run[][] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => parseInline(c.trim()))
}

// ---- Block parser ---------------------------------------------------------
function isBlockStart(line: string): boolean {
  if (!line.trim()) return false
  if (/^#{1,6}\s/.test(line)) return true
  if (line.startsWith('```')) return true
  if (line.startsWith('>')) return true
  if (/^[-*]\s+/.test(line)) return true
  if (/^\d+\.\s+/.test(line)) return true
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true
  if (line.startsWith('|')) return true
  return false
}

function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    if (line.startsWith('```')) {
      i++
      const buf: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      blocks.push({ kind: 'code', text: buf.join('\n') })
      continue
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      const kind = (['h1', 'h2', 'h3'] as const)[h[1].length - 1]
      blocks.push({ kind, runs: parseInline(h[2]) })
      i++
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }

    if (line.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1])) {
      const header = parseTableRow(line)
      i += 2
      const rows: Run[][][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(parseTableRow(lines[i]))
        i++
      }
      blocks.push({ kind: 'table', header, rows })
      continue
    }

    if (line.startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ kind: 'quote', runs: parseInline(buf.join(' ')) })
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ListItem[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push({ runs: parseInline(lines[i].replace(/^[-*]\s+/, '')) })
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ListItem[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push({ runs: parseInline(lines[i].replace(/^\d+\.\s+/, '')) })
        i++
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    const buf: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: 'p', runs: parseInline(buf.join(' ')) })
  }
  return blocks
}

// ---- Entry points ---------------------------------------------------------
export async function markdownToPdf(text: string, options: BuildOptions = {}): Promise<Uint8Array> {
  // Clean the source *before* parsing, not just before drawing: pasted bullet
  // glyphs become the `*` that makes them a list, and a stray em dash becomes a
  // hyphen rather than a `?`.
  const sanitized = sanitize(text, { markdownGlyphs: true })
  return blocksToPdf(parseMarkdown(sanitized), options)
}

export async function markdownToPdfFile(text: string, options: BuildOptions = {}): Promise<File> {
  const title = options.title || guessTitle(text) || 'document'
  const bytes = await markdownToPdf(text, { ...options, title })
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const name = `${safeFilename(title)}.pdf`
  return new File([blob], name, { type: 'application/pdf' })
}

function guessTitle(text: string): string {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = /^#{1,3}\s+(.+)$/.exec(line)
    if (m) return m[1].replace(/[*_`]+/g, '').trim()
  }
  const first = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  return (first ?? '').slice(0, 60)
}
