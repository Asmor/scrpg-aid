import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Hero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import type { Clock } from '../play/state'
import { JOIN_WAIT } from '../session/client'
import { HostSession } from '../session/host'
import { OFFLINE_AFTER } from '../session/link'
import { localSessionStore, memoryStorage } from '../session/storage'
import { fakeNetwork } from '../session/transport'
import { completeHero } from '../test/heroes'
import { MemoryVillainStore } from '../villain/store'
import { createGame } from './model'
import { MemoryGameStore } from './store'

let n = 0
const clock = (): Clock => ({ now: new Date(), newId: () => `id${++n}` })
const OLD = 'ABCD-EFGH'
const NEW = 'K7QX-2MRT'
const maya = (): Hero => ({ ...completeHero(), id: 'maya', details: { ...completeHero().details, name: 'Maya Reyes' } })

afterEach(() => {
  vi.useRealTimers()
  window.location.hash = ''
})

/** The GM's device hosting Thursday game on OLD, and this device running the app. */
async function setup(hash: string, gameStore = new MemoryGameStore()) {
  const net = fakeNetwork()
  const gmGames = new MemoryGameStore()
  await gmGames.save({ ...createGame({ id: 'g1', name: 'Thursday game' }), code: OLD })
  const host = new HostSession(net.connect, { room: OLD, gameId: 'g1', gm: 'Sam', removed: [] }, gmGames, clock)
  const heroes = new MemoryHeroStore()
  await heroes.save(maya())
  window.location.hash = hash
  render(<App store={heroes} villainStore={new MemoryVillainStore()} gameStore={gameStore} searchStore={new MemorySavedSearchStore()} connect={net.connect} sessionStore={localSessionStore(memoryStorage())} />)
  const settle = () => act(() => net.settle())
  return { net, host, gmGames, settle }
}

async function join(settle: () => Promise<void>) {
  await userEvent.type(screen.getByLabelText('Your name (everyone at the table sees it)'), 'Alex')
  await userEvent.click(screen.getByRole('button', { name: 'Join with Maya Reyes' }))
  await settle()
  await waitFor(() => expect(window.location.hash).toBe(`#/table/${OLD}`))
  await settle()
}

describe('a player and a new game code', () => {
  it('follows the GM to the new code, with a toast that shows it', async () => {
    const { host, settle } = await setup(`#/join/${OLD}`)
    await join(settle)
    act(() => void host.changeCode(NEW, new Set(host.getSnapshot().connected)))
    await settle()
    await waitFor(() => expect(window.location.hash).toBe(`#/table/${NEW}`))
    await settle()
    expect(await screen.findByText(/The GM changed the game code\. You're still in\. New code:/)).toHaveTextContent(NEW)
    expect(screen.getByText(NEW, { selector: 'code' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Maya Reyes' })).toBeInTheDocument()
  })

  it('says so when the GM removed them with the new code', async () => {
    const { host, settle } = await setup(`#/join/${OLD}`)
    await join(settle)
    act(() => void host.changeCode(NEW, new Set()))
    await settle()
    expect(await screen.findByRole('alert')).toHaveTextContent("You've been removed from Thursday game. Ask the GM if you think that's a mistake.")
  })

  it('reconnects a saved game with a new code from the GM, keeping the hero’s place', async () => {
    const { net, host, gmGames, settle } = await setup(`#/join/${OLD}`)
    await join(settle)
    const heroId = host.game!.heroes[0]!.id
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    // The GM changes the code while this device is away (it misses the message).
    host.leave()
    await settle()
    act(() => vi.advanceTimersByTime(OFFLINE_AFTER))
    const banner = screen.getByText(/The GM isn't hosting, or changed the code\. Read-only until you reconnect\./)
    expect(banner).toHaveTextContent("Can't reach Thursday game.")
    await host.settled
    const moved = new HostSession(net.connect, { room: NEW, gameId: 'g1', gm: 'Sam', removed: [] }, gmGames, clock)
    await settle()
    vi.useRealTimers()
    await userEvent.type(screen.getByLabelText('New code from your GM'), NEW.toLowerCase())
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    await settle()
    await waitFor(() => expect(window.location.hash).toBe(`#/table/${NEW}`))
    await settle()
    expect(moved.game!.heroes.map((h) => h.id)).toEqual([heroId])
    expect(moved.getSnapshot().connected.size).toBe(1)
    moved.leave()
  })
})

describe('joining with an old code', () => {
  it('says no game is using it, under the code field, and leaves', async () => {
    const { settle } = await setup(`#/join/WXYZ-2345`)
    await userEvent.type(screen.getByLabelText('Your name (everyone at the table sees it)'), 'Alex')
    const button = await screen.findByRole('button', { name: 'Join with Maya Reyes' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    act(() => fireEvent.click(button))
    expect(screen.getByRole('button', { name: 'Looking for game WXYZ-2345…' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(`Looking for game WXYZ-2345… This can take up to ${JOIN_WAIT / 1000} seconds.`)
    await settle()
    act(() => vi.advanceTimersByTime(JOIN_WAIT))
    expect(screen.getByRole('alert')).toHaveTextContent("No game is using this code right now. The GM may have changed it, or isn't hosting yet. Check the code with your GM.")
    expect(screen.getByLabelText('Game code')).toHaveAccessibleDescription(/No game is using this code/)
    expect(window.location.hash).toBe('#/join/WXYZ-2345')
    expect(screen.getByRole('button', { name: 'Join with Maya Reyes' })).toBeEnabled()
  })
})

describe('joining with a code typed in', () => {
  it('puts the code typed in the address, so a reload tries that one', async () => {
    await setup(`#/join/WXYZ-2345`)
    await userEvent.type(screen.getByLabelText('Your name (everyone at the table sees it)'), 'Alex')
    const field = screen.getByLabelText('Game code')
    await userEvent.clear(field)
    await userEvent.type(field, 'PBYQ-7V83')
    await userEvent.click(await screen.findByRole('button', { name: 'Join with Maya Reyes' }))
    expect(window.location.hash).toBe('#/join/PBYQ-7V83')
    expect(screen.getByRole('button', { name: 'Looking for game PBYQ-7V83…' })).toBeDisabled()
  })
})

describe('the GM’s New code…', () => {
  it('keeps the checked players and screens, removes the rest, and says who needs the new code', async () => {
    const net = fakeNetwork()
    const games = new MemoryGameStore()
    await games.save({ ...createGame({ id: 'g1', name: 'Thursday game' }), code: OLD })
    window.location.hash = '#/game/g1'
    render(<App store={new MemoryHeroStore()} villainStore={new MemoryVillainStore()} gameStore={games} searchStore={new MemorySavedSearchStore()} connect={net.connect} sessionStore={localSessionStore(memoryStorage())} />)
    const settle = () => act(() => net.settle())
    await userEvent.click(await screen.findByRole('button', { name: 'Start hosting' }))
    const start = within(screen.getByRole('dialog', { name: 'Start hosting' }))
    await userEvent.type(start.getByLabelText('Your name (players see it)'), 'Sam')
    await userEvent.click(start.getByRole('button', { name: 'Start hosting' }))
    expect(await screen.findByText(`Hosting · ${OLD}`)).toBeInTheDocument()
    // Alex and a TV are here; Jo joins, then leaves (away); Chaos is unwelcome.
    const peer = (hello: object) => {
      const t = net.connect(OLD)
      const got: unknown[] = []
      t.onMessage((m) => got.push(m))
      t.send({ v: 10, type: 'hello', ...hello })
      return { t, got }
    }
    const hero = (id: string, name: string) => ({ ...completeHero(), id, details: { ...completeHero().details, name } })
    peer({ role: 'player', clientId: 'c1', name: 'Alex', heroSourceId: 'maya', sheet: hero('maya', 'Maya Reyes') })
    peer({ role: 'observer', clientId: 'tv', screenName: 'Living room TV' })
    const chaos = peer({ role: 'player', clientId: 'c3', name: 'Uninvited', heroSourceId: 'chaos', sheet: hero('chaos', 'Captain Chaos') })
    const jo = peer({ role: 'player', clientId: 'c2', name: 'Priya', heroSourceId: 'swarm', sheet: hero('swarm', 'Swarmwright') })
    await settle()
    jo.t.leave()
    await settle()

    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const invite = within(screen.getByRole('dialog', { name: 'Invite to Thursday game' }))
    await userEvent.click(invite.getByRole('button', { name: 'Get a new game code' }))
    const confirm = within(screen.getByRole('dialog', { name: 'Get a new code?' }))
    expect(confirm.getByText(OLD)).toBeInTheDocument()
    expect(confirm.getByRole('checkbox', { name: 'Alex · Maya Reyes' })).toHaveFocus()
    expect(confirm.getByRole('checkbox', { name: 'Living room TV' })).toBeChecked()
    expect(confirm.getByText(/Priya is disconnected, so they'll need the new code from you\./)).toBeInTheDocument()
    await userEvent.click(confirm.getByRole('checkbox', { name: 'Uninvited · Captain Chaos' }))
    await userEvent.click(confirm.getByRole('button', { name: 'Get new code' }))
    await settle()

    const note = await invite.findByText(/^New code ready\./, { selector: '.gt-note-line' })
    expect(note.textContent).toBe(`New code ready. ${OLD} no longer works. Alex and Living room TV came along. Send the new code to Priya.`)
    expect(invite.getByText('New')).toBeInTheDocument()
    expect(invite.queryByText(OLD)).not.toBeInTheDocument()
    expect(invite.getByText('needs the new code')).toBeInTheDocument()
    expect(invite.queryByText(/Captain Chaos/)).not.toBeInTheDocument()
    expect(chaos.got.some((m) => (m as { type?: string }).type === 'removed')).toBe(true)
    await userEvent.click(invite.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText(`Hosting · ${OLD}`)).not.toBeInTheDocument()
  })

  it('just replaces the saved code while not hosting', async () => {
    const games = new MemoryGameStore()
    await games.save({ ...createGame({ id: 'g1', name: 'Thursday game' }), code: OLD })
    window.location.hash = '#/game/g1'
    render(<App store={new MemoryHeroStore()} villainStore={new MemoryVillainStore()} gameStore={games} searchStore={new MemorySavedSearchStore()} connect={fakeNetwork().connect} sessionStore={localSessionStore(memoryStorage())} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }))
    const invite = within(screen.getByRole('dialog', { name: 'Invite to Thursday game' }))
    expect(invite.getByText("You're not hosting this game, so nobody can join it until you start hosting.")).toBeInTheDocument()
    expect(invite.queryByText('Connected')).not.toBeInTheDocument()
    await userEvent.click(invite.getByRole('button', { name: 'Get a new game code' }))
    const confirm = within(screen.getByRole('dialog', { name: 'Get a new code?' }))
    expect(confirm.getByText("You're not hosting this game, so everyone will need the new code from you.")).toBeInTheDocument()
    await userEvent.click(confirm.getByRole('button', { name: 'Get new code' }))
    expect(await invite.findByText(`New code ready. ${OLD} no longer works. Send the new code to your players.`, { selector: '.gt-note-line' })).toBeInTheDocument()
    await waitFor(async () => {
      const saved = await games.get('g1')
      expect(saved.status === 'found' && saved.game.code).not.toBe(OLD)
    })
  })
})
