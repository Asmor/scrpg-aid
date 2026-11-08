/**
 * Searching help (scrpg-aid-designs/help/spec.md, section 2): topic titles, section headings and
 * glossary terms (the glossary's headings), then the text of each section. Each result has a
 * snippet with the matching words marked.
 */
import { blockText, type HelpTopic } from './markdown'
import { HELP_TOPICS } from './topics'

/** A piece of a snippet: matching text is marked. */
export interface SnippetPart {
  text: string
  match: boolean
}

export interface HelpResult {
  topicId: string
  /** Unset when the topic itself matched. */
  sectionId?: string
  title: string
  /** Where it lives: the topic's title, or "Help" for a topic. */
  where: string
  snippet: SnippetPart[]
}

const SNIPPET = 140
const LEAD = 40

const normalize = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase()

/** Marks every case-insensitive occurrence of `query` in `text`. */
export function highlight(text: string, query: string): SnippetPart[] {
  const q = normalize(query)
  if (!q) return [{ text, match: false }]
  const parts: SnippetPart[] = []
  const lower = text.toLowerCase()
  let at = 0
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
    if (i > at) parts.push({ text: text.slice(at, i), match: false })
    parts.push({ text: text.slice(i, i + q.length), match: true })
    at = i + q.length
  }
  if (at < text.length || !parts.length) parts.push({ text: text.slice(at), match: false })
  return parts
}

/** A short piece of `text`, around the first match if there is one, cut at word breaks. */
function excerpt(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q)
  let start = i > LEAD ? text.lastIndexOf(' ', i - LEAD) + 1 : 0
  if (start < 0) start = 0
  let end = start + SNIPPET
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end)
    end = space > Math.max(start, i + q.length) ? space : end
  } else end = text.length
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/** Results for `query`, best first: titles and headings, then text. Empty for an empty query. */
export function searchHelp(query: string, topics: readonly HelpTopic[] = HELP_TOPICS): HelpResult[] {
  const q = normalize(query)
  if (!q) return []
  const found: { rank: number; order: number; result: HelpResult }[] = []
  let order = 0
  for (const topic of topics) {
    const introText = blockText(topic.intro)
    if (topic.title.toLowerCase().includes(q)) {
      found.push({ rank: 0, order: order++, result: { topicId: topic.id, title: topic.title, where: 'Help', snippet: highlight(excerpt(introText, q), q) } })
    }
    for (const section of topic.sections) {
      const body = blockText(section.blocks)
      const inHeading = section.title.toLowerCase().includes(q)
      if (!inHeading && !body.toLowerCase().includes(q)) continue
      found.push({
        rank: inHeading ? 1 : 2,
        order: order++,
        result: { topicId: topic.id, sectionId: section.id, title: section.title, where: topic.title, snippet: highlight(excerpt(body, q), q) },
      })
    }
  }
  return found.sort((a, b) => a.rank - b.rank || a.order - b.order).map((f) => f.result)
}
