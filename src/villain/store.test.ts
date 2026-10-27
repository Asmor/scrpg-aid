import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createHero } from '../hero/model'
import { IndexedDbHeroStore } from '../hero/store'
import { createVillain } from './model'
import { createDefaultVillainStore, IndexedDbVillainStore, MemoryVillainStore, type VillainStore } from './store'

const villain = (id: string, updatedAt: string) => ({ ...createVillain({ id }), updatedAt })

describe.each<[string, () => VillainStore]>([
  ['MemoryVillainStore', () => new MemoryVillainStore()],
  ['IndexedDbVillainStore', () => new IndexedDbVillainStore(new IDBFactory())],
])('%s', (_name, make) => {
  it('saves, lists newest first, gets, and removes villains', async () => {
    const store = make()
    await store.save(villain('a', '2026-01-01T00:00:00Z'))
    await store.save(villain('b', '2026-02-01T00:00:00Z'))
    expect((await store.list()).villains.map((v) => v.id)).toEqual(['b', 'a'])
    expect(await store.get('a')).toMatchObject({ status: 'found', villain: { id: 'a' } })
    await store.remove('a')
    expect(await store.get('a')).toEqual({ status: 'missing' })
  })
})

describe('the shared database', () => {
  it('keeps heroes and villains apart, and adds the villains store to a database from before it existed', async () => {
    const factory = new IDBFactory()
    // A version-1 database, which only had heroes.
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('old-db', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('heroes', { keyPath: 'id' })
      request.onsuccess = () => {
        const tx = request.result.transaction('heroes', 'readwrite')
        tx.objectStore('heroes').put({ id: 'h1', saved: { format: 'scrpg-hero', version: 1, hero: createHero('guided', { id: 'h1' }) } })
        tx.oncomplete = () => {
          request.result.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
    const villains = new IndexedDbVillainStore(factory, 'old-db')
    await villains.save(villain('v1', '2026-01-01T00:00:00Z'))
    expect((await villains.list()).villains.map((v) => v.id)).toEqual(['v1'])
    await villains.close()
    const heroes = new IndexedDbHeroStore(factory, 'old-db')
    expect((await heroes.list()).heroes.map((h) => h.id)).toEqual(['h1'])
    await heroes.close()
  })

  it('reports villain records it can’t read', async () => {
    const store = new MemoryVillainStore()
    await (store as unknown as { putRecord: (r: unknown) => Promise<void> }).putRecord({ id: 'bad', saved: { format: 'scrpg-villain', version: 99, villain: {} } })
    expect(await store.list()).toEqual({ villains: [], unreadable: [{ id: 'bad', error: 'saved by a newer version of the app (format 99)' }] })
    expect(await store.get('bad')).toEqual({ status: 'unreadable', error: 'saved by a newer version of the app (format 99)' })
  })

  it('uses IndexedDB when available, and memory otherwise', () => {
    expect(createDefaultVillainStore(new IDBFactory())).toBeInstanceOf(IndexedDbVillainStore)
    expect(createDefaultVillainStore(undefined)).toBeInstanceOf(MemoryVillainStore)
  })
})
