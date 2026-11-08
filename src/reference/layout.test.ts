import { describe, expect, it } from 'vitest'
import { cardPlace, columnMoveTarget, estimateCardHeight, estimatePages, pageBox, paginate, TITLE_HEIGHT } from './layout'
import type { SheetCard } from './model'

const ids = (layout: ReturnType<typeof paginate>) => layout.pages.map((p) => p.columns.map((c) => c.map((x) => (x.continued ? `${x.index}+` : String(x.index)))))

describe('paginate', () => {
  it('fills columns then pages, starting a column when a card does not fit', () => {
    const cards = [300, 300, 300, 300, 300, 300].map((height) => ({ height }))
    expect(ids(paginate(cards, 2, 650))).toEqual([
      [
        ['0', '1'],
        ['2', '3'],
      ],
      [['4', '5']],
    ])
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

  const minion: SheetCard = {
    ref: { kind: 'minion', id: 'm' },
    type: 'minion',
    name: 'Drones',
    appearance: { primary: 'red' },
    die: 'd6',
    actions: 'any',
    notes: 'Small flying welders, reprogrammed. They swarm the nearest hero.',
    abilities: [],
    members: Array.from({ length: 4 }, () => ({ die: 'd6' as const, out: false })),
  }
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

describe('cardPlace and columnMoveTarget', () => {
  // Page 1: [0, 1] [2, 3]; page 2: [4, 5].
  const layout = paginate(
    [300, 300, 300, 300, 300, 300].map((height) => ({ height })),
    2,
    650,
  )

  it('finds a card by page, column and position', () => {
    expect(cardPlace(layout, 3)).toEqual({ page: 1, column: 2, position: 2, of: 2 })
    expect(cardPlace(layout, 4)).toEqual({ page: 2, column: 1, position: 1, of: 2 })
    expect(cardPlace(layout, 9)).toBeUndefined()
  })

  it('moves to the same place in the next or previous column, across pages', () => {
    // Card 1 (column 1, position 2) to before card 3 (column 2, position 2): index 2 once 1 is out.
    expect(columnMoveTarget(layout, 1, 1, 6)).toBe(2)
    expect(columnMoveTarget(layout, 2, -1, 6)).toBe(0)
    // Card 3 to page 2's first column, position 2: before card 5.
    expect(columnMoveTarget(layout, 3, 1, 6)).toBe(4)
    // Nowhere left of the first column, nor right of the last.
    expect(columnMoveTarget(layout, 0, -1, 6)).toBe(0)
    expect(columnMoveTarget(layout, 5, 1, 6)).toBe(5)
  })

  it('goes to the end of a shorter column', () => {
    const short = paginate([{ height: 150 }, { height: 150 }, { height: 150 }, { height: 150, breakBefore: 'column' as const }], 3, 650)
    // [0, 1, 2] [3]: card 2 (position 3) goes after card 3.
    expect(columnMoveTarget(short, 2, 1, 4)).toBe(3)
  })
})
