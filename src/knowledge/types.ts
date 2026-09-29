// Structurally identical to @unisim/sdk's KnowledgeArticle / KnowledgeSource
// (0.168.0+). Kept local so the articles compile whatever SDK version is
// installed.
export interface Article {
  id: string        // stable kebab-case slug, identical across languages
  title: string
  summary?: string  // one line shown under the title on its card
  group?: string    // card heading, e.g. "The basics" / "How it works" / "Privacy and security" (translated)
  body: string      // tiny closed markdown: paragraphs, "## ", "- ", "1. ", "**bold**"
  sources?: Source[] // merged in from ./sources by index.ts — never set per language
}

// A paper, standard or report an article draws on. Titles stay in their
// original language, so these live once in ./sources, not in each translation.
export interface Source {
  kind: 'paper' | 'standard' | 'report' | 'guidance' | 'law'
  title: string
  authors?: string
  publisher?: string
  year?: number
  href: string      // the canonical free link (DOI, publisher page or their PDF)
  pdf?: string      // our hosted copy under opensource.unisim.co.uk/kb/ — ONLY if the licence allows it
  licence?: string  // the licence that hosted copy is shared under
}
