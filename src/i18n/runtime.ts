// The lookup itself, with no React and no SDK, so a lib module that plain node
// unit-tests (`node --experimental-strip-types`) can translate its messages.
// Import it WITH the extension — `../i18n/runtime.ts` — as node needs.
//
// Only English is loaded here. `index.tsx` registers the other languages and
// sets the active one, so under node every message is English, which is what
// the tests read.
import { en, type Messages } from './en/index.ts'

export type { Messages }

/** Every key, as `namespace.key`. */
export type MessageKey = {
  [N in keyof Messages]: `${N & string}.${keyof Messages[N] & string}`
}[keyof Messages]

/** The stem of every plural key: `ns.pages` for `ns.pages_one` + `ns.pages_other`. */
export type PluralKey = MessageKey extends infer K
  ? K extends `${infer Stem}_other`
    ? Stem
    : never
  : never

export type Vars = Record<string, string | number>

const DICTS: Record<string, Messages> = { en }

export function registerLanguages(dicts: Record<string, Messages>): void {
  Object.assign(DICTS, dicts)
}

/**
 * The dictionaries to try, in order — the SDK's `languageFallbacks`, restated so
 * this file needs nothing from the SDK: `pt-BR` → pt-BR, pt-PT; any other `pt`
 * → pt-PT, pt-BR; `fr-CA` → fr; always ending in English.
 */
function chain(lang: string): Messages[] {
  const l = lang.replace('_', '-').toLowerCase()
  const codes =
    l === 'pt-br' ? ['pt-BR', 'pt-PT']
      : l.startsWith('pt') ? ['pt-PT', 'pt-BR']
        : [l, l.split('-')[0]]
  return [...codes.map((c) => DICTS[c]).filter(Boolean), en]
}

function find(lang: string, key: string): string | undefined {
  const dot = key.indexOf('.')
  const ns = key.slice(0, dot) as keyof Messages
  const k = key.slice(dot + 1)
  for (const dict of chain(lang)) {
    const hit = (dict[ns] as Record<string, string> | undefined)?.[k]
    if (hit !== undefined) return hit
  }
  return undefined
}

export function fill(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** Intl wants a BCP 47 tag; the SDK's plain `en` means US English. */
export function intlLocale(lang: string): string {
  return lang === 'en' ? 'en-US' : lang
}

export interface BasicTranslator {
  (key: MessageKey, vars?: Vars): string
  /** A plural: `t.plural('tools.pages', 3)` → "3 pages". `{count}` is filled in. */
  plural(stem: PluralKey, count: number, vars?: Vars): string
  /** The active language code, for Intl formatting: `intlLocale(t.lang)`. */
  lang: string
}

export function lookup(lang: string, key: string): string {
  return find(lang, key) ?? key
}

export function makeBasicTranslator(lang: string): BasicTranslator {
  const t = ((key: MessageKey, vars?: Vars) => fill(lookup(lang, key), vars)) as BasicTranslator
  t.plural = (stem, count, vars) => {
    const form = new Intl.PluralRules(intlLocale(lang)).select(count)
    const text = find(lang, `${stem}_${form}`) ?? lookup(lang, `${stem}_other`)
    return fill(text, { count, ...vars })
  }
  t.lang = lang
  return t
}

let active: BasicTranslator = makeBasicTranslator('en')

/** The translator for code that is not a component (stores, lib, callbacks). */
export function getT(): BasicTranslator {
  return active
}

export function setActiveLanguage(lang: string): void {
  if (active.lang !== lang) active = makeBasicTranslator(lang)
}
