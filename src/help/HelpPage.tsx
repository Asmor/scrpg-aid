/**
 * The Help page (scrpg-aid-designs/help/spec.md, sections 2, 6 and 7): the topics on the left with
 * search, and the open topic on the right. On phones it's one column: the search and the topic
 * list, then a topic with a way back. Search results replace the topic (or the list), and Enter
 * opens the first one.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { helpPath, navigate } from '../app/route'
import { useMediaQuery } from '../components/useMediaQuery'
import { useHelp, usePageKey } from './help-context'
import type { Block, HelpTopic, Inline } from './markdown'
import { searchHelp, type HelpResult } from './search'
import { HELP_TOPICS, helpTopic } from './topics'

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

function Inlines({ list }: { list: readonly Inline[] }) {
  return (
    <>
      {list.map((i, n) =>
        i.kind === 'text' ? (
          i.text
        ) : i.kind === 'strong' ? (
          <strong key={n}>{i.text}</strong>
        ) : (
          <a key={n} href={i.href}>
            {i.text}
          </a>
        ),
      )}
    </>
  )
}

function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((b, n) =>
        b.kind === 'p' ? (
          <p key={n}>
            <Inlines list={b.inlines} />
          </p>
        ) : (
          <ul key={n}>
            {b.items.map((item, m) => (
              <li key={m}>
                <Inlines list={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  )
}

/** The element id of a section's heading on the page. */
const sectionAnchor = (section: string) => `help-${section}`

function TopicView({ topic, section, crumb }: { topic: HelpTopic; section?: string; crumb: boolean }) {
  const title = useRef<HTMLHeadingElement>(null)
  // What was last shown: arriving at the page leaves focus alone unless a section was asked for.
  const shown = useRef(`${topic.id}/`)
  // A new topic or section puts focus on its heading (scrolling to it), so it's read out.
  useEffect(() => {
    const now = `${topic.id}/${section ?? ''}`
    const changed = shown.current !== now
    shown.current = now
    if (!changed && !section) return
    const target = section ? document.getElementById(sectionAnchor(section)) : title.current
    target?.scrollIntoView?.({ block: 'start' })
    target?.focus({ preventScroll: true })
  }, [topic, section])
  return (
    <article className="help-topic" aria-labelledby="help-topic-title">
      {crumb && (
        <p className="help-topic__crumb muted">
          <a href={helpPath()}>Help</a> / {topic.title}
        </p>
      )}
      <h1 id="help-topic-title" ref={title} tabIndex={-1}>
        {topic.title}
      </h1>
      <div className="help-topic__intro">
        <Blocks blocks={topic.intro} />
      </div>
      {topic.sections.map((s) => (
        <section key={s.id} aria-labelledby={sectionAnchor(s.id)}>
          <h2 id={sectionAnchor(s.id)} tabIndex={-1}>
            {s.title}
          </h2>
          <Blocks blocks={s.blocks} />
        </section>
      ))}
    </article>
  )
}

function Results({ results, query, onOpen }: { results: readonly HelpResult[]; query: string; onOpen: () => void }) {
  if (!results.length) return <p className="help-none">Nothing matches "{query.trim()}". Try a shorter word.</p>
  return (
    <ul className="help-results">
      {results.map((r) => (
        <li key={`${r.topicId}/${r.sectionId ?? ''}`}>
          <a className="help-result" href={helpPath(r.topicId, r.sectionId)} onClick={onOpen}>
            <span className="help-result__head">
              <strong>{r.title}</strong> <span className="muted">{r.where}</span>
            </span>
            <span className="help-result__snippet">{r.snippet.map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : p.text))}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function TopicList({ current, onPick, phone }: { current?: string; onPick: () => void; phone: boolean }) {
  const { openShortcuts } = useHelp()
  return (
    <ul className={phone ? 'help-list help-list--phone' : 'help-list'}>
      {HELP_TOPICS.map((t) => (
        <li key={t.id}>
          <a href={helpPath(t.id)} className="help-list__item" {...(t.id === current ? { 'aria-current': 'page' as const } : {})} onClick={onPick}>
            {t.title}
            {phone && <span aria-hidden="true">›</span>}
          </a>
        </li>
      ))}
      <li className="help-list__shortcuts">
        <button type="button" className="help-list__item" onClick={openShortcuts}>
          Keyboard shortcuts <kbd aria-hidden="true">?</kbd>
          {phone && <span aria-hidden="true">›</span>}
        </button>
      </li>
    </ul>
  )
}

export function HelpPage({ topic: topicId, section }: { topic?: string; section?: string }) {
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const results = searchHelp(query)
  const searching = query.trim().length > 0
  // A desktop's Help opens on the first topic; a phone's shows the list.
  const topic = topicId ? helpTopic(topicId) : phone ? undefined : HELP_TOPICS[0]
  const clear = () => setQuery('')
  usePageKey('/', (e) => {
    e.preventDefault()
    search.current?.focus()
  })

  const searchField = (
    <label className="help-search">
      <SearchIcon />
      <input
        ref={search}
        type="search"
        aria-label="Search help"
        placeholder="Search help"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !results[0]) return
          e.preventDefault()
          navigate(helpPath(results[0].topicId, results[0].sectionId))
          clear()
        }}
      />
    </label>
  )
  const count = (
    <p role="status" className={searching ? 'help-count muted' : 'visually-hidden'}>
      {searching ? `${results.length === 1 ? '1 result' : `${results.length} results`} for "${query.trim()}"` : ''}
    </p>
  )
  const missing = topicId && !topic && (
    <p role="alert">
      There's no help topic called "{topicId}". <a href={helpPath()}>See every topic</a>.
    </p>
  )
  const body = (main: ReactNode) =>
    searching ? (
      <>
        {count}
        <Results results={results} query={query} onOpen={clear} />
      </>
    ) : (
      <>
        {count}
        {missing || main}
      </>
    )

  if (phone) {
    const reading = topic && !searching
    const shown = topic ? (
      <TopicView topic={topic} {...(section ? { section } : {})} crumb={false} />
    ) : (
      <nav aria-label="Help topics">
        <TopicList onPick={clear} phone />
      </nav>
    )
    return (
      <div className="help-page help-page--phone">
        {topicId ? (
          <div className="help-page__bar">
            <a className="icon-button" href={helpPath()} aria-label="Back to Help">
              ‹
            </a>
            <span className="muted">Help</span>
          </div>
        ) : (
          <h1 className="help-page__title">Help</h1>
        )}
        {!reading && searchField}
        {body(shown)}
      </div>
    )
  }
  return (
    <div className="help-page">
      <nav aria-label="Help topics" className="help-nav">
        {searchField}
        <TopicList {...(topic ? { current: topic.id } : {})} onPick={clear} phone={false} />
      </nav>
      <div className="help-main">{body(topic && <TopicView topic={topic} {...(section ? { section } : {})} crumb />)}</div>
    </div>
  )
}
