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
import { Fragment, useEffect, useMemo, type ReactNode } from 'react'
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
import { fr } from './fr'
import { es } from './es'
import { it } from './it'
import { de } from './de'
import { ptBR } from './pt-BR'
import { ptPT } from './pt-PT'
import { tr as turkish } from './tr'

export { getT, intlLocale }
export type { BasicTranslator, MessageKey, Messages, PluralKey, Vars }
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

registerLanguages({ fr, es, it, de, 'pt-BR': ptBR, 'pt-PT': ptPT, tr: turkish })

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
  return useMemo(() => makeTranslator(language), [language])
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
  return <>{children}</>
}
