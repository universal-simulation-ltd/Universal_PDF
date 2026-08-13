// Minimal ZIP *reader* — the mirror of the STORE-mode writer in `zip.ts`, and
// the shared front half of both office importers: `.docx` and `.odt` are both
// ZIP packages of XML, so reading one is the first thing either parser needs.
//
// Only what those two formats actually use is supported: stored (method 0) and
// deflate (method 8) entries in a plain, non-spanned archive. Inflation is the
// platform's own `DecompressionStream`, so this stays dependency-free like the
// writer next door, and — like everything else in this app — runs entirely
// on-device.

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const ZIP64_LOCATOR_SIG = 0x07064b50

export interface ZipArchive {
  /** Entry names, in central-directory order. */
  names: string[]
  has(name: string): boolean
  /** Raw bytes of one entry, or null if it isn't in the archive. */
  read(name: string): Promise<Uint8Array | null>
  /** UTF-8 text of one entry, or null if it isn't in the archive. */
  readText(name: string): Promise<string | null>
}

interface Entry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

/** Thrown for a package this reader can't open. The message is shown to the user. */
export class ZipError extends Error {}

function findEndOfCentralDirectory(view: DataView): number {
  // The EOCD record is at the very end unless the archive carries a trailing
  // comment, which is capped at 64 KB — so a bounded backwards scan always
  // finds it. Start at the earliest position a 22-byte EOCD could occupy.
  const minOffset = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let i = view.byteLength - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i
  }
  return -1
}

export async function openZip(data: ArrayBuffer | Uint8Array): Promise<ZipArchive> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const eocd = findEndOfCentralDirectory(view)
  if (eocd < 0) throw new ZipError('That file is not a valid Word or OpenDocument package.')

  const entryCount = view.getUint16(eocd + 10, true)
  const centralOffset = view.getUint32(eocd + 16, true)
  // ZIP64 parks sentinel values in the 32-bit fields and puts the real ones in
  // its own record. Office writes ZIP64 only for genuinely huge documents, so
  // rather than implement it, say plainly what happened.
  if (centralOffset === 0xffffffff || entryCount === 0xffff) {
    throw new ZipError('That document is too large to open here (ZIP64 package).')
  }
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIG) {
    throw new ZipError('That document is too large to open here (ZIP64 package).')
  }

  const decoder = new TextDecoder('utf-8')
  const entries = new Map<string, Entry>()
  const names: string[] = []
  let offset = centralOffset
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIG) {
      throw new ZipError('That document appears to be damaged (bad ZIP directory).')
    }
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const uncompressedSize = view.getUint32(offset + 24, true)
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    if (!entries.has(name)) {
      entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset })
      names.push(name)
    }
    offset += 46 + nameLen + extraLen + commentLen
  }

  async function read(name: string): Promise<Uint8Array | null> {
    const entry = entries.get(name)
    if (!entry) return null
    // The local header repeats the name and carries its own extra field, whose
    // length routinely differs from the central one — so the payload offset has
    // to be computed from the local header, not the central directory. The
    // *sizes* are read from the central directory: when the archive was written
    // as a stream (general-purpose bit 3) the local header's are left at zero.
    const local = entry.localHeaderOffset
    if (local + 30 > bytes.length) throw new ZipError('That document appears to be damaged.')
    const localNameLen = view.getUint16(local + 26, true)
    const localExtraLen = view.getUint16(local + 28, true)
    const start = local + 30 + localNameLen + localExtraLen
    const raw = bytes.subarray(start, start + entry.compressedSize)
    if (entry.method === 0) return raw
    if (entry.method !== 8) {
      throw new ZipError('That document uses an unsupported compression method.')
    }
    return inflateRaw(raw)
  }

  return {
    names,
    has: (name) => entries.has(name),
    read,
    async readText(name) {
      const buf = await read(name)
      return buf ? new TextDecoder('utf-8').decode(buf) : null
    }
  }
}

async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('This browser cannot unpack Word or OpenDocument files.')
  }
  // `deflate-raw` is the headerless deflate ZIP stores. A browser old enough to
  // have DecompressionStream without it throws on construction, so treat that
  // the same as not having it at all rather than failing later with a stack.
  let stream: DecompressionStream
  try {
    stream = new DecompressionStream('deflate-raw')
  } catch {
    throw new ZipError('This browser cannot unpack Word or OpenDocument files.')
  }
  // `raw` is a view onto the whole archive; Response wants just this slice.
  const sliced = raw.slice()
  const decompressed = new Response(sliced as unknown as BodyInit).body?.pipeThrough(stream)
  if (!decompressed) throw new ZipError('That document appears to be damaged.')
  const buf = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buf)
}
