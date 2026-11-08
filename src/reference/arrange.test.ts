import { describe, expect, it } from 'vitest'
import { defaultArrangement, isRearranged, leaveOut, moveCard, movePage, putBack, reconcileArrangement, setBreak, sortByType } from './arrange'
import type { CardType, SheetCard, SheetContents } from './model'

function card(type: CardType, name: string, extra: Partial<SheetCard> = {}): SheetCard {
  const ref = { kind: type, id: name.toLowerCase().replace(/ /g, '-') }
  const base = { ref, name, appearance: { primary: 'red' as const }, ...extra }
  if (type === 'challenge') return { ...base, type, description: '', steps: [], whenDone: '' } as SheetCard
  if (type === 'environment') return { ...base, type, description: '', aspects: [], twists: [], brings: [] } as SheetCard
  return { ...base, type, actions: 'any', notes: '', abilities: [], members: [] } as SheetCard
}

const contents = (cards: SheetCard[], pages: string[] = []): Pick<SheetContents, 'pages' | 'cards'> => ({
  cards,
  pages: pages.map((name) => ({ ref: { kind: 'hero', id: name }, kind: 'hero', name, draft: false, hero: {} as never })),
})

const names = (c: Pick<SheetContents, 'cards'>, arrangement: { cards: { ref: { id: string } }[] }) => arrangement.cards.map((x) => c.cards.find((y) => y.ref.id === x.ref.id)!.name)

const sample = () =>
  contents(
    [
      card('minion', 'Foundry Thugs', { brought: true, from: 'Molten Foundry' }),
      card('minion', 'Ember Drones'),
      card('challenge', 'Rolling Blackout'),
      card('lieutenant', 'Slag Brute'),
      card('challenge', 'Gate Lock', { brought: true, from: 'Molten Foundry' }),
      card('environment', 'Molten Foundry'),
      card('minion', 'Ash Rats'),
    ],
    ['Paradigm', 'Afterimage'],
  )

describe('defaultArrangement', () => {
  it('orders cards by type then name, with attached templates after their type, and no breaks', () => {
    const c = sample()
    const a = defaultArrangement(c)
    expect(names(c, a)).toEqual(['Molten Foundry', 'Rolling Blackout', 'Gate Lock', 'Slag Brute', 'Ash Rats', 'Ember Drones', 'Foundry Thugs'])
    expect(a.cards.every((x) => x.breakBefore === undefined)).toBe(true)
    expect(a.pages.map((p) => p.id)).toEqual(['Paradigm', 'Afterimage'])
    expect(a.omitted).toEqual([])
  })
})

describe('moveCard and the break helpers', () => {
  it('moves a card, clamped, with its break', () => {
    const c = sample()
    let a = setBreak(defaultArrangement(c), 1, 'column')
    a = moveCard(a, 1, 4)
    expect(names(c, a)).toEqual(['Molten Foundry', 'Gate Lock', 'Slag Brute', 'Ash Rats', 'Rolling Blackout', 'Ember Drones', 'Foundry Thugs'])
    expect(a.cards[4]!.breakBefore).toBe('column')
    expect(names(c, moveCard(a, 0, 99)).at(-1)).toBe('Molten Foundry')
    expect(moveCard(a, 2, 2)).toBe(a)
    expect(moveCard(a, 40, 0)).toBe(a)
  })

  it("sets and clears breaks, but not before the first card", () => {
    const a = defaultArrangement(sample())
    expect(setBreak(a, 0, 'page')).toBe(a)
    const paged = setBreak(a, 3, 'page')
    expect(paged.cards[3]).toMatchObject({ breakBefore: 'page' })
    expect(setBreak(paged, 3, undefined).cards[3]).toEqual({ ref: paged.cards[3]!.ref })
    expect(setBreak(a, 99, 'page')).toBe(a)
  })

  it('moves full pages', () => {
    const a = defaultArrangement(sample())
    expect(movePage(a, 1, 0).pages.map((p) => p.id)).toEqual(['Afterimage', 'Paradigm'])
    expect(movePage(a, 0, 0)).toBe(a)
    expect(movePage(a, 5, 0)).toBe(a)
  })

  it('leaves items out and puts them back in their place', () => {
    const c = sample()
    let a = leaveOut(defaultArrangement(c), { kind: 'challenge', id: 'rolling-blackout' })
    a = leaveOut(a, { kind: 'hero', id: 'Paradigm' })
    expect(leaveOut(a, { kind: 'hero', id: 'Paradigm' })).toBe(a)
    expect(a.omitted).toHaveLength(2)
    expect(names(c, a)).not.toContain('Rolling Blackout')
    expect(a.pages.map((p) => p.id)).toEqual(['Afterimage'])
    a = putBack(a, { kind: 'challenge', id: 'rolling-blackout' }, c)
    // At the end of its type's run.
    expect(names(c, a).slice(0, 3)).toEqual(['Molten Foundry', 'Gate Lock', 'Rolling Blackout'])
    a = putBack(a, { kind: 'hero', id: 'Paradigm' }, c)
    expect(a.pages.map((p) => p.id)).toEqual(['Afterimage', 'Paradigm'])
    expect(a.omitted).toEqual([])
  })

  it('sorts by type, keeping what is left out, and tells when anything moved', () => {
    const c = sample()
    const base = leaveOut(defaultArrangement(c), { kind: 'minion', id: 'ash-rats' })
    expect(isRearranged(base, c)).toBe(false)
    const moved = moveCard(base, 0, 3)
    expect(isRearranged(moved, c)).toBe(true)
    expect(isRearranged(setBreak(base, 2, 'column'), c)).toBe(true)
    const sorted = sortByType(setBreak(moved, 2, 'column'), c)
    expect(sorted.cards).toEqual(base.cards)
    expect(sorted.omitted).toEqual(base.omitted)
  })
})

describe('reconcileArrangement', () => {
  it('keeps a saved order, drops what is gone, and adds new cards at the end of their type', () => {
    const c = sample()
    const saved = setBreak(moveCard(defaultArrangement(c), 6, 0), 3, 'page')
    expect(names(c, saved)[0]).toBe('Foundry Thugs')
    const next = contents(
      [...c.cards.filter((x) => x.name !== 'Slag Brute' && x.name !== 'Rolling Blackout'), card('minion', 'Ash Rats Two'), card('lieutenant', 'Crane Op'), card('challenge', 'Vent')],
      ['Afterimage', 'Newcomer'],
    )
    const r = reconcileArrangement(saved, next)
    expect(names(next, r)).toEqual(['Foundry Thugs', 'Molten Foundry', 'Gate Lock', 'Vent', 'Crane Op', 'Ash Rats', 'Ember Drones', 'Ash Rats Two'])
    expect(r.pages.map((p) => p.id)).toEqual(['Afterimage', 'Newcomer'])
  })

  it('puts a new type where it would start, and keeps omitted items out', () => {
    const c = contents([card('environment', 'Rooftops'), card('minion', 'Snipers')])
    const saved = leaveOut(defaultArrangement(c), { kind: 'minion', id: 'snipers' })
    const next = contents([...c.cards, card('challenge', 'Defuse')])
    const r = reconcileArrangement(saved, next)
    expect(names(next, r)).toEqual(['Rooftops', 'Defuse'])
    expect(r.omitted).toEqual([{ kind: 'minion', id: 'snipers' }])
    // An omitted item that's gone is forgotten.
    expect(reconcileArrangement(saved, contents([card('environment', 'Rooftops')])).omitted).toEqual([])
    // With nothing of an earlier type, a new environment goes first.
    expect(names(next, reconcileArrangement({ pages: [], cards: [{ ref: { kind: 'challenge', id: 'defuse' } }], omitted: [] }, next))).toEqual(['Rooftops', 'Defuse', 'Snipers'])
  })
})
