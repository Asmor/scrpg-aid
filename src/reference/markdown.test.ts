import { describe, expect, it } from 'vitest'
import { heroMarkdown, villainMarkdown } from '../transfer/markdown'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { defaultArrangement, setBreak } from './arrange'
import { sheetMarkdown, trackerLine } from './markdown'
import { DEFAULT_SHEET_OPTIONS, type PageItem, type ScenePage, type SheetCard, type SheetContents } from './model'

const hero = completeHero()
hero.details.name = 'Paradigm'
const pages: PageItem[] = [
  { ref: { kind: 'hero', id: 'h' }, kind: 'hero', hero, name: 'Paradigm', draft: false },
  { ref: { kind: 'villain', id: 'v' }, kind: 'villain', villain: adaptiveBruiser(), name: 'Ironclad', draft: false },
]
const cards: SheetCard[] = [
  {
    ref: { kind: 'environment', id: 'e' },
    type: 'environment',
    name: 'Molten Foundry',
    appearance: { primary: 'green' },
    description: 'Hot.',
    aspects: [
      { name: 'Molten Steel', die: 'd10' },
      { name: '', die: 'd6' },
    ],
    twists: [
      { zone: 'green', kind: 'minor', name: 'Slag', text: 'A ladle tips.', used: true },
      { zone: 'red', kind: 'major', text: 'It goes critical.', used: false },
    ],
    brings: ['Foundry Thugs'],
  },
  {
    ref: { kind: 'challenge', id: 'c' },
    type: 'challenge',
    name: 'Gate Lock',
    appearance: { primary: 'red' },
    description: '',
    steps: [
      { label: 'Find the panel', done: true },
      { label: '', done: false },
    ],
    whenDone: 'It opens.',
    hidden: 'starts',
  },
  {
    ref: { kind: 'minion', id: 'm' },
    type: 'minion',
    name: 'Foundry Thugs',
    appearance: { primary: 'green' },
    from: 'Molten Foundry',
    brought: true,
    die: 'd6',
    actions: ['attack', 'defend'],
    notes: 'Big.',
    abilities: [{ name: 'Shove', type: 'A', text: 'Attack.' }],
    members: [
      { die: 'd6', out: false },
      { die: 'd6', out: true },
    ],
  },
]
const contents: SheetContents = { pages, cards, bringable: [] }
const options = { ...DEFAULT_SHEET_OPTIONS }

describe('sheetMarkdown', () => {
  it('puts each full page in its own Markdown, without the import JSON, then the cards, with --- between', () => {
    const md = sheetMarkdown(contents, defaultArrangement(contents), options)
    expect(md).not.toContain('<!--')
    const parts = md.split('\n\n---\n\n')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe(heroMarkdown(hero, { payload: false, healthLine: true }).trimEnd())
    expect(parts[0]).toContain('**Current Health:** ____')
    expect(parts[1]).toBe(villainMarkdown(adaptiveBruiser(), { payload: false, healthLine: true }).trimEnd())
    expect(parts[2]!.startsWith('# Reference sheet\n\n## Molten Foundry\n\n*Environment*')).toBe(true)
    // The usual exports still carry it.
    expect(heroMarkdown(hero)).toContain('<!--')
    expect(villainMarkdown(adaptiveBruiser())).toContain('<!--')
  })

  it('writes each card type, with write-in boxes', () => {
    const md = sheetMarkdown(contents, defaultArrangement(contents), options)
    expect(md).toContain('**Aspects**\n\n- Molten Steel: d10\n- Aspect 2: d6')
    expect(md).toContain('**Twists**\n\n- [x] **G** Minor: **Slag:** A ladle tips.\n- [ ] **R** Major: It goes critical.')
    expect(md).toContain('Brings: Foundry Thugs')
    expect(md).toContain("## Gate Lock\n\n*Challenge*\n\nStarts hidden\n\n- [x] Find the panel\n- [ ] Step 2\n\n**When it's done:** It opens.")
    expect(md).toContain('## Foundry Thugs\n\n*Minion · from Molten Foundry*\n\n**Die:** d6\\\n**Actions:** Attack or Defend\n\n- **Shove** (Action): Attack.\n\nBig.\n\nGroup of 2: [ ] d6 [x] d6 (out)')
    // A group in play counts its members instead.
    const inPlay: SheetContents = { ...contents, cards: contents.cards.map((c) => (c.type === 'minion' ? { ...c, ref: { kind: 'group', id: 'g' } } : c)) }
    expect(sheetMarkdown(inPlay, defaultArrangement(inPlay), options)).toContain('2 members: [ ] d6 [x] d6 (out)')
  })

  it('drops the write-in spaces when they are off, keeping what is already done', () => {
    const md = sheetMarkdown(contents, defaultArrangement(contents), { ...options, writeIns: false })
    expect(md).not.toContain('Group of')
    expect(md).not.toContain('Current Health')
    expect(md).toContain('- [x] Find the panel\n- Step 2')
    expect(md).toContain('- [x] **G** Minor')
    expect(md).toContain('- **R** Major')
  })

  it('follows the arrangement, ignoring breaks, and puts cards first when asked', () => {
    const a = setBreak({ ...defaultArrangement(contents), pages: [pages[1]!.ref], omitted: [pages[0]!.ref] }, 1, 'page')
    a.cards.reverse()
    const md = sheetMarkdown(contents, a, { ...options, cardsFirst: true })
    const parts = md.split('\n\n---\n\n')
    expect(parts).toHaveLength(2)
    expect(parts[0]!.indexOf('## Foundry Thugs')).toBeLessThan(parts[0]!.indexOf('## Molten Foundry'))
    expect(parts[1]!.startsWith('# Ironclad')).toBe(true)
    // Nothing but full pages: no card part.
    expect(sheetMarkdown({ ...contents, cards: [] }, { pages: [pages[0]!.ref], cards: [], omitted: [] }, options).split('\n\n---\n\n')).toHaveLength(1)
  })

  it("starts a scene's with its name, the tracker line and the notes", () => {
    const scene: ScenePage = {
      gameName: 'Thursday game',
      where: 'Issue 2 · Scene 3',
      name: 'The Foundry',
      number: 3,
      notes: 'Keep the lights low.',
      tracker: { counts: { green: 2, yellow: 4, red: 2 }, name: 'Standard', zones: ['green', 'green', 'yellow', 'yellow', 'yellow', 'yellow', 'red', 'red'], filled: 4, now: 'Yellow 2' },
    }
    expect(trackerLine(scene)).toBe('Tracker: ■■■■□□□□ · Standard 2 / 4 / 2 · Now: Yellow 2')
    const withScene = { ...contents, scene }
    const md = sheetMarkdown(withScene, defaultArrangement(withScene), options)
    expect(md.startsWith('# The Foundry\n\nThursday game · Issue 2 · Scene 3\n\nTracker: ■■■■□□□□ · Standard 2 / 4 / 2 · Now: Yellow 2\n\n**Scene notes**\n\nKeep the lights low.\n\n## Molten Foundry')).toBe(true)
    expect(sheetMarkdown(withScene, defaultArrangement(withScene), { ...options, includeNotes: false })).not.toContain('Scene notes')
    const planned = { ...withScene, scene: { ...scene, tracker: { ...scene.tracker, filled: 0 } } }
    delete planned.scene.tracker.now
    expect(trackerLine(planned.scene)).toBe('Tracker: □□□□□□□□ · Standard 2 / 4 / 2')
  })
})
