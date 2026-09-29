import type { Article } from './types'
import en from './en'
import { SOURCES } from './sources'

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

// The research behind each article is the same in every language, so it is
// kept once, in ./sources, and attached here by article id.
const withSources = (articles: Article[]): Article[] =>
  articles.map((a) => (SOURCES[a.id] ? { ...a, sources: SOURCES[a.id] } : a))

export async function loadArticles(language: string): Promise<Article[]> {
  const load = LOADERS[language]
  if (!load) return withSources(en)
  try {
    return withSources((await load()).default)
  } catch {
    return withSources(en)
  }
}

/**
 * For the navbar's `knowledgeBase` prop (wired separately). `guides`: the
 * guide PDFs are published at opensource.unisim.co.uk/kb/pdf/<lang>/ — re-run
 * universal-platform's packages/sdk/scripts/kb-pdfs.mjs after editing an
 * article or a source, and commit the output to the portal.
 */
export const KNOWLEDGE_BASE = { articles: loadArticles, guides: true }
