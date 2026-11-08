import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import type { PageItem, ScenePage, SheetCard, SheetContents } from './model'
import { sheetFileBase, printReference } from './print'
import { arranged, cardCountsText, cardFooter, followingLine, hiddenText, layoutCards, membersText, pageRuns, printRules } from './sheet'
import { DEFAULT_SHEET_OPTIONS } from './model'

const minion = (name: string): SheetCard => ({ ref: { kind: 'minion', id: name }, type: 'minion', name, appearance: { primary: 'red' }, die: 'd6', actions: 'any', notes: '', abilities: [], members: [] })
const challenge = (name: string): SheetCard => ({ ref: { kind: 'challenge', id: name }, type: 'challenge', name, appearance: { primary: 'red' }, description: '', steps: [], whenDone: '' })

const hero: PageItem = { ref: { kind: 'hero', id: 'h' }, kind: 'hero', hero: completeHero(), name: 'Paradigm', draft: false }
const villain: PageItem = { ref: { kind: 'villain', id: 'v' }, kind: 'villain', villain: adaptiveBruiser(), name: 'Ironclad', draft: false }
const scene: ScenePage = { gameName: 'Thursday game', where: 'Issue 2 · Scene 3', name: 'The Foundry', number: 3, notes: '', tracker: { counts: { green: 2, yellow: 4, red: 2 }, name: 'Standard', zones: [], filled: 0 } }

describe('the sheet helpers', () => {
  it('keeps what the arrangement keeps, in its order, with breaks', () => {
    const contents: SheetContents = { pages: [hero, villain], cards: [minion('A'), challenge('B')], bringable: [] }
    const kept = arranged(contents, { pages: [villain.ref, { kind: 'hero', id: 'gone' }], cards: [{ ref: challenge('B').ref, breakBefore: 'page' }, { ref: { kind: 'minion', id: 'gone' } }], omitted: [] })
    expect(kept.pages.map((p) => p.name)).toEqual(['Ironclad'])
    expect(kept.cards.map((c) => [c.card.name, c.breakBefore])).toEqual([['B', 'page']])
  })

  it('splits cards into page runs at page breaks', () => {
    const a = { card: minion('A') }
    const b = { card: minion('B'), breakBefore: 'page' as const }
    const c = { card: minion('C'), breakBefore: 'column' as const }
    expect(pageRuns([a, b, c]).map((r) => r.map((x) => x.card.name))).toEqual([['A'], ['B', 'C']])
    expect(pageRuns([b])).toEqual([[b]])
    expect(pageRuns([])).toEqual([[]])
  })

  it('writes the page rules: paper, the cards footer, and each full page by name', () => {
    const rules = printRules([hero, { ...villain, name: 'Iron "Clad"' }], {}, 'a4')
    expect(rules).toContain('@page { size: A4; }')
    expect(rules).toContain('@page ref-cards { @bottom-left { content: "Reference sheet"; } }')
    expect(rules).toContain('@page ref-page-0 { @bottom-left { content: "Paradigm"; } }')
    expect(rules).toContain('@page ref-page-1 { @bottom-left { content: "Iron \\"Clad\\""; } }')
    expect(printRules([], { scene }, 'letter')).toContain('content: "Scene 3: The Foundry"')
    expect(cardFooter({})).toBe('Reference sheet')
  })

  it('names what follows a scene, and counts cards by type', () => {
    expect(followingLine([villain])).toBe('Ironclad (villain) is on the next pages.')
    expect(followingLine([villain, hero, { ...hero, name: 'Afterimage' }])).toBe('Ironclad (villain), Paradigm (hero) and Afterimage (hero) are on the next pages.')
    expect(cardCountsText([minion('A'), challenge('B'), minion('C')])).toBe('Challenges 1 · Minions 2')
    expect(hiddenText('starts')).toBe('Starts hidden')
    expect(hiddenText('now')).toBe('Hidden')
  })

  it('labels the die boxes by member count for a group in play, and as a group size for a template', () => {
    const box = { die: 'd6' as const, out: false }
    expect(membersText({ ref: { kind: 'group', id: 'g' }, members: [box] })).toBe('1 member')
    expect(membersText({ ref: { kind: 'group', id: 'g' }, members: [box, box, box, { ...box, out: true }] })).toBe('4 members')
    expect(membersText({ ref: { kind: 'minion', id: 'm' }, members: [box, box, box, box] })).toBe('Group of 4')
  })

  it('lays cards out with measured heights where there are some', () => {
    const cards = [{ card: minion('A') }, { card: minion('B') }]
    const options = { ...DEFAULT_SHEET_OPTIONS, columns: 2 as const }
    expect(layoutCards(cards, {}, options).pages).toHaveLength(1)
    const tall = new Map([['A', 850]])
    expect(layoutCards(cards, {}, options, tall, (c) => c.card.name).pages[0]!.columns.map((c) => c.length)).toEqual([1, 1])
    // A scene block takes more of page 1 than the title does.
    const four = ['A', 'B', 'C', 'D'].map((n) => ({ card: minion(n) }))
    const heights = new Map(['A', 'B', 'C', 'D'].map((n) => [n, 440]))
    expect(layoutCards(four, {}, options, heights, (c) => c.card.name).pages).toHaveLength(1)
    expect(layoutCards(four, { scene }, options, heights, (c) => c.card.name).pages).toHaveLength(2)
  })
})

describe('printing', () => {
  afterEach(() => {
    document.title = ''
    document.documentElement.classList.remove('printing-reference')
  })

  it('names the file after the scene, or the date for a library export', () => {
    expect(sheetFileBase({ scene: { ...scene, name: 'The Foundry: Part 2' } })).toBe('Thursday game - Scene 3 - The Foundry Part 2')
    expect(sheetFileBase({}, new Date(2026, 10, 8))).toBe('SCRPG Aid reference sheet - 2026-11-08')
  })

  it('adds the rules, hides the app and sets the title for one print, then takes them away', async () => {
    document.title = 'SCRPG Aid'
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(document.head.querySelector('style[data-print]')!.textContent).toBe('@page { size: A4; }')
      expect(document.title).toBe('My sheet')
      expect(document.documentElement.classList.contains('printing-reference')).toBe(true)
    })
    const done = printReference('@page { size: A4; }', 'My sheet')
    await vi.waitFor(() => expect(print).toHaveBeenCalled())
    window.dispatchEvent(new Event('afterprint'))
    window.dispatchEvent(new Event('afterprint'))
    await done
    expect(document.head.querySelector('style[data-print]')).toBeNull()
    expect(document.title).toBe('SCRPG Aid')
    expect(document.documentElement.classList.contains('printing-reference')).toBe(false)
    print.mockRestore()
  })
})
