import { describe, expect, it } from 'vitest'
import { completeHero } from '../test/heroes'
import { localSessionStore, memoryStorage } from './storage'

describe('session storage', () => {
  it('saves, loads, and forgets hosting and playing, through the versioned readers', () => {
    const storage = memoryStorage()
    const store = localSessionStore(storage)
    const host = { v: 1 as const, room: 'ABCD-EFGH', gameId: 'g1', gm: 'Sam', removed: [] }
    store.saveHost(host)
    expect(store.loadHost()).toEqual(host)
    store.saveHost(undefined)
    expect(store.loadHost()).toBeUndefined()
    const playing = { v: 1 as const, room: 'ABCD-EFGH', name: 'Alex', heroSourceId: 'h1', sheet: completeHero() }
    store.savePlaying(playing)
    expect(store.loadPlaying()).toEqual(playing)
    // Damaged or old saves are ignored.
    storage.setItem('scrpg.session.playing', '{"v":0}')
    expect(store.loadPlaying()).toBeUndefined()
    storage.setItem('scrpg.session.host', 'not json')
    expect(store.loadHost()).toBeUndefined()
  })

  it('remembers the name and which notes were seen', () => {
    const store = localSessionStore(memoryStorage())
    expect(store.loadName()).toBe('')
    store.saveName('  Sam  ')
    expect(store.loadName()).toBe('Sam')
    expect(store.noteSeen('g:h')).toBe(false)
    store.markNoteSeen('g:h')
    store.markNoteSeen('g:h')
    expect(store.noteSeen('g:h')).toBe(true)
  })

  it('remembers the last game joined', () => {
    const storage = memoryStorage()
    const store = localSessionStore(storage)
    expect(store.loadLastGame()).toBeUndefined()
    store.saveLastGame({ v: 1, room: 'ABCD-EFGH' })
    expect(localSessionStore(storage).loadLastGame()).toEqual({ v: 1, room: 'ABCD-EFGH' })
    store.saveLastGame({ v: 1, room: 'ABCD-EFGH', at: '2026-10-27T10:00:00.000Z' })
    expect(store.loadLastGame()).toEqual({ v: 1, room: 'ABCD-EFGH', at: '2026-10-27T10:00:00.000Z' })
    storage.setItem('scrpg.session.lastGame', '{"room":"ABCD-EFGH"}')
    expect(store.loadLastGame()).toBeUndefined()
  })

  it('forgets the old game sessions’ saves', () => {
    const storage = memoryStorage()
    storage.setItem('scrpg.session.gm', '{"v":1,"room":"X","password":"pw"}')
    storage.setItem('scrpg.session.player', '{"v":1}')
    localSessionStore(storage)
    expect(storage.data.has('scrpg.session.gm')).toBe(false)
    expect(storage.data.has('scrpg.session.player')).toBe(false)
  })

  it('keeps one client id per browser', () => {
    const storage = memoryStorage()
    const id = localSessionStore(storage).clientId()
    expect(localSessionStore(storage).clientId()).toBe(id)
    expect(id).toBeTruthy()
  })

  it('works, without remembering, when storage is unavailable or throws', () => {
    const none = localSessionStore(null)
    none.saveHost({ v: 1, room: 'ABCD-EFGH', gameId: 'g', gm: 'Sam', removed: [] })
    expect(none.loadHost()).toBeUndefined()
    expect(none.clientId()).toBe(none.clientId())
    const broken = localSessionStore({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    broken.savePlaying(undefined)
    expect(broken.loadPlaying()).toBeUndefined()
    expect(broken.noteSeen('x')).toBe(false)
    broken.markNoteSeen('x')
    expect(broken.clientId()).toBe(broken.clientId())
  })
})
