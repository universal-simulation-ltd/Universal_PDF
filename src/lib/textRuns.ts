import type { TextAnnotation, TextRun } from '../types/annotations'

// The style keys that vary per run (everything else — colour, size, family — is
// whole-annotation).
type RunStyle = Pick<TextRun, 'bold' | 'italic' | 'underline' | 'link'>

// True if a run carries any inline style.
export function runHasStyle(r: TextRun): boolean {
  return !!(r.bold || r.italic || r.underline || r.link)
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    (a.link ?? '') === (b.link ?? '')
}

// Drop empty runs and merge neighbours that share a style, so the model stays
// minimal (one run per contiguous style span).
export function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = []
  for (const r of runs) {
    if (!r.text) continue
    const last = out[out.length - 1]
    if (last && sameStyle(last, r)) {
      last.text += r.text
    } else {
      out.push({ ...cleanStyle(r), text: r.text })
    }
  }
  return out
}

// Strip falsy style flags so equal runs compare/serialise cleanly.
function cleanStyle(r: TextRun): TextRun {
  const out: TextRun = { text: r.text }
  if (r.bold) out.bold = true
  if (r.italic) out.italic = true
  if (r.underline) out.underline = true
  if (r.link) out.link = r.link
  return out
}

// The runs to render/measure/export for an annotation: the styled runs if it has
// them, else a single run synthesised from the whole-annotation style fallback.
export function effectiveRuns(a: TextAnnotation): TextRun[] {
  if (a.runs && a.runs.length > 0) return a.runs
  return [cleanStyle({
    text: a.text,
    bold: a.bold,
    italic: a.italic,
    underline: a.underline,
    link: a.link
  })]
}

export function runsToPlainText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('')
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

// Serialise runs to the HTML seeded into the contentEditable editor. Uses plain
// <b>/<i>/<u>/<a> tags (matching what execCommand with styleWithCSS=false
// produces) so the round-trip through parseRunsFromDom is stable.
export function runsToHtml(runs: TextRun[]): string {
  if (runs.length === 0) return ''
  return runs
    .map((r) => {
      let inner = escapeHtml(r.text)
      if (r.underline) inner = `<u>${inner}</u>`
      if (r.italic) inner = `<i>${inner}</i>`
      if (r.bold) inner = `<b>${inner}</b>`
      if (r.link) inner = `<a href="${escapeHtml(r.link)}">${inner}</a>`
      return inner
    })
    .join('')
}

// Parse a contentEditable root into clean, merged runs. Walks the DOM tracking an
// inherited style context; recognises bold/italic/underline/link both as tags
// (<b>/<strong>, <i>/<em>, <u>, <a>) and as inline styles (what some browsers'
// execCommand emits), so it copes whichever form the browser used.
export function parseRunsFromDom(root: HTMLElement): TextRun[] {
  const out: TextRun[] = []
  walk(root, {}, out)
  return mergeRuns(out)
}

function walk(node: Node, ctx: RunStyle, out: TextRun[]): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text) out.push({ ...ctx, text })
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const tag = el.tagName
    if (tag === 'BR') {
      // Single-line editor — treat a stray line break as a space.
      out.push({ ...ctx, text: ' ' })
      continue
    }
    const next: RunStyle = { ...ctx }
    if (tag === 'B' || tag === 'STRONG') next.bold = true
    if (tag === 'I' || tag === 'EM') next.italic = true
    if (tag === 'U') next.underline = true
    if (tag === 'A') {
      const href = el.getAttribute('href')
      if (href) next.link = href
    }
    const st = el.style
    if (st) {
      const w = st.fontWeight
      if (w === 'bold' || w === 'bolder' || (/^\d+$/.test(w) && parseInt(w, 10) >= 600)) next.bold = true
      if (st.fontStyle === 'italic' || st.fontStyle === 'oblique') next.italic = true
      const dec = `${st.textDecoration} ${st.textDecorationLine}`
      if (dec.includes('underline')) next.underline = true
    }
    walk(el, next, out)
  }
}

// Konva `fontStyle` string for one run's bold/italic toggles.
export function runFontStyle(r: TextRun): string {
  const parts: string[] = []
  if (r.bold) parts.push('bold')
  if (r.italic) parts.push('italic')
  return parts.length ? parts.join(' ') : 'normal'
}
