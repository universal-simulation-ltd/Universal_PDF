// Several PDFs in one window, one tab each — browser-level check.
//
//   ./scripts/preview.sh      # in one terminal (Universal PDF is :5174)
//   npm run test:tabs         # in another
//
// James, 2026-09-14: "If the user drops multiple PDFs in ... introduce tabs to
// easily switch between them."
//
// What it pins down is that a tab really is its OWN document: an amendment made
// in one tab is not visible in another and is still there on coming back, the
// save question is asked of the tab being closed and nobody else, and the strip
// disappears again once only one document is left. Files arrive the way a
// user's do — a real drop on the page, the strip's own + picker — and state is
// read back through the app's own module registry.
//
// This repo has no test runner of its own, so Playwright is borrowed from a
// sibling repo that does — the suite's usual arrangement for a one-file spec.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
const SAMPLE = readFileSync(join(HERE, 'fixtures', 'sample.pdf')).toString('base64')
const BLANK = readFileSync(join(HERE, 'fixtures', 'about-blank.pdf')).toString('base64')

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js'
]

async function loadPlaywright() {
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    let mod
    try {
      mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
    } catch {
      continue
    }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch {
      continue
    }
  }
  console.error('No usable Playwright found — see e2e/exit-guard.e2e.mjs for the candidate list.')
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))
page.on('dialog', (d) => {
  failures.push('unexpected alert: ' + d.message())
  void d.dismiss()
})

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

// A real drop: the same DragEvents a file dragged in from a folder produces,
// on the page rather than on any particular target — the drop zones are
// page-wide, and that is how people actually let go of files.
async function dropFiles(files) {
  await page.evaluate(async (list) => {
    const dt = new DataTransfer()
    for (const f of list) {
      const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))
      dt.items.add(new File([bytes], f.name, { type: 'application/pdf' }))
    }
    for (const type of ['dragenter', 'dragover', 'drop']) {
      document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
    }
  }, files)
}

async function state() {
  return page.evaluate(async () => {
    const { usePdfStore } = await import('/src/stores/pdfStore.ts')
    const { useTabStore } = await import('/src/stores/tabStore.ts')
    const { useFormStore } = await import('/src/stores/formStore.ts')
    const t = useTabStore.getState()
    const p = usePdfStore.getState()
    return {
      fileName: p.fileName,
      loading: p.loading,
      forms: useFormStore.getState().values.length,
      tabs: t.tabs.map((x) => x.snapshot?.fileName ?? (x.id === t.activeId ? p.fileName : null) ?? x.name)
    }
  })
}

async function until(test, timeout = 20000) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    last = await state()
    if (test(last)) return last
    await page.waitForTimeout(150)
  }
  console.log(`    (last seen: ${JSON.stringify(last)})`)
  return null
}

const strip = page.locator('[role="tablist"][aria-label="Open PDFs"]')
const tabLabels = async () => (await strip.locator('[role="tab"]').allInnerTexts()).map((t) => t.replace(/\(.*\)/, '').trim())
const saveQuestion = page.getByText('Save your changes?')

// The viewer's scroll box: the nearest scrollable ancestor of the pages.
const viewerScroll = (set) =>
  page.evaluate((to) => {
    let el = document.querySelector('[data-page-index]')
    while (el && !(el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible')) {
      el = el.parentElement
    }
    if (!el) return null
    if (to === 'middle') el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
    return { top: el.scrollTop, room: el.scrollHeight - el.clientHeight }
  }, set)

try {
  console.log('Three PDFs dropped on the start screen together')
  await dropFiles([
    { name: 'one.pdf', b64: SAMPLE },
    { name: 'two.pdf', b64: BLANK },
    { name: 'three.pdf', b64: SAMPLE }
  ])
  let s = await until((x) => x.tabs.length === 3 && !x.loading)
  check('they open as three tabs', !!s)
  check('the first one dropped is the one on screen', s?.fileName === 'one.pdf', s?.fileName)
  await strip.waitFor({ timeout: 5000 }).catch(() => {})
  check('the strip shows all three, in the order dropped', (await tabLabels()).join('|') === 'one.pdf|two.pdf|three.pdf', (await tabLabels()).join('|'))

  console.log('\nAn amendment in one tab belongs to that tab')
  await page.evaluate(async () => {
    const { useFormStore } = await import('/src/stores/formStore.ts')
    useFormStore.getState().setValue(0, 'probe', 'kept')
  })
  await page.waitForTimeout(400)
  const before = await viewerScroll('middle')
  await page.waitForTimeout(200)
  await strip.locator('[role="tab"]').nth(1).click()
  s = await until((x) => x.fileName === 'two.pdf')
  check('clicking a tab brings its document forward', !!s)
  check('the other tab’s amendment does not come with it', s?.forms === 0, `forms: ${s?.forms}`)
  check(
    'the amended tab carries the unsaved dot',
    (await strip.locator('[role="tab"]', { hasText: 'one.pdf' }).getByText('(changes not saved to a file)').count()) === 1
  )
  await strip.locator('[role="tab"]').nth(0).click()
  s = await until((x) => x.fileName === 'one.pdf')
  check('coming back, the amendment is still there', s?.forms === 1, `forms: ${s?.forms}`)
  if (before && before.room > 50) {
    await page.waitForTimeout(1200)
    const after = await viewerScroll()
    check('and so is the place the reader had scrolled to', !!after && Math.abs(after.top - before.top) < 8, `${before.top} → ${after?.top}`)
  } else {
    console.log('  – scroll position not checked: the page fits the window at this size')
  }

  console.log('\nKeyboard')
  await page.keyboard.press('Control+PageDown')
  check('Ctrl+PageDown goes to the next tab', !!(await until((x) => x.fileName === 'two.pdf', 5000)))
  await page.keyboard.press('Control+PageUp')
  check('Ctrl+PageUp comes back', !!(await until((x) => x.fileName === 'one.pdf', 5000)))

  console.log('\nClosing a tab with nothing amended just closes it')
  await page.getByRole('button', { name: 'Close two.pdf' }).click()
  s = await until((x) => x.tabs.length === 2)
  check('it goes, without a question', !!s && (await saveQuestion.count()) === 0)
  check('and the tab in front stays in front', s?.fileName === 'one.pdf' && s?.tabs.join() === 'one.pdf,three.pdf', JSON.stringify(s))

  console.log('\nClosing the amended tab asks first')
  await page.getByRole('button', { name: 'Close one.pdf' }).click()
  const worded = page.getByText('Closing its tab leaves your other PDFs open.')
  await worded.waitFor({ timeout: 5000 }).catch(() => {})
  check('the save question is asked, in words about a tab', await worded.isVisible())
  await page.getByRole('button', { name: 'Exit without saving' }).click()
  s = await until((x) => x.tabs.length === 0 && x.fileName === 'three.pdf')
  check('the last document left is simply the document — no strip', !!s && !(await strip.isVisible()))
  check('and not the start screen', !!s && (await page.locator('[data-page-index]').count()) > 0)

  console.log('\nDropping onto an open document adds a tab — it no longer replaces it')
  await dropFiles([{ name: 'four.pdf', b64: BLANK }])
  s = await until((x) => x.tabs.length === 2 && x.fileName === 'four.pdf')
  check('the dropped file opens in front, in a new tab', !!s)
  check('with three.pdf still open behind it', s?.tabs.join() === 'three.pdf,four.pdf', s?.tabs.join())
  check('and nothing was asked, because nothing was lost', (await saveQuestion.count()) === 0)

  console.log('\nThe strip’s + opens more')
  await strip.locator('input[type="file"]').setInputFiles([
    { name: 'five.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SAMPLE, 'base64') }
  ])
  s = await until((x) => x.tabs.length === 3 && x.fileName === 'five.pdf')
  check('a picked file opens in a tab beside the one it was opened from', s?.tabs.join() === 'three.pdf,four.pdf,five.pdf', s?.tabs.join())

  console.log('\nClose PDF closes only the tab in front')
  // The call Actions → File → Close PDF makes once the guard has let it through.
  await page.evaluate(async () => {
    const { usePdfStore } = await import('/src/stores/pdfStore.ts')
    usePdfStore.getState().reset()
  })
  s = await until((x) => x.tabs.length === 2 && !!x.fileName && x.fileName !== 'five.pdf')
  check('its neighbour comes forward', s?.fileName === 'four.pdf', JSON.stringify(s))
} finally {
  await browser.close()
}

console.log(failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)
