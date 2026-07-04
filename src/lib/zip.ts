// Minimal STORE-mode (no compression) ZIP writer. PDFs are already
// binary-compressed, so storing them uncompressed keeps the batch-export
// dependency-free while producing a standard .zip any OS can open. Everything
// runs on-device — nothing is uploaded.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

// Build a ZIP archive (store method) from the given entries.
export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Local file header (30 bytes + name), then the raw stored data.
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed to extract
    lv.setUint16(6, 0x0800, true) // general purpose flag: UTF-8 filename
    lv.setUint16(8, 0, true) // compression method: store
    lv.setUint16(10, 0, true) // mod time
    lv.setUint16(12, 0, true) // mod date
    lv.setUint32(14, crc, true) // crc-32
    lv.setUint32(18, size, true) // compressed size
    lv.setUint32(22, size, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true) // filename length
    lv.setUint16(28, 0, true) // extra field length
    local.set(nameBytes, 30)
    parts.push(local, entry.data)

    // Central directory header (46 bytes + name), collected for the tail.
    const cd = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true) // central file header signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed to extract
    cv.setUint16(8, 0x0800, true) // general purpose flag: UTF-8 filename
    cv.setUint16(10, 0, true) // compression method: store
    cv.setUint16(12, 0, true) // mod time
    cv.setUint16(14, 0, true) // mod date
    cv.setUint32(16, crc, true) // crc-32
    cv.setUint32(20, size, true) // compressed size
    cv.setUint32(24, size, true) // uncompressed size
    cv.setUint16(28, nameBytes.length, true) // filename length
    cv.setUint16(30, 0, true) // extra field length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attributes
    cv.setUint32(38, 0, true) // external attributes
    cv.setUint32(42, offset, true) // relative offset of local header
    cd.set(nameBytes, 46)
    central.push(cd)

    offset += local.length + size
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const centralOffset = offset

  // End of central directory record (22 bytes, no archive comment).
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central dir signature
  ev.setUint16(4, 0, true) // number of this disk
  ev.setUint16(6, 0, true) // disk with central dir start
  ev.setUint16(8, entries.length, true) // central dir entries on this disk
  ev.setUint16(10, entries.length, true) // total central dir entries
  ev.setUint32(12, centralSize, true) // central dir size
  ev.setUint32(16, centralOffset, true) // central dir offset
  ev.setUint16(20, 0, true) // comment length

  const total = centralOffset + centralSize + eocd.length
  const out = new Uint8Array(total)
  let p = 0
  for (const part of parts) {
    out.set(part, p)
    p += part.length
  }
  for (const cd of central) {
    out.set(cd, p)
    p += cd.length
  }
  out.set(eocd, p)
  return out
}

// Build a ZIP from the entries and trigger a browser download.
export function downloadZip(entries: ZipEntry[], zipName: string) {
  const bytes = createZip(entries)
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = zipName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
