// A link in a text annotation looks on the canvas the way it will export.
//
//   ./scripts/preview.sh              # or preview.ps1 — Universal PDF is :5174
//   npm run test:link-style           # in another terminal
//
// Needs the DEV server: the annotation is put on the page through the
// `window.__stores` hook main.tsx only installs in a dev build.
//
// What is pinned (James, 2026-09-14, on the text editor's 🔗 button: "leave it
// [not clickable on the canvas], but show styling as it will appear in
// export"):
//
//   • The committed canvas and the EXPORTED FILE, rendered by pdf.js at the same
//     scale, draw the linked run the same way: glyphs and underline in the
//     annotation's own colour (no link blue), the underline under the linked
//     run only, at the same depth below the glyphs and the same thickness. Three
//     font sizes, because Konva's underline and the export's are computed
//     differently and could agree at one size by luck.
//   • The export's /Link annotation draws nothing of its own (border 0) — so
//     the text IS the whole of the link's look in the file.
//   • The OPEN EDITOR underlines the link too. This is the check that was red:
//     Tailwind's preflight gives `a` `text-decoration: inherit`, so a word you
//     had just linked looked like plain text until the edit committed.
//   • The canvas is not made clickable — nothing link-shaped appears in the DOM
//     for an annotation's link.
//
// ⚠️ HOW IT MEASURES. Not by eye: both rasters are scanned in the same page
// region for the ink rows, and the underline is the band of rows holding a
// horizontal run of ink far longer than any glyph stroke. All figures are
// reported in page points, measured at 3x so a point is three pixels.
//
// Negative control (2026-09-14, run): against the tree before this change the
// editor check goes red (`text-decoration: none`) and every canvas-vs-export
// check stays green — the canvas already matched the file; the editor did not.
// With the Konva Text's `textDecoration` forced to '' the canvas underline
// checks go red at all three sizes.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'
// Set E2E_SHOTS to a directory to keep the side-by-side crops (canvas above,
// exported file below).
const SHOTS = process.env.E2E_SHOTS
const URL_ = 'https://example.com/universal-pdf/link-style'
const COLOR = '#c2410c'

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
  if (condition) console.log(`  ✓ ${label}${detail ? `  (${detail})` : ''}`)
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => failures.push('page error: ' + e.message))

try {
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__stores, null, { timeout: 15000 })
} catch {
  console.error(`Could not reach a DEV build at ${BASE} — start it first (./scripts/preview.sh).`)
  await browser.close()
  process.exit(2)
}

// A blank A4 page: nothing on it but the annotation, so every ink pixel in the
// region is the annotation's.
await page.evaluate(async () => {
  const { PDFDocument } = await import('/node_modules/pdf-lib/dist/pdf-lib.esm.js')
  const d = await PDFDocument.create()
  d.addPage([595, 842])
  await window.__stores.pdf.getState().loadFile(new File([await d.save()], 'links.pdf', { type: 'application/pdf' }))
})
await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
await page.waitForTimeout(800)

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const [CR, CG, CB] = hex(COLOR)
const near = (rgb, tol) => !!rgb && Math.abs(rgb[0] - CR) <= tol && Math.abs(rgb[1] - CG) <= tol && Math.abs(rgb[2] - CB) <= tol

for (const fontSize of [10, 18, 40]) {
  console.log(`\n${fontSize}pt: the canvas draws the link the way the exported file does`)
  await page.evaluate(({ fontSize, COLOR, URL_ }) => {
    const s = window.__stores.ann.getState()
    s.clearAll()
    s.add({
      id: 'lnk', pageIndex: 0, type: 'text', x: 60, y: 100, text: 'Visit our site now',
      color: COLOR, fontSize,
      runs: [{ text: 'Visit ' }, { text: 'our site', link: URL_ }, { text: ' now' }],
    })
    // Deselected, so no Transformer chrome is in the raster.
    window.__stores.ann.getState().setSelected(null)
    window.__stores.ann.getState().setTool('select')
  }, { fontSize, COLOR, URL_ })
  await page.waitForTimeout(500)

  const res = await page.evaluate(async ({ fontSize, keep }) => {
    const stage = window.Konva.stages.find((s) => s.container().closest('[data-page-index="0"]'))
    const zoom = stage.scaleX()
    const PR = 3
    const k = zoom * PR // page point → raster pixel
    const kc = stage.toCanvas({ pixelRatio: PR })

    const { buildAnnotatedPdfBytes } = await import('/src/lib/export.ts')
    const { layoutText } = await import('/src/lib/textLayout.ts')
    const pdfjsLib = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'
    const st = window.__stores
    const anns = st.ann.getState().annotations
    const a = anns.find((x) => x.id === 'lnk')
    const linkRun = layoutText(a)[0].runs.find((r) => r.link)
    const bytes = await buildAnnotatedPdfBytes(st.pdf.getState().sourceBytes.slice(0), anns, 1)
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise
    const p = await doc.getPage(1)
    const links = (await p.getAnnotations()).filter((x) => x.subtype === 'Link')
    const vp = p.getViewport({ scale: k })
    const pc = document.createElement('canvas')
    pc.width = Math.round(vp.width)
    pc.height = Math.round(vp.height)
    await p.render({ canvasContext: pc.getContext('2d'), viewport: vp }).promise

    const region = {
      x0: Math.floor((a.x - 4) * k), x1: Math.ceil((a.x + fontSize * 9) * k),
      y0: Math.floor((a.y - 4) * k), y1: Math.ceil((a.y + fontSize * 1.6) * k),
    }
    const W = region.x1 - region.x0, H = region.y1 - region.y0
    const toPt = (px) => px / k

    function analyse(canvas) {
      const img = canvas.getContext('2d').getImageData(region.x0, region.y0, W, H).data
      // Ink = how far from white, weighted by coverage — the Konva raster is
      // transparent where there is no ink, pdf.js's is white.
      const ink = (i) => (img[i + 3] / 255) * Math.max(255 - img[i], 255 - img[i + 1], 255 - img[i + 2])
      const rows = []
      for (let y = 0; y < H; y++) {
        let best = 0, run = 0, bestStart = 0, start = 0
        for (let x = 0; x < W; x++) {
          if (ink((y * W + x) * 4) > 60) {
            if (!run) start = x
            if (++run > best) { best = run; bestStart = start }
          } else run = 0
        }
        rows.push({ y, best, bestStart })
      }
      // No glyph stroke is anywhere near 1.5 em of unbroken horizontal ink.
      const ul = rows.filter((r) => r.best >= fontSize * 1.5 * k)
      const ulRows = new Set(ul.map((r) => r.y))
      let gBot = -1
      const g = [0, 0, 0, 0], u = [0, 0, 0, 0]
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4
          const d = ink(i)
          if (d > 60 && !ulRows.has(y)) gBot = Math.max(gBot, y)
          // Fully-covered pixels only, for the colour: anti-aliased edges are
          // blends with the paper.
          if (d > 150 && img[i + 3] > 250) {
            const s = ulRows.has(y) ? u : g
            s[0] += img[i]; s[1] += img[i + 1]; s[2] += img[i + 2]; s[3]++
          }
        }
      }
      const avg = (s) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]].map(Math.round) : null)
      return {
        glyphColour: avg(g),
        glyphBottom: gBot >= 0 ? toPt(gBot + 1) : null,
        underline: ul.length
          ? {
              top: toPt(ul[0].y),
              bottom: toPt(ul[ul.length - 1].y + 1),
              thickness: toPt(ul.length),
              left: toPt(ul[0].bestStart) + region.x0 / k - a.x,
              right: toPt(ul[0].bestStart + ul[0].best) + region.x0 / k - a.x,
              colour: avg(u),
            }
          : null,
      }
    }

    let png = null
    if (keep) {
      const comp = document.createElement('canvas')
      comp.width = W
      comp.height = H * 2 + 6
      const c = comp.getContext('2d')
      c.fillStyle = '#fff'
      c.fillRect(0, 0, W, comp.height)
      c.drawImage(kc, region.x0, region.y0, W, H, 0, 0, W, H)
      c.fillStyle = '#94a3b8'
      c.fillRect(0, H, W, 6)
      c.drawImage(pc, region.x0, region.y0, W, H, 0, H + 6, W, H)
      png = comp.toDataURL('image/png')
    }
    return {
      canvas: analyse(kc),
      exported: analyse(pc),
      linkRun: { x: linkRun.x, width: linkRun.width },
      links: links.map((l) => ({ url: l.url, border: l.borderStyle?.width ?? null })),
      domLinks: document.querySelectorAll('[data-pdf-link], [data-page-index="0"] a[href]').length,
      png,
    }
  }, { fontSize, keep: !!SHOTS })

  if (SHOTS && res.png) {
    mkdirSync(SHOTS, { recursive: true })
    writeFileSync(join(SHOTS, `link-style-${fontSize}pt.png`), Buffer.from(res.png.split(',')[1], 'base64'))
  }

  const c = res.canvas, e = res.exported
  const fmt = (rgb) => (rgb ? `rgb(${rgb.join(',')})` : 'none')
  check('the exported file carries the link', res.links.some((l) => l.url === URL_), JSON.stringify(res.links))
  check('and its /Link annotation draws no border of its own', res.links.every((l) => !l.border), JSON.stringify(res.links))
  check('the canvas text is the annotation colour', near(c.glyphColour, 6), fmt(c.glyphColour))
  check('the exported text is the annotation colour', near(e.glyphColour, 16), fmt(e.glyphColour))
  check('the canvas underlines the link', !!c.underline)
  check('the exported file underlines the link', !!e.underline)
  if (!c.underline || !e.underline) continue
  check('the canvas underline is the text colour, not a link blue', near(c.underline.colour, 6), fmt(c.underline.colour))
  check('as is the exported one', near(e.underline.colour, 40), fmt(e.underline.colour))
  // Depth below the glyphs, not absolute y: the two renderers set the whole
  // line a fraction of a point apart, and that is not a link question.
  const cDepth = c.underline.top - c.glyphBottom
  const eDepth = e.underline.top - e.glyphBottom
  check(
    'the underline sits at the same depth below the text',
    Math.abs(cDepth - eDepth) <= 0.75,
    `canvas ${cDepth.toFixed(2)}pt, export ${eDepth.toFixed(2)}pt`,
  )
  check(
    'and is the same thickness',
    Math.abs(c.underline.thickness - e.underline.thickness) <= 0.75,
    `canvas ${c.underline.thickness.toFixed(2)}pt, export ${e.underline.thickness.toFixed(2)}pt`,
  )
  const runL = res.linkRun.x, runR = res.linkRun.x + res.linkRun.width
  check(
    'the canvas underlines the linked words and nothing else',
    Math.abs(c.underline.left - runL) <= 1.5 && Math.abs(c.underline.right - runR) <= 1.5,
    `${c.underline.left.toFixed(1)}–${c.underline.right.toFixed(1)} vs run ${runL.toFixed(1)}–${runR.toFixed(1)}`,
  )
  check(
    'over the same stretch the export does',
    Math.abs(c.underline.left - e.underline.left) <= 1.5 && Math.abs(c.underline.right - e.underline.right) <= 1.5,
    `canvas ${c.underline.left.toFixed(1)}–${c.underline.right.toFixed(1)}, export ${e.underline.left.toFixed(1)}–${e.underline.right.toFixed(1)}`,
  )
  check('the canvas grows no clickable link for it', res.domLinks === 0, `${res.domLinks} link element(s)`)
}

// ── The open editor ─────────────────────────────────────────────────────────
console.log('\nwhile the text is being edited, the link is underlined too')
await page.evaluate(({ COLOR, URL_ }) => {
  const s = window.__stores.ann.getState()
  s.clearAll()
  s.add({
    id: 'lnk', pageIndex: 0, type: 'text', x: 60, y: 100, text: 'Visit our site now', color: COLOR, fontSize: 18,
    runs: [{ text: 'Visit ' }, { text: 'our site', link: URL_ }, { text: ' now' }],
  })
  window.__stores.ann.getState().setSelected(null)
  window.__stores.ann.getState().setTool('select')
}, { COLOR, URL_ })
await page.waitForTimeout(500)
const zoom = await page.evaluate(() => window.Konva.stages.find((s) => s.container().closest('[data-page-index="0"]')).scaleX())
const pageBox = await page.locator('[data-page-index="0"] canvas').first().boundingBox()
await page.mouse.dblclick(pageBox.x + (60 + 15) * zoom, pageBox.y + (100 + 9) * zoom)
await page.waitForTimeout(600)
const ed = await page.evaluate(() => {
  const el = document.querySelector('[contenteditable="true"]')
  if (!el) return null
  const a = el.querySelector('a')
  const plain = getComputedStyle(el)
  const cs = a && getComputedStyle(a)
  return {
    hasLink: !!a,
    decoration: cs?.textDecorationLine ?? null,
    color: cs?.color ?? null,
    weight: cs?.fontWeight ?? null,
    editorColor: plain.color,
    editorWeight: plain.fontWeight,
  }
})
check('the editor opened on the text, with the link inside it', !!ed?.hasLink, JSON.stringify(ed))
check('the link is underlined in the editor', !!ed && /underline/.test(ed.decoration ?? ''), ed?.decoration)
check('in the text colour, not the browser link blue', !!ed && ed.color === ed.editorColor, `${ed?.color} vs ${ed?.editorColor}`)
check('and at the text weight', !!ed && ed.weight === ed.editorWeight, `${ed?.weight} vs ${ed?.editorWeight}`)
if (SHOTS) {
  await page.screenshot({
    path: join(SHOTS, 'link-style-editor.png'),
    clip: { x: pageBox.x + 40 * zoom, y: pageBox.y + 85 * zoom, width: 220 * zoom, height: 40 * zoom },
  })
}
await page.keyboard.press('Escape')

await browser.close()

console.log('')
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`)
  for (const f of failures) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('All checks passed.')
