import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameStoreContext } from '../app/game-store-context'
import { SavedSearchStoreContext } from '../app/saved-search-context'
import { StoreContext } from '../app/store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import type { Hero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import { readHostMessage, type HostMessage } from '../session/protocol'
import { SessionProvider } from '../session/SessionProvider'
import { localSessionStore, memoryStorage } from '../session/storage'
import { fakeNetwork } from '../session/transport'
import { completeHero } from '../test/heroes'
import { MemoryVillainStore } from '../villain/store'
import { GamePage } from './GamePage'
import { createGame, heroCopy, type Game } from './model'
import { MemoryGameStore } from './store'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

const maya = (name = 'Maya Reyes'): Hero => ({ ...completeHero(), id: 'maya-src', details: { ...completeHero().details, name } })

async function setup(change: (g: Game) => Game = (g) => g) {
  const net = fakeNetwork()
  const games = new MemoryGameStore()
  await games.save(change(createGame({ id: 'g1', name: 'Thursday game' })))
  const storage = memoryStorage()
  render(
    <StoreContext.Provider value={new MemoryHeroStore()}>
      <VillainStoreContext.Provider value={new MemoryVillainStore()}>
        <GameStoreContext.Provider value={games}>
          <SavedSearchStoreContext.Provider value={new MemorySavedSearchStore()}>
            <SessionProvider connect={net.connect} store={localSessionStore(storage)} clock={clock}>
              <GamePage id="g1" clock={clock} />
            </SessionProvider>
          </SavedSearchStoreContext.Provider>
        </GameStoreContext.Provider>
      </VillainStoreContext.Provider>
    </StoreContext.Provider>,
  )
  await screen.findByRole('button', { name: /Rename game/ })
  return { net, games, storage }
}

async function startHosting(name = 'Sam') {
  await userEvent.click(screen.getByRole('button', { name: 'Start hosting' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Start hosting' }))
  await userEvent.clear(dialog.getByLabelText('Your name (players see it)'))
  await userEvent.type(dialog.getByLabelText('Your name (players see it)'), name)
  await userEvent.click(dialog.getByRole('button', { name: 'Start hosting' }))
  const pill = await screen.findByText(/^Hosting · /)
  return pill.textContent!.replace('Hosting · ', '')
}

/** A player's device: sends raw messages and keeps what the GM's device sends it. */
function player(net: ReturnType<typeof fakeNetwork>, room: string) {
  const got: HostMessage[] = []
  const t = net.connect(room)
  t.onMessage((raw) => {
    const msg = readHostMessage(raw)
    if (msg) got.push(msg)
  })
  return {
    got,
    hello: (clientId = 'c1', sheet = maya()) => t.send({ v: 2, type: 'hello', role: 'player', clientId, name: 'Alex', heroSourceId: sheet.id, sheet }),
    send: (msg: unknown) => t.send(msg),
    leave: () => t.leave(),
  }
}

describe('hosting from the game table', () => {
  it('starts hosting under the GM’s name, and invites with the code, a QR code and the player link', async () => {
    const { storage } = await setup()
    expect(screen.getByText('Not hosting')).toBeInTheDocument()
    const room = await startHosting()
    expect(room).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(screen.getByText('0 of 0 players connected')).toBeInTheDocument()
    expect(storage.getItem('scrpg.session.name')).toBe('"Sam"')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const invite = within(screen.getByRole('dialog', { name: 'Invite to Thursday game' }))
    expect(invite.getByText(room)).toBeInTheDocument()
    expect(invite.getByRole('img', { name: 'QR code for the player link' })).toBeInTheDocument()
    expect(invite.getByRole('button', { name: 'Copy player link' })).toBeInTheDocument()
    expect(invite.getByText('No one has joined yet.')).toBeInTheDocument()
  })

  it('shows a joining player’s hero with their name, then Disconnected when they leave, and removes them after asking', async () => {
    const { net } = await setup()
    const room = await startHosting()
    const alex = player(net, room)
    alex.hello()
    await net.settle()
    const card = await screen.findByRole('article', { name: 'Maya Reyes' })
    expect(card).toHaveTextContent('Alex')
    expect(card).not.toHaveTextContent('Disconnected')
    expect(screen.getByText('1 of 1 player connected')).toBeInTheDocument()
    alex.leave()
    await net.settle()
    await waitFor(() => expect(card).toHaveTextContent('Disconnected'))
    expect(screen.getByText('0 of 1 player connected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const invite = within(screen.getByRole('dialog', { name: 'Invite to Thursday game' }))
    expect(invite.getByText('Alex · Maya Reyes')).toBeInTheDocument()
    expect(invite.getByText('disconnected')).toBeInTheDocument()
    await userEvent.click(invite.getByRole('button', { name: 'Remove Alex and Maya Reyes' }))
    await userEvent.click(within(invite.getByRole('group', { name: 'Remove Alex?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Maya Reyes' })).not.toBeInTheDocument())
  })

  it('lists a watching screen in Invite with the watch link, counts it in the header, and removes it', async () => {
    const { net } = await setup()
    const room = await startHosting()
    const tv = player(net, room)
    tv.send({ v: 2, type: 'hello', role: 'observer', clientId: 'tv1', screenName: 'Living room TV' })
    await net.settle()
    expect(await screen.findByText('0 of 0 players connected · 1 watching')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const invite = within(screen.getByRole('dialog', { name: 'Invite to Thursday game' }))
    expect(invite.getByRole('button', { name: 'Copy watch link' })).toBeInTheDocument()
    expect(invite.getByText('Living room TV')).toBeInTheDocument()
    expect(invite.getByText('watching')).toBeInTheDocument()
    await userEvent.click(invite.getByRole('button', { name: 'Remove Living room TV' }))
    await net.settle()
    await waitFor(() => expect(invite.queryByText('Living room TV')).not.toBeInTheDocument())
    expect(tv.got.at(-1)).toMatchObject({ type: 'refused', reason: 'removed' })
    expect(screen.getByText('0 of 0 players connected')).toBeInTheDocument()
  })

  it('applies a player’s action to the table', async () => {
    const { net } = await setup()
    const room = await startHosting()
    const alex = player(net, room)
    alex.hello()
    await net.settle()
    const state = alex.got.find((m) => m.type === 'state') as Extract<HostMessage, { type: 'state' }>
    alex.send({ v: 2, type: 'action', id: 'a1', heroId: state.you!.heroId, action: { kind: 'reaction', used: true }, basedOn: state.version })
    await net.settle()
    await waitFor(() => expect(screen.getByRole('article', { name: 'Maya Reyes' })).toHaveTextContent('Reaction used'))
  })

  it('shows a sheet update request in Requests and on the hero card, and approves it', async () => {
    const { net, games } = await setup()
    const room = await startHosting()
    const alex = player(net, room)
    alex.hello()
    await net.settle()
    const state = alex.got.find((m) => m.type === 'state') as Extract<HostMessage, { type: 'state' }>
    alex.send({ v: 2, type: 'syncRequest', heroId: state.you!.heroId, sheet: maya('Maya Reyes II') })
    await net.settle()
    const requests = within(await screen.findByRole('region', { name: /^Requests/ }))
    expect(requests.getByText('1')).toBeInTheDocument()
    expect(requests.getByText(/Alex updated the sheet: 1 change/)).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Maya Reyes' })).getByRole('button', { name: 'Sheet update requested · Review' })).toBeInTheDocument()
    await userEvent.click(requests.getByRole('button', { name: "Review Maya Reyes's sheet update" }))
    const dialog = within(screen.getByRole('dialog', { name: "Update Maya Reyes to Alex's sheet?" }))
    expect(dialog.getByText(/^Requested /)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('article', { name: 'Maya Reyes II' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Requests/ })).not.toBeInTheDocument()
    await net.settle()
    expect(alex.got.at(-1)).toMatchObject({ type: 'syncResult', approved: true })
    await waitFor(async () => {
      const r = await games.get('g1')
      expect(r.status === 'found' && r.game.heroes[0]!.sheet.details.name).toBe('Maya Reyes II')
    })
  })

  it('declines a waiting request while not hosting, changing nothing', async () => {
    const { games } = await setup((g) => {
      const copy = { ...heroCopy(maya(), 'h1', { clientId: 'c1', name: 'Alex' }) }
      return { ...g, heroes: [copy], turn: { ...g.turn, order: [{ kind: 'hero', id: 'h1' }] }, pendingSyncs: [{ heroId: 'h1', sheet: maya('Maya Reyes II'), at: new Date().toISOString() }] }
    })
    await userEvent.click(within(screen.getByRole('article', { name: 'Maya Reyes' })).getByRole('button', { name: 'Sheet update requested · Review' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: "Update Maya Reyes to Alex's sheet?" })).getByRole('button', { name: 'Decline' }))
    await waitFor(async () => {
      const r = await games.get('g1')
      expect(r.status === 'found' && r.game.pendingSyncs).toEqual([])
    })
    expect(screen.getByRole('article', { name: 'Maya Reyes' })).toBeInTheDocument()
  })

  it('stops hosting from Invite, keeping the game', async () => {
    await setup()
    await startHosting()
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop hosting…' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Stop hosting?' })).getByRole('button', { name: 'Stop hosting' }))
    expect(await screen.findByText('Not hosting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rename game/ })).toBeInTheDocument()
  })

  it('hosts with the remembered name and the same code, and changes the name from Invite', async () => {
    const { net } = await setup()
    const room = await startHosting()
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop hosting…' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Stop hosting?' })).getByRole('button', { name: 'Stop hosting' }))
    await screen.findByText('Not hosting')
    // The name is known: no dialog this time, and the same code.
    await userEvent.click(screen.getByRole('button', { name: 'Start hosting' }))
    expect(await screen.findByText(`Hosting · ${room}`)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Start hosting' })).not.toBeInTheDocument()

    const alex = player(net, room)
    alex.hello()
    await net.settle()
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const invite = within(screen.getByRole('dialog', { name: 'Invite to Thursday game' }))
    await userEvent.clear(invite.getByLabelText('Your name (players see it)'))
    await userEvent.type(invite.getByLabelText('Your name (players see it)'), 'Samantha')
    await userEvent.click(invite.getByRole('button', { name: 'Save' }))
    await net.settle()
    const states = alex.got.filter((m) => m.type === 'state') as Extract<HostMessage, { type: 'state' }>[]
    expect(states.at(-1)!.gm).toBe('Samantha')
  })
})
