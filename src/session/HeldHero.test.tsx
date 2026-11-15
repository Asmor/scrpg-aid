/** Joining with a hero someone else holds, and having yours taken over (scrpg-aid-designs/game-table/spec.md, section 7). */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App'
import { createGame, type Game } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { addHero } from '../game/table'
import type { Hero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import type { Clock } from '../play/state'
import { MemorySettingsStore } from '../settings/store'
import { completeHero } from '../test/heroes'
import { MemoryVillainStore } from '../villain/store'
import { HostSession } from './host'
import { PROTOCOL_VERSION } from './protocol'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'

let n = 0
const clock = (): Clock => ({ now: new Date(), newId: () => `id${++n}` })
const ROOM = 'ABCD-EFGH'
const maya = (): Hero => ({ ...completeHero(), id: 'maya', details: { ...completeHero().details, name: 'Maya Reyes' } })

afterEach(() => {
  window.location.hash = ''
})

/** The GM's device hosting `game`, and a player's device on the Join page with Maya Reyes in the library. */
async function setup(game: Game) {
  const net = fakeNetwork()
  const gmGames = new MemoryGameStore()
  await gmGames.save(game)
  const host = new HostSession(net.connect, { room: ROOM, gameId: game.id, gm: 'Sam', removed: [] }, gmGames, clock)
  const heroes = new MemoryHeroStore()
  await heroes.save(maya())
  window.location.hash = `#/join/${ROOM}`
  render(<App settingsStore={new MemorySettingsStore()} store={heroes} villainStore={new MemoryVillainStore()} gameStore={new MemoryGameStore()} searchStore={new MemorySavedSearchStore()} connect={net.connect} sessionStore={localSessionStore(memoryStorage())} />)
  await screen.findByRole('heading', { name: 'Join a game' })
  const settle = () => act(() => net.settle())
  return { net, host, heroes, settle }
}

/** Thursday game, with Maya Reyes held by Priya (away). */
const heldByPriya = () => addHero(createGame({ id: 'g1', name: 'Thursday game' }), maya(), clock(), { clientId: 'priya-device', name: 'Priya' })

async function tryToJoin(settle: () => Promise<void>) {
  await userEvent.type(await screen.findByLabelText('Your name (everyone at the table sees it)'), 'Alex')
  await userEvent.click(await screen.findByRole('button', { name: 'Join with Maya Reyes' }))
  await settle()
  return within(await screen.findByRole('dialog', { name: 'Maya Reyes is already in Thursday game' }))
}

describe('joining with a hero someone else holds', () => {
  it('asks, saying who holds it, with Join with my own copy first in focus', async () => {
    const { settle, host } = await setup(heldByPriya())
    const dialog = await tryToJoin(settle)
    expect(dialog.getByText("Priya was playing Maya Reyes; they're not connected right now.")).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /^Join with my own copy/ })).toHaveFocus()
    expect(dialog.getByRole('button', { name: /^Take over Maya Reyes/ })).toHaveAccessibleName(/Priya will be told\.$/)
    expect(window.location.hash).toBe(`#/join/${ROOM}`)
    expect(host.game!.heroes[0]!.player!.clientId).toBe('priya-device')
  })

  it('joins with an own copy: a new library hero with a new id, alongside Priya’s', async () => {
    const { settle, host, heroes } = await setup(heldByPriya())
    const dialog = await tryToJoin(settle)
    await userEvent.click(dialog.getByRole('button', { name: /^Join with my own copy/ }))
    await settle()
    await waitFor(() => expect(window.location.hash).toBe(`#/table/${ROOM}`))
    const library = (await heroes.list()).heroes
    const copy = library.find((h) => h.id !== 'maya')!
    expect(copy).toMatchObject({ copiedFrom: 'maya', details: { name: 'Maya Reyes' } })
    expect(host.game!.heroes.map((h) => [h.sourceId, h.player?.name])).toEqual([
      ['maya', 'Priya'],
      [copy.id, 'Alex'],
    ])
  })

  it('takes it over: the game’s copy becomes Alex’s', async () => {
    const { settle, host } = await setup(heldByPriya())
    const dialog = await tryToJoin(settle)
    await userEvent.click(dialog.getByRole('button', { name: /^Take over Maya Reyes/ }))
    await settle()
    await waitFor(() => expect(window.location.hash).toBe(`#/table/${ROOM}`))
    expect(host.game!.heroes).toHaveLength(1)
    expect(host.game!.heroes[0]!.player).toMatchObject({ name: 'Alex' })
    expect(host.game!.feed.at(-1)!.text).toBe('Alex took over Maya Reyes from Priya.')
  })

  it('goes back to Bring a hero with the held hero marked; Cancel leaves the page as it was', async () => {
    const { settle } = await setup(heldByPriya())
    let dialog = await tryToJoin(settle)
    await userEvent.click(dialog.getByRole('button', { name: /^Choose a different hero/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('· Priya is playing this one')).toBeInTheDocument()
    // No hero chosen now, and focus is back on the heroes.
    const radio = screen.getByRole('radio', { name: /Maya Reyes/ })
    expect(radio).not.toBeChecked()
    expect(radio).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled()
    await userEvent.click(radio)
    await userEvent.click(screen.getByRole('button', { name: 'Join with Maya Reyes' }))
    await settle()
    dialog = within(await screen.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.location.hash).toBe(`#/join/${ROOM}`)
  })

  it("says the GM is running one of the GM's own heroes", async () => {
    const { settle } = await setup(addHero(createGame({ id: 'g1', name: 'Thursday game' }), maya(), clock()))
    const dialog = await tryToJoin(settle)
    expect(dialog.getByText('The GM is running Maya Reyes.')).toBeInTheDocument()
  })
})

describe('having your hero taken over', () => {
  it('shows who took it, with Choose another hero, Watch the game and Leave', async () => {
    const { net, settle } = await setup(createGame({ id: 'g1', name: 'Thursday game' }))
    await userEvent.type(await screen.findByLabelText('Your name (everyone at the table sees it)'), 'Alex')
    await userEvent.click(await screen.findByRole('button', { name: 'Join with Maya Reyes' }))
    await settle()
    await waitFor(() => expect(window.location.hash).toBe(`#/table/${ROOM}`))
    await settle()
    // Priya takes it over from another device.
    const priya = net.connect(ROOM)
    await settle()
    priya.send({ v: PROTOCOL_VERSION, type: 'hello', role: 'player', clientId: 'priya-device', name: 'Priya', heroSourceId: 'maya', sheet: maya(), takeOver: true })
    await settle()
    const banner = within(await screen.findByRole('alert'))
    expect(banner.getByText('Priya took over Maya Reyes.')).toBeInTheDocument()
    expect(banner.getByRole('button', { name: 'Watch the game' })).toBeInTheDocument()
    expect(banner.getByRole('button', { name: 'Leave' })).toBeInTheDocument()
    await userEvent.click(banner.getByRole('button', { name: 'Choose another hero' }))
    expect(window.location.hash).toBe(`#/join/${ROOM}`)
  })
})
