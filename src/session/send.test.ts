import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hero } from '../hero/model'
import { completeHero } from '../test/heroes'
import { backupJson } from '../transfer/files'
import { createVillain } from '../villain/model'
import { ACCEPT_HANDOFF_MS, MAX_OFFER, RECEIVE_WAIT, Receiver, Sender, readOffer, readSendMessage, sendRoom } from './send'
import { fakeNetwork } from './transport'

const CODE = 'ABCD-EFGH'
const hero = (id: string, name: string, tags: string[] = []): Hero => ({ ...completeHero(), id, tags, details: { ...completeHero().details, name } })
const backup = (heroes: Hero[], villains = [createVillain({ id: 'v1' })]) => backupJson({ heroes, villains, games: [], savedSearches: [] })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('sending items', () => {
  it('offers the items to the device that enters the code, and closes once it accepts', async () => {
    const net = fakeNetwork()
    const sender = new Sender(net.connect, backup([hero('maya', 'Maya Reyes', ['thursday-game'])]), CODE)
    expect(sender.code).toBe(CODE)
    expect(sender.getSnapshot().status).toBe('waiting')
    const receiver = new Receiver(net.connect, CODE)
    await net.settle()
    expect(sender.getSnapshot().status).toBe('opened')
    const s = receiver.getSnapshot()
    expect(s.status).toBe('offered')
    if (s.status !== 'offered') return
    expect(s.offer.heroes.map((h) => [h.details.name, h.tags])).toEqual([['Maya Reyes', ['thursday-game']]])
    expect(s.offer.villains.map((v) => v.id)).toEqual(['v1'])

    receiver.accept()
    await net.settle()
    expect(receiver.getSnapshot().status).toBe('accepted')
    expect(sender.getSnapshot().status).toBe('accepted')
    // Both leave the room: the sender at once, the receiver after a moment.
    vi.advanceTimersByTime(ACCEPT_HANDOFF_MS)
    expect(net.peerIds()).toEqual([])
  })

  it('works whichever device opens the code first', async () => {
    const net = fakeNetwork()
    const receiver = new Receiver(net.connect, CODE)
    await net.settle()
    const sender = new Sender(net.connect, backup([hero('maya', 'Maya Reyes')]), CODE)
    await net.settle()
    expect(receiver.getSnapshot().status).toBe('offered')
    expect(sender.getSnapshot().status).toBe('opened')
  })

  it('goes back to waiting when the device with the code leaves without accepting', async () => {
    const net = fakeNetwork()
    const sender = new Sender(net.connect, backup([hero('maya', 'Maya Reyes')]), CODE)
    const receiver = new Receiver(net.connect, CODE)
    await net.settle()
    receiver.close()
    await net.settle()
    expect(sender.getSnapshot().status).toBe('waiting')
  })

  it("doesn't find a game, or a different send, with the same code", async () => {
    const net = fakeNetwork()
    const game = net.connect(CODE)
    const got: unknown[] = []
    game.onMessage((m) => got.push(m))
    new Sender(net.connect, backup([hero('maya', 'Maya Reyes')]), 'WXYZ-2345')
    const receiver = new Receiver(net.connect, CODE)
    await net.settle()
    expect(got).toEqual([])
    vi.advanceTimersByTime(RECEIVE_WAIT)
    expect(receiver.getSnapshot()).toEqual({ status: 'notFound' })
    expect(net.peerIds()).toHaveLength(2)
  })

  it('stops sending when the sender cancels', async () => {
    const net = fakeNetwork()
    const sender = new Sender(net.connect, backup([hero('maya', 'Maya Reyes')]), CODE)
    const receiver = new Receiver(net.connect, CODE)
    await net.settle()
    sender.cancel()
    await net.settle()
    expect(receiver.getSnapshot().status).toBe('gone')
    receiver.accept()
    expect(receiver.getSnapshot().status).toBe('gone')
  })

  it('ignores an accept from a device it never offered to', async () => {
    const net = fakeNetwork()
    const sender = new Sender(net.connect, backup([hero('maya', 'Maya Reyes')]), CODE)
    const stranger = net.connect(sendRoom(CODE))
    stranger.send({ v: 1, type: 'accepted' })
    await net.settle()
    expect(sender.getSnapshot().status).toBe('waiting')
  })
})

describe('receiving items', () => {
  it('says nothing is being sent with the code after a while, and can look again', async () => {
    const net = fakeNetwork()
    const receiver = new Receiver(net.connect, CODE)
    await net.settle()
    vi.advanceTimersByTime(RECEIVE_WAIT - 1)
    expect(receiver.getSnapshot().status).toBe('looking')
    vi.advanceTimersByTime(1)
    expect(receiver.getSnapshot().status).toBe('notFound')
    expect(net.peerIds()).toEqual([])
    receiver.retry()
    expect(receiver.getSnapshot().status).toBe('looking')
    new Sender(net.connect, backup([hero('maya', 'Maya Reyes')]), CODE)
    await net.settle()
    expect(receiver.getSnapshot().status).toBe('offered')
  })

  it("says so when what was sent couldn't be read", async () => {
    const net = fakeNetwork()
    const sender = net.connect(sendRoom(CODE))
    sender.onMessage((_m, peer) => sender.send({ v: 1, type: 'offer', backup: '{"not":"a backup"}' }, peer))
    const receiver = new Receiver(net.connect, CODE)
    await net.settle()
    vi.advanceTimersByTime(RECEIVE_WAIT)
    expect(receiver.getSnapshot()).toEqual({ status: 'notFound', unreadable: true })
  })

  it('takes only heroes and villains from an offer, and counts the ones that can’t be read', () => {
    const text = JSON.parse(backup([hero('maya', 'Maya Reyes')])) as { heroes: unknown[]; games: unknown[] }
    text.heroes.push({ broken: true })
    const offer = readOffer(JSON.stringify(text))
    expect(offer?.heroes).toHaveLength(1)
    expect(offer?.unreadable).toBe(1)
    expect(readOffer(backupJson({ heroes: [], villains: [], games: [], savedSearches: [] }))).toBeUndefined()
    expect(readOffer('nonsense')).toBeUndefined()
  })

  it('reads only well-formed send messages', () => {
    expect(readSendMessage({ v: 1, type: 'receive' })).toEqual({ v: 1, type: 'receive' })
    expect(readSendMessage({ v: 1, type: 'accepted', extra: 1 })).toEqual({ v: 1, type: 'accepted' })
    expect(readSendMessage({ v: 1, type: 'offer', backup: '{}' })).toEqual({ v: 1, type: 'offer', backup: '{}' })
    expect(readSendMessage({ v: 1, type: 'offer', backup: 5 })).toBeUndefined()
    expect(readSendMessage({ v: 1, type: 'offer', backup: 'x'.repeat(MAX_OFFER + 1) })).toBeUndefined()
    expect(readSendMessage({ v: 3, type: 'receive' })).toBeUndefined()
    expect(readSendMessage({ v: 1, type: 'hello' })).toBeUndefined()
    expect(readSendMessage('receive')).toBeUndefined()
  })
})
