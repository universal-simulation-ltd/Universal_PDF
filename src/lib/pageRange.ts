// Which pages to print or export (James, 2026-11-03: "on the print popup and
// advanced give the choice for which pages to print"). All of them, the one on
// screen, or a typed range in the print dialog's own shape: "1-3, 5, 8-".
// Cutting the file down is `keepPages` in pdfPages.ts; this module imports
// nothing, so Node can unit-test it (scripts/pageRange.test.mjs).

export type PagesChoice = { kind: 'all' } | { kind: 'current' } | { kind: 'custom'; text: string }

/**
 * Parse "1-3, 5, 8-" (page numbers from 1) into page INDEXES from 0, in the
 * order typed, duplicates dropped. Null when it names no page or anything in
 * it is not a page of this document — the caller shows that as an error
 * rather than printing something the reader did not ask for.
 *
 * "8-" runs to the end and "-3" from the start; en dashes are taken as
 * hyphens, and spaces or semicolons separate as well as commas.
 */
export function parsePageRange(text: string, total: number): number[] | null {
  const parts = text
    .replace(/[–—]/g, '-')
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0 || total < 1) return null
  const out: number[] = []
  const seen = new Set<number>()
  const push = (n: number) => {
    if (!seen.has(n)) {
      seen.add(n)
      out.push(n - 1)
    }
  }
  for (const part of parts) {
    const m = /^(\d*)-(\d*)$/.exec(part)
    if (m) {
      if (!m[1] && !m[2]) return null
      const from = m[1] ? Number(m[1]) : 1
      const to = m[2] ? Number(m[2]) : total
      if (from < 1 || to < 1 || from > total || to > total) return null
      const step = from <= to ? 1 : -1
      for (let n = from; n !== to + step; n += step) push(n)
      continue
    }
    if (!/^\d+$/.test(part)) return null
    const n = Number(part)
    if (n < 1 || n > total) return null
    push(n)
  }
  return out.length ? out : null
}

/** The page nearest the middle of the screen, as an index from 0. */
export function pageInView(): number {
  const pages = document.querySelectorAll<HTMLElement>('[data-page-index]')
  const midY = window.innerHeight / 2
  const midX = window.innerWidth / 2
  let best = 0
  let bestDist = Infinity
  pages.forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const dy = midY < r.top ? r.top - midY : midY > r.bottom ? midY - r.bottom : 0
    const dx = midX < r.left ? r.left - midX : midX > r.right ? midX - r.right : 0
    const d = dy * 4 + dx
    if (d < bestDist) {
      bestDist = d
      best = Number(el.dataset.pageIndex) || 0
    }
  })
  return best
}

/** The page indexes a choice names, or null when a typed range is not valid. */
export function pagesFor(choice: PagesChoice, total: number, current: number): number[] | null {
  if (choice.kind === 'all') return Array.from({ length: total }, (_, i) => i)
  if (choice.kind === 'current') return [Math.min(Math.max(current, 0), Math.max(total - 1, 0))]
  return parsePageRange(choice.text, total)
}

/** True when the indexes are every page, in order — nothing to cut. */
export function isWholeDocument(indexes: number[], total: number): boolean {
  return indexes.length === total && indexes.every((v, i) => v === i)
}
