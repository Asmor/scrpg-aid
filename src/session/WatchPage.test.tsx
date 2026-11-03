import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App'
import { createGame } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { MemoryHeroStore } from '../hero/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import { MemoryVillainStore } from '../villain/store'
import { HostSession } from './host'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'

const ROOM = 'ABCD-EFGH'
let n = 0
const clock = () => ({ now: new Date('2026-11-03T21:00:00Z'), newId: () => `id${++n}` })

afterEach(() => {
  window.location.hash = ''
})

async function setup(hash: string, saved?: (s: ReturnType<typeof localSessionStore>) => void) {
  const net = fakeNetwork()
  const games = new MemoryGameStore()
  await games.save({ ...createGame({ id: 'g', name: 'Thursday game' }), scene: { name: 'The Foundry', tracker: ['green', 'yellow', 'red'], position: 0 } })
  const host = new HostSession(net.connect, { room: ROOM, gameId: 'g', gm: 'Sam', removed: [] }, games, clock)
  const storage = memoryStorage()
  saved?.(localSessionStore(storage))
  window.location.hash = hash
  render(<App store={new MemoryHeroStore()} villainStore={new MemoryVillainStore()} gameStore={new MemoryGameStore()} searchStore={new MemorySavedSearchStore()} connect={net.connect} sessionStore={localSessionStore(storage)} />)
  return { net, host, storage }
}

describe('watching a game', () => {
  it('asks for the code and a name for the screen, then shows the display view', async () => {
    const { net, host, storage } = await setup('#/watch')
    await userEvent.type(screen.getByLabelText('Game code'), 'abcd efgh')
    await userEvent.type(screen.getByLabelText('Name this screen (the GM sees it)'), 'Living room TV')
    await userEvent.click(screen.getByRole('button', { name: 'Start watching' }))
    expect(window.location.hash).toBe('#/watch/ABCD-EFGH')
    await act(() => net.settle())
    expect(await screen.findByRole('heading', { name: 'The Foundry' })).toBeInTheDocument()
    expect(screen.getByText('Watching Thursday game · ABCD-EFGH')).toBeInTheDocument()
    expect(host.getSnapshot().observers).toEqual([{ clientId: expect.any(String), screenName: 'Living room TV' }])
    expect(storage.getItem('scrpg.session.screenName')).toBe('"Living room TV"')

    // The GM's changes show up; the GM leaving shows in the footer.
    act(() => host.apply((g) => ({ ...g, scene: { ...g.scene, name: 'The Crucible' } })))
    await act(() => net.settle())
    expect(await screen.findByRole('heading', { name: 'The Crucible' })).toBeInTheDocument()
    host.leave()
    await act(() => net.settle())
    expect(await screen.findByText('Reconnecting to the GM…')).toBeInTheDocument()
  })

  it('prefills the code from the watch link and the remembered screen name', async () => {
    await setup('#/watch/ABCD-EFGH', (s) => s.saveScreenName('Den TV'))
    expect(screen.getByLabelText('Game code')).toHaveValue('ABCD-EFGH')
    expect(screen.getByLabelText('Name this screen (the GM sees it)')).toHaveValue('Den TV')
  })

  it('says so when the GM removed this screen, and offers another game', async () => {
    const { net, host } = await setup(`#/watch/${ROOM}`, (s) => s.saveWatching({ v: 1, room: ROOM, screenName: 'TV' }))
    await act(() => net.settle())
    expect(await screen.findByRole('heading', { name: 'The Foundry' })).toBeInTheDocument()
    act(() => host.removeObserver(host.getSnapshot().observers[0]!.clientId))
    await act(() => net.settle())
    expect(await screen.findByRole('alert')).toHaveTextContent('The GM removed this screen from the game.')
    await userEvent.click(screen.getByRole('button', { name: 'Watch another game' }))
    expect(window.location.hash).toBe('#/watch')
    expect(await screen.findByRole('button', { name: 'Start watching' })).toBeInTheDocument()
  })
})
