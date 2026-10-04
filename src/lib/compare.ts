// Comparing two PDFs — the pure half (pixels in, pixels out; text in, a diff
// out). The dialog (`components/Compare/CompareDialog.tsx`) renders the pages
// with the app's shared pdf.js worker and hands the results to these.
//
// ⚠️ This file imports NOTHING, so `scripts/compare.test.mjs` can load it under
// Node's type-stripping.

// ── Visual diff ──────────────────────────────────────────────────────────────

/** How far apart two pixels' lightness must be (0–255) to count as changed.
 *  Both pages go through the same renderer at the same size, so an unchanged
 *  page differs by exactly 0; the margin only absorbs anti-aliasing where a
 *  page was re-made by another program with a sub-pixel shift. */
export const PIXEL_TOLERANCE = 48

const REMOVED: [number, number, number] = [220, 38, 38] // red — ink only in the first
const ADDED: [number, number, number] = [22, 163, 74] // green — ink only in the second

function lightness(d: Uint8ClampedArray, i: number): number {
  // Composited over white, so a transparent pixel reads as paper.
  const a = d[i + 3] / 255
  const r = d[i] * a + 255 * (1 - a)
  const g = d[i + 1] * a + 255 * (1 - a)
  const b = d[i + 2] * a + 255 * (1 - a)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * Compare two same-sized RGBA buffers. When `out` is given it is filled with
 * the overlay picture: unchanged content as faint grey, ink only in `a` red,
 * ink only in `b` green. Returns how many pixels changed.
 */
export function diffPixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  out?: Uint8ClampedArray,
  tolerance = PIXEL_TOLERANCE,
): number {
  if (a.length !== b.length) throw new Error('diffPixels: buffers differ in size')
  let changed = 0
  for (let i = 0; i < a.length; i += 4) {
    const la = lightness(a, i)
    const lb = lightness(b, i)
    const delta = la - lb
    if (Math.abs(delta) > tolerance) {
      changed++
      if (out) {
        const c = delta < 0 ? REMOVED : ADDED
        out[i] = c[0]
        out[i + 1] = c[1]
        out[i + 2] = c[2]
        out[i + 3] = 255
      }
    } else if (out) {
      // The second document, washed out to a quarter of its contrast, so the
      // red and green are what the eye goes to.
      const v = 255 - (255 - Math.min(la, lb)) * 0.25
      out[i] = v
      out[i + 1] = v
      out[i + 2] = v
      out[i + 3] = 255
    }
  }
  return changed
}

// ── Text diff ────────────────────────────────────────────────────────────────

export type DiffKind = 'equal' | 'delete' | 'insert'
export interface DiffRun<T> {
  kind: DiffKind
  items: T[]
}

/**
 * Myers' O((N+M)·D) shortest edit script. Returns null when the two differ by
 * more than `maxEdits` — the caller then falls back to a coarser comparison
 * rather than spending seconds and hundreds of MB on two unrelated documents.
 * Common prefix and suffix are trimmed first, so a small change in a long
 * document costs almost nothing.
 */
export function diffSequences<T>(
  a: readonly T[],
  b: readonly T[],
  maxEdits = 2000,
  same: (x: T, y: T) => boolean = (x, y) => x === y,
): DiffRun<T>[] | null {
  let pre = 0
  while (pre < a.length && pre < b.length && same(a[pre], b[pre])) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && same(a[a.length - 1 - suf], b[b.length - 1 - suf])) suf++
  const A = a.slice(pre, a.length - suf)
  const B = b.slice(pre, b.length - suf)

  const runs: DiffRun<T>[] = []
  const push = (kind: DiffKind, item: T) => {
    const last = runs[runs.length - 1]
    if (last && last.kind === kind) last.items.push(item)
    else runs.push({ kind, items: [item] })
  }
  for (let i = 0; i < pre; i++) push('equal', a[i])

  const middle = myers(A, B, maxEdits, same)
  if (!middle) return null
  for (const [kind, item] of middle) push(kind, item)

  for (let i = a.length - suf; i < a.length; i++) push('equal', a[i])
  return runs
}

function myers<T>(
  A: readonly T[],
  B: readonly T[],
  maxEdits: number,
  same: (x: T, y: T) => boolean,
): Array<[DiffKind, T]> | null {
  const n = A.length
  const m = B.length
  if (n === 0) return B.map((x) => ['insert', x] as [DiffKind, T])
  if (m === 0) return A.map((x) => ['delete', x] as [DiffKind, T])
  const max = Math.min(n + m, maxEdits)
  const offset = max + 1
  let v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  let found = -1
  for (let d = 0; d <= max; d++) {
    // Only the band step d can read (k in -d-1 … d+1): O(D²) memory in all,
    // not O(D·(N+M)).
    trace.push(v.slice(offset - d - 1, offset + d + 2))
    const next = v.slice()
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1]
      else x = v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && same(A[x], B[y])) {
        x++
        y++
      }
      next[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
    v = next
    if (found !== -1) break
  }
  if (found === -1) return null

  // Walk the trace back from (n, m).
  const out: Array<[DiffKind, T]> = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const vd = trace[d]
    const at = (kk: number) => vd[kk + d + 1]
    const k = x - y
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1))
    const prevK = down ? k + 1 : k - 1
    const prevX = at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      out.push(['equal', A[x - 1]])
      x--
      y--
    }
    if (down) out.push(['insert', B[y - 1]])
    else out.push(['delete', A[x - 1]])
    x = prevX
    y = prevY
  }
  while (x > 0 && y > 0) {
    out.push(['equal', A[x - 1]])
    x--
    y--
  }
  return out.reverse()
}

/** A word of a document's text, with the page it is on (0-based). */
export interface Word {
  text: string
  page: number
  /** True when whitespace came before it in the document — so the diff can be
   *  printed back with the spacing it had, and CJK text without spaces. */
  spaced: boolean
}

// Han, kana and Hangul syllables, compared one character at a time: these
// scripts don't separate words with spaces, and a whole sentence as one "word"
// would make any one-character change a whole-sentence change.
const CJK = /[⺀-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]/
const TOKEN = /[⺀-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]|[^\s⺀-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]+/g

/** Split each page's text into words (and CJK characters). */
export function tokenize(pages: readonly string[]): Word[] {
  const words: Word[] = []
  pages.forEach((text, page) => {
    let last = 0
    for (const m of text.matchAll(TOKEN)) {
      const at = m.index ?? 0
      words.push({ text: m[0], page, spaced: at > last || (at === 0 && words.length > 0) })
      last = at + m[0].length
    }
  })
  return words
}

function lineKey(words: Word[]): string {
  return words.map((w) => w.text).join(' ')
}

/**
 * Word-by-word diff of two documents' text. Tries the whole thing word by word;
 * when the two are too far apart for that, compares runs of ~12 words first
 * and refines each changed block word by word. Null only when even that is
 * hopeless (two unrelated documents).
 */
export function diffWords(a: Word[], b: Word[]): DiffRun<Word>[] | null {
  const same = (x: Word, y: Word) => x.text === y.text
  const direct = diffSequences(a, b, 2000, same)
  if (direct) return direct

  const CHUNK = 12
  const chunk = (ws: Word[]) => {
    const out: Word[][] = []
    for (let i = 0; i < ws.length; i += CHUNK) out.push(ws.slice(i, i + CHUNK))
    return out
  }
  const coarse = diffSequences(chunk(a), chunk(b), 4000, (x, y) => lineKey(x) === lineKey(y))
  if (!coarse) return null

  const runs: DiffRun<Word>[] = []
  const push = (kind: DiffKind, items: Word[]) => {
    if (!items.length) return
    const last = runs[runs.length - 1]
    if (last && last.kind === kind) last.items.push(...items)
    else runs.push({ kind, items: [...items] })
  }
  for (let i = 0; i < coarse.length; i++) {
    const r = coarse[i]
    const flat = r.items.flat()
    if (r.kind === 'equal') {
      push('equal', flat)
      continue
    }
    // A delete next to an insert is a replaced block: refine it.
    const nextRun = coarse[i + 1]
    if (r.kind === 'delete' && nextRun?.kind === 'insert') {
      const fine = diffSequences(flat, nextRun.items.flat(), 500, same)
      if (fine) for (const f of fine) push(f.kind, f.items)
      else {
        push('delete', flat)
        push('insert', nextRun.items.flat())
      }
      i++
      continue
    }
    push(r.kind, flat)
  }
  return runs
}

/** One stretch of the text view: changes with a little context either side. */
export interface TextHunk {
  /** Page (0-based) in the first document where it starts — or in the second,
   *  for a hunk that only adds text. */
  page: number
  /** Which document `page` counts in. */
  pageIn: 'a' | 'b'
  runs: DiffRun<Word>[]
  /** Unchanged words skipped before this hunk. */
  skippedBefore: number
}

/**
 * Cut a diff into hunks: every change, with up to `context` unchanged words
 * either side, and how many unchanged words were left out in between.
 */
export function toHunks(runs: DiffRun<Word>[], context = 10): { hunks: TextHunk[]; skippedAfter: number } {
  const hunks: TextHunk[] = []
  let current: TextHunk | null = null
  let pendingSkip = 0
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]
    if (r.kind === 'equal') {
      const isFirst = i === 0
      const isLast = i === runs.length - 1
      const head = isFirst ? 0 : Math.min(context, r.items.length)
      const tail = isLast ? 0 : Math.min(context, r.items.length - head)
      if (current && head) current.runs.push({ kind: 'equal', items: r.items.slice(0, head) })
      const skipped = r.items.length - head - tail
      if (skipped > 0 || !current) {
        if (current) hunks.push(current)
        current = null
        pendingSkip = skipped
      }
      if (tail) {
        current = current ?? { page: 0, pageIn: 'a', runs: [], skippedBefore: pendingSkip }
        current.runs.push({ kind: 'equal', items: r.items.slice(r.items.length - tail) })
      }
      continue
    }
    if (!current) current = { page: 0, pageIn: 'a', runs: [], skippedBefore: pendingSkip }
    current.runs.push({ kind: r.kind, items: r.items })
  }
  if (current) hunks.push(current)
  let skippedAfter = 0
  const last = runs[runs.length - 1]
  if (last?.kind === 'equal' && runs.length > 1) skippedAfter = Math.max(0, last.items.length - Math.min(context, last.items.length))
  // Each hunk is labelled with the page its first CHANGE is on.
  for (const h of hunks) {
    const change = h.runs.find((r) => r.kind !== 'equal')
    if (change) {
      h.page = change.items[0].page
      h.pageIn = change.kind === 'insert' && !h.runs.some((r) => r.kind === 'delete') ? 'b' : 'a'
      if (h.pageIn === 'a' && change.kind === 'insert') {
        // An insert ahead of a delete in the same hunk: count it on the first
        // document's page, which the delete gives.
        h.page = h.runs.find((r) => r.kind === 'delete')!.items[0].page
      }
    }
  }
  return { hunks, skippedAfter }
}

/** Print words back as text, spaced as they were (CJK without spaces). */
export function joinWords(words: Word[], leading = false): string {
  let out = ''
  words.forEach((w, i) => {
    if ((i > 0 || leading) && w.spaced && !(CJK.test(w.text) && out && CJK.test(out[out.length - 1]))) out += ' '
    out += w.text
  })
  return out
}
