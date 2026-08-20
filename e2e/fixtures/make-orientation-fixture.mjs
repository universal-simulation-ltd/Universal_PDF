// Builds `orientation.docx` — a Word file that changes orientation mid-document.
//
//   node e2e/fixtures/make-orientation-fixture.mjs
//
// Written by hand rather than exported from an editor because the point of the
// fixture is the EXACT shape of the section breaks, and every editor rewrites
// them its own way. What it pins down:
//
//   • `w:sectPr` lives inside the `w:pPr` of the LAST paragraph of the section
//     it describes — not the first, which is the thing everyone gets backwards;
//   • the FINAL section's properties hang off the end of `w:body` instead;
//   • sizes are twips (twentieths of a point), so A4 portrait is 11906 × 16838.
//
// Three sections: portrait, then landscape, then portrait again — James's
// report with one landscape page in the middle of it.
//
// `orientation-libre.docx` and `orientation.odt` are this file re-saved by
// LibreOffice, so the suite also proves the parsers against a real producer's
// rewrite rather than only against XML we wrote ourselves. Worth knowing what
// that rewrite does: LibreOffice drops `w:orient` from portrait sections
// entirely and writes it FIRST on the landscape one, and the ODT it produces
// says the same thing a third way again — via master pages.
//
// It also writes `orientation-contradictory.docx`; see the note by it.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync, crc32 } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))

const A4_W = 11906
const A4_H = 16838

const sectPr = (w, h, orient) =>
  `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}" w:orient="${orient}"/>` +
  `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`

const para = (text, trailing = '') =>
  `<w:p>${trailing ? `<w:pPr>${trailing}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
  // --- Section 1: portrait. Its sectPr rides on its LAST paragraph. ---
  para('PORTRAIT SECTION ONE first paragraph') +
  para('PORTRAIT SECTION ONE last paragraph', sectPr(A4_W, A4_H, 'portrait')) +
  // --- Section 2: landscape (w/h swapped, as Word writes them). ---
  para('LANDSCAPE SECTION TWO the wide table page') +
  para('LANDSCAPE SECTION TWO last paragraph', sectPr(A4_H, A4_W, 'landscape')) +
  // --- Section 3: portrait again; its properties are on the body. ---
  para('PORTRAIT SECTION THREE back to upright') +
  sectPr(A4_W, A4_H, 'portrait') +
  `</w:body></w:document>`

// A file that CONTRADICTS ITSELF: `w:orient="landscape"` on a section whose
// width and height are portrait. Producers do emit this — it is what a document
// converted between tools looks like when one of them updates only the label.
//
// The rule the app settles on: the LABEL decides which way round the page goes,
// the MEASUREMENTS decide what paper it is. Nothing about that is obvious, so
// the fixture exists to make it a decision on the record rather than an
// accident of whichever branch happened to be written first.
const contradictoryXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
  para('CONTRADICTORY the label says landscape, the numbers say portrait') +
  `<w:sectPr><w:pgSz w:w="${A4_W}" w:h="${A4_H}" w:orient="landscape"/>` +
  `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
  `</w:body></w:document>`

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`

const rels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`

// --- Minimal ZIP writer (deflate, no dependency) ----------------------------
function writeDocx(documentXml, outName) {
const files = [
  ['[Content_Types].xml', contentTypes],
  ['_rels/.rels', rels],
  ['word/document.xml', documentXml]
]

const chunks = []
const central = []
let offset = 0
for (const [name, text] of files) {
  const nameBuf = Buffer.from(name, 'utf8')
  const raw = Buffer.from(text, 'utf8')
  const data = deflateRawSync(raw)
  const crc = crc32(raw) >>> 0

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)      // version needed
  local.writeUInt16LE(0, 6)       // flags
  local.writeUInt16LE(8, 8)       // deflate
  local.writeUInt16LE(0, 10)      // time
  local.writeUInt16LE(0x21, 12)   // date (1 Jan 1980-ish; fixed so the file is reproducible)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(raw.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)
  chunks.push(local, nameBuf, data)

  const cen = Buffer.alloc(46)
  cen.writeUInt32LE(0x02014b50, 0)
  cen.writeUInt16LE(20, 4)
  cen.writeUInt16LE(20, 6)
  cen.writeUInt16LE(0, 8)
  cen.writeUInt16LE(8, 10)
  cen.writeUInt16LE(0, 12)
  cen.writeUInt16LE(0x21, 14)
  cen.writeUInt32LE(crc, 16)
  cen.writeUInt32LE(data.length, 20)
  cen.writeUInt32LE(raw.length, 24)
  cen.writeUInt16LE(nameBuf.length, 28)
  cen.writeUInt32LE(0, 38)        // external attrs
  cen.writeUInt32LE(offset, 42)
  central.push(cen, nameBuf)

  offset += local.length + nameBuf.length + data.length
}

const centralBuf = Buffer.concat(central)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralBuf.length, 12)
end.writeUInt32LE(offset, 16)

const out = join(HERE, outName)
writeFileSync(out, Buffer.concat([...chunks, centralBuf, end]))
console.log('wrote', out)
}

writeDocx(documentXml, 'orientation.docx')
writeDocx(contradictoryXml, 'orientation-contradictory.docx')

console.log('')
console.log('To refresh the real-producer twins (needs LibreOffice):')
console.log('  node e2e/fixtures/make-orientation-fixture.mjs')
console.log('  /Applications/LibreOffice.app/Contents/MacOS/soffice --headless \\')
console.log('    --convert-to docx --outdir /tmp/lo e2e/fixtures/orientation.docx')
console.log('  mv /tmp/lo/orientation.docx e2e/fixtures/orientation-libre.docx')
console.log('  /Applications/LibreOffice.app/Contents/MacOS/soffice --headless \\')
console.log('    --convert-to odt --outdir /tmp/lo e2e/fixtures/orientation.docx')
console.log('  mv /tmp/lo/orientation.odt e2e/fixtures/orientation.odt')
