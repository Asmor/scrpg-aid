import { describe, expect, it } from 'vitest'
import { exampleHero } from '../hero/example'
import { createHero } from '../hero/model'
import { dividedHero, formChangerHero, minionMakerHero, modularHero } from '../test/heroes'
import { embeddableJson, extractEmbedded, markdownPayload, SCRIPT_OPEN } from './embed'
import { readImport } from './files'
import { heroMarkdown, villainMarkdown } from './markdown'
import { adaptiveBruiser } from '../test/villains'
import { createVillain } from '../villain/model'

/** The Markdown before the import comment. */
const body = (md: string) => md.slice(0, md.indexOf('<!--'))
/** An HTML tag or comment that isn't escaped. */
const HTML = /(^|[^\\])<[a-z!/]/im

describe('heroMarkdown', () => {
  const md = heroMarkdown(exampleHero({ id: 'x' }))

  it('lays out the sheet with headings, lists and padded tables', () => {
    expect(md.startsWith('# Maya Reyes\n\n**Alias:** Afterimage\n\n## Characteristics\n\n- **Background:** Upper Class\n')).toBe(true)
    expect(md).toContain('- **Costume / equipment:** A heat-resistant running suit in orange and white')
    // Powers, qualities, and status dice in one table, padded so it lines up as plain text.
    expect(md).toContain(
      [
        '## Powers, qualities, and status',
        '',
        '| Power     | Die | Quality   | Die | Status | Die |',
        '| --------- | --- | --------- | --- | ------ | --- |',
        '| Speed     | d12 | Fitness   | d10 | Green  | d8  |',
        '| Agility   | d10 | Alertness | d8  | Yellow | d8  |',
        '| Awareness | d8  | Old Money | d8  | Red    | d8  |',
        '| Fire      | d8  |           |     |        |     |',
        '| Flight    | d6  |           |     |        |     |',
      ].join('\n'),
    )
    expect(md).toContain('**Max Health:** 30\n\n- **Green:** 30–23\n- **Yellow:** 22–12\n- **Red:** 11–1')
    expect(md).toContain('### Principle of Business\n\n- **During roleplaying:** ')
    expect(md).toContain('### Green\n\n- **Immunity** (Inherent): You do not take damage from Fire.')
    expect(md).toContain('### Out\n\nBoost an ally by rolling your single Fitness die.')
  })

  it('uses no HTML besides the import comment, which comes last', () => {
    expect(body(md)).not.toMatch(HTML)
    expect(md.trimEnd().endsWith('-->')).toBe(true)
  })

  it('imports back to the same hero', () => {
    const hero = { ...dividedHero(), id: 'd1' }
    expect(readImport(heroMarkdown(hero))).toEqual({ ok: true, heroes: [hero], villains: [], skipped: [] })
  })

  it('escapes the player’s text so it stays plain', () => {
    const hero = createHero('guided', { id: 'h1' })
    hero.details.name = 'The *Real* [Deal] | <b>'
    hero.details.costume = 'Cape\n- not a list\n# not a heading\n1. not numbered\n\n  > not a quote'
    const out = heroMarkdown(hero)
    expect(out.startsWith('# The \\*Real\\* \\[Deal\\] \\| \\<b\\>\n')).toBe(true)
    expect(out).toContain('- **Costume / equipment:** Cape\\\n  \\- not a list\\\n  \\# not a heading\\\n  1\\. not numbered\n\n  \\> not a quote\n')
    expect(body(out)).not.toMatch(HTML)
  })

  it('keeps paragraphs, escapes every line-start marker, and leaves an empty field blank', () => {
    const hero = createHero('guided', { id: 'h1' })
    hero.details.name = 'Agent #'
    hero.details.costume = 'Mask ~~and~~ cape &amp; boots\n+ one\n= two\n~ three\n1) four\n\n\nSecond paragraph'
    hero.archetype = { id: 'speedster', traits: [], abilities: [], bonus: [], principle: { id: 'custom', custom: { category: 'ideals', name: 'Hope', roleplaying: '', minorTwist: '', majorTwist: '', greenAbility: { name: '', text: '' } } } }
    const out = heroMarkdown(hero)
    // A trailing "#" would otherwise be dropped from the rendered heading.
    expect(out.startsWith('# Agent \\#\n')).toBe(true)
    expect(out).toContain('- **Costume / equipment:** Mask \\~\\~and\\~\\~ cape \\&amp; boots\\\n  \\+ one\\\n  \\= two\\\n  \\~ three\\\n  1\\) four\n\n  Second paragraph\n')
    expect(out).toMatch(/- \*\*During roleplaying:\*\*\n/)
  })

  it('leaves out a Divided section with nothing in it', () => {
    expect(heroMarkdown(dividedHero())).not.toContain('### Divided')
  })

  it('says what a new hero hasn’t chosen yet', () => {
    const out = heroMarkdown(createHero('guided', { id: 'h1' }))
    expect(out).toContain('# Unnamed hero')
    expect(out).toContain(['## Powers, qualities, and status', '', '| Power | Die | Quality | Die | Status | Die |', '| ----- | --- | ------- | --- | ------ | --- |', '|       |     |         |     | Green  | —   |'].join('\n'))
    expect(out).toContain('## Health\n\nNot worked out yet.')
    expect(out).toContain('## Principles\n\nNo principles yet.')
    expect(out).not.toContain('## Details')
    expect(out).not.toContain('## Auxiliary sheet')
  })

  it('includes the auxiliary sheet for forms, modes, and minion forms', () => {
    expect(heroMarkdown(formChangerHero())).toContain('### Brute (Green form)\n\n| Trait ')
    const modular = heroMarkdown(modularHero())
    expect(modular).toMatch(/### .+ \((Green|Yellow|Red) mode\)/)
    expect(modular).toContain('### Powerless mode')
    expect(heroMarkdown(minionMakerHero())).toContain('### Minion forms\n\n- **')
  })

  it('lists advancement: back issues, collections with notes, and changes', () => {
    const hero = exampleHero({ id: 'x' })
    hero.advancement = {
      backIssues: 2,
      collections: [{ name: 'Origins', notes: 'First arc\nSecond line' }, { name: '' }],
      changes: [{ kind: 'swapQuality', from: { kind: 'quality', id: 'alertness' }, to: { kind: 'quality', id: 'banter' } }],
    }
    const out = heroMarkdown(hero)
    expect(out).toContain('## Advancement\n\nBack issues: 2\n\n1. **Origins**\\\n   First arc\\\n   Second line\n2. **Collection 2**\n\n- ')
    expect(out).toMatch(/\| Banter +\| d8 +\|/)
  })
})

describe('embedded JSON', () => {
  it('leaves out the game aid’s play state', () => {
    const hero = { ...createHero('guided', { id: 'h1' }), play: { health: 3, heroPoints: 1, reactionUsed: false, mods: [], twists: [], history: [] } }
    expect(JSON.parse(embeddableJson(hero)).hero.play).toBeUndefined()
    const { play: _, ...without } = hero
    expect(readImport(heroMarkdown(hero))).toEqual({ ok: true, heroes: [without], villains: [], skipped: [] })
  })

  it('can’t close its comment or script tag, whatever the player typed', () => {
    const hero = createHero('guided', { id: 'h1' })
    hero.details.name = 'a --> b </script> c <!-- d & e ---'
    const json = embeddableJson(hero)
    expect(json).not.toMatch(/--|<|>|&/)
    expect(JSON.parse(json).hero.details.name).toBe(hero.details.name)
    expect(extractEmbedded(`text\n\n${markdownPayload(embeddableJson(hero))}\n`)?.trim()).toBe(json)
    expect(readImport(heroMarkdown(hero))).toEqual({ ok: true, heroes: [hero], villains: [], skipped: [] })
  })

  it('finds the real comment when the player’s text looks like one', () => {
    const hero = createHero('guided', { id: 'h1' })
    hero.details.name = 'Agent <!-- scrpg-hero #'
    hero.details.costume = '<!-- scrpg-hero {"format":"scrpg-hero"} -->'
    hero.background = { id: 'upper-class', qualities: [], principle: { id: 'custom', custom: { category: 'identity', name: '<!-- scrpg-hero', roleplaying: 'x -->', minorTwist: '', majorTwist: '', greenAbility: { name: 'a --> b', text: '' } } } }
    expect(readImport(heroMarkdown(hero))).toEqual({ ok: true, heroes: [hero], villains: [], skipped: [] })
  })

  it('explains a Markdown file without a readable hero', () => {
    expect(readImport('# Just notes')).toEqual({ ok: false, error: "This file isn't a hero, villain, or backup the app can read." })
    expect(readImport('# Hero\n\n<!-- scrpg-hero\n{"unclosed": 1')).toEqual({ ok: false, error: "This file isn't a hero, villain, or backup the app can read." })
    expect(readImport('# Hero\n\n<!-- scrpg-hero\n{broken\n-->')).toEqual({ ok: false, error: "This file's data is damaged, so it can't be imported." })
  })
})

describe('extractEmbedded', () => {
  const comment = (json: string) => `<!-- scrpg-hero\n${json}\n-->`
  const script = (json: string) => `${SCRIPT_OPEN}${json}</script>`

  it('reads whichever kind of payload comes last', () => {
    expect(extractEmbedded(`${comment('"a"')} text ${script('"b"')}`)).toBe('"b"')
    expect(extractEmbedded(`${script('"b"')} text ${comment('"a"')}`)?.trim()).toBe('"a"')
    expect(extractEmbedded(`${comment('"a"')} ${comment('"c"')}`)?.trim()).toBe('"c"')
  })

  it('finds nothing without a payload, or with one that isn’t closed', () => {
    expect(extractEmbedded('# Notes')).toBeUndefined()
    expect(extractEmbedded('<!-- scrpg-hero {"a": 1}')).toBeUndefined()
    expect(extractEmbedded(`${SCRIPT_OPEN}{"a": 1}`)).toBeUndefined()
  })
})

describe('villainMarkdown', () => {
  it('writes the villain’s sheet as Markdown that imports back', () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd12', abilities: [{ source: 'vehicle', name: 'Sturdy' }] } }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    v.details.motivation = 'Revenge'
    const md = villainMarkdown(v)
    for (const expected of ['# Ironclad', '- **Approach:** Adaptive', '- **Kind:** Major villain', '- **Motivation:** Revenge', '| Robotics', '**Max Health:** 70 (built for 4 heroes, 5 Health each)', '## Status die', 'Status follows its Health zone.', '- Green d6', '- **Lash Out** (Action)', '### Vehicle (d12)', '- **Sturdy** (Inherent)', '### Mastery']) {
      expect(md).toContain(expected)
    }
    expect(readImport(md)).toEqual({ ok: true, heroes: [], villains: [v], skipped: [] })
  })

  it('writes a blank villain, and each kind of status rule', () => {
    expect(villainMarkdown(createVillain({ id: 'x' }))).toContain('Not worked out yet.')
    for (const [id, line] of [
      ['domain', '- 3 or more: d10'],
      ['inventor', '- 1: d8'],
      ['formidable', '- Has no penalties related to its weakness: d12'],
      ['titan', '(1 success)'],
    ] as const) {
      const v = adaptiveBruiser()
      v.archetype = { id, abilities: [] }
      expect(villainMarkdown(v)).toContain(line)
    }
  })
})
