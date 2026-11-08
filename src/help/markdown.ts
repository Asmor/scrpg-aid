/**
 * Help topics are Markdown in src/help/<topic>.md (scrpg-aid-designs/help/spec.md, section 8). This
 * reads the small part of Markdown they use: one `#` title, an intro, `##` sections, paragraphs,
 * `- ` lists, `**bold**`, and links to the app's own pages (`[Open Settings](#/settings)`).
 * Anything else throws, so a topic that uses more than this fails its test instead of showing
 * stray symbols.
 */

export type Inline = { kind: 'text'; text: string } | { kind: 'strong'; text: string } | { kind: 'link'; text: string; href: string }

export type Block = { kind: 'p'; inlines: Inline[] } | { kind: 'ul'; items: Inline[][] }

export interface HelpSection {
  /** The heading's slug, unique in its topic: the section's address (`#/help/<topic>/<id>`). */
  id: string
  title: string
  blocks: Block[]
}

export interface HelpTopic {
  id: string
  title: string
  /** What comes before the first section: the topic's one-line description, and any links. */
  intro: Block[]
  sections: HelpSection[]
}

/** "Make the scene more dangerous" → "make-the-scene-more-dangerous". */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function inlines(text: string, where: string): Inline[] {
  const out: Inline[] = []
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let at = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > at) out.push({ kind: 'text', text: text.slice(at, m.index) })
    if (m[1] !== undefined) out.push({ kind: 'strong', text: m[1] })
    else {
      const href = m[3]!
      // Only the app's own pages: help never sends anyone off the app.
      if (!href.startsWith('#/')) throw new Error(`${where}: a link must go to a page of the app (#/...), not "${href}"`)
      out.push({ kind: 'link', text: m[2]!, href })
    }
    at = m.index + m[0].length
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  const left = out.filter((i) => i.kind === 'text').map((i) => i.text).join('')
  if (/[*_`[\]<>]/.test(left)) throw new Error(`${where}: unsupported Markdown in "${text}"`)
  return out
}

/** A topic's Markdown, read into its title, intro and sections. `id` names it in errors. */
export function parseTopic(id: string, markdown: string): HelpTopic {
  let title: string | undefined
  const intro: Block[] = []
  const sections: HelpSection[] = []
  let para: string[] = []
  let list: Inline[][] | null = null
  const where = () => `${id}${sections.length ? ` › ${sections.at(-1)!.title}` : ''}`
  const target = () => (sections.length ? sections.at(-1)!.blocks : intro)
  const flush = () => {
    if (para.length) target().push({ kind: 'p', inlines: inlines(para.join(' '), where()) })
    if (list) target().push({ kind: 'ul', items: list })
    para = []
    list = null
  }
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      const [, hashes, text] = heading
      if (hashes === '#') {
        if (title !== undefined || sections.length) throw new Error(`${id}: one # title, before any section`)
        title = text!
      } else if (hashes === '##') {
        if (title === undefined) throw new Error(`${id}: a section before the # title`)
        const sectionId = slug(text!)
        if (!sectionId || sections.some((s) => s.id === sectionId)) throw new Error(`${id}: section "${text}" needs a heading of its own`)
        sections.push({ id: sectionId, title: text!, blocks: [] })
      } else throw new Error(`${id}: only # and ## headings, not "${line}"`)
      continue
    }
    if (title === undefined) throw new Error(`${id}: text before the # title`)
    const item = /^- (.+)$/.exec(line)
    if (item) {
      if (para.length) flush()
      list ??= []
      list.push(inlines(item[1]!, where()))
      continue
    }
    if (list) flush()
    para.push(line)
  }
  flush()
  if (title === undefined) throw new Error(`${id}: no # title`)
  return { id, title, intro, sections }
}

const inlineText = (items: readonly Inline[]) => items.map((i) => i.text).join('')

/** The words of some blocks, as one string (for search and popovers). */
export function blockText(blocks: readonly Block[]): string {
  return blocks.map((b) => (b.kind === 'p' ? inlineText(b.inlines) : b.items.map(inlineText).join(' '))).join(' ')
}
