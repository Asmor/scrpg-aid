import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createVillain } from '../villain/model'
import { IndexedDbVillainStore } from '../villain/store'
import { villainToSaved } from '../villain/serialize'
import { createMinion } from './model'
import { createDefaultMinionStore, IndexedDbMinionStore, MemoryMinionStore, type MinionStore } from './store'

const minion = (id: string, updatedAt: string) => ({ ...createMinion({ id }), updatedAt })

describe.each<[string, () => MinionStore]>([
  ['MemoryMinionStore', () => new MemoryMinionStore()],
  ['IndexedDbMinionStore', () => new IndexedDbMinionStore(new IDBFactory())],
])('%s', (_name, make) => {
  it('saves, lists newest first, gets, and removes minions', async () => {
    const store = make()
    await store.save(minion('a', '2026-01-01T00:00:00Z'))
    await store.save(minion('b', '2026-02-01T00:00:00Z'))
    expect((await store.list()).minions.map((m) => m.id)).toEqual(['b', 'a'])
    expect(await store.get('a')).toMatchObject({ status: 'found', minion: { id: 'a' } })
    await store.remove('a')
    expect(await store.get('a')).toEqual({ status: 'missing' })
  })
})

describe('the shared database', () => {
  it('adds the minions store to a database from before it existed, keeping the villains', async () => {
    const factory = new IDBFactory()
    // A version-2 database, which had heroes and villains.
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('old-db', 2)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('heroes', { keyPath: 'id' })
        request.result.createObjectStore('villains', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const tx = request.result.transaction('villains', 'readwrite')
        tx.objectStore('villains').put({ id: 'v1', saved: villainToSaved(createVillain({ id: 'v1' })) })
        tx.oncomplete = () => {
          request.result.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
    const minions = new IndexedDbMinionStore(factory, 'old-db')
    await minions.save(minion('m1', '2026-01-01T00:00:00Z'))
    expect((await minions.list()).minions.map((m) => m.id)).toEqual(['m1'])
    await minions.close()
    const villains = new IndexedDbVillainStore(factory, 'old-db')
    expect((await villains.list()).villains.map((v) => v.id)).toEqual(['v1'])
    await villains.close()
  })

  it('reports minion records it can’t read', async () => {
    const store = new MemoryMinionStore()
    await (store as unknown as { putRecord: (r: unknown) => Promise<void> }).putRecord({ id: 'bad', saved: { format: 'scrpg-minion', version: 99, minion: {} } })
    expect(await store.list()).toEqual({ minions: [], unreadable: [{ id: 'bad', error: 'saved by a newer version of the app (format 99)' }] })
    expect(await store.get('bad')).toEqual({ status: 'unreadable', error: 'saved by a newer version of the app (format 99)' })
  })

  it('uses IndexedDB when available, and memory otherwise', () => {
    expect(createDefaultMinionStore(new IDBFactory())).toBeInstanceOf(IndexedDbMinionStore)
    expect(createDefaultMinionStore(undefined)).toBeInstanceOf(MemoryMinionStore)
  })
})
