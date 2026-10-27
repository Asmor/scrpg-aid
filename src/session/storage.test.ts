import { describe, expect, it } from 'vitest'
import { newSession } from './gm'
import { localSessionStore, memoryStorage } from './storage'

describe('session storage', () => {
  it('saves, loads, and forgets sessions, through the versioned readers', () => {
    const storage = memoryStorage()
    const store = localSessionStore(storage)
    const gm = { v: 1 as const, room: 'ABCD-EFGH', state: newSession('ABCD-EFGH') }
    store.saveGm(gm)
    expect(store.loadGm()).toEqual(gm)
    store.saveGm(undefined)
    expect(store.loadGm()).toBeUndefined()
    const player = { v: 1 as const, room: 'ABCD-EFGH', clientId: 'c1', heroId: 'h1', applied: [] }
    store.savePlayer(player)
    expect(store.loadPlayer()).toEqual(player)
    // Damaged or old saves are ignored.
    storage.setItem('scrpg.session.player', '{"v":0}')
    expect(store.loadPlayer()).toBeUndefined()
    storage.setItem('scrpg.session.gm', 'not json')
    expect(store.loadGm()).toBeUndefined()
  })

  it('keeps one client id per browser', () => {
    const storage = memoryStorage()
    const id = localSessionStore(storage).clientId()
    expect(localSessionStore(storage).clientId()).toBe(id)
    expect(id).toBeTruthy()
  })

  it('works, without remembering, when storage is unavailable or throws', () => {
    const none = localSessionStore(null)
    none.saveGm({ v: 1, room: 'ABCD-EFGH', state: newSession('ABCD-EFGH') })
    expect(none.loadGm()).toBeUndefined()
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
    broken.savePlayer(undefined)
    expect(broken.loadPlayer()).toBeUndefined()
    expect(broken.clientId()).toBe(broken.clientId())
  })
})
