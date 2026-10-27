import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHero } from './model'
import { HERO_FORMAT } from './serialize'
import { DB_VERSION } from '../store/records'
import { createDefaultStore, IndexedDbHeroStore, MemoryHeroStore, type HeroStore } from './store'

const hero = (id: string, updated: string) =>
  createHero('guided', { id, now: new Date(updated) })

const opened: IndexedDbHeroStore[] = []

afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.close()))
})

const backends: [string, () => HeroStore][] = [
  ['MemoryHeroStore', () => new MemoryHeroStore()],
  [
    'IndexedDbHeroStore',
    () => {
      const store = new IndexedDbHeroStore(new IDBFactory())
      opened.push(store)
      return store
    },
  ],
]

describe.each(backends)('%s', (_name, makeStore) => {
  it('starts empty', async () => {
    expect(await makeStore().list()).toEqual({ heroes: [], unreadable: [] })
  })

  it('saves, reads, and lists heroes, most recently updated first', async () => {
    const store = makeStore()
    const older = hero('a', '2026-01-01T00:00:00Z')
    const newer = hero('b', '2026-06-01T00:00:00Z')
    await store.save(older)
    await store.save(newer)
    expect(await store.get('a')).toEqual({ status: 'found', hero: older })
    expect((await store.list()).heroes.map((h) => h.id)).toEqual(['b', 'a'])
  })

  it('overwrites a hero saved again with the same id', async () => {
    const store = makeStore()
    const h = hero('a', '2026-01-01T00:00:00Z')
    await store.save(h)
    await store.save({ ...h, details: { ...h.details, name: 'Renamed' } })
    expect(await store.get('a')).toMatchObject({ hero: { details: { name: 'Renamed' } } })
    expect((await store.list()).heroes).toHaveLength(1)
  })

  it('stores a copy, not the caller’s object', async () => {
    const store = makeStore()
    const h = hero('a', '2026-01-01T00:00:00Z')
    await store.save(h)
    h.details.name = 'Changed after saving'
    expect(await store.get('a')).toMatchObject({ hero: { details: { name: '' } } })
  })

  it('hands out copies, so changing a loaded hero doesn’t change what’s stored', async () => {
    const store = makeStore()
    await store.save(hero('a', '2026-01-01T00:00:00Z'))
    const got = await store.get('a')
    if (got.status === 'found') got.hero.details.name = 'edited without saving'
    ;(await store.list()).heroes[0]!.details.alias = 'also edited'
    expect(await store.get('a')).toMatchObject({ hero: { details: { name: '', alias: '' } } })
  })

  it('removes heroes, and ignores unknown ids', async () => {
    const store = makeStore()
    await store.save(hero('a', '2026-01-01T00:00:00Z'))
    await store.remove('a')
    await store.remove('never-existed')
    expect(await store.get('a')).toEqual({ status: 'missing' })
    expect((await store.list()).heroes).toEqual([])
  })
})

describe('IndexedDbHeroStore', () => {
  it('persists across connections to the same database', async () => {
    const factory = new IDBFactory()
    const first = new IndexedDbHeroStore(factory, 'persist-test')
    await first.save(hero('a', '2026-01-01T00:00:00Z'))
    await first.close()
    const second = new IndexedDbHeroStore(factory, 'persist-test')
    opened.push(second)
    expect(await second.get('a')).toMatchObject({ status: 'found', hero: { id: 'a' } })
  })

  it('reports records it cannot read instead of hiding them', async () => {
    const factory = new IDBFactory()
    const store = new IndexedDbHeroStore(factory, 'corrupt-test')
    opened.push(store)
    await store.save(hero('good', '2026-01-01T00:00:00Z'))
    // Write a record from a future app version directly.
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('corrupt-test', DB_VERSION)
      request.onsuccess = () => {
        const tx = request.result.transaction('heroes', 'readwrite')
        tx.objectStore('heroes').put({ id: 'future', saved: { format: HERO_FORMAT, version: 99, hero: {} } })
        tx.oncomplete = () => {
          request.result.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
    const list = await store.list()
    expect(list.heroes.map((h) => h.id)).toEqual(['good'])
    expect(list.unreadable).toEqual([{ id: 'future', error: 'saved by a newer version of the app (format 99)' }])
    expect(await store.get('future')).toEqual({ status: 'unreadable', error: 'saved by a newer version of the app (format 99)' })
  })
})

describe('createDefaultStore', () => {
  it('uses IndexedDB when available, and memory otherwise', () => {
    expect(createDefaultStore(new IDBFactory())).toBeInstanceOf(IndexedDbHeroStore)
    expect(createDefaultStore(undefined)).toBeInstanceOf(MemoryHeroStore)
  })
})

describe('IndexedDbHeroStore errors', () => {
  it('rejects when the database cannot be opened', async () => {
    const failing = {
      open() {
        const request = { error: new DOMException('blocked', 'UnknownError') } as unknown as IDBOpenDBRequest
        queueMicrotask(() => request.onerror?.(new Event('error')))
        return request
      },
    } as unknown as IDBFactory
    await expect(new IndexedDbHeroStore(failing).list()).rejects.toThrow('blocked')
  })

  it('tries to open again after a failure', async () => {
    const real = new IDBFactory()
    let attempts = 0
    const flaky = {
      open(name: string, version: number) {
        attempts++
        if (attempts > 1) return real.open(name, version)
        const request = { error: new DOMException('busy', 'UnknownError') } as unknown as IDBOpenDBRequest
        queueMicrotask(() => request.onerror?.(new Event('error')))
        return request
      },
    } as unknown as IDBFactory
    const store = new IndexedDbHeroStore(flaky, 'retry-test')
    opened.push(store)
    await expect(store.list()).rejects.toThrow('busy')
    expect(await store.list()).toEqual({ heroes: [], unreadable: [] })
    expect(attempts).toBe(2)
  })

  it('steps aside when a newer copy of the app upgrades the database', async () => {
    const factory = new IDBFactory()
    const store = new IndexedDbHeroStore(factory, 'upgrade-test')
    await store.save(hero('a', '2026-01-01T00:00:00Z'))
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('upgrade-test', DB_VERSION + 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('blocked'))
    })
    expect(upgraded.version).toBe(DB_VERSION + 1)
    upgraded.close()
  })

  it('reconnects after the browser closes the connection', async () => {
    const factory = new IDBFactory()
    const store = new IndexedDbHeroStore(factory, 'close-test')
    opened.push(store)
    await store.save(hero('a', '2026-01-01T00:00:00Z'))
    // Simulate the browser force-closing the connection.
    const db = await (store as unknown as { db: Promise<IDBDatabase> }).db
    db.onclose?.call(db, new Event('close'))
    db.close()
    expect(await store.get('a')).toMatchObject({ status: 'found' })
  })

  it('rejects when blocked, and closes the connection if it opens anyway', async () => {
    let request: IDBOpenDBRequest | undefined
    const close = vi.fn()
    const factory = {
      open() {
        request = {} as IDBOpenDBRequest
        return request
      },
    } as unknown as IDBFactory
    const store = new IndexedDbHeroStore(factory)
    const listing = store.list()
    request!.onblocked?.(new Event('blocked') as IDBVersionChangeEvent)
    await expect(listing).rejects.toThrow('close other tabs')
    Object.defineProperty(request, 'result', { value: { close } })
    request!.onsuccess?.(new Event('success'))
    expect(close).toHaveBeenCalledOnce()
  })
})
