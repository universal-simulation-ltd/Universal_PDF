// A document opened from a password-locked file must never be written to this
// device unlocked — 2026-10-01.
//
//   ./scripts/preview.sh        # Universal PDF is :5174
//   npm run test:locked-recents
//
// Opening a locked file was always kept out of recents (pdfStore `loadFile`).
// But the store forgot the lock as soon as the file was open, so deleting or
// moving a page, stripping metadata, or undoing any of those each wrote the
// UNLOCKED bytes to IndexedDB — and the result sat in Recent files, openable by
// anyone with no password. The edit auto-save and rename matched recents by
// name, so they also wrote into whichever unrelated recent shared the name.
//
// This drives the real stores in the app's own page and reads IndexedDB back.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    try {
      const mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch {
      // next candidate
    }
  }
  console.error('No usable Playwright found — see office-import.e2e.mjs.')
  process.exit(2)
}

const pdf = await PDFDocument.create()
pdf.addPage([612, 792])
pdf.addPage([612, 792])
pdf.addPage([612, 792])
const plain = Buffer.from(await pdf.save()).toString('base64')

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const page = await browser.newPage()
await page.goto(BASE)

const results = await page.evaluate(async (plainB64) => {
  const { usePdfStore } = await import('/src/stores/pdfStore.ts')
  const { useAnnotationStore } = await import('/src/stores/annotationStore.ts')
  const { listRecents, getRecentEdits } = await import('/src/lib/recents.ts')
  const { encryptPdf } = await import('/src/lib/pdfEncrypt.ts')
  const plain = Uint8Array.from(atob(plainB64), (c) => c.charCodeAt(0))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = []
  const check = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail })
  const named = async (name) => (await listRecents()).filter((r) => r.name === name)
  // ⚠️ `loadFile` starts destroying the outgoing document without awaiting
  // it, and every document shares one pdf.js worker port — so a second load
  // fired straight after a first can land in the gap ("the worker is being
  // destroyed"). A pre-existing race, not what this file tests: close first.
  const settle = async () => {
    usePdfStore.getState().reset()
    await sleep(500)
  }

  // An ordinary file called same.pdf first — the recent a name-matched write
  // would land on.
  await usePdfStore.getState().loadFile(new File([plain], 'same.pdf', { type: 'application/pdf' }))
  await sleep(800)
  const plainRecent = (await named('same.pdf'))[0]
  check('fixture: the unlocked same.pdf is in recents', plainRecent)

  const locked = (await encryptPdf(plain, 'hunter22')).bytes
  const lockedFile = () => new File([locked], 'same.pdf', { type: 'application/pdf' })
  await settle()
  await usePdfStore.getState().loadFile(lockedFile(), { password: 'hunter22' })
  check('locked file opens', usePdfStore.getState().numPages === 3)
  check('and is flagged as opened locked', usePdfStore.getState().openedLocked === true)

  const before = (await listRecents()).length
  // ⚠️ Recents are UPSERTED BY NAME (lib/recents.ts saveRecent), so the old
  // leak did not add an entry here — it overwrote same.pdf with the unlocked
  // bytes. Counting entries alone would pass against the broken code; the
  // same-named entry has to be shown untouched as well.
  const untouched = async () => {
    const [r] = await named('same.pdf')
    return (await listRecents()).length === before && r && r.lastOpened === plainRecent.lastOpened && r.size === plainRecent.size
  }

  // Marks on the locked document must not be filed under the unlocked one.
  useAnnotationStore.setState({
    annotations: [{ id: 'x', pageIndex: 0, type: 'rect', x: 10, y: 10, width: 10, height: 10, color: '#000000' }]
  })
  await sleep(1000)
  const edits = await getRecentEdits(plainRecent.id)
  check('edit auto-save does not write into a same-named recent', !(edits.annotations ?? []).some((a) => a.id === 'x'), JSON.stringify(edits.annotations))

  await usePdfStore.getState().deletePage(0)
  await sleep(500)
  check('delete page: recents untouched', await untouched())

  await usePdfStore.getState().movePage(0, 1)
  await sleep(500)
  check('move page: recents untouched', await untouched())

  await usePdfStore.getState().scrubMetadata()
  await sleep(500)
  check('strip metadata: recents untouched', await untouched())

  await usePdfStore.getState().undoDocument()
  await sleep(500)
  check('undo: recents untouched', await untouched())

  await usePdfStore.getState().renameFile('renamed.pdf')
  await sleep(300)
  check('rename: the same-named unlocked recent keeps its name', (await named('same.pdf')).length === 1 && (await named('renamed.pdf')).length === 0)

  // And an ordinary file opened afterwards is back to normal.
  await settle()
  await usePdfStore.getState().loadFile(new File([plain], 'after.pdf', { type: 'application/pdf' }))
  await sleep(500)
  check('an ordinary file after it is not flagged', usePdfStore.getState().openedLocked === false)
  await usePdfStore.getState().deletePage(0)
  await sleep(800)
  check('and its page change IS kept in recents (negative control)', (await named('after.pdf')).length === 1)

  return out
}, plain)

await browser.close()

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : `  -> ${r.detail}`}`)
}
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
