// Renders a typed signature (the phone's Sign page, "Type it") in the Caveat
// handwriting face. Shared by the Sign page and the placed signature's options
// card, which re-renders it when "Make it look more realistic" is switched
// (James, 2026-10-22: "have an option for more realistic on typed and apply by
// default"), so both produce identical ink for the same name.
//
// Realistic: blue ink that bleeds a little, each letter leaning, sitting and
// sized very slightly differently, uneven pressure, and a couple of speckles —
// the treatment renderInkSignature gives drawn strokes. Seeded by the name, so
// the same name always comes out the same. Plain: one even, upright line.

const SIZE = 72
const FONT = `700 ${SIZE}px Caveat, cursive`
const RS = 2

function seedOf(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function renderTypedSignature(
  name: string,
  color: string,
  realistic: boolean
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    await document.fonts.load(FONT, name)
  } catch {
    // The fallback face still makes a usable signature.
  }
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return null
  probe.font = FONT
  // The ink, not the advance width: Caveat's last stroke (a k, an f) reaches
  // past the advance and was cut off at the canvas edge.
  const m = probe.measureText(name)
  const inkLeft = Math.max(0, m.actualBoundingBoxLeft || 0)
  const inkRight = Math.max(m.width, m.actualBoundingBoxRight || 0)
  // Room for the letters' lean and lift when realistic.
  const margin = realistic ? 14 : 8
  const w = Math.ceil(inkLeft + inkRight) + margin * 2
  const h = Math.ceil(SIZE * 1.3) + (realistic ? 8 : 0)
  const canvas = document.createElement('canvas')
  canvas.width = w * RS
  canvas.height = h * RS
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(RS, RS)
  ctx.font = FONT
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  const x0 = margin + inkLeft
  const y0 = h / 2

  if (!realistic) {
    ctx.fillText(name, x0, y0)
    return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
  }

  const rnd = mulberry32(seedOf(name))
  // Each letter where the whole word would put it (kerning kept), then nudged.
  const glyphs = Array.from(name).map((ch, i, all) => ({
    ch,
    x: x0 + probe.measureText(all.slice(0, i).join('')).width,
    lean: (rnd() * 2 - 1) * 0.05, // ±3°
    lift: (rnd() * 2 - 1) * 1.6,
    scale: 0.96 + rnd() * 0.08,
    alpha: 0.8 + rnd() * 0.2,
  }))
  const draw = (alphaOf: (g: (typeof glyphs)[number]) => number) => {
    for (const g of glyphs) {
      if (!g.ch.trim()) continue
      ctx.save()
      ctx.globalAlpha = alphaOf(g)
      ctx.translate(g.x, y0 + g.lift)
      ctx.rotate(g.lean)
      ctx.scale(g.scale, g.scale)
      ctx.fillText(g.ch, 0, 0)
      ctx.restore()
    }
  }
  // Faint, slightly wider blurred underlay → ink bleed.
  ctx.save()
  try { ctx.filter = 'blur(0.7px)' } catch { /* filter unsupported — no bleed */ }
  draw(() => 0.22)
  ctx.restore()
  // The letters, each pressed a little harder or lighter.
  draw((g) => g.alpha)
  // A couple of tiny ink speckles near the letters.
  const marks = glyphs.filter((g) => g.ch.trim())
  const speckles = marks.length ? 2 + Math.floor(rnd() * 2) : 0
  for (let k = 0; k < speckles; k++) {
    const g = marks[Math.floor(rnd() * marks.length)]
    ctx.globalAlpha = 0.35 + rnd() * 0.3
    ctx.beginPath()
    ctx.arc(g.x + rnd() * SIZE * 0.4, y0 + (rnd() * 2 - 1) * SIZE * 0.3, 0.5 + rnd() * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
}
