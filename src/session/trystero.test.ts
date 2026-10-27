import { describe, expect, it, vi } from 'vitest'

const room = {
  makeAction: vi.fn(),
  leave: vi.fn(() => Promise.resolve()),
  onPeerJoin: null as ((id: string) => void) | null,
  onPeerLeave: null as ((id: string) => void) | null,
}
const action = { send: vi.fn(() => Promise.resolve()), onMessage: null as ((data: unknown, ctx: { peerId: string }) => void) | null }
const joinRoom = vi.fn(() => room)
room.makeAction.mockReturnValue(action)
vi.mock('trystero', () => ({ joinRoom }))

const { APP_ID, connectTrystero } = await import('./trystero')

describe('the Trystero transport', () => {
  it('joins the room with the app id and password, and passes messages and peers through', () => {
    const t = connectTrystero('ABCD-EFGH', 'pw')
    expect(joinRoom).toHaveBeenCalledWith({ appId: APP_ID, password: 'pw' }, 'ABCD-EFGH')
    t.send({ hi: 1 })
    t.send({ hi: 2 }, 'peerA')
    expect(action.send).toHaveBeenNthCalledWith(1, { hi: 1 }, undefined)
    expect(action.send).toHaveBeenNthCalledWith(2, { hi: 2 }, { target: 'peerA' })
    const got: unknown[] = []
    t.onMessage((m, peer) => got.push([m, peer]))
    action.onMessage!({ x: 1 }, { peerId: 'peerB' })
    expect(got).toEqual([[{ x: 1 }, 'peerB']])
    const joins: string[] = []
    t.onPeerJoin((p) => joins.push(`+${p}`))
    t.onPeerLeave((p) => joins.push(`-${p}`))
    room.onPeerJoin!('p1')
    room.onPeerLeave!('p1')
    expect(joins).toEqual(['+p1', '-p1'])
    t.leave()
    expect(room.leave).toHaveBeenCalled()
    connectTrystero('ABCD-EFGH')
    expect(joinRoom).toHaveBeenLastCalledWith({ appId: APP_ID }, 'ABCD-EFGH')
  })
})
