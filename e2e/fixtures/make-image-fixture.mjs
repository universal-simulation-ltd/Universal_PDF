// Builds `image-size.docx` and `image-size.odt` — the same two pictures, said
// both ways, for the rule that a picture is drawn at the size its AUTHOR set.
//
//   node e2e/fixtures/make-image-fixture.mjs
//
// ⚠️ THE PIXEL COUNT AND THE DISPLAY SIZE ARE DELIBERATELY FAR APART, because
// that is the only thing that makes the test discriminate. Until 2026-08-25 the
// writer drew every embedded picture at `pixels` treated as `points`, clamped
// to the text column — so a picture's resolution decided its size on the page
// and its author's choice was ignored entirely. Both fixtures below come out
// looking completely different under the two rules:
//
//   WIDE   300 x 200 px, placed at 1.5in x 1in  ->  108 x 72 pt
//          old rule: 300 x 200 pt — nearly three times too big
//   LOGO  2000 x 2000 px, placed at 0.5in       ->   36 x 36 pt
//          old rule: clamped to the 451 pt column — a postage stamp filling
//          the page, which is the 600 dpi company logo everyone has hit
//
// The PNGs are written by hand (IHDR/IDAT/IEND, one solid colour) so the
// fixture has no dependency and no binary blob checked in beside it — and so
// the pixel dimensions are unambiguous rather than whatever an editor exported.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, deflateRawSync, crc32 } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))

// --- A solid-colour PNG, written by hand -----------------------------------
function png(width, height, [r, g, b]) {
  const chunk = (type, body) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'ascii')
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])) >>> 0, 0)
    return Buffer.concat([head, body, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // colour type 2 = truecolour RGB
  // 10, 11, 12 stay 0: deflate, adaptive filtering, no interlace.

  // Each scanline is a filter byte (0 = none) followed by RGB triples.
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const WIDE = png(300, 200, [0x2f, 0x6f, 0xd8])   // blue
const LOGO = png(2000, 2000, [0xd8, 0x6f, 0x2f]) // orange

// --- A ZIP writer (deflate, no dependency) ---------------------------------
// `stored` exists for ODF's `mimetype`, which the spec requires to be the first
// entry and uncompressed.
function zip(files) {
  const chunks = []
  const central = []
  let offset = 0
  for (const { name, body, stored } of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')
    const data = stored ? raw : deflateRawSync(raw)
    const method = stored ? 0 : 8
    const crc = crc32(raw) >>> 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12)   // fixed date, so the fixture is reproducible
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
    cen.writeUInt16LE(method, 10)
    cen.writeUInt16LE(0, 12)
    cen.writeUInt16LE(0x21, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(data.length, 20)
    cen.writeUInt32LE(raw.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt32LE(0, 38)
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
  return Buffer.concat([...chunks, centralBuf, end])
}

// --- DOCX ------------------------------------------------------------------
// The display size is `wp:extent`, in EMUs: 914400 to the inch.
const EMU = (inches) => Math.round(inches * 914400)

const drawing = (rid, wIn, hIn, name) =>
  `<w:p><w:r><w:drawing>` +
  `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
  `<wp:extent cx="${EMU(wIn)}" cy="${EMU(hIn)}"/>` +
  `<wp:docPr id="1" name="${name}"/>` +
  `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData ` +
  `uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
  `r:embed="${rid}"/></pic:blipFill>` +
  `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`

const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`

const docxDocument =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
  para('IMAGE SIZE FIXTURE') +
  drawing('rId10', 1.5, 1, 'wide') +
  para('AND A HIGH RESOLUTION LOGO PLACED SMALL') +
  drawing('rId11', 0.5, 0.5, 'logo') +
  `</w:body></w:document>`

writeFileSync(join(HERE, 'image-size.docx'), zip([
  {
    name: '[Content_Types].xml',
    body:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  },
  {
    name: '_rels/.rels',
    body:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  },
  { name: 'word/document.xml', body: docxDocument },
  {
    name: 'word/_rels/document.xml.rels',
    body:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/wide.png"/>` +
      `<Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>` +
      `</Relationships>`,
  },
  { name: 'word/media/wide.png', body: WIDE },
  { name: 'word/media/logo.png', body: LOGO },
]))
console.log('wrote', join(HERE, 'image-size.docx'))

// --- ODT -------------------------------------------------------------------
// ODF says the same thing with an `svg:width` / `svg:height` on the FRAME, as a
// length with a unit. Written in centimetres on purpose: it is what LibreOffice
// emits, and it is the unit whose conversion is not a round number.
const frame = (href, wCm, hCm, name) =>
  `<text:p><draw:frame draw:name="${name}" svg:width="${wCm}cm" svg:height="${hCm}cm" text:anchor-type="as-char">` +
  `<draw:image xlink:href="${href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
  `<svg:title>${name}</svg:title>` +
  `</draw:frame></text:p>`

const IN_TO_CM = 2.54
const odtContent =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<office:document-content ` +
  `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
  `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
  `xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ` +
  `xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" ` +
  `xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2">` +
  `<office:body><office:text>` +
  `<text:p>IMAGE SIZE FIXTURE</text:p>` +
  frame('Pictures/wide.png', (1.5 * IN_TO_CM).toFixed(4), (1 * IN_TO_CM).toFixed(4), 'wide') +
  `<text:p>AND A HIGH RESOLUTION LOGO PLACED SMALL</text:p>` +
  frame('Pictures/logo.png', (0.5 * IN_TO_CM).toFixed(4), (0.5 * IN_TO_CM).toFixed(4), 'logo') +
  `</office:text></office:body></office:document-content>`

writeFileSync(join(HERE, 'image-size.odt'), zip([
  // ⚠️ First and STORED. ODF requires it; a compressed mimetype makes the file
  // unrecognisable to anything that sniffs the package rather than the name.
  { name: 'mimetype', body: 'application/vnd.oasis.opendocument.text', stored: true },
  {
    name: 'META-INF/manifest.xml',
    body:
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">` +
      `<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
      `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
      `<manifest:file-entry manifest:full-path="Pictures/wide.png" manifest:media-type="image/png"/>` +
      `<manifest:file-entry manifest:full-path="Pictures/logo.png" manifest:media-type="image/png"/>` +
      `</manifest:manifest>`,
  },
  { name: 'content.xml', body: odtContent },
  { name: 'Pictures/wide.png', body: WIDE },
  { name: 'Pictures/logo.png', body: LOGO },
]))
console.log('wrote', join(HERE, 'image-size.odt'))
