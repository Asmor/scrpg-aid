import { describe, expect, it } from 'vitest'
import { fakeNetwork, lazyConnect, quietAfterLeave, type Connect } from './transport'

describe('a transport that loads in the background', () => {
  it('passes handlers on once loaded, and sends nothing before', async () => {
    const net = fakeNetwork()
    let release!: () => void
    const loaded = new Promise<void>((r) => (release = r))
    const connect = lazyConnect(() => loaded.then(() => net.connect))
    const a = connect('ROOM')
    const got: unknown[] = []
    a.onMessage((m) => got.push(m))
    const joins: string[] = []
    a.onPeerJoin((p) => joins.push(p))
    a.onPeerLeave((p) => joins.push(`-${p}`))
    a.send('too early')
    expect(net.peerIds()).toEqual([])
    release()
    await loaded
    const b = net.connect('ROOM')
    await net.settle()
    b.send('hello')
    await net.settle()
    expect(got).toEqual(['hello'])
    a.send('back')
    b.leave()
    await net.settle()
    expect(joins).toHaveLength(2)
    expect(joins[1]).toBe(`-${joins[0]}`)
    a.leave()
    expect(net.peerIds()).toEqual([])
  })

  it('never connects if left before loading, or if loading fails', async () => {
    const net = fakeNetwork()
    const left = lazyConnect(() => Promise.resolve(net.connect))('ROOM')
    left.leave()
    await Promise.resolve()
    await Promise.resolve()
    expect(net.peerIds()).toEqual([])
    const failed = lazyConnect(() => Promise.reject(new Error('offline')))('ROOM')
    failed.send('x')
    failed.leave()
  })

  it('passes connection problems on, but not after leaving', async () => {
    let report!: (message: string) => void
    const stub = { send: () => {}, onMessage: () => {}, onPeerJoin: () => {}, onPeerLeave: () => {}, onError: (h: (m: string) => void) => void (report = h), leave: () => {} }
    const t = quietAfterLeave(await lazyLoaded(() => stub))
    const errors: string[] = []
    t.onError!((m) => errors.push(m))
    report('one')
    t.leave()
    report('two')
    expect(errors).toEqual(['one'])
  })
})

/** A lazily loaded transport, after its load has finished. */
async function lazyLoaded(make: Connect) {
  const t = lazyConnect(() => Promise.resolve(make))('ROOM')
  await Promise.resolve()
  await Promise.resolve()
  return t
}
