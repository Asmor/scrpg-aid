import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT, defaultSearchName, emptyQuery, filterCount, filterItems, isFiltered, matches, nextSort, noMatchText, parseView, sameQuery, sortItems, viewHash, withFilterTag, type LibraryQuery } from './query'

const items = [
  { type: 'hero', typeLabel: 'Hero', name: 'Maya Reyes', tags: ['thursday-game'], updatedAt: '2026-10-30T10:00:00.000Z' },
  { type: 'villain', typeLabel: 'Villain', name: 'Gravelord', tags: ['thursday-game', 'Scene-3'], updatedAt: '2026-10-31T10:00:00.000Z' },
  { type: 'villain', typeLabel: 'Villain', name: 'Rust Hound', tags: ['scene-3', 'prep'], updatedAt: '2026-10-29T10:00:00.000Z' },
  { type: 'hero', typeLabel: 'Hero', name: 'paradigm', tags: [], updatedAt: '2026-10-28T10:00:00.000Z' },
]
const q = (patch: Partial<LibraryQuery>): LibraryQuery => ({ ...emptyQuery(), ...patch })
const names = (list: readonly { name: string }[]) => list.map((i) => i.name)

describe('matching', () => {
  it('matches everything with an empty query', () => {
    expect(isFiltered(emptyQuery())).toBe(false)
    expect(filterItems(items, emptyQuery())).toHaveLength(4)
  })

  it('searches names as a case-insensitive substring', () => {
    expect(names(filterItems(items, q({ text: ' RE ' })))).toEqual(['Maya Reyes'])
    expect(names(filterItems(items, q({ text: 'PARA' })))).toEqual(['paradigm'])
  })

  it('matches any chosen type', () => {
    expect(names(filterItems(items, q({ types: ['villain'] })))).toEqual(['Gravelord', 'Rust Hound'])
    expect(filterItems(items, q({ types: ['villain', 'hero'] }))).toHaveLength(4)
  })

  it('requires every chosen tag, ignoring case', () => {
    expect(names(filterItems(items, q({ tags: ['scene-3'] })))).toEqual(['Gravelord', 'Rust Hound'])
    expect(names(filterItems(items, q({ tags: ['scene-3', 'PREP'] })))).toEqual(['Rust Hound'])
    expect(filterItems(items, q({ tags: ['scene-3', 'nothing'] }))).toEqual([])
  })

  it('combines search, types and tags with AND', () => {
    expect(matches(items[1]!, q({ text: 'grave', types: ['villain'], tags: ['thursday-game'] }))).toBe(true)
    expect(matches(items[1]!, q({ text: 'grave', types: ['hero'], tags: ['thursday-game'] }))).toBe(false)
    expect(matches(items[1]!, q({ text: 'rust', types: ['villain'], tags: ['thursday-game'] }))).toBe(false)
  })
})

describe('query helpers', () => {
  it('compares queries ignoring order, case and surrounding spaces', () => {
    expect(sameQuery(q({ text: 'Gr ', types: ['villain', 'hero'], tags: ['A', 'b'] }), q({ text: 'gr', types: ['hero', 'villain'], tags: ['B', 'a'] }))).toBe(true)
    expect(sameQuery(q({ tags: ['a'] }), q({ tags: ['a', 'b'] }))).toBe(false)
  })

  it('adds a filter tag once', () => {
    expect(withFilterTag(q({ tags: ['prep'] }), 'Prep').tags).toEqual(['prep'])
    expect(withFilterTag(q({ tags: ['prep'] }), 'scene-3').tags).toEqual(['prep', 'scene-3'])
  })

  it('counts type and tag filters', () => {
    expect(filterCount(q({ text: 'x', types: ['hero'], tags: ['a', 'b'] }))).toBe(3)
  })

  it('names a search after its tags, else its types, else "My search"', () => {
    const plural = (t: string) => (t === 'hero' ? 'Heroes' : 'Villains')
    expect(defaultSearchName(q({ tags: ['scene-3', 'prep'], types: ['hero'] }), plural)).toBe('scene-3 + prep')
    expect(defaultSearchName(q({ types: ['hero', 'villain'] }), plural)).toBe('Heroes + Villains')
    expect(defaultSearchName(q({ text: 'x' }), plural)).toBe('My search')
  })

  it('explains no matches', () => {
    expect(noMatchText(q({ tags: ['scene-3', 'prep'] }))).toBe('Nothing has all of these tags: scene-3, prep. Remove a tag to widen the search.')
    expect(noMatchText(q({ text: 'zz' }))).toBe('No names match your search.')
  })
})

describe('sorting', () => {
  it('sorts by Changed, newest first, by default', () => {
    expect(names(sortItems(items, DEFAULT_SORT))).toEqual(['Gravelord', 'Maya Reyes', 'Rust Hound', 'paradigm'])
  })

  it('sorts by name ignoring case, and by type keeping ties in order', () => {
    expect(names(sortItems(items, { key: 'name', dir: 'asc' }))).toEqual(['Gravelord', 'Maya Reyes', 'paradigm', 'Rust Hound'])
    expect(names(sortItems(items, { key: 'name', dir: 'desc' }))).toEqual(['Rust Hound', 'paradigm', 'Maya Reyes', 'Gravelord'])
    expect(names(sortItems(items, { key: 'type', dir: 'asc' }))).toEqual(['Maya Reyes', 'paradigm', 'Gravelord', 'Rust Hound'])
  })

  it('flips the current column and starts others ascending (Changed newest first)', () => {
    expect(nextSort(DEFAULT_SORT, 'changed')).toEqual({ key: 'changed', dir: 'asc' })
    expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' })
    expect(nextSort({ key: 'name', dir: 'asc' }, 'changed')).toEqual(DEFAULT_SORT)
  })
})

describe('the view in the URL', () => {
  it('reads All, a saved search, and filters', () => {
    expect(parseView('')).toEqual({ kind: 'all' })
    expect(parseView('s=abc')).toEqual({ kind: 'saved', id: 'abc' })
    expect(parseView('q=gr&type=hero,villain&tag=scene-3&tag=prep')).toEqual({ kind: 'query', query: { text: 'gr', types: ['hero', 'villain'], tags: ['scene-3', 'prep'] } })
  })

  it('tidies tags and drops empty filters', () => {
    expect(parseView('tag=%20a%20%20b&tag=A%20B&tag=')).toEqual({ kind: 'query', query: { text: '', types: [], tags: ['a b'] } })
    expect(parseView('type=&q=')).toEqual({ kind: 'all' })
  })

  it('writes each view and reads it back', () => {
    expect(viewHash({ kind: 'all' })).toBe('#/')
    expect(viewHash({ kind: 'saved', id: 'a b' })).toBe('#/?s=a+b')
    const view = { kind: 'query' as const, query: { text: 'gr & co', types: ['hero', 'villain'], tags: ['scene 3', 'prep'] } }
    const hash = viewHash(view)
    expect(hash).toBe('#/?q=gr+%26+co&type=hero%2Cvillain&tag=scene+3&tag=prep')
    expect(parseView(hash.slice(3))).toEqual(view)
    expect(viewHash({ kind: 'query', query: emptyQuery() })).toBe('#/')
  })
})
