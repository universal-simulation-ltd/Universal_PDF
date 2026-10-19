import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { parseArticleBody, translateNav, useLanguage, useUniversal } from '@unisim/sdk'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { KNOWLEDGE_BASE, loadArticles } from '../knowledge'
import type { Article, Source } from '../knowledge/types'
import { Icon, PATHS } from './icons'
import { BackLink, Hl } from './parts'
import { topScreen, useNav } from './nav'

// The knowledge base as a page of the phone's own (James, 2026-10-18: "Make
// knowledge base native page"), in place of the SDK's KnowledgeBaseDialog,
// which the website and the desktop app keep. The same articles (`src/knowledge`,
// in the reader's language) grouped the same way, a search box, and each
// article a page of its own with its back link to the list.
//
// Two pages on the nav stack, so Android's back closes article → list → page:
// 'kb' is the list, 'kb-article' (with `kbArticle`) an article over it. Both are
// this one component, kept mounted between them so the list keeps its search
// and its scroll under the article. Previous / Next turn the article in place.
// Opened from Tune (no document: NativeApp stands it over the tabs) and from
// What else ▸ How to… (over the document).
//
// The bodies go through the SDK's own parser (`parseArticleBody`: paragraphs,
// `## `, `- `, `1. `), so the closed little markdown means the same thing here
// as in the dialog, and nothing in an article can inject markup. Only the
// look is the phone's. The words the dialog already has (Research and sources,
// Download this guide, Previous / Next, the kinds of source) are the SDK's own
// translations, through `translateNav`.
//
// ⚠️ The search box is never focused for the reader: the keyboard must not
// come up before the page has been taken in (James).

/** Where the suite's guide PDFs live: the SDK's KB_LIBRARY_URL, which it doesn't export. */
const KB_LIBRARY = 'https://opensource.unisim.co.uk/kb'

/** The paper colours of the Desk's cards, one per group in the order they come. */
const HUES = [
  { bg: '#dfe7fb', ink: '#173a94', fold: '#b3c4ee' },
  { bg: '#fde3cf', ink: '#b4480a', fold: '#efbf9a' },
  { bg: '#dcefd9', ink: '#2f6b3a', fold: '#b2d4ab' },
  { bg: '#fde68a', ink: '#6b4f00', fold: '#e5c75a' },
]

type Hue = (typeof HUES)[number]
type Loaded = { lang: string; list: Article[] } | 'failed' | null

/** Accents and case away, so "resume" finds "résumé" and "IMZA" finds "imza". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i')
}

function hueFor(groups: string[], a: Article): Hue {
  return HUES[Math.max(0, groups.indexOf(a.group ?? '')) % HUES.length]
}

/**
 * Anything that still asks for the knowledge base through the store's flag
 * (the website's way) gets the page instead of the dialog.
 */
export function useKnowledgeBaseRequests() {
  const open = usePdfStore((s) => s.knowledgeBaseOpen)
  useEffect(() => {
    if (!open) return
    usePdfStore.getState().setKnowledgeBaseOpen(false)
    useNav.getState().push('kb')
  }, [open])
}

export default function KnowledgeScreen() {
  const { language } = useLanguage()
  const reading = useNav((s) => topScreen(s.screens) === 'kb-article')
  const articleId = useNav((s) => s.kbArticle)
  const [loaded, setLoaded] = useState<Loaded>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    loadArticles(language)
      .then((list) => live && setLoaded({ lang: language, list }))
      .catch(() => live && setLoaded('failed'))
    return () => {
      live = false
    }
  }, [language])

  const list = loaded && loaded !== 'failed' ? loaded.list : null
  const groups = useMemo(() => [...new Set((list ?? []).map((a) => a.group ?? ''))], [list])
  const article = reading && list ? list.find((a) => a.id === articleId) ?? null : null

  return (
    <div className="np-page-enter flex-1 min-h-0 flex flex-col relative" style={{ background: 'var(--np-paper)' }}>
      <ListPage
        loaded={loaded}
        groups={groups}
        query={query}
        setQuery={setQuery}
        hidden={reading}
      />
      {reading && list && article && (
        <ArticlePage article={article} list={list} hue={hueFor(groups, article)} />
      )}
    </div>
  )
}

function ListPage({
  loaded,
  groups,
  query,
  setQuery,
  hidden,
}: {
  loaded: Loaded
  groups: string[]
  query: string
  setQuery: (q: string) => void
  hidden: boolean
}) {
  const t = useT()
  const { language } = useLanguage()
  const tab = useNav((s) => s.tab)
  const fileName = usePdfStore((s) => (s.doc ? s.fileName : null))
  const list = loaded && loaded !== 'failed' ? loaded.list : null

  const backTo = fileName
    ? fileName.replace(/\.pdf$/i, '') || t('phone.sign_back')
    : t(tab === 'desk' ? 'phone.tab_desk' : tab === 'signatures' ? 'phone.tab_signatures' : 'phone.tab_tune')

  // Every word of the search somewhere in the article: its title, summary,
  // group or body. Groups keep their order and their runs, as in the dialog.
  const runs = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean)
    const shown = (list ?? []).filter((a) => {
      if (!words.length) return true
      const hay = fold([a.title, a.summary, a.group, a.body].filter(Boolean).join(' '))
      return words.every((w) => hay.includes(w))
    })
    const out: { group?: string; items: Article[] }[] = []
    for (const a of shown) {
      const last = out[out.length - 1]
      if (last && last.group === a.group) last.items.push(a)
      else out.push({ group: a.group, items: [a] })
    }
    return out
  }, [list, query])

  return (
    <div
      data-edge-under
      className="flex-1 min-h-0 flex flex-col"
      aria-hidden={hidden || undefined}
      style={hidden ? { visibility: 'hidden' } : undefined}
    >
      <header className="flex-none px-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <BackLink label={backTo} onClick={() => useNav.getState().pop()} />
      </header>

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 flex flex-col gap-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="np-serif m-0 text-[34px] leading-[1.05] font-bold">
            {t('phone.kb_lead')} <Hl>{t('phone.kb_hl')}</Hl>
          </h1>
          <span className="text-[14px] leading-[1.45] text-[color:var(--np-muted)]">{t('phone.kb_note')}</span>
        </div>

        <form
          role="search"
          className="relative"
          onSubmit={(e) => {
            // Enter puts the keyboard away so the results can be read.
            e.preventDefault()
            ;(document.activeElement as HTMLElement | null)?.blur?.()
          }}
        >
          <span className="absolute left-3 top-0 h-full flex items-center pointer-events-none text-[color:var(--np-muted)]">
            <Icon d={PATHS.search} size={18} />
          </span>
          <input
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('phone.kb_search')}
            aria-label={t('phone.kb_search')}
            className="np-kb-search w-full h-11 pl-10 pr-11 rounded-xl text-[16px] outline-none"
            style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}
          />
          {query && (
            <button
              type="button"
              aria-label={t('phone.kb_clear')}
              onClick={() => setQuery('')}
              className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-[color:var(--np-muted)]"
            >
              <Icon d={PATHS.close} size={16} width={2.4} />
            </button>
          )}
        </form>

        {loaded === 'failed' ? (
          <p className="m-0 text-[15px] leading-[1.45] text-[color:var(--np-muted)]">{translateNav(language, 'kb.load_failed')}</p>
        ) : !list ? (
          <p className="m-0 text-[15px] text-[color:var(--np-muted)]">{translateNav(language, 'kb.loading')}</p>
        ) : runs.length === 0 ? (
          <p className="m-0 text-[15px] leading-[1.45] text-[color:var(--np-muted)]">{query.trim() ? t('phone.kb_no_match') : translateNav(language, 'kb.no_articles')}</p>
        ) : (
          runs.map((run, i) => {
            const hue = hueFor(groups, run.items[0])
            return (
              <section key={`${run.group ?? ''}-${i}`} className="flex flex-col gap-2">
                {run.group && (
                  <h2 className="np-serif m-0 text-[21px] font-bold flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="np-tilt flex-none w-3.5 h-3.5 rounded-[3px]"
                      style={{ background: hue.fold, transform: 'rotate(-6deg)' }}
                    />
                    {run.group}
                  </h2>
                )}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}>
                  {run.items.map((a, j) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => useNav.getState().readArticle(a.id)}
                      className="w-full flex items-center gap-3 min-h-[64px] px-3.5 py-3 text-left"
                      style={{ borderTop: j ? '1px solid var(--np-rule)' : 0 }}
                    >
                      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="text-[16px] font-semibold leading-snug">{a.title}</span>
                        {a.summary && <span className="text-[13.5px] leading-[1.4] text-[color:var(--np-muted)]">{a.summary}</span>}
                      </span>
                      <Icon d={PATHS.chevron} size={16} stroke="#9a9ca3" width={2.4} />
                    </button>
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}

function ArticlePage({ article, list, hue }: { article: Article; list: Article[]; hue: Hue }) {
  const t = useT()
  const { language } = useLanguage()
  const { config } = useUniversal()
  const sdk = (key: string) => translateNav(language, key)
  const at = list.findIndex((a) => a.id === article.id)
  const prev = at > 0 ? list[at - 1] : null
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null
  const guideLang = language === 'en-gb' || language === 'en' ? 'en' : language
  const guide = KNOWLEDGE_BASE.guides && config.product ? `${KB_LIBRARY}/${config.product}/${guideLang}/${article.id}.pdf` : null
  const sources = article.sources ?? []

  return (
    <div data-edge-page className="np-page-enter absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--np-paper)' }}>
      <header className="flex-none px-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
        <BackLink label={t('phone.kb_all')} onClick={() => useNav.getState().pop()} />
      </header>

      {/* Keyed by the article, so turning to the next one starts at its top. */}
      <div
        key={article.id}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 flex flex-col gap-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <div className="flex flex-col gap-2 items-start">
          {article.group && (
            <span
              className="np-tilt px-2.5 py-1 rounded-[3px] text-[12px] font-bold uppercase tracking-[0.06em]"
              style={{ background: hue.bg, color: hue.ink, transform: 'rotate(-1.5deg)' }}
            >
              {article.group}
            </span>
          )}
          <h1 className="np-serif m-0 text-[30px] leading-[1.1] font-bold">{article.title}</h1>
          {article.summary && <p className="m-0 text-[15px] leading-[1.45] text-[color:var(--np-muted)]">{article.summary}</p>}
        </div>

        <article
          className="bg-white rounded-[3px] px-[18px] py-5 flex flex-col gap-3"
          style={{ boxShadow: '0 6px 14px rgba(23,30,50,0.1)', userSelect: 'text', WebkitUserSelect: 'text' }}
        >
          <ArticleBody body={article.body} />
        </article>

        {guide && (
          <a
            href={guide}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[50px] rounded-2xl text-white text-[16px] font-bold flex items-center justify-center gap-2 px-4 text-center no-underline"
            style={{ background: 'var(--np-cobalt)' }}
          >
            <Icon d={PATHS.download} size={18} stroke="#ffffff" />
            {sdk('kb.download_guide')}
          </a>
        )}

        {sources.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="np-serif m-0 text-[21px] font-bold">{sdk('kb.sources')}</h2>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}>
              {sources.map((s, i) => (
                <SourceRow key={s.href} source={s} first={i === 0} sdk={sdk} />
              ))}
            </div>
          </section>
        )}

        {(prev || next) && (
          <nav className="grid grid-cols-2 gap-2.5 pt-1">
            {prev ? <TurnButton label={`‹ ${sdk('kb.previous')}`} title={prev.title} onClick={() => useNav.getState().readArticle(prev.id)} /> : <span />}
            {next ? <TurnButton label={`${sdk('kb.next')} ›`} title={next.title} onClick={() => useNav.getState().readArticle(next.id)} right /> : <span />}
          </nav>
        )}
      </div>
    </div>
  )
}

/** `**bold**` only; everything else is the words as they are. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i} className="font-bold text-[color:var(--np-ink)]">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  )
}

function ArticleBody({ body }: { body: string }) {
  const blocks = useMemo(() => parseArticleBody(body), [body])
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'h') return <h2 key={i} className="np-serif m-0 mt-2 text-[20px] leading-tight font-bold">{inline(b.text)}</h2>
        if (b.kind === 'p') return <p key={i} className="m-0 text-[16px] leading-[1.6] text-[color:var(--np-ink-2)]">{inline(b.text)}</p>
        const List = b.kind === 'ul' ? 'ul' : 'ol'
        return (
          <List key={i} className={`m-0 pl-5 flex flex-col gap-1.5 text-[16px] leading-[1.55] text-[color:var(--np-ink-2)] ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
            {b.items.map((item, j) => <li key={j} className="pl-0.5">{inline(item)}</li>)}
          </List>
        )
      })}
    </>
  )
}

function SourceRow({ source: s, first, sdk }: { source: Source; first: boolean; sdk: (key: string) => string }) {
  const byline = [s.authors, s.publisher, s.year].filter(Boolean).join(' · ')
  const pdf = s.pdf ? (/^https?:\/\//.test(s.pdf) ? s.pdf : `${KB_LIBRARY}/${s.pdf.replace(/^\//, '')}`) : null
  const pill = 'inline-flex items-center min-h-[32px] px-3 rounded-full text-[13px] font-semibold no-underline'
  return (
    <div className="px-3.5 py-3 flex flex-col gap-1" style={{ borderTop: first ? 0 : '1px solid var(--np-rule)' }}>
      <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--np-muted)]">{sdk(`kb.kind.${s.kind}`)}</span>
      <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold leading-snug text-[color:var(--np-ink)] no-underline">
        {s.title}
      </a>
      {byline && <span className="text-[13px] leading-[1.4] text-[color:var(--np-muted)]">{byline}</span>}
      <span className="flex flex-wrap gap-2 mt-1">
        {pdf && (
          <a href={pdf} target="_blank" rel="noopener noreferrer" className={pill} style={{ background: 'var(--np-cobalt)', color: '#ffffff' }}>
            PDF
          </a>
        )}
        <a href={s.href} target="_blank" rel="noopener noreferrer" className={pill} style={{ border: '1px solid var(--np-line)', color: 'var(--np-cobalt-deep)' }}>
          {sdk(pdf ? 'kb.publisher' : 'kb.read_source')} ↗
        </a>
      </span>
      {pdf && s.licence && <span className="text-[12px] leading-[1.35] text-[color:var(--np-muted)]">{s.licence}</span>}
    </div>
  )
}

function TurnButton({ label, title, onClick, right = false }: { label: string; title: string; onClick: () => void; right?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-3.5 py-3 flex flex-col gap-0.5 min-w-0 ${right ? 'text-right items-end' : 'text-left items-start'}`}
      style={{ background: 'var(--np-slip)', border: '1px solid var(--np-line)' }}
    >
      <span className="text-[13px] font-semibold text-[color:var(--np-cobalt)]">{label}</span>
      <span className="text-[14px] font-semibold leading-snug max-w-full">{title}</span>
    </button>
  )
}
