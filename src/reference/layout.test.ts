import { describe, expect, it } from 'vitest'
import { estimateCardHeight, estimatePages, pageBox, paginate, TITLE_HEIGHT } from './layout'
import type { SheetCard } from './model'

const ids = (layout: ReturnType<typeof paginate>) => layout.pages.map((p) => p.columns.map((c) => c.map((x) => (x.continued ? `${x.index}+` : String(x.index)))))

describe('paginate', () => {
  it('fills columns then pages, starting a column when a card does not fit', () => {
    const cards = [300, 300, 300, 300, 300, 300].map((height) => ({ height }))
    expect(ids(paginate(cards, 2, 650))).toEqual([[['0', '1'], ['2', '3']], [['4', '5']]])
  })

  it('leaves room for the first page top in every column of page 1 only', () => {
    const cards = [300, 300, 300, 300].map((height) => ({ height }))
    expect(ids(paginate(cards, 2, 650, 100))).toEqual([[['0'], ['1']], [['2', '3']]])
  })

  it('honors column and page breaks, without empty columns or pages', () => {
    const cards = [{ height: 100 }, { height: 100, breakBefore: 'column' as const }, { height: 100, breakBefore: 'page' as const }, { height: 100, breakBefore: 'column' as const }, { height: 100, breakBefore: 'page' as const }]
    expect(ids(paginate(cards, 2, 650))).toEqual([[['0'], ['1']], [['2'], ['3']], [['4']]])
    // A page break right after a page overflowed doesn't add another page.
    const overflow = [{ height: 600 }, { height: 600 }, { height: 600 }, { height: 100, breakBefore: 'page' as const }]
    expect(ids(paginate(overflow, 1, 650))).toEqual([[['0']], [['1']], [['2']], [['3']]])
  })

  it('breaks a card taller than a column across the next ones', () => {
    const layout = paginate([{ height: 100 }, { height: 1000 }, { height: 100 }], 2, 650)
    expect(ids(layout)).toEqual([[['0'], ['1']], [['1+', '2']]])
    expect([...layout.tooTall]).toEqual([1])
  })

  it('always has a first page', () => {
    expect(paginate([], 2, 650).pages).toEqual([{ columns: [[]] }])
  })
})

describe('page sizes and estimates', () => {
  it('knows Letter and A4 at 96 px to the inch', () => {
    expect(pageBox('letter', 2)).toEqual({ width: 816, height: 1056, inner: 720, columnHeight: 936, columnWidth: 352 })
    expect(pageBox('a4', 3).columnHeight).toBe(1003)
  })

  const minion: SheetCard = { ref: { kind: 'minion', id: 'm' }, type: 'minion', name: 'Drones', appearance: { primary: 'red' }, die: 'd6', actions: 'any', notes: 'Small flying welders, reprogrammed. They swarm the nearest hero.', abilities: [], members: Array.from({ length: 4 }, () => ({ die: 'd6' as const, out: false })) }
  const env: SheetCard = {
    ref: { kind: 'environment', id: 'e' },
    type: 'environment',
    name: 'Foundry',
    appearance: { primary: 'green' },
    description: 'A steel mill.',
    aspects: [{ name: 'Heat', die: 'd8' }],
    twists: Array.from({ length: 30 }, () => ({ zone: 'green' as const, kind: 'minor' as const, text: 'A ladle tips and the floor runs with slag, everywhere at once.', used: false })),
    brings: ['Thugs'],
  }

  it('estimates taller cards for more text, and write-ins add the die boxes', () => {
    expect(estimateCardHeight(minion, 352, true)).toBeGreaterThan(estimateCardHeight(minion, 352, false))
    expect(estimateCardHeight(env, 228, true)).toBeGreaterThan(estimateCardHeight(env, 352, true))
    const challenge: SheetCard = { ref: { kind: 'challenge', id: 'c' }, type: 'challenge', name: 'Lock', appearance: { primary: 'red' }, description: '', steps: [{ label: '', done: false }], whenDone: 'Open.', hidden: 'starts' }
    expect(estimateCardHeight(challenge, 352, true)).toBeGreaterThan(56)
  })

  it('counts two pages for each sheet, plus the card pages', () => {
    expect(estimatePages({ pages: [1, 2], cards: [] }, { paper: 'letter', columns: 2, writeIns: true })).toBe(4)
    expect(estimatePages({ pages: [1], cards: [minion] }, { paper: 'letter', columns: 2, writeIns: true })).toBe(3)
    expect(estimatePages({ pages: [], cards: [env, env, env] }, { paper: 'letter', columns: 2, writeIns: true }, TITLE_HEIGHT)).toBeGreaterThan(1)
    // A scene's page prints even with no cards.
    expect(estimatePages({ pages: [], cards: [] }, { paper: 'letter', columns: 2, writeIns: true }, 150)).toBe(1)
  })
})
