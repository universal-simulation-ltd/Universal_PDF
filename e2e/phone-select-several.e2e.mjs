// Selecting several marks on the phone — browser-level regression check.
//
//   ./scripts/preview.sh                  # or preview.ps1 — Universal PDF is :5174
//   npm run test:select-several           # in another terminal
//
// James on the iPhone (2026-10-19): "On mobile need a tap and drag to select
// multiple annotations". A mouse box-selects with a plain drag on empty page;
// a finger can't have that, because a plain drag on the page already scrolls
// the row of pages. So a finger presses and holds on empty page (350 ms), then
// drags the box. What is pinned, at iPhone size with real touch events (CDP):
//
//   • the first tap on a mark, on a page with others, says how — once;
//   • a hold and a drag selects every mark the box touches, highlighter
//     strokes included, and the pages do not move under it;
//   • a plain drag still scrolls the pages and selects nothing;
//   • a tap on empty page deselects;
//   • the group's bin deletes them all, and one undo brings them all back;
//   • dragging one of the selected marks moves them all;
//   • it works from Fill (the Text tool) too, where a long tap that doesn't
//     move still drops a text box;
//   • the page layer turns off iOS's long-press callout and text selection.
//
// Negative control: with E2E_EXPECT_OFF=1 the script expects the gesture NOT
// to select (run it against a build without the feature to prove the checks
// can fail). See docs/README.md → "Selecting several marks on a phone".

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepAppModuleUrls } from './app-modules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../backoffice/universal-platform/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
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
      /* try the next one */
    }
  }
  console.error('No usable Playwright found. Install it in a sibling Universal app.')
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
const json = (v) => JSON.stringify(v)

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
await keepAppModuleUrls(context)
const page = await context.newPage()
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(`${BASE}?app`, { waitUntil: 'load' })
} catch {
  console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
  await browser.close()
  process.exit(2)
}

const mod = (path, src, arg) =>
  page.evaluate(
    async ({ path, src, arg }) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))(path)
      // eslint-disable-next-line no-new-func
      return new Function('m', 'arg', src)(m, arg)
    },
    { path, src, arg },
  )
const store = (src, arg) => mod('/src/stores/annotationStore.ts', `const s = m.useAnnotationStore.getState(); ${src}`, arg)
const selected = () => store('return [...s.selectedIds].sort()')
const toast = () => mod('/src/native/nav.ts', 'return m.useNav.getState().toast')

await page.getByText('Try with example PDF').click()
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(1500)

const cdp = await context.newCDPSession(page)

/** One finger: down, an optional hold, a drag of (dx, dy), up. */
async function finger({ x, y, dx = 0, dy = 0, holdMs = 0, steps = 14 }) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  if (holdMs) await page.waitForTimeout(holdMs)
  for (let i = 1; i <= (dx || dy ? steps : 0); i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps, id: 1 }],
    })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(600)
}
const tap = (x, y) => finger({ x, y })

/** The scroller that holds the row of pages. */
const scrollPos = () =>
  page.evaluate(() => {
    let el = document.querySelector('[data-page-index="0"]')
    while (el && !(el.scrollWidth > el.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowX))) el = el.parentElement
    return el ? { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop) } : null
  })
const setScrollLeft = (v) =>
  page.evaluate((v) => {
    let el = document.querySelector('[data-page-index="0"]')
    while (el && !(el.scrollWidth > el.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowX))) el = el.parentElement
    if (el) el.scrollLeft = v
  }, v)

// Page 1's size in points, so marks can be put at fractions of it and found
// again on screen at the same fractions of the page's box.
const pt = await mod('/src/stores/pdfStore.ts', `
  const doc = m.usePdfStore.getState().doc
  return doc.getPage(1).then((p) => {
    const v = p.getViewport({ scale: 1 })
    return { w: v.width, h: v.height }
  })
`)

/** Three boxes in a cluster and one highlighter stroke beside them, on page 1. */
async function putMarks() {
  await store(`
    s.resetDocument()
    const { w, h } = arg
    const box = (id, fx, fy) => ({ id, pageIndex: 0, type: 'rect', x: w * fx, y: h * fy, width: w * 0.12, height: h * 0.05, color: '#1d4ed8' })
    s.addMany([
      box('box-a', 0.30, 0.42),
      box('box-b', 0.50, 0.46),
      box('box-c', 0.36, 0.53),
      { id: 'hl-d', pageIndex: 0, type: 'draw', points: [w * 0.30, h * 0.62, w * 0.45, h * 0.62, w * 0.60, h * 0.621], color: '#facc15', strokeWidth: 14, opacity: 0.4 },
    ])
    s.setSelected(null)
    s.setTool('select')
  `, pt)
  await page.waitForTimeout(400)
}

const box = async () => page.locator('[data-page-index="0"]').first().boundingBox()
const at = async (fx, fy) => {
  const b = await box()
  return { x: b.x + b.width * fx, y: b.y + b.height * fy }
}
const ALL = ['box-a', 'box-b', 'box-c', 'hl-d']

// Hold on empty page above-left of the cluster, drag to below-right of it.
async function holdAndBox() {
  const from = await at(0.24, 0.38)
  const to = await at(0.68, 0.66)
  await finger({ x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y, holdMs: 500 })
}

const expectOn = process.env.E2E_EXPECT_OFF !== '1'
if (!expectOn) console.log('\n(negative control: expecting the gesture to be OFF)')

await putMarks()

console.log('\nthe page layer turns off iOS long-press behaviour')
{
  const style = await page.evaluate(() => {
    const stage = [...document.querySelectorAll('[data-page-index="0"] div')].find((d) => d.style.touchAction)
    return stage ? { callout: stage.style.webkitTouchCallout ?? stage.style.getPropertyValue('-webkit-touch-callout'), select: stage.style.userSelect || stage.style.webkitUserSelect } : null
  })
  check('no callout, no text selection on the page layer', !!style && style.select === 'none', json(style))
}

console.log('\nthe first tap on a mark says how to select several')
{
  await mod('/src/native/nav.ts', 'm.useNav.getState().dismissToast()')
  const a = await at(0.36, 0.445)
  await tap(a.x, a.y)
  check('the tapped box is selected', json(await selected()) === json(['box-a']), json(await selected()))
  const said = await toast()
  check('…and the hint shows', expectOn ? /press and hold/i.test(said ?? '') : !said, json(said))
  const empty = await at(0.5, 0.85)
  await tap(empty.x, empty.y)
  check('a tap on empty page deselects', (await selected()).length === 0, json(await selected()))
  await mod('/src/native/nav.ts', 'm.useNav.getState().dismissToast()')
  await tap(a.x, a.y)
  check('the hint does not show twice', !(await toast()), json(await toast()))
  await tap(empty.x, empty.y)
}

console.log('\na plain drag still scrolls, and selects nothing')
{
  await setScrollLeft(0)
  await page.waitForTimeout(300)
  const before = await scrollPos()
  const from = await at(0.24, 0.38)
  await finger({ x: from.x, y: from.y, dx: -220, dy: 0 })
  await page.waitForTimeout(400)
  const after = await scrollPos()
  check('the row of pages moved', !!before && !!after && after.left - before.left > 80, json({ before, after }))
  check('nothing is selected', (await selected()).length === 0, json(await selected()))
  await setScrollLeft(0)
  await page.waitForTimeout(500)
}

console.log('\nhold, then drag: the box selects every mark it touches')
{
  const before = await scrollPos()
  await holdAndBox()
  const after = await scrollPos()
  const ids = await selected()
  if (expectOn) {
    check('all four are selected (the highlight too)', json(ids) === json(ALL), json(ids))
    check('the pages did not move under the box', json(before) === json(after), json({ before, after }))
  } else {
    check('(off) nothing is selected', ids.length < 2, json(ids))
  }
  const bin = page.getByRole('button', { name: /^Delete \d+ selected objects$/ })
  check(expectOn ? 'the group bin is on screen' : '(off) no group bin', (await bin.count()) === (expectOn ? 1 : 0))
  if (expectOn && (await bin.count())) {
    const b = await bin.boundingBox()
    const pb = await box()
    check('…inside the page', !!b && b.x >= pb.x - 1 && b.x + b.width <= pb.x + pb.width + 1, json({ b, pb }))
  }
}

// Where each mark is: a box's x, a stroke's first point.
const xs = () => store("return Object.fromEntries(s.annotations.map((a) => [a.id, a.type === 'draw' ? a.points[0] : a.x]))")

/** Drag box B (a member of the selection) 40 px right, by finger or by mouse; report how far each mark went. */
async function dragGroup(by) {
  const was = await xs()
  const steps = await store('return s.past.length')
  const b = await at(0.56, 0.475)
  const dxPx = 40
  if (by === 'mouse') {
    await page.mouse.move(b.x, b.y)
    await page.mouse.down()
    await page.mouse.move(b.x + dxPx, b.y, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(600)
  } else {
    await finger({ x: b.x, y: b.y, dx: dxPx, dy: 0, steps: 10 })
  }
  const now = await xs()
  const moved = Object.fromEntries(ALL.map((id) => [id, Math.round((now[id] - was[id]) * 10) / 10]))
  const want = (dxPx * pt.w) / (await box()).width
  return { moved, want, all: ALL.every((id) => Math.abs(moved[id] - want) < want * 0.35), steps: (await store('return s.past.length')) - steps, was }
}

console.log('\ndragging one of them moves them all')
{
  const before = await scrollPos()
  const r = await dragGroup('finger')
  if (expectOn) {
    check('all four moved by the drag, together', r.all, json({ moved: r.moved, want: Math.round(r.want) }))
    check('…as one undo step', r.steps === 1, json(r.steps))
    check('…and the pages did not scroll', json(before) === json(await scrollPos()), json({ before, after: await scrollPos() }))
    check('…and they are still selected', json(await selected()) === json(ALL), json(await selected()))
    await store('s.undo()')
    await page.waitForTimeout(300)
    check('one undo puts them all back', json(await xs()) === json(r.was), json(await xs()))
    await store('s.setSelectedIds(arg)', ALL)
    await page.waitForTimeout(300)
    // The same drag with a mouse, the website's way: the fix to the group
    // drag (see groupDrag in AnnotationLayer) is not the phone's alone.
    const m = await dragGroup('mouse')
    check('a mouse drag moves the group together too', m.all && m.steps === 1, json({ moved: m.moved, want: Math.round(m.want), steps: m.steps }))
  } else {
    check('(off) not all of them moved', !r.all, json(r.moved))
  }
}

console.log('\nthe group bin deletes them all, in one undo step')
{
  const bin = page.getByRole('button', { name: /^Delete \d+ selected objects$/ })
  if (await bin.count()) {
    const b = await bin.boundingBox()
    await tap(b.x + b.width / 2, b.y + b.height / 2)
    check('none left', (await store('return s.annotations.length')) === 0, json(await store('return s.annotations.map((a) => a.id)')))
    await store('s.undo()')
    await page.waitForTimeout(300)
    const back = await store('return s.annotations.map((a) => a.id).sort()')
    check('one undo brings all four back', json(back) === json(ALL), json(back))
  } else {
    check(expectOn ? 'the group bin was there to tap' : '(off) no group bin to tap', !expectOn)
  }
}

console.log('\nfrom Fill (the Text tool) too')
{
  await putMarks()
  await page.locator('nav[aria-label="Tools"]').getByRole('button', { name: 'Fill' }).click()
  await page.waitForTimeout(400)
  check('Fill hands you Text', (await store('return s.tool')) === 'text', await store('return s.tool'))
  await holdAndBox()
  const ids = await selected()
  if (expectOn) {
    check('all four are selected', json(ids) === json(ALL), json(ids))
    check('…and Select is in hand, so they can be dragged', (await store('return s.tool')) === 'select', await store('return s.tool'))
  } else {
    check('(off) nothing is selected', ids.length < 2, json(ids))
  }
  // A long tap that does not move still drops a text box.
  await store("s.setSelected(null); s.setTool('text')")
  const n = await store('return s.annotations.length')
  const p = await at(0.5, 0.8)
  await finger({ x: p.x, y: p.y, holdMs: 500 })
  const texts = await store("return s.annotations.filter((a) => a.type === 'text').length")
  check('a long tap without moving still drops a text box', (await store('return s.annotations.length')) === n + 1 && texts === 1, json({ n, texts }))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

await browser.close()

console.log('')
if (failures.length) {
  console.error(`${failures.length} check(s) failed:`)
  for (const f of failures) console.error(`  • ${f}`)
  process.exit(1)
}
console.log('All checks passed.')
