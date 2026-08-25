// Builds build/pdf-document.icns from a set of PNGs.
//
// ⚠️ electron-builder derives the macOS association icon from the Windows one
// by swapping the extension: `fileAssociations[0].icon: "build/pdf-document.ico"`
// makes it demand `build/pdf-document.icns`, and the whole mac job fails with
// "cannot find specified resource" if that file is absent. There is no
// iconutil on Windows, so the container is written by hand — it is a trivial
// format, and this keeps the two platforms' document icons in one repo without
// needing a Mac to regenerate them.
//
//   node scripts/make-icns.mjs <dir-with-icon_16.png…> [out.icns]
//
// An .icns is: "icns", a big-endian total length, then one entry per size —
// a four-character type, a big-endian length that INCLUDES its own 8-byte
// header, and the PNG bytes.
import fs from 'node:fs'
import path from 'node:path'

// The types macOS reads PNG from. 512 and 1024 are deliberately absent: the
// source .ico stops at 256, and an upscaled blur is worse than letting macOS
// scale a sharp 256 itself.
const TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
]

const dir = process.argv[2]
const out = process.argv[3] || 'build/pdf-document.icns'
if (!dir) {
  console.error('usage: node scripts/make-icns.mjs <png-dir> [out.icns]')
  process.exit(2)
}

const entries = []
for (const [type, size] of TYPES) {
  const file = path.join(dir, `icon_${size}.png`)
  if (!fs.existsSync(file)) {
    console.error(`missing ${file}`)
    process.exit(1)
  }
  const png = fs.readFileSync(file)
  if (png.readUInt32BE(0) !== 0x89504e47) {
    console.error(`${file} is not a PNG`)
    process.exit(1)
  }
  const header = Buffer.alloc(8)
  header.write(type, 0, 'ascii')
  header.writeUInt32BE(png.length + 8, 4)
  entries.push(Buffer.concat([header, png]))
}

const body = Buffer.concat(entries)
const header = Buffer.alloc(8)
header.write('icns', 0, 'ascii')
header.writeUInt32BE(body.length + 8, 4)
fs.writeFileSync(out, Buffer.concat([header, body]))

console.log(`wrote ${out} (${body.length + 8} bytes, ${TYPES.length} sizes)`)
