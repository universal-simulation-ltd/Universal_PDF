// PDF → Word, the last step: a DocxDoc (layout.ts) as the files inside a .docx.
// The caller zips them (lib/zip, @unisim/media) — a .docx is a ZIP of XML.
//
// The smallest set Word, LibreOffice, Pages and Google Docs all open:
// [Content_Types].xml, the package and document relationships, the document,
// and styles — real Heading 1–3 styles, so the headings drive Word's
// navigation pane and table of contents. A scanned page is a PNG in
// word/media, as large as the page's margins allow.
//
// Imports nothing at run time (scripts/pdfToDocx.test.mjs runs it in Node).

import type { DocxBlock, DocxDoc, DocxRun } from './layout'

export interface DocxEntry {
  name: string
  data: Uint8Array
}

const enc = new TextEncoder()
const TWIP = 20 // per point
const EMU = 12700 // per point
const MARGIN_PT = 72

/** Text as XML: escaped, and without the control characters XML forbids. */
export function xmlText(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function run(r: DocxRun): string {
  const props = (r.bold ? '<w:b/>' : '') + (r.italic ? '<w:i/>' : '')
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlText(r.text)}</w:t></w:r>`
}

function picture(id: number, rel: string, widthPt: number, heightPt: number): string {
  const cx = Math.round(widthPt * EMU)
  const cy = Math.round(heightPt * EMU)
  return (
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="Page ${id}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="page-${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  )
}

/** The page a scan fills, inside the margins, keeping its shape. */
function fitPicture(b: Extract<DocxBlock, { kind: 'picture' }>, doc: DocxDoc): { w: number; h: number } {
  const roomW = doc.pageWidthPt - 2 * MARGIN_PT
  const roomH = doc.pageHeightPt - 2 * MARGIN_PT
  const k = Math.min(roomW / b.widthPt, roomH / b.heightPt)
  return { w: b.widthPt * k, h: b.heightPt * k }
}

export function docxEntries(doc: DocxDoc): DocxEntry[] {
  const media: DocxEntry[] = []
  const rels: string[] = ['<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>']
  const body: string[] = []
  for (const b of doc.blocks) {
    if (b.kind === 'pagebreak') {
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    } else if (b.kind === 'picture') {
      const n = media.length + 1
      const rel = `rIdImg${n}`
      media.push({ name: `word/media/page-${n}.png`, data: b.png })
      rels.push(`<Relationship Id="${rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-${n}.png"/>`)
      const { w, h } = fitPicture(b, doc)
      body.push(picture(n, rel, w, h))
    } else {
      const style = b.kind === 'heading' ? `<w:pStyle w:val="Heading${b.level}"/>` : b.listItem ? '<w:pStyle w:val="ListItem"/>' : ''
      body.push(`<w:p>${style ? `<w:pPr>${style}</w:pPr>` : ''}${b.runs.map(run).join('')}</w:p>`)
    }
  }
  const w = Math.round(doc.pageWidthPt * TWIP)
  const h = Math.round(doc.pageHeightPt * TWIP)
  const m = MARGIN_PT * TWIP
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<w:body>${body.join('')}` +
    `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${w > h ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>` +
    '</w:body></w:document>'

  // Sizes are half-points. The body is the PDF's own body size, kept to
  // something sensible; headings step up from it.
  const bodyHp = Math.round(Math.min(14, Math.max(8, doc.bodySizePt)) * 2)
  const heading = (level: number, scale: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="${level === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${Math.round(bodyHp * scale)}"/></w:rPr></w:style>`
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="${bodyHp}"/><w:szCs w:val="${bodyHp}"/></w:rPr></w:rPrDefault>` +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    heading(1, 1.7) +
    heading(2, 1.4) +
    heading(3, 1.2) +
    // A list item as typed: its own bullet or number, then the text hung off it.
    '<w:style w:type="paragraph" w:styleId="ListItem"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:after="60"/><w:ind w:left="360" w:hanging="360"/></w:pPr></w:style>' +
    '</w:styles>'

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>'
  const packageRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'
  const documentRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`

  return [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(packageRels) },
    { name: 'word/document.xml', data: enc.encode(document) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(documentRels) },
    { name: 'word/styles.xml', data: enc.encode(styles) },
    ...media
  ]
}
