// Scan to sign, step 2 (platform 0306): the desktop only believes a phone's
// `attest` when the record matches its own channel token and the PNG it
// received — and prints nothing otherwise. Run: npm run test:attest
//
// A copy of Universal Signatures' scripts/phoneAttest.test.mjs, for this app
// ('pdf'), whose relay carries bare base64 rather than a data URL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { attestedOnDocument, pngBytes, sha256Hex, verifyPhoneAttestation, ATTEST_CHECK_URL } from '../src/lib/phoneAttest.ts'
import { appendSigningRecordPages, printPhoneAttest } from '../src/lib/phoneAttestPdf.ts'

// A real 1×1 transparent PNG, and a different one (one byte of the pixel data changed).
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const OTHER_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGB60e6kgAAAABJRU5ErkJggg=='
const PNG = `data:image/png;base64,${PNG_B64}`
const OTHER = `data:image/png;base64,${OTHER_B64}`
const TOKEN = '0123456789abcdef0123456789abcdef'
const CERT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

async function row(over = {}) {
  return {
    ok: true,
    cert_id: CERT,
    signer_email: 'signer@example.com',
    app: 'pdf',
    channel_sha256: await sha256Hex(TOKEN),
    png_sha256: await sha256Hex(pngBytes(PNG)),
    signed_at: '2026-10-22T14:07:30.123+00:00',
    ...over,
  }
}

function rpcReturning(data, error = null) {
  const calls = []
  const rpc = (fn, args) => { calls.push([fn, args]); return Promise.resolve({ data, error }) }
  return { rpc, calls }
}

const base = { attest: CERT, channelToken: TOKEN, signature: PNG_B64, app: 'pdf' }

test('hashes: the channel token as UTF-8, the PNG as decoded bytes', async () => {
  // sha256("abc") — the textbook vector.
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  // A data URL and bare base64 are the same bytes, so the same hash.
  assert.equal(await sha256Hex(pngBytes(PNG)), await sha256Hex(pngBytes(PNG_B64)))
  assert.notEqual(await sha256Hex(pngBytes(PNG)), await sha256Hex(pngBytes(OTHER)))
  // Not a PNG: nothing to hash.
  assert.equal(pngBytes('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), null)
  assert.equal(pngBytes('data:image/png;base64,bm90IGEgcG5n'), null)
  assert.equal(pngBytes('not base64!'), null)
})

test('a matching record is accepted', async () => {
  const { rpc, calls } = rpcReturning(await row())
  const a = await verifyPhoneAttestation(rpc, base)
  assert.deepEqual(calls, [['verify_phone_sign_attestation', { p_cert: CERT }]])
  assert.equal(a?.signerEmail, 'signer@example.com')
  assert.equal(a?.certId, CERT)
  assert.equal(a?.checkUrl, ATTEST_CHECK_URL + CERT)
  assert.equal(a?.checkUrl, `https://app.unisim.co.uk/check?attest=${CERT}`)
  // A data URL (the other desktops' dialect) is the same bytes.
  assert.ok(await verifyPhoneAttestation(rpc, { ...base, signature: PNG }))
})

test('anything that does not match is refused', async () => {
  const cases = {
    'another channel': [await row({ channel_sha256: await sha256Hex('someone-elses-token') }), base],
    'another image': [await row(), { ...base, signature: OTHER }],
    'another image (bare base64)': [await row(), { ...base, signature: OTHER_B64 }],
    'another app': [await row({ app: 'signatures' }), base],
    'uppercase hash': [await row({ png_sha256: (await sha256Hex(pngBytes(PNG))).toUpperCase() }), base],
    'not ok': [{ ok: false }, base],
    'no email': [await row({ signer_email: '' }), base],
    'no time': [await row({ signed_at: null }), base],
    'another cert': [await row({ cert_id: 'ffffffffffffffffffffffffffffffff' }), base],
  }
  for (const [name, [data, args]] of Object.entries(cases)) {
    assert.equal(await verifyPhoneAttestation(rpcReturning(data).rpc, args), null, name)
  }
  assert.equal(await verifyPhoneAttestation(rpcReturning(null, { message: 'offline' }).rpc, base), null, 'lookup error')
  assert.equal(await verifyPhoneAttestation(() => Promise.reject(new Error('boom')), base), null, 'lookup throws')
})

test('no lookup at all for a missing or malformed attest (older phones)', async () => {
  for (const attest of [undefined, null, '', 'nope', CERT.toUpperCase(), CERT + '0', 42]) {
    const { rpc, calls } = rpcReturning(await row())
    assert.equal(await verifyPhoneAttestation(rpc, { ...base, attest }), null, String(attest))
    assert.equal(calls.length, 0)
  }
})

// The page the line goes on: drawText is watched to see what was printed.
async function printed(attestation, signature) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const drawn = []
  const drawText = page.drawText.bind(page)
  page.drawText = (text, opts) => { drawn.push(text); drawText(text, opts) }
  const did = await printPhoneAttest(doc, page, {
    attestation,
    signature,
    texts: ({ email, time }) => ({ heading: 'Signature sent from a phone', line: `Signed by ${email} via Universal ID · ${time}` }),
    english: { heading: 'Signature sent from a phone', line: 'Signed by {email} via Universal ID · {time}' },
  })
  await doc.save() // must not throw
  return { did, drawn }
}

test('verified: the line and the check URL are printed', async () => {
  const a = await verifyPhoneAttestation(rpcReturning(await row()).rpc, base)
  const { did, drawn } = await printed(a, PNG)
  assert.equal(did, true)
  assert.ok(drawn.includes('SIGNATURE SENT FROM A PHONE'))
  assert.ok(drawn.some((t) => t === 'Signed by signer@example.com via Universal ID · 2026-10-22 14:07 UTC'), drawn.join(' | '))
  assert.ok(drawn.includes(`https://app.unisim.co.uk/check?attest=${CERT}`))
})

test('mismatch: nothing extra is printed', async () => {
  // The lookup refused it…
  const refused = await verifyPhoneAttestation(rpcReturning(await row({ png_sha256: '0'.repeat(64) })).rpc, base)
  assert.deepEqual(await printed(refused, PNG), { did: false, drawn: [] })
  // …or it was verified, but the signature was changed before signing.
  const a = await verifyPhoneAttestation(rpcReturning(await row()).rpc, base)
  assert.deepEqual(await printed(a, OTHER), { did: false, drawn: [] })
  assert.deepEqual(await printed(a, null), { did: false, drawn: [] })
})

test('a language the standard font cannot draw falls back to English', async () => {
  const a = await verifyPhoneAttestation(rpcReturning(await row()).rpc, base)
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const drawn = []
  const drawText = page.drawText.bind(page)
  page.drawText = (text, opts) => { drawn.push(text); drawText(text, opts) }
  const did = await printPhoneAttest(doc, page, {
    attestation: a,
    signature: PNG,
    texts: ({ email, time }) => ({ heading: 'Telefondan gönderilen imza', line: `${email} tarafından Universal ID ile imzalandı · ${time}` }),
    english: { heading: 'Signature sent from a phone', line: 'Signed by {email} via Universal ID · {time}' },
  })
  assert.equal(did, true)
  assert.ok(drawn.includes('Signed by signer@example.com via Universal ID · 2026-10-22 14:07 UTC'), drawn.join(' | '))
})

// ── The Signing record page (lib/signingRecord.ts → appendSigningRecordPages) ──

const PAGE_EN = {
  title: 'Signing record',
  intro: 'Universal PDF added this page when the document was saved.',
  image: 'The signature as the phone sent it',
  limits: 'What this shows: that the Universal ID named here sent exactly this signature image.',
}
const LINE_EN = { heading: 'Signature sent from a phone', line: 'Signed by {email} via Universal ID · {time}' }
const recordArgs = (qr) => ({
  page: PAGE_EN,
  englishPage: PAGE_EN,
  texts: ({ email, time }) => ({ heading: LINE_EN.heading, line: `Signed by ${email} via Universal ID · ${time}` }),
  english: LINE_EN,
  qrPngFor: qr,
})

// A one-page "document", saved without pdf-lib's own metadata so two saves compare.
async function onePager() {
  const doc = await PDFDocument.create({ updateMetadata: false })
  doc.addPage([400, 400])
  return doc
}

// Watch what lands on each page the record adds.
function watchNewPages(doc) {
  const seen = { text: [], images: 0 }
  const addPage = doc.addPage.bind(doc)
  doc.addPage = (...a) => {
    const page = addPage(...a)
    const drawText = page.drawText.bind(page)
    const drawImage = page.drawImage.bind(page)
    page.drawText = (t, o) => { seen.text.push(t); drawText(t, o) }
    page.drawImage = (img, o) => { seen.images++; seen.qrSize = o.width; drawImage(img, o) }
    return page
  }
  return seen
}

async function held(signature = PNG_B64) {
  const a = await verifyPhoneAttestation(rpcReturning(await row()).rpc, base)
  return { attestation: a, received: signature, dataUrl: 'data:image/png;base64,LIBRARYCOPY' }
}

test('attestedOnDocument: only an attested signature that is placed counts', async () => {
  const h = await held()
  const byEntry = { e1: h }
  assert.deepEqual(attestedOnDocument([], byEntry), [])
  assert.deepEqual(attestedOnDocument([{ type: 'image', src: h.dataUrl }], {}), [])
  assert.deepEqual(attestedOnDocument([{ type: 'image', src: 'data:image/png;base64,OTHER' }, { type: 'text' }], byEntry), [])
  // Placed as it is, placed then given a name (src recomposed, ink kept), or signed into a box.
  assert.deepEqual(attestedOnDocument([{ type: 'image', src: h.dataUrl }], byEntry), [h])
  assert.deepEqual(attestedOnDocument([{ type: 'image', src: 'data:composite', sig: { ink: h.dataUrl } }], byEntry), [h])
  assert.deepEqual(attestedOnDocument([{ type: 'sigfield', signed: { src: 'x', data: { ink: h.dataUrl } } }], byEntry), [h])
  // Placed twice: one record.
  assert.deepEqual(attestedOnDocument([{ type: 'image', src: h.dataUrl }, { type: 'image', src: h.dataUrl }], byEntry), [h])
})

test('no attestation: no page, and the file is byte-for-byte the same', async () => {
  const plain = await (await onePager()).save()
  const doc = await onePager()
  const records = attestedOnDocument([{ type: 'image', src: 'data:image/png;base64,PLAIN' }], {})
  assert.equal(await appendSigningRecordPages(doc, records, recordArgs()), 0)
  assert.equal(doc.getPageCount(), 1)
  assert.deepEqual(await doc.save(), plain)
})

test('attested: a Signing record page with the line, the check URL and a 72pt QR', async () => {
  const h = await held()
  const doc = await onePager()
  const seen = watchNewPages(doc)
  const asked = []
  const added = await appendSigningRecordPages(doc, [h], recordArgs(async (url) => { asked.push(url); return PNG }))
  assert.equal(added, 1)
  assert.equal(doc.getPageCount(), 2)
  assert.deepEqual(asked, [`https://app.unisim.co.uk/check?attest=${CERT}`])
  assert.ok(seen.text.includes('Signing record'), seen.text.join(' | '))
  assert.ok(seen.text.includes('SIGNATURE SENT FROM A PHONE'))
  assert.ok(seen.text.includes('Signed by signer@example.com via Universal ID · 2026-10-22 14:07 UTC'), seen.text.join(' | '))
  assert.ok(seen.text.includes(`https://app.unisim.co.uk/check?attest=${CERT}`))
  // The signature itself, then the QR (drawn last, 72pt square).
  assert.equal(seen.images, 2)
  assert.equal(seen.qrSize, 72)
  // The reloaded file has the page.
  assert.equal((await PDFDocument.load(await doc.save())).getPageCount(), 2)
})

test('attested, but not about the image the phone sent: no page', async () => {
  const h = { ...(await held()), received: OTHER_B64 }
  const doc = await onePager()
  assert.equal(await appendSigningRecordPages(doc, [h], recordArgs(async () => PNG)), 0)
  assert.equal(doc.getPageCount(), 1)
})

test('a page language the standard font cannot draw falls back to English', async () => {
  const h = await held()
  const doc = await onePager()
  const seen = watchNewPages(doc)
  const args = { ...recordArgs(), page: { title: 'İmza kaydı', intro: 'Universal PDF bu sayfayı ekledi.', image: 'İmza', limits: 'Bu sayfanın gösterdiği.' } }
  assert.equal(await appendSigningRecordPages(doc, [h], args), 1)
  assert.ok(seen.text.includes('Signing record'), seen.text.join(' | '))
  assert.ok(seen.text.includes('THE SIGNATURE AS THE PHONE SENT IT'))
})
