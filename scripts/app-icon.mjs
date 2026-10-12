#!/usr/bin/env node
// Universal PDF's own icon (James, 2026-10-12, the Cobalt sketch from the
// 2026-10-11 icon proposal): a cream page with its corner folded, filling a
// cobalt ground, five fat lines of text and a UNI·SIM orange highlighter
// across the middle one. Drawn once, below; every phone and desktop file is
// rendered from it.
//
//   PLAYWRIGHT=../../backoffice/universal-platform/node_modules/playwright/index.mjs \
//     node scripts/app-icon.mjs
//
// PDF's installed icons are its own, not the suite mark on the orange tile, so
// the suite generators skip them (`ownNativeIcon` and `ownDesktopIcon` in
// backoffice/universal-platform/scripts/app-marks/marks.mjs). Three things stay
// the suite's, by James's 2026-10-11 rule: the favicon and switcher glyph (a
// 16 px tab can't carry this), the installer (`build/installer-icon.ico`, the
// orange tile with the globe seal: an installer isn't the app), and the
// website and portal tiles until PDF is out on every platform.
//
// What it writes:
//   iOS      AppIcon (1024, opaque) and the launch splash (2732, the icon on
//            the phone app's paper)
//   Android  legacy ic_launcher / ic_launcher_round, the adaptive icon as two
//            layers (the cobalt ground behind, the page in front), the splash
//            mark, and the splash background colour
//   Desktop  build/app-icon.png (Windows + Linux: rounded, full bleed),
//            build/app-icon-mac.png (macOS: inset on Apple's 824 grid so it
//            sits the same size as other dock icons), and the .pdf file icon
//            build/document-icon.ico + .icns (a page with this icon as its
//            badge)
//   Web      src/assets/app-icon.png (144, rounded): the icon over the
//            landing page's "Download it for offline use" row, so the
//            download shows what you'll get (James, 2026-10-12)
//
// ⚠️ No lettering. "PDF" on the old tile was unreadable at 40 px; the folded
// corner already says document. Keep every stroke ≥ ~40/1024.
//
// ⚠️ ADAPTIVE LAYERS ARE 108dp, AND A LAUNCHER SHOWS ONLY THE MIDDLE ~72dp.
// The layers draw the art with the viewBox widened (1660 for 1024, as
// Jukebox's), so what a launcher shows matches the iOS icon. The page runs on
// past the bottom edge for launchers that mask less.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright')

/** The splash ground: the paper the phone app opens on. */
const PAPER = '#f4f1ea'
/** The ground's dark end, for opaque corners. */
const COBALT_DEEP = '#173a94'

/**
 * The icon as SVG on a 1024 grid.
 * @param {{ wide?: boolean, back?: boolean, page?: boolean }} o
 *   wide — the 108dp adaptive canvas (viewBox widened, see the header);
 *   back / page — which layers to draw (both by default).
 */
function svg({ wide = false, back = true, page = true } = {}) {
  const box = wide ? '-318 -318 1660 1660' : '0 0 1024 1024'
  // The page runs to 1500 so its foot is never in view, even un-masked.
  const sheet = 'M150 130H680L900 350V1500H150Z'
  const lines = [[430, 560], [550, 470], [670, 600], [790, 420], [910, 540]]
  const ground = `<rect x="-340" y="-340" width="1704" height="1704" fill="url(#bg)"/>`
  const paper = `<g transform="rotate(-8 512 600)">
    <path d="${sheet}" fill="#000" fill-opacity="0.25" transform="translate(14 20)"/>
    <path d="${sheet}" fill="url(#cream)"/>
    <path d="M680 130V350H900Z" fill="#c4b192"/>
    <path d="M680 350H900L872 378H708Z" fill="#000" fill-opacity="0.07"/>
    <rect x="216" y="620" width="660" height="100" rx="14" fill="url(#orange)" fill-opacity="0.92" transform="rotate(-1.4 540 670)"/>
    ${lines.map(([y, w]) => `<rect x="240" y="${y - 26}" width="${w}" height="52" rx="26" fill="${COBALT_DEEP}" fill-opacity="${y === 670 ? 0.55 : 0.24}"/>`).join('\n    ')}
  </g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b7cf0"/><stop offset="1" stop-color="${COBALT_DEEP}"/></linearGradient>
    <linearGradient id="cream" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf6ee"/><stop offset="1" stop-color="#d9cbb6"/></linearGradient>
    <linearGradient id="orange" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fe8c01"/><stop offset="1" stop-color="#e05504"/></linearGradient>
  </defs>
  ${back ? ground : ''}
  ${page ? paper : ''}
</svg>`
}

const browser = await chromium.launch()

/**
 * Render to PNG.
 * @param {number} size  canvas edge in px
 * @param {string} art   the SVG (or any HTML)
 * @param {{ inset?: number, radius?: string, ground?: string | null, shadow?: string }} o
 *   inset — share of the canvas the art takes; radius — CSS corner rounding
 *   of the art; ground — the canvas colour, or null for transparent.
 */
async function png(size, art, { inset = 1, radius = '0', ground = null, shadow = 'none' } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const pct = (inset * 100).toFixed(4)
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;width:${size}px;height:${size}px;background:${ground ?? 'transparent'};display:grid;place-items:center}
    body>div{width:${pct}%;height:${pct}%;border-radius:${radius};overflow:hidden;box-shadow:${shadow}}
  </style><div>${art}</div>`)
  const buf = await page.screenshot({ omitBackground: ground === null })
  await page.close()
  return buf
}

/**
 * The .pdf file icon: a white page with this icon, small, as its badge. A file
 * and a program must not share an outline, so the page keeps the silhouette
 * the suite's document icons have (desktop-icons.mjs `documentHtml`).
 */
function documentArt(size) {
  const s = (n) => (n / 64) * size
  return `<div style="position:relative;width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" style="position:absolute;inset:0">
      <path d="M13 4 H39 L51 16 V60 H13 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M39 4 L51 16 H39 Z" fill="#c9d8f6"/>
      <rect x="20" y="26" width="22" height="2.2" rx="1.1" fill="#cbd5e1"/>
      <rect x="20" y="32" width="15" height="2.2" rx="1.1" fill="#cbd5e1"/>
    </svg>
    <div style="position:absolute;left:${s(26)}px;top:${s(38)}px;width:${s(26)}px;height:${s(26)}px;border-radius:22.4%;overflow:hidden">${svg()}</div>
  </div>`
}

if (process.env.PREVIEW) {
  mkdirSync(process.env.PREVIEW, { recursive: true })
  const out = path.join(process.env.PREVIEW, 'icon.png')
  writeFileSync(out, await png(1024, svg(), { ground: COBALT_DEEP }))
  await browser.close()
  console.log(`Preview: ${out}`)
  process.exit(0)
}

const written = []
function put(rel, data) {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  try {
    if (readFileSync(file).equals(Buffer.from(data))) return
  } catch { /* new file */ }
  writeFileSync(file, data)
  written.push(rel)
}

const HEADER = `<!-- Written by scripts/app-icon.mjs — edit the drawing there, not this file.
     PDF's phone icon is its own; the suite generator skips it (ownNativeIcon). -->`

// ── iOS ─────────────────────────────────────────────────────────────────────
const IOS = 'ios/App/App/Assets.xcassets'
// Opaque, full bleed: iOS rounds the corners itself and refuses alpha.
put(`${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`, await png(1024, svg(), { ground: COBALT_DEEP }))
// The splash: the icon, rounded, in the middle of the paper.
const splash = await png(2732, svg(), { inset: 0.26, radius: '22.4%', ground: PAPER })
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  put(`${IOS}/Splash.imageset/${name}`, splash)
}

// ── Android ─────────────────────────────────────────────────────────────────
const RES = 'android/app/src/main/res'
const DENSITIES = { 'mipmap-mdpi': 1, 'mipmap-hdpi': 1.5, 'mipmap-xhdpi': 2, 'mipmap-xxhdpi': 3, 'mipmap-xxxhdpi': 4 }
for (const [dir, scale] of Object.entries(DENSITIES)) {
  const launcher = Math.round(48 * scale)
  const adaptive = Math.round(108 * scale)
  // Pre-Android 8: nothing masks these, so they carry their own shape.
  put(`${RES}/${dir}/ic_launcher.png`, await png(launcher, svg(), { inset: 0.92, radius: '22.4%' }))
  put(`${RES}/${dir}/ic_launcher_round.png`, await png(launcher, svg(), { inset: 0.92, radius: '50%' }))
  put(`${RES}/${dir}/ic_launcher_background.png`, await png(adaptive, svg({ wide: true, page: false }), { ground: COBALT_DEEP }))
  put(`${RES}/${dir}/ic_launcher_foreground.png`, await png(adaptive, svg({ wide: true, back: false })))
}
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
${HEADER}
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
put(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, adaptiveXml)
put(`${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptiveXml)

// The splash. Android 11 and below draw `drawable/splash.xml` (the tile, then
// the mark at its own size); 12 and up draw the launcher icon on
// `ic_launcher_background`. Both on the paper.
const SPLASH = { 'drawable-mdpi': 1, 'drawable-hdpi': 1.5, 'drawable-xhdpi': 2, 'drawable-xxhdpi': 3, 'drawable-xxxhdpi': 4 }
for (const [dir, scale] of Object.entries(SPLASH)) {
  const px = Math.round(240 * scale)
  put(`${RES}/${dir}/splash_mark.png`, await png(px, svg(), { inset: 0.6, radius: '22.4%' }))
}
put(`${RES}/drawable/ic_launcher_tile.xml`, `<?xml version="1.0" encoding="utf-8"?>
${HEADER}
<!-- The splash ground (drawable/splash.xml draws it under the mark). -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="${PAPER}"/>
</shape>
`)
put(`${RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>
${HEADER}
<resources>
    <color name="ic_launcher_background">${PAPER}</color>
</resources>
`)

// ── Desktop ─────────────────────────────────────────────────────────────────
// Windows and Linux mask nothing, so the icon carries its own rounded corners.
put('build/app-icon.png', await png(1024, svg(), { radius: '22.4%' }))
// macOS draws dock icons on Apple's grid: an 824 rounded square in a 1024
// canvas with room for a shadow. Full bleed, the icon stands a size larger
// than every other app in the dock.
put('build/app-icon-mac.png', await png(1024, svg(), {
  inset: 824 / 1024, radius: '22.4%', shadow: '0 10px 18px rgb(0 0 0 / .28)',
}))

// ── Web ─────────────────────────────────────────────────────────────────────
// Shown at 48 px over the landing page's download row; 144 covers 3× screens.
put('src/assets/app-icon.png', await png(144, svg(), { radius: '22.4%' }))

// The .pdf file icon, in both containers electron-builder wants (it finds the
// .icns by swapping the extension of `fileAssociations[0].icon`).
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
// ⚠️ Never the icp4/icp5/icp6 slots: Finder reads them as raw pixels and a PNG
// in them shows as noise (2026-09-27). Small sizes go in the retina slots.
const ICNS_TYPES = { 32: ['ic11'], 64: ['ic12'], 128: ['ic07'], 256: ['ic08', 'ic13'], 512: ['ic09', 'ic14'], 1024: ['ic10'] }
const docs = new Map()
for (const size of new Set([...ICO_SIZES, ...Object.keys(ICNS_TYPES).map(Number)])) {
  docs.set(size, await png(size, documentArt(size)))
}

function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}
function icns(images) {
  const chunks = []
  for (const { size, data } of images) {
    for (const type of ICNS_TYPES[size]) {
      const h = Buffer.alloc(8)
      h.write(type, 0, 'ascii'); h.writeUInt32BE(data.length + 8, 4)
      chunks.push(h, data)
    }
  }
  const body = Buffer.concat(chunks)
  const h = Buffer.alloc(8)
  h.write('icns', 0, 'ascii'); h.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([h, body])
}
put('build/document-icon.ico', ico(ICO_SIZES.map((size) => ({ size, data: docs.get(size) }))))
put('build/document-icon.icns', icns(Object.keys(ICNS_TYPES).map(Number).map((size) => ({ size, data: docs.get(size) }))))

await browser.close()
console.log(written.length ? `Wrote ${written.length} file(s):\n  ${written.join('\n  ')}` : 'Nothing changed.')
