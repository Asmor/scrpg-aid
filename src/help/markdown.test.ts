import { describe, expect, it } from 'vitest'
import { blockText, parseTopic, slug } from './markdown'
import { GLOSSARY_ID, HELP_TOPICS, helpSection, helpTopic } from './topics'

describe('help Markdown', () => {
  it('reads the title, intro, sections, paragraphs, lists, bold and app links', () => {
    const topic = parseTopic(
      't',
      `# Running a game

For the GM.
[Open Games](#/games)

## Status die

One line,
the same paragraph.

- **First** thing
- Second

Another paragraph.
`,
    )
    expect(topic.title).toBe('Running a game')
    expect(topic.intro).toEqual([
      {
        kind: 'p',
        inlines: [
          { kind: 'text', text: 'For the GM. ' },
          { kind: 'link', text: 'Open Games', href: '#/games' },
        ],
      },
    ])
    expect(topic.sections).toHaveLength(1)
    const [section] = topic.sections
    expect(section!.id).toBe('status-die')
    expect(section!.blocks).toEqual([
      { kind: 'p', inlines: [{ kind: 'text', text: 'One line, the same paragraph.' }] },
      {
        kind: 'ul',
        items: [
          [
            { kind: 'strong', text: 'First' },
            { kind: 'text', text: ' thing' },
          ],
          [{ kind: 'text', text: 'Second' }],
        ],
      },
      { kind: 'p', inlines: [{ kind: 'text', text: 'Another paragraph.' }] },
    ])
    expect(blockText(section!.blocks)).toBe('One line, the same paragraph. First thing Second Another paragraph.')
  })

  it('slugs headings', () => {
    expect(slug("Games this version can't read")).toBe('games-this-version-cant-read')
    expect(slug('Make the scene more dangerous')).toBe('make-the-scene-more-dangerous')
  })

  it("refuses what it can't show: links off the app, other markup, extra titles, repeated sections", () => {
    expect(() => parseTopic('t', '# T\n\n[Rules](https://example.com)')).toThrow(/page of the app/)
    expect(() => parseTopic('t', '# T\n\nSome `code`.')).toThrow(/unsupported Markdown/)
    expect(() => parseTopic('t', '# T\n\n_emphasis_')).toThrow(/unsupported Markdown/)
    expect(() => parseTopic('t', '# T\n\n### Small')).toThrow(/only # and ##/)
    expect(() => parseTopic('t', '# T\n\n# Again')).toThrow(/one # title/)
    expect(() => parseTopic('t', '# T\n\n## A\n\n## A')).toThrow(/heading of its own/)
    expect(() => parseTopic('t', 'Text first\n\n# T')).toThrow(/before the # title/)
    expect(() => parseTopic('t', '')).toThrow(/no # title/)
  })
})

describe('the help topics', () => {
  it('are the spec’s eight, in order, each with an intro and sections', () => {
    expect(HELP_TOPICS.map((t) => t.title)).toEqual(['Getting started', 'Building heroes', 'Villains and NPCs', 'Running a game', 'Playing a hero', 'Between issues', 'Settings and data', 'Glossary'])
    for (const t of HELP_TOPICS) {
      expect(t.id).toBe(slug(t.title))
      expect(blockText(t.intro)).not.toBe('')
      expect(t.sections.length).toBeGreaterThan(2)
      for (const s of t.sections) expect(blockText(s.blocks)).not.toBe('')
    }
  })

  it('cover the glossary’s words', () => {
    const terms = helpTopic(GLOSSARY_ID)!.sections.map((s) => s.title)
    for (const word of ['Game', 'Issue', 'Scene', 'Set aside', 'Hidden', 'Revealed', 'Side', 'Back issue', 'Collection', 'Solo game']) expect(terms).toContain(word)
  })

  it('find a section by topic and id', () => {
    expect(helpSection('running-a-game', 'status-die')?.title).toBe('Status die')
    expect(helpSection('running-a-game', 'nope')).toBeUndefined()
    expect(helpTopic('nope')).toBeUndefined()
  })

  it('only link to the app’s own pages', () => {
    const links = HELP_TOPICS.flatMap((t) => [t.intro, ...t.sections.map((s) => s.blocks)].flat()).flatMap((b) => (b.kind === 'p' ? b.inlines : b.items.flat())).filter((i) => i.kind === 'link')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link.kind === 'link' && link.href.startsWith('#/')).toBe(true)
  })
})
