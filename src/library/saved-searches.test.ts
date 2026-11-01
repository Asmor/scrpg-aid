import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { checkSearchName, createSavedSearch, IndexedDbSavedSearchStore, MemorySavedSearchStore, parseSavedSearch, parseSavedSearchJson, searchesToRestore, searchToSaved, SEARCH_FORMAT, type SavedSearch } from './saved-searches'

const now = new Date('2026-10-31T12:00:00Z')
const search = (id: string, name: string): SavedSearch => createSavedSearch(name, { text: '', types: [], tags: ['scene-3'] }, { id, now })

describe('saved search format', () => {
  it('round-trips through its envelope', () => {
    const s = search('a', 'Scene 3')
    expect(searchToSaved(s)).toEqual({ format: SEARCH_FORMAT, version: 1, search: s })
    expect(parseSavedSearchJson(JSON.stringify(searchToSaved(s)))).toEqual({ ok: true, search: s })
  })

  it('rejects malformed ones, and tidies names and tags', () => {
    expect(parseSavedSearchJson('{')).toEqual({ ok: false, error: 'not valid JSON' })
    expect(parseSavedSearch({ format: SEARCH_FORMAT, version: 1, search: { ...search('a', 'x'), query: { text: '', types: [] } } })).toEqual({ ok: false, error: 'search.query.tags should be a list' })
    expect(parseSavedSearch(searchToSaved({ ...search('a', 'x'), name: 'y'.repeat(61) }))).toMatchObject({ ok: false, error: expect.stringContaining('60 characters') })
    expect(parseSavedSearch(searchToSaved({ ...search('a', '  Prep  '), query: { text: '', types: [], tags: [' a ', 'A'] } }))).toMatchObject({ ok: true, search: { name: 'Prep', query: { tags: ['a'] } } })
  })
})

describe('checkSearchName', () => {
  const existing = [search('a', 'Scene 3')]
  it('trims, and requires 1–60 characters', () => {
    expect(checkSearchName('  Prep  ', existing)).toEqual({ ok: true, name: 'Prep' })
    expect(checkSearchName('   ', existing)).toEqual({ ok: false, error: 'Give the search a name.' })
    expect(checkSearchName('x'.repeat(60), existing).ok).toBe(true)
    expect(checkSearchName('x'.repeat(61), existing).ok).toBe(false)
  })

  it('rejects a duplicate ignoring case, except the search being renamed', () => {
    expect(checkSearchName('scene 3', existing)).toEqual({ ok: false, error: 'You already have a saved search with that name.' })
    expect(checkSearchName('SCENE 3', existing, 'a')).toEqual({ ok: true, name: 'SCENE 3' })
  })
})

describe('searchesToRestore', () => {
  it('replaces one with the same id and renames a name clash', () => {
    const existing = [search('a', 'Scene 3'), search('b', 'Prep')]
    const incoming = [{ ...search('a', 'Scene 3'), query: { text: 'x', types: [], tags: [] } }, search('c', 'prep'), search('d', 'Prep'), search('c', 'again')]
    expect(searchesToRestore(incoming, existing).map((s) => [s.id, s.name])).toEqual([
      ['a', 'Scene 3'],
      ['c', 'prep (2)'],
      ['d', 'Prep (3)'],
    ])
  })

  it('keeps a renamed name within 60 characters', () => {
    const long = 'x'.repeat(60)
    expect(searchesToRestore([search('b', long)], [search('a', long)])[0]!.name).toBe(`${'x'.repeat(56)} (2)`)
  })
})

describe('saved search stores', () => {
  for (const [label, make] of [
    ['memory', () => new MemorySavedSearchStore()],
    ['IndexedDB', () => new IndexedDbSavedSearchStore(new IDBFactory())],
  ] as const) {
    it(`saves, lists by name, and removes (${label})`, async () => {
      const store = make()
      await store.save(search('a', 'zeta'))
      await store.save(search('b', 'Alpha'))
      expect((await store.list()).searches.map((s) => s.name)).toEqual(['Alpha', 'zeta'])
      await store.remove('a')
      expect((await store.list()).searches.map((s) => s.id)).toEqual(['b'])
    })
  }
})
