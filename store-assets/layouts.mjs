// Universal PDF's own creative layout, rendered by the UNI·SIM store kit
// (Docs_UNI_SIM/store-kit/build.mjs reads it through store.json "layouts";
// the look is store.css).
//
//   page-header  The App Store product page header (3840×1646, 21:9), which
//                the open-source portal's app grid also shows as the card art
//                and the square's peek (backoffice/opensource-portal
//                scripts/spotlight-art.sh). Built the way Jukebox's
//                sleeve-header is: the icon's own idea blown up on a two-tone
//                join, with the app either side of it — but a laptop on the
//                left and a phone on the right (James, 2026-11-20: PDF is
//                web-first, unlike Jukebox). Here the icon's cream page,
//                tilted as it is on the icon, stands on the paper / PDF-blue
//                join with its orange highlighter stroke, filled-in lines and
//                a signature, and bleeds off the bottom as the icon's does.
//                No words, so one render serves every language and nothing
//                fights the name and Get button the store lays over it.
//
// `raw` is [phone]; the laptop shows LAPTOP, a capture from generate.mjs's
// opt-in laptop device (DEVICE=laptop node store-assets/generate.mjs 04).
// Geometry is in stage pixels.

const LAPTOP = '/app/raw/laptop/04-signed.png'

// ── Geometry (James, 2026-11-20: "it doesn't look quite right") ─────────────
// What was wrong with the first laptop version, and the rule each fix keeps:
//   - The page sat off the paper / blue join. Jukebox's record sits ON its
//     join; that is what makes the two-tone ground mean something. So the join
//     follows the page (JOIN = PAGE_CX), wherever the group puts it.
//   - The phone stood taller than the laptop. Devices are drawn near true
//     scale: the phone about 0.85 of the lid's height (a 6.9" phone beside a
//     13" laptop is about 0.78; a touch generous so its screen still reads).
//   - Laptop and phone floated at different heights and angles. Both stand
//     upright on one baseline, each with a contact shadow, as on a desk; only
//     the page (the icon, not an object) tilts.
//   - The group hung right of centre. It is centred as a whole (the laptop's
//     base overhang included), so the page lands right of centre instead, and
//     the portal points the grid square's crop at it (background-position).
// spotlight/scenes.js pdf() in the open-source portal repeats svgLeft (from
// PAGE_CX below): change both together.
const W = 3840, H = 1646
const S = 1380, K = S / 1024
const PAGE_HALF = Math.round((750 * K) / 2)
const LAP_W = 1500, PHONE_W = 400, OVERLAP = 60
const BASELINE = Math.round(H * 0.86)
const lapBase = (w) => Math.round(w * 1.14)
const GROUP = (lapBase(LAP_W) - LAP_W) / 2 + LAP_W + (2 * PAGE_HALF - OVERLAP) + (PHONE_W - OVERLAP)
const LAP_LEFT = Math.round((W - GROUP) / 2 + (lapBase(LAP_W) - LAP_W) / 2)
export const PAGE_CX = LAP_LEFT + LAP_W - OVERLAP + PAGE_HALF
export const SVG_LEFT = Math.round(PAGE_CX - 525 * K)
// Where the grid square's crop centres (CSS background-position x), so it
// shows the page as Jukebox's shows its record.
export const PEEK_X = `${Math.round((100 * (PAGE_CX - H / 2)) / (W - H))}%`

/** The icon's page (1024 space, the icon's own coordinates), with its content. */
function page(moving = true) {
  const line = (y, w, o = 0.24) => `<rect x="240" y="${y}" width="${w}" height="40" rx="20" fill="#173a94" fill-opacity="${o}"/>`
  return `<svg class="pdf-page" viewBox="0 0 1024 1024" aria-hidden="true" overflow="visible">
    <defs>
      <linearGradient id="pdf-cream" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdf9f2"/><stop offset="1" stop-color="#e2d6c4"/></linearGradient>
      <linearGradient id="pdf-orange" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fe8c01"/><stop offset="1" stop-color="#e05504"/></linearGradient>
      <filter id="pdf-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#0b1a3f" flood-opacity="0.42"/></filter>
    </defs>
    <g transform="rotate(-8 512 600)">
      <path d="M150 130H680L900 350V1500H150Z" fill="url(#pdf-cream)" filter="url(#pdf-shadow)"/>
      <path d="M680 130V350H900Z" fill="#c4b192"/>
      <path d="M680 350H900L872 378H708Z" fill="#000" fill-opacity="0.07"/>
      <!-- the letterhead -->
      <rect x="240" y="230" width="360" height="64" rx="14" fill="#173a94" fill-opacity="0.82"/>
      ${line(330, 230, 0.18)}
      <!-- the text, one line under the highlighter -->
      ${line(420, 560)}
      ${moving ? `<rect x="216" y="494" width="640" height="84" rx="12" fill="url(#pdf-orange)" fill-opacity="0.92" transform="rotate(-1.4 536 536)"/>
      ${line(516, 600, 0.55)}` : ''}
      ${line(612, 470)}
      ${line(684, 540)}
      <!-- two filled-in fields -->
      <rect x="240" y="768" width="290" height="70" rx="10" fill="none" stroke="#173a94" stroke-opacity="0.35" stroke-width="5"/>
      <rect x="560" y="768" width="240" height="70" rx="10" fill="none" stroke="#173a94" stroke-opacity="0.35" stroke-width="5"/>
      <rect x="262" y="791" width="170" height="24" rx="12" fill="#173a94" fill-opacity="0.6"/>
      <rect x="582" y="791" width="120" height="24" rx="12" fill="#173a94" fill-opacity="0.6"/>
      <!-- the tick box -->
      <rect x="240" y="878" width="52" height="52" rx="10" fill="none" stroke="#173a94" stroke-opacity="0.45" stroke-width="6"/>
      ${moving ? '<path d="M252 904l14 14 30-36" fill="none" stroke="#e05504" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>' : ''}
      ${line(886, 380, 0.2)}
      <!-- the signature, on its line -->
      ${moving ? `<path d="M262 1036 c 20 -70 46 -96 54 -64 c 8 34 -26 82 -14 92 c 14 10 40 -70 62 -76 c 18 -4 6 56 20 60 c 16 4 36 -66 58 -66 c 20 0 -6 58 12 62 c 20 4 42 -60 64 -60 c 22 0 -2 56 18 58 c 22 2 52 -44 80 -48 c 24 -4 64 6 104 -8"
            fill="none" stroke="#173a94" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      <rect x="240" y="1076" width="560" height="6" rx="3" fill="#173a94" fill-opacity="0.4"/>
    </g>
  </svg>`
}

function stage(ctx, inner) {
  const c = ctx.cls
  return `<div class="canvas pdf" style="--fit:${ctx.fit}"><div class="stage clip" style="--stage-w:${c.stage[0]}px;--stage-h:${c.stage[1]}px">${inner}</div></div>`
}

/**
 * `layer` splits the header for the portal's live scene (spotlight/scenes.js
 * pdf()): 'back' is the ground and the page without the parts that move (the
 * highlighter and the line under it, the tick, the signature), 'front' the
 * phones and mark alone on a transparent ground ("alpha": true in store.json).
 * The scene draws the moving parts between them, from the same geometry, so
 * its finished state is the flat header.
 */
function pageHeader(ctx, t, [r], layer = 'full') {
  const { device, deviceHeight, laptop } = ctx.kit
  const c = ctx.cls
  if (c.frame !== 'iphone' || c.stage[0] !== W) throw new Error('page-header is drawn for the 3840×1646 header class only')
  const svgTop = Math.round(H * 0.075 - 130 * K)
  // laptop()'s own proportions: lid = bezel + 16:10 screen + chin, then base.
  const bezel = Math.round(LAP_W * 0.024), chin = Math.round(LAP_W * 0.034)
  const lidH = bezel + Math.round((LAP_W - 2 * bezel) * 0.625) + chin, baseH = Math.round(LAP_W * 0.028)
  const phoneH = deviceHeight(c.frame, PHONE_W, r.aspect)
  const phoneLeft = PAGE_CX + PAGE_HALF - OVERLAP
  const floor = (cx, w, h) => `<div class="floor pdf-floor" style="left:${Math.round(cx - w / 2)}px;top:${Math.round(BASELINE - h / 2)}px;width:${Math.round(w)}px;height:${Math.round(h)}px"></div>`
  const [size, inset] = c.mark
  return stage(ctx, `
    ${layer === 'front' ? '' : `<div class="pdf-paper" style="left:0;width:${PAGE_CX}px"></div><div class="pdf-blue" style="left:${PAGE_CX}px;width:${W - PAGE_CX}px"></div>
    <div class="pdf-page-wrap" style="left:${SVG_LEFT}px;top:${svgTop}px;width:${S}px;height:${S}px">${page(layer === 'full')}</div>`}
    ${layer === 'back' ? '' : `${floor(LAP_LEFT + LAP_W / 2, lapBase(LAP_W) * 1.1, 90)}${floor(phoneLeft + PHONE_W / 2, PHONE_W * 1.5, 60)}
    ${laptop(LAPTOP, { w: LAP_W, left: LAP_LEFT, top: BASELINE - lidH - baseH, z: 3 })}
    ${device(ctx, r, { w: PHONE_W, left: phoneLeft, top: Math.round(BASELINE - phoneH), rot: 0, z: 3 })}
    <img class="unisim-mark" src="/kit/brand/unisim-icon-white.png" alt="UNI·SIM" style="width:${size}px;right:${inset}px;top:${inset}px">`}`)
}

export const LAYOUTS = {
  'page-header': (ctx, t, caps) => pageHeader(ctx, t, caps),
  'page-header-back': (ctx, t, caps) => pageHeader(ctx, t, caps, 'back'),
  'page-header-front': (ctx, t, caps) => pageHeader(ctx, t, caps, 'front'),
}
