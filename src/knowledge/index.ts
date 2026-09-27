import type { Article } from './types'
import en from './en'

// English ships in the main bundle; each translation is its own chunk, loaded
// only when the reader's language asks for it.
const LOADERS: Record<string, () => Promise<{ default: Article[] }>> = {
  fr: () => import('./fr'),
  es: () => import('./es'),
  it: () => import('./it'),
  de: () => import('./de'),
  'pt-BR': () => import('./pt-BR'),
  'pt-PT': () => import('./pt-PT'),
  tr: () => import('./tr'),
}

export async function loadArticles(language: string): Promise<Article[]> {
  const load = LOADERS[language]
  if (!load) return en
  try {
    return (await load()).default
  } catch {
    return en
  }
}

/** For the navbar's `knowledgeBase` prop (wired separately). */
export const KNOWLEDGE_BASE = { articles: loadArticles }
