// PDF → Word: words into lines, lines into headings and paragraphs, and the
// files inside the .docx.
//
//   npm run test:pdf-to-docx
//
// Runs under Node's type-stripping; layout.ts and docx.ts import only types.
//
// What is pinned (James, 2026-10-18: "Export to Word (.docx)"): the text comes
// out as the paragraphs a reader sees — wrapped lines joined, a word broken
// over a line rejoined, a gap or a set-in first line starting a new one; a
// line clearly bigger than the body is a real Word heading, the biggest
// Heading 1; bold and italic kept; lists keep their own bullet or number; a
// page with no text is a picture of the page; one page break per page. The
// browser half (pdf.js reading a real PDF, the dialog, the file read back by
// the suite's own Word reader) is e2e/word-export.e2e.mjs.

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDocx, linesFromBits } from '../src/lib/pdfToDocx/layout.ts'
import { docxEntries, xmlText } from '../src/lib/pdfToDocx/docx.ts'

// A line of words, 6pt a character, from (x, y).
const words = (text, x, y, size = 11, style = {}) => {
  const out = []
  let cx = x
  for (const w of text.split(' ')) {
    out.push({ str: w, x: cx, y, width: w.length * size * 0.5, size, bold: !!style.bold, italic: !!style.italic, eol: false })
    cx += w.length * size * 0.5 + size * 0.3
  }
  out[out.length - 1].eol = true
  return out
}
const page = (bits, extra = {}) => ({ width: 595, height: 842, bits, ...extra })
const textOf = (b) => b.runs.map((r) => r.text).join('')

test('words on one baseline are one line, with spaces between them', () => {
  const [l] = linesFromBits(words('The quick brown fox', 72, 100))
  assert.equal(l.runs.map((r) => r.text).join(''), 'The quick brown fox')
})

test('wrapped lines are one paragraph; a gap starts the next', () => {
  const doc = buildDocx([page([
    ...words('This is the first line of a paragraph that', 72, 100),
    ...words('carries on here and ends.', 72, 114),
    ...words('A second paragraph after a gap.', 72, 150)
  ])])
  assert.deepEqual(doc.blocks.map((b) => [b.kind, textOf(b)]), [
    ['paragraph', 'This is the first line of a paragraph that carries on here and ends.'],
    ['paragraph', 'A second paragraph after a gap.']
  ])
})

test('a word hyphenated over a line break is put back together', () => {
  const doc = buildDocx([page([...words('the infor-', 72, 100), ...words('mation is here', 72, 114)])])
  assert.equal(textOf(doc.blocks[0]), 'the information is here')
})

test('a set-in first line starts a new paragraph', () => {
  const doc = buildDocx([page([
    ...words('Ends the first one.', 72, 100),
    ...words('Starts the second, set in.', 100, 114)
  ])])
  assert.equal(doc.blocks.length, 2)
})

test('bigger lines are headings, the biggest Heading 1', () => {
  const doc = buildDocx([page([
    ...words('Annual Report', 72, 80, 24),
    ...words('Summary', 72, 120, 16),
    ...words('Body text one two three four five six seven eight nine ten.', 72, 150),
    ...words('More body text, so the body size is clear to see here.', 72, 190),
    ...words('Details', 72, 230, 16)
  ])])
  assert.equal(doc.bodySizePt, 11)
  assert.deepEqual(doc.blocks.filter((b) => b.kind === 'heading').map((b) => [b.level, textOf(b)]), [[1, 'Annual Report'], [2, 'Summary'], [2, 'Details']])
})

test('bold and italic are kept, and runs that look the same are joined', () => {
  const doc = buildDocx([page([
    ...words('Plain then', 72, 100).map((b) => ({ ...b, eol: false })),
    { str: 'bold', x: 140, y: 100, width: 22, size: 11, bold: true, italic: false, eol: false },
    { str: 'words', x: 166, y: 100, width: 27, size: 11, bold: true, italic: false, eol: true }
  ])])
  const runs = doc.blocks[0].runs
  assert.deepEqual(runs.map((r) => [r.text, !!r.bold]), [['Plain then ', false], ['bold words', true]])
})

test('a space after a bold word is plain', () => {
  const doc = buildDocx([page([
    { str: 'The ', x: 72, y: 100, width: 20, size: 11, bold: false, italic: false, eol: false },
    { str: 'main driver ', x: 92, y: 100, width: 60, size: 11, bold: true, italic: false, eol: false },
    { str: 'was custom.', x: 152, y: 100, width: 55, size: 11, bold: false, italic: false, eol: true }
  ])])
  assert.deepEqual(doc.blocks[0].runs.map((r) => [r.text, !!r.bold]), [['The ', false], ['main driver', true], [' was custom.', false]])
})

test('a list keeps its bullets and numbers as typed, wrapped lines included', () => {
  const doc = buildDocx([page([
    ...words('• First point that wraps onto', 72, 100),
    ...words('a second line', 84, 114),
    ...words('• Second point', 72, 128),
    ...words('3. Numbered as it was', 72, 142)
  ])])
  assert.deepEqual(doc.blocks.map((b) => [b.listItem, textOf(b)]), [
    [true, '• First point that wraps onto a second line'],
    [true, '• Second point'],
    [true, '3. Numbered as it was']
  ])
})

test('a page break between pages; a page with no text is a picture of it', () => {
  const png = new Uint8Array([137, 80, 78, 71])
  const doc = buildDocx([page(words('Page one.', 72, 100)), page([], { picture: png, width: 612, height: 792 }), page(words('Page three.', 72, 100))])
  assert.deepEqual(doc.blocks.map((b) => b.kind), ['paragraph', 'pagebreak', 'picture', 'pagebreak', 'paragraph'])
  assert.equal(doc.blocks[2].png, png)
})

test('the .docx files: parts, styles, page size, escaping', () => {
  const doc = buildDocx([
    page([...words('Q&A <draft>', 72, 80, 20), ...words('Tom & Jerry say "hi"', 72, 120)]),
    page([], { picture: new Uint8Array([1, 2, 3]) })
  ])
  const entries = docxEntries(doc)
  assert.deepEqual(entries.map((e) => e.name), ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/media/page-1.png'])
  const xml = (name) => new TextDecoder().decode(entries.find((e) => e.name === name).data)
  const d = xml('word/document.xml')
  assert.match(d, /<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Q&amp;A &lt;draft&gt;<\/w:t>/)
  assert.match(d, /Tom &amp; Jerry say &quot;hi&quot;/)
  assert.match(d, /<w:br w:type="page"\/>/)
  assert.match(d, /<a:blip r:embed="rIdImg1"\/>/)
  assert.match(d, /<w:pgSz w:w="11900" w:h="16840"\/>/)
  assert.match(xml('word/_rels/document.xml.rels'), /Id="rIdImg1"[^>]*Target="media\/page-1.png"/)
  assert.match(xml('word/styles.xml'), /w:styleId="Heading1"[\s\S]*<w:outlineLvl w:val="0"\/>/)
  assert.match(xml('[Content_Types].xml'), /Extension="png"/)
})

test('characters XML forbids are dropped', () => {
  assert.equal(xmlText('a\u0001b\u000Bc\td'), 'abc\td')
})
