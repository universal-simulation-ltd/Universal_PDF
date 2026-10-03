// The app's own translations.
//
// The SDK's language (`useLanguage()`): the suite's GLOBAL language, which it
// resolves from the saved choice, then the device's language, then English —
// unless this app has its own, set in App preferences. `language` is already
// that effective value, so the navbar, the profile menu and this app always
// agree. Both pickers are the SDK's (App preferences / Global preferences in
// the profile menu); the Actions menu's own Language row went in 2026-09-17.
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
import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLanguage, SUPPORTED_LANGUAGES } from '@unisim/sdk'
import {
  fill,
  getT,
  intlLocale,
  lookup,
  makeBasicTranslator,
  registerLanguages,
  setActiveLanguage,
  type BasicTranslator,
  type MessageKey,
  type Messages,
  type PluralKey,
  type Vars,
} from './runtime.ts'

export { getT, intlLocale }
export type { BasicTranslator, MessageKey, Messages, PluralKey, Vars }
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

// ⚠️ Each translation is its OWN chunk, loaded when it is the language in use.
// All seven used to be imported here, which put ~450 kB of other people's
// languages — 15% of the main bundle — into every start-up, to be parsed by
// every phone before the first paint. English stays in the bundle: it is the
// fallback for every key and what `runtime.ts` (and the node tests) read.
const LOADERS: Record<string, () => Promise<Messages>> = {
  fr: () => import('./fr').then((m) => m.fr),
  es: () => import('./es').then((m) => m.es),
  it: () => import('./it').then((m) => m.it),
  de: () => import('./de').then((m) => m.de),
  'pt-BR': () => import('./pt-BR').then((m) => m.ptBR),
  'pt-PT': () => import('./pt-PT').then((m) => m.ptPT),
  tr: () => import('./tr').then((m) => m.tr),
}
const loadedDicts = new Set<string>()
const loadingDicts = new Map<string, Promise<void>>()

/** The one dictionary `lang` reads first — the same choice `runtime.ts`'s chain makes. */
function dictFor(lang: string): string | null {
  const l = lang.replace('_', '-').toLowerCase()
  if (l === 'pt-br') return 'pt-BR'
  if (l.startsWith('pt')) return 'pt-PT'
  if (LOADERS[l]) return l
  const base = l.split('-')[0]
  return LOADERS[base] ? base : null
}

function languageReady(lang: string): boolean {
  const code = dictFor(lang)
  return !code || loadedDicts.has(code)
}

/** Fetch and register `lang`'s dictionary. Null when there is nothing to wait for. */
function loadLanguage(lang: string): Promise<void> | null {
  const code = dictFor(lang)
  if (!code || loadedDicts.has(code)) return null
  let p = loadingDicts.get(code)
  if (!p) {
    p = LOADERS[code]()
      .then((dict) => {
        registerLanguages({ [code]: dict })
        loadedDicts.add(code)
      })
      .finally(() => loadingDicts.delete(code))
    loadingDicts.set(code, p)
  }
  return p
}

// Start on the likely language while the SDK is still booting, so the chunk is
// usually here before <I18nRoot> first asks. A guess only — the SDK's answer is
// what <I18nRoot> waits on — so it reads the SDK's saved choices (this app's,
// then the suite's) and the device's languages, and loads at most two.
try {
  const guesses = [
    localStorage.getItem('universal:language:pdf'),
    localStorage.getItem('universal:language'),
    ...(navigator.languages ?? [navigator.language]),
  ]
  const first = guesses.find((g) => g && (g.toLowerCase().startsWith('en') || dictFor(g)))
  if (first) loadLanguage(first)?.catch(() => {})
} catch {
  // No storage (private mode, a locked-down WebView): <I18nRoot> loads it anyway.
}

// Bumped each time a dictionary arrives, so every `useT()` re-renders with it.
const DictVersion = createContext(0)

export interface Translator extends BasicTranslator {
  /**
   * A sentence with React nodes in it: `t.rich('menu.contact', { link: <a…/> })`
   * for "{link} to request a language". Text around the nodes stays one string,
   * so a translator can move the link to wherever the sentence needs it.
   */
  rich(key: MessageKey, nodes: Record<string, ReactNode>, vars?: Vars): ReactNode
  lang: Language
}

export function makeTranslator(lang: Language): Translator {
  const t = makeBasicTranslator(lang) as Translator
  t.rich = (key, nodes, vars) => {
    const parts = fill(lookup(lang, key), vars).split(/(\{\w+\})/)
    return parts.map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part)
      return <Fragment key={i}>{m && m[1] in nodes ? nodes[m[1]] : part}</Fragment>
    })
  }
  return t
}

/** The translator for a component. Re-renders when the language changes. */
export function useT(): Translator {
  const { language } = useLanguage()
  const version = useContext(DictVersion)
  return useMemo(() => makeTranslator(language), [language, version])
}

/**
 * Mount once, just inside <UniversalProvider>. Keeps `getT()` and `<html lang>`
 * on the suite language. Set during render, not in an effect, so the children
 * rendered in this same pass already see it.
 */
export function I18nRoot({ children }: { children: ReactNode }) {
  // `language` is the EFFECTIVE one: this app's override, else the global.
  const { language, setAppLanguage } = useLanguage()
  setActiveLanguage(language)
  if (typeof document !== 'undefined' && document.documentElement.lang !== language) {
    document.documentElement.lang = language
  }
  // The desktop shell draws its own Save dialogs; tell it which language.
  useEffect(() => {
    window.desktop?.setLanguage?.(language)
  }, [language])
  // For store-assets/generate.mjs: it drives the app in English (its selectors
  // are English labels) and switches language just before each capture. Only
  // what a user can already do from App preferences: it sets this app's
  // override, which translates the app and the SDK's chrome alike.
  useEffect(() => {
    ;(window as unknown as { __pdfSetLanguage?: (l: Language) => void }).__pdfSetLanguage = setAppLanguage
  }, [setAppLanguage])

  // The dictionary for `language`, if it isn't here yet. The FIRST paint waits
  // for it (a few ms: it is precached, or on disk in the native apps) rather
  // than flashing English at a French reader; a switch later on keeps the app
  // mounted and re-renders once it lands. The timeout is for the one case
  // where it can't land — offline before the service worker has it — so the
  // app opens in English rather than not at all.
  const [version, setVersion] = useState(0)
  const [started, setStarted] = useState(() => languageReady(language))
  // Whether THIS render could already read the dictionary. ⚠️ The prefetch
  // above can land between this render and the effect below, which then finds
  // nothing to load — and without a bump the screen stays in the English it
  // was just rendered in (seen with de-DE and pt-BR browsers).
  const readyAtRender = languageReady(language)
  useEffect(() => {
    const pending = loadLanguage(language)
    if (!pending) {
      if (!readyAtRender) setVersion((v) => v + 1)
      setStarted(true)
      return
    }
    let live = true
    const giveUp = window.setTimeout(() => setStarted(true), 4000)
    pending
      .catch((e) => console.warn(`[i18n] ${language} failed to load; using English`, e))
      .finally(() => {
        window.clearTimeout(giveUp)
        if (!live) return
        setVersion((v) => v + 1)
        setStarted(true)
      })
    return () => {
      live = false
      window.clearTimeout(giveUp)
    }
  }, [language, readyAtRender])
  if (!started) return null
  return <DictVersion.Provider value={version}>{children}</DictVersion.Provider>
}
