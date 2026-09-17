// The app's own translations.
//
// ONE language for the whole suite: the SDK's (`useLanguage()`), which it
// resolves from the saved choice, then the device's language, then English.
// The navbar, the profile menu and this app all read it, so a French phone gets
// French everywhere, and changing it anywhere changes it everywhere.
//
// ⚠️ Until 1.0.3 the app had a separate "Document language" picker that only
// set `<html lang>` and translated nothing, while every label was hard-coded
// English — a French phone got a French navbar over an English app, and the
// picker looked broken. `<html lang>` now follows the suite language.
//
// Dictionaries live in `src/i18n/<lang>/<namespace>.ts`. English is the
// source of truth and defines the shape (`Messages`); every other language is
// typed against it, so `tsc` fails on a missing or misspelt key.
//
// Keys are `<namespace>.<key>`. Placeholders are `{name}`. A plural is two
// (or more) keys sharing a stem — `pages_one`, `pages_other` — read through
// `t.plural('ns.pages', count)`, which picks the form with Intl.PluralRules
// and passes `{count}` for you.
import { Fragment, useEffect, useMemo, type ReactNode } from 'react'
import { pickTranslation, useLanguage, SUPPORTED_LANGUAGES } from '@unisim/sdk'
import { en, type Messages } from './en'
import { fr } from './fr'
import { es } from './es'
import { it } from './it'
import { de } from './de'
import { ptBR } from './pt-BR'
import { ptPT } from './pt-PT'
import { tr as turkish } from './tr'

export type { Messages }
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

const DICTS: Record<string, Messages> = {
  en,
  fr,
  es,
  it,
  de,
  'pt-BR': ptBR,
  'pt-PT': ptPT,
  tr: turkish,
}

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

/**
 * The languages offered in the app's own picker, as their speakers write them.
 * Same codes and labels as the SDK's profile menu, so the two never disagree.
 */
export const LANGUAGE_OPTIONS: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'English (US)', flag: '🇺🇸' },
  { code: 'en-gb', label: 'English (GB)', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'pt-PT', label: 'Português (Portugal)', flag: '🇵🇹' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
]

function lookup(lang: string, key: string): string {
  const dot = key.indexOf('.')
  const ns = key.slice(0, dot) as keyof Messages
  const k = key.slice(dot + 1)
  const dict = pickTranslation(DICTS, lang) ?? en
  const hit = (dict[ns] as Record<string, string> | undefined)?.[k]
  if (hit !== undefined) return hit
  const fallback = (en[ns] as Record<string, string> | undefined)?.[k]
  if (fallback !== undefined) return fallback
  if (import.meta.env.DEV) console.warn(`[i18n] missing key ${key}`)
  return key
}

function fill(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** Intl wants a BCP 47 tag; the SDK's `en-gb` is one already, case aside. */
export function intlLocale(lang: string): string {
  return lang === 'en' ? 'en-US' : lang
}

export interface Translator {
  (key: MessageKey, vars?: Vars): string
  /** A plural: `t.plural('tools.pages', 3)` → "3 pages". `{count}` is filled in. */
  plural(stem: PluralKey, count: number, vars?: Vars): string
  /**
   * A sentence with React nodes in it: `t.rich('menu.contact', { link: <a…/> })`
   * for "{link} to request a language". Text around the nodes stays one string,
   * so a translator can move the link to wherever the sentence needs it.
   */
  rich(key: MessageKey, nodes: Record<string, ReactNode>, vars?: Vars): ReactNode
  /** The active language code, for Intl formatting: `new Intl.DateTimeFormat(intlLocale(t.lang))`. */
  lang: Language
}

export function makeTranslator(lang: Language): Translator {
  const t = ((key: MessageKey, vars?: Vars) => fill(lookup(lang, key), vars)) as Translator
  t.plural = (stem, count, vars) => {
    const form = new Intl.PluralRules(intlLocale(lang)).select(count)
    const exact = `${stem}_${form}`
    const dot = exact.indexOf('.')
    const ns = exact.slice(0, dot) as keyof Messages
    const dict = pickTranslation(DICTS, lang) ?? en
    const has = (dict[ns] as Record<string, string> | undefined)?.[exact.slice(dot + 1)] !== undefined
    const key = (has ? exact : `${stem}_other`) as MessageKey
    return fill(lookup(lang, key), { count, ...vars })
  }
  t.rich = (key, nodes, vars) => {
    const parts = fill(lookup(lang, key), vars).split(/(\{\w+\})/)
    return parts.map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part)
      return <Fragment key={i}>{m && m[1] in nodes ? nodes[m[1]] : part}</Fragment>
    })
  }
  t.lang = lang
  return t
}

// ── Outside React ──────────────────────────────────────────────────────────
// Stores, lib helpers and error messages built away from a component read the
// language the tree last rendered with, through `getT()`. <I18nRoot> keeps it
// current.
let active: Translator = makeTranslator('en')

/** The translator for code that is not a component (stores, lib, callbacks). */
export function getT(): Translator {
  return active
}

/** The translator for a component. Re-renders when the language changes. */
export function useT(): Translator {
  const { language } = useLanguage()
  return useMemo(() => makeTranslator(language), [language])
}

/**
 * Mount once, just inside <UniversalProvider>. Keeps `getT()` and `<html lang>`
 * on the suite language. Set during render, not in an effect, so the children
 * rendered in this same pass already see it.
 */
export function I18nRoot({ children }: { children: ReactNode }) {
  const { language, setLanguage } = useLanguage()
  if (active.lang !== language) active = makeTranslator(language)
  if (typeof document !== 'undefined' && document.documentElement.lang !== language) {
    document.documentElement.lang = language
  }
  // The desktop shell draws its own Save dialogs; tell it which language.
  useEffect(() => {
    window.desktop?.setLanguage?.(language)
  }, [language])
  // For store-assets/generate.mjs: it drives the app in English (its selectors
  // are English labels) and switches language just before each capture. Only
  // what a user can already do from the Language menu.
  useEffect(() => {
    ;(window as unknown as { __pdfSetLanguage?: (l: Language) => void }).__pdfSetLanguage = setLanguage
  }, [setLanguage])
  return <>{children}</>
}
