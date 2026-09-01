// Locking a PDF — does a DIFFERENT implementation open it?
//
//   npm run test:encrypt
//
// ⚠️ The point of this file is that it does not check our own work with our
// own code. `pdfCrypto.ts` round-tripping against itself proves nothing: a
// hash with the wrong loop bound, a missing salt, or AES in the wrong mode all
// round-trip perfectly and produce a file no other reader on earth can open.
// So every assertion below goes through pdf.js's security handler — a separate
// implementation, written from the same spec by other people, and the one that
// will actually be reading these files inside this very app.
//
// ⚠️ The WRITE direction is additionally verified against Ghostscript by hand
// (it opens our files with the password, refuses them without, and reports no
// conformance warnings).
//
// The READ direction used to be the gap: `decryptPdf` was only ever pointed at
// files this module itself wrote, because Ghostscript cannot produce revision 6
// ("Encryption revisions 2 and 3 are only supported"). CLOSED 2026-09-01 with
// LibreOffice, which can — see "Opening a file this app did NOT write" below.
// It found a real bug on the first attempt: a PDF locked by LibreOffice would
// NOT open. ⚠️ Still nothing here is a file written by Acrobat or Word
// specifically; those remain unproven, and a fixture from either is worth
// adding the day one turns up.
//
// Negative controls (2026-09-01, actually run, all four red):
//   - Truncating Algorithm 2.B's loop to a fixed 64 rounds: pdf.js then
//     rejects the CORRECT password.
//   - Hashing the owner password against U[0..31] instead of the full 48
//     bytes: pdf.js then refuses to open the file as its owner.
//   - Dropping the string shape guard in `decryptStrings`: the LibreOffice file
//     stops opening (2 red).
//   - Dropping the `/EncryptMetadata false` exemption: the hand-built fixture
//     stops opening (2 red).
//
// ⚠️ The second control passed silently until an owner password was added
// below. With owner and user set to the same string — which is what the app
// ships — /O is never the thing a reader authenticates against, so the entire
// owner half of `buildEncryptionValues` could be wrong and nothing noticed.

import fs from 'node:fs'
import zlib from 'node:zlib'
import { PDFDocument, StandardFonts, PDFName, PDFNumber, PDFBool, PDFRawStream } from 'pdf-lib'
import { encryptPdf, decryptPdf, isEncryptedPdf, WrongPasswordError, UnsupportedEncryptionError } from '../src/lib/pdfEncrypt.ts'
import { passwordBytes, passwordWarning, checkUserPassword, buildEncryptionValues } from '../src/lib/pdfCrypto.ts'

let pass = 0
let fail = 0
function ok(cond, label) {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}`)
  }
}
async function throws(fn, label) {
  try {
    await fn()
    fail++
    console.log(`  ✗ ${label} (expected it to throw, it did not)`)
  } catch {
    pass++
    console.log(`  ✓ ${label}`)
  }
}

// pdf.js's node entry.
//
// ⚠️ `workerSrc` must point at a real worker file. Leaving it empty makes
// pdf.js fail to start one at all — and that failure throws from
// `getDocument`, which is indistinguishable from "the password was rejected"
// to the `throws()` helper below. The two refusal tests passed against a
// broken worker before this was set, which is the most dangerous kind of green.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).href

/**
 * Open and assert, reporting a refusal as a normal red line.
 *
 * ⚠️ Without this, a document that fails to open takes the whole run down with
 * an unhandled PasswordException from inside pdf.js — a stack trace where a
 * `✗` belongs, and every later test silently unrun. Both negative controls
 * above land here, so this is the path that has to stay readable.
 */
async function opensWith(bytes, password, pages, label) {
  try {
    const pdf = await openWith(bytes, password)
    ok(pdf.numPages === pages, label)
    return pdf
  } catch (e) {
    fail++
    console.log(`  ✗ ${label} (${e?.message ?? e})`)
    return null
  }
}

async function openWith(bytes, password) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    password,
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  return await task.promise
}

/** A small but not trivial document: text, a font, metadata, two pages. */
async function samplePdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.setTitle('Quarterly figures')
  doc.setAuthor('Universal Simulation Ltd')
  doc.setSubject('Locked document test — (parens) and \\backslashes\\')
  const p1 = doc.addPage([595, 842])
  p1.drawText('Commercially sensitive', { x: 60, y: 760, size: 24, font })
  p1.drawText('Second line of the first page.', { x: 60, y: 720, size: 12, font })
  const p2 = doc.addPage([595, 842])
  p2.drawText('Page two', { x: 60, y: 760, size: 18, font })
  return await doc.save()
}

async function textOf(pdf, pageNo) {
  const page = await pdf.getPage(pageNo)
  const content = await page.getTextContent()
  return content.items.map((i) => i.str).join(' ')
}

console.log('\nLocking a PDF (AES-256, revision 6)\n')

const plain = await samplePdf()
ok(!isEncryptedPdf(plain), 'a freshly built PDF does not look encrypted')

const PASSWORD = 'correct horse battery staple'
const locked = await encryptPdf(plain, PASSWORD)
ok(isEncryptedPdf(locked.bytes), 'the locked PDF advertises /Encrypt')
ok(locked.size > 0, 'the locked PDF has bytes')

// --- the actual security claim -------------------------------------------
await throws(() => openWith(locked.bytes), 'pdf.js refuses to open it with no password')
await throws(() => openWith(locked.bytes, 'wrong password'), 'pdf.js refuses the wrong password')

const opened = await opensWith(locked.bytes, PASSWORD, 2, 'the right password opens it, and both pages are there')

// --- and the content survived the round trip ------------------------------
const page1 = await textOf(opened, 1)
ok(page1.includes('Commercially sensitive'), 'page 1 text decrypts intact')
ok(page1.includes('Second line of the first page.'), 'page 1 second run decrypts intact')
ok((await textOf(opened, 2)).includes('Page two'), 'page 2 text decrypts intact')

// ⚠️ Metadata is a STRING, not a stream — it exercises the other half of
// `encryptStrings`, and a document whose title survives but whose pages are
// garbage (or vice versa) is exactly what a strings-only or streams-only bug
// looks like.
const meta = await opened.getMetadata()
ok(meta.info.Title === 'Quarterly figures', 'a string value decrypts intact (/Title)')
ok(meta.info.Subject.includes('(parens)'), 'a string with PDF delimiters survives')

// --- the encryption is real, not a flag ------------------------------------
//
// ⚠️ Grepping the raw bytes is NOT good enough, and the first version of this
// test made exactly that mistake. pdf-lib deflates content streams, so
// 'Commercially sensitive' is absent from an ordinary unencrypted PDF too --
// the assertion passed while proving nothing at all. What an attacker actually
// gets for free is the raw bytes PLUS anything that inflates, so that is what
// gets searched.
function recoverableText(bytes) {
  const buf = Buffer.from(bytes)
  const latin = buf.toString('latin1')
  const parts = [latin]

  // Every stream that inflates. pdf-lib deflates content streams, so without
  // this step a search finds nothing in an ORDINARY PDF either.
  const re = /stream\r?\n/g
  let m
  while ((m = re.exec(latin)) !== null) {
    const start = m.index + m[0].length
    const end = latin.indexOf('endstream', start)
    if (end < 0) continue
    try {
      parts.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1'))
    } catch {
      // Not deflate, or encrypted -- which is the whole point.
    }
  }

  // ⚠️ And then the hex strings, in the raw bytes AND in what just inflated.
  // pdf-lib writes drawn text as `<436F6D...> Tj` and document titles as
  // UTF-16BE hex, so a reader looking for ASCII sees neither even when both
  // are entirely in the clear. Decoding them is what makes the control below
  // able to fail.
  const decoded = []
  for (const part of parts) {
    for (const [, hex] of part.matchAll(/<([0-9A-Fa-f\s]{4,})>/g)) {
      const clean = hex.replace(/\s+/g, '')
      if (clean.length % 2) continue
      const raw = Buffer.from(clean, 'hex')
      decoded.push(raw.toString('latin1'))
      if (raw[0] === 0xfe && raw[1] === 0xff) decoded.push(raw.subarray(2).swap16().toString('utf16le'))
    }
  }
  return parts.concat(decoded).join('\n')
}

// The control has to be built by the SAME writer settings as the locked file,
// or it is comparing two different things and a difference proves nothing.
const plainSameWriter = await (await PDFDocument.load(plain, { updateMetadata: false })).save({
  useObjectStreams: false,
})
const clear = recoverableText(plainSameWriter)
ok(clear.includes('Commercially sensitive'), 'control: the page text IS recoverable before locking')
ok(clear.includes('Quarterly figures'), 'control: the title IS recoverable before locking')

const haystack = recoverableText(locked.bytes)
ok(!haystack.includes('Commercially sensitive'), 'the page text is NOT recoverable from the locked file')
ok(!haystack.includes('Quarterly figures'), 'the title is NOT recoverable from the locked file')
ok(!haystack.includes('Second line of the first page.'), 'nor is any other page text')

// --- object streams must be off, or the content double-encrypts -------------
const rawLocked = Buffer.from(locked.bytes).toString('latin1')
ok(!rawLocked.includes('/ObjStm'), 'the output has no object streams')
ok(!rawLocked.includes('/XRef'), 'the output has a classic xref table, not an xref stream')

console.log('\nPasswords and PINs\n')

const pin = await encryptPdf(plain, '4913')
await opensWith(pin.bytes, '4913', 2, 'a 4-digit PIN locks and unlocks')
await throws(() => openWith(pin.bytes, '4914'), 'a neighbouring PIN is refused')

// --- the owner password, which nothing else here would exercise ------------
const twoPw = await encryptPdf(plain, 'the-user-one', { ownerPassword: 'the-owner-one' })
await opensWith(twoPw.bytes, 'the-user-one', 2, 'the user password opens a two-password file')
await opensWith(twoPw.bytes, 'the-owner-one', 2, 'the owner password opens it too')
await throws(() => openWith(twoPw.bytes, 'the-other-one'), 'a third password is still refused')

const unicode = await encryptPdf(plain, 'pässwörd–ü')
await opensWith(unicode.bytes, 'pässwörd–ü', 2, 'a non-ASCII password round-trips')

ok(passwordBytes('abc').length === 3, 'ASCII password is 1 byte per character')
ok(passwordBytes('é').length === 2, 'a non-ASCII character is its UTF-8 length')
ok(passwordBytes('a'.repeat(200)).length === 127, 'a long password truncates at 127 bytes')
ok(passwordBytes('é'.repeat(200)).length <= 127, 'truncation never exceeds 127 bytes')
ok(passwordBytes('é'.repeat(200)).length % 2 === 0, 'truncation lands on a character boundary')
ok(passwordWarning('hunter2') === null, 'an ASCII password draws no warning')
ok(passwordWarning('日本語') !== null, 'a non-Latin password warns about other readers')
ok(passwordWarning('a'.repeat(200)) !== null, 'an over-long password warns about truncation')

console.log('\nUnlocking again\n')

// ⚠️ Why decryption exists at all: pdf.js can RENDER a locked PDF, but every
// other tool in this app (annotate, flatten, compress, read signature boxes)
// goes through pdf-lib, which cannot decrypt. So the test that matters is not
// "does it render" — it is "can pdf-lib load the result", i.e. is the document
// genuinely back to being an ordinary PDF.
const unlocked = await decryptPdf(locked.bytes, PASSWORD)
ok(!isEncryptedPdf(unlocked), 'the unlocked copy no longer advertises /Encrypt')
await opensWith(unlocked, undefined, 2, 'pdf.js opens the unlocked copy with no password')

const reloaded = await PDFDocument.load(unlocked)
ok(reloaded.getPageCount() === 2, 'pdf-lib can load it — the editing pipeline works again')
ok(reloaded.getTitle() === 'Quarterly figures', 'pdf-lib reads the decrypted title')

const back = await openWith(unlocked)
ok((await textOf(back, 1)).includes('Commercially sensitive'), 'page 1 text survived the round trip')
ok((await textOf(back, 2)).includes('Page two'), 'page 2 text survived the round trip')
ok(recoverableText(unlocked).includes('Commercially sensitive'), 'and is in the clear again, as it started')

// The owner password unlocks too — the other half of `fileKeyFromPassword`.
const byOwner = await decryptPdf(twoPw.bytes, 'the-owner-one')
await opensWith(byOwner, undefined, 2, 'the owner password unlocks as well as the user one')

let wrong = null
try { await decryptPdf(locked.bytes, 'nope') } catch (e) { wrong = e }
ok(wrong instanceof WrongPasswordError, 'a wrong password raises WrongPasswordError')

let unsupported = null
try { await decryptPdf(plain, 'anything') } catch (e) { unsupported = e }
ok(unsupported instanceof UnsupportedEncryptionError, 'an unlocked PDF is refused as not locked')

// ⚠️ Lock, unlock, lock again with a different password. Chaining is where a
// leftover /Encrypt or a stale /Length shows up, and none of the single-pass
// tests above would catch it.
const relocked = await encryptPdf(unlocked, 'second-password')
await opensWith(relocked.bytes, 'second-password', 2, 'an unlocked copy can be locked again')
await throws(() => openWith(relocked.bytes, PASSWORD), 'and the ORIGINAL password no longer works')

console.log('\nOpening a file this app did NOT write\n')

// ⚠️ THIS IS THE SECTION THAT MATTERS MOST, because everything above still
// reads files written by the module under test. `scripts/fixtures/` holds two
// documents produced by LibreOffice 26.2 and nothing else — a genuinely
// separate writer, from a separate codebase, for the READ direction.
//
// Regenerate them with (macOS; any LibreOffice ≥ 7 will do):
//
//   soffice --headless \
//     --convert-to 'pdf:writer_pdf_Export:{"EncryptFile":{"type":"boolean","value":"true"},
//       "DocumentOpenPassword":{"type":"string","value":"hunter2"},
//       "SelectPdfVersion":{"type":"long","value":"20"}}' src.txt --outdir out
//
// `SelectPdfVersion` 20 (PDF 2.0) is what makes it AES-256 revision 6 —
// /V 5 /R 6 /CFM /AESV3, checked in the file. Version 17 gives /V 2 /R 3, i.e.
// RC4-128, which is the second fixture and is what LibreOffice's DEFAULT export
// produces. Ghostscript cannot write revision 6 at all, which is why this gap
// stood open until LibreOffice was tried.
const LO_PASSWORD = 'hunter2'
const loAes = new Uint8Array(fs.readFileSync(new URL('./fixtures/libreoffice-aes256-r6.pdf', import.meta.url)))

ok(isEncryptedPdf(loAes), 'the LibreOffice AES-256 file is recognised as locked')
// Proves the fixture is really sealed rather than merely claiming to be — if it
// opened unaided, every assertion below would be worthless.
await throws(() => openWith(loAes, undefined), 'pdf.js will not open the fixture without the password')

// ⚠️ Caught, not awaited bare: the regression this section exists for threw
// out of `decryptPdf` and would take the whole run down with a stack trace
// where a `✗` belongs — every later test then silently unrun. Same reasoning as
// `opensWith` above.
let loUnlocked = null
try {
  loUnlocked = await decryptPdf(loAes, LO_PASSWORD)
  ok(!isEncryptedPdf(loUnlocked), 'a PDF locked by LibreOffice unlocks, and drops its /Encrypt')
} catch (e) {
  fail++
  console.log(`  ✗ a PDF locked by LibreOffice unlocks, and drops its /Encrypt (${e?.message ?? e})`)
}
if (loUnlocked) {
  const loBack = await opensWith(loUnlocked, undefined, 1, 'pdf.js opens the result with no password')
  if (loBack) {
    ok((await textOf(loBack, 1)).includes('the quick brown fox'), 'its text came back intact')
  }
  ok((await PDFDocument.load(loUnlocked)).getPageCount() === 1, 'and pdf-lib can load it — the editing pipeline works')
}

// ⚠️ THE REGRESSION THIS FIXTURE EXISTS FOR. LibreOffice writes the PDF 2.0
// structure namespace `/NS (http://iso.org/pdf2/ssn)` as a PLAINTEXT string
// inside an encrypted document — 23 bytes, which cannot be an IV plus whole
// cipher blocks. `decryptStrings` used to hand it to WebCrypto, which threw a
// bare OperationError out of `decryptPdf`; `pdfStore.loadFile` prints the
// message of whatever it caught, so the user was shown "The operation failed
// for an operation-specific reason" and NO document. Remove the shape guard and
// this line goes red — the check is that the string is still there, unharmed.
ok(
  loUnlocked !== null && Buffer.from(loUnlocked).toString('latin1').includes('http://iso.org/pdf2/ssn'),
  'a string the writer left in the clear is passed through, not fatal and not mangled'
)

let loWrong = null
try { await decryptPdf(loAes, 'not-the-password') } catch (e) { loWrong = e }
// Worth more than the same assertion above it: this rejects against /U and /O
// values hashed by SOMEBODY ELSE'S implementation of Algorithm 2.B.
ok(loWrong instanceof WrongPasswordError, 'a wrong password on a third-party file is a wrong password, not a crash')

// The older schemes are refused BY DESIGN, and this is a real file to prove it
// on rather than a hand-built one. RC4/AES-128 derive a different key per
// object from the file ID and object number — a separate algorithm this app
// does not implement, and guessing would produce silent garbage.
const loRc4 = new Uint8Array(fs.readFileSync(new URL('./fixtures/libreoffice-rc4-128.pdf', import.meta.url)))
let loOld = null
try { await decryptPdf(loRc4, LO_PASSWORD) } catch (e) { loOld = e }
ok(loOld instanceof UnsupportedEncryptionError, 'an RC4-128 file is refused as unsupported, not as a wrong password')
ok(/older encryption scheme/.test(loOld?.message ?? ''), 'and says so in words the user can act on')

// ⚠️ `/EncryptMetadata false` — the one stream a locked PDF may legitimately
// leave readable, so a search indexer can list a document it cannot open.
// Acrobat offers it as a checkbox; nothing available on this machine writes
// one, so the fixture is built here by hand from our own encrypted output.
// That is honest for a READER test: what is under test is how `decryptPdf`
// treats the file, not who produced it.
const XMP_MARK = 'Readable to a search indexer'
const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><rdf:Description rdf:about=""><dc:title>${XMP_MARK}</dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`

const metaDoc = await PDFDocument.load(plain)
const metaRef = metaDoc.context.register(
  metaDoc.context.flateStream(xmp, { Type: 'Metadata', Subtype: 'XML' })
)
metaDoc.catalog.set(PDFName.of('Metadata'), metaRef)
const withMeta = await metaDoc.save({ useObjectStreams: false })
const sealedMeta = await encryptPdf(withMeta, PASSWORD)

// Now put that stream back in the clear and flag it, the way a writer offering
// the checkbox would have.
const reopenedSealed = await PDFDocument.load(sealedMeta.bytes, { ignoreEncryption: true, updateMetadata: false })
const openedCtx = reopenedSealed.context
for (const [ref, obj] of [...openedCtx.enumerateIndirectObjects()]) {
  if (obj instanceof PDFRawStream && String(obj.dict.get(PDFName.of('Type'))) === '/Metadata') {
    const bytes = Buffer.from(xmp, 'latin1')
    obj.dict.set(PDFName.of('Length'), PDFNumber.of(bytes.length))
    obj.dict.delete(PDFName.of('Filter'))
    openedCtx.assign(ref, PDFRawStream.of(obj.dict, new Uint8Array(bytes)))
  }
}
openedCtx.lookup(openedCtx.trailerInfo.Encrypt).set(PDFName.of('EncryptMetadata'), PDFBool.False)
const plainMetadataFile = await reopenedSealed.save({ useObjectStreams: false })

let metaUnlocked = null
try {
  metaUnlocked = await decryptPdf(plainMetadataFile, PASSWORD)
} catch (e) {
  fail++
  console.log(`  ✗ a file with /EncryptMetadata false still unlocks (${e?.message ?? e})`)
}
if (metaUnlocked) {
  await opensWith(metaUnlocked, undefined, 2, 'a file with /EncryptMetadata false still unlocks')
}
// Without the exemption this stream is decrypted anyway: AES either throws and
// costs the user the whole document, or unpads by luck and writes noise over
// the metadata. Either way this line goes red.
ok(
  metaUnlocked !== null && Buffer.from(metaUnlocked).toString('latin1').includes(XMP_MARK),
  'and its readable metadata is left alone rather than decrypted into noise'
)

console.log('\nThe pieces underneath\n')

const v = await buildEncryptionValues('s3cret')
ok(v.U.length === 48, '/U is 48 bytes')
ok(v.UE.length === 32, '/UE is 32 bytes')
ok(v.O.length === 48, '/O is 48 bytes')
ok(v.OE.length === 32, '/OE is 32 bytes')
ok(v.Perms.length === 16, '/Perms is one AES block')
ok(v.fileKey.length === 32, 'the file key is 256 bits')
ok(await checkUserPassword('s3cret', v.U), 'the user hash validates its own password')
ok(!(await checkUserPassword('s3cre', v.U)), 'a prefix of the password is refused')

const a = await buildEncryptionValues('same password')
const b = await buildEncryptionValues('same password')
// ⚠️ Two files locked with the same password must not share a key. If the
// salts were fixed, cracking one would crack every document the user ever
// sent.
ok(Buffer.compare(Buffer.from(a.U), Buffer.from(b.U)) !== 0, 'the same password gives different salts each time')
ok(Buffer.compare(Buffer.from(a.fileKey), Buffer.from(b.fileKey)) !== 0, 'the same password gives a different file key each time')

await throws(() => encryptPdf(plain, ''), 'an empty password is refused')

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
