import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { useRoute } from '../app/route'
import { StoreContext } from '../app/store-context'
import { MemoryHeroStore } from '../hero/store'
import { PlayPage } from '../play/PlayPage'
import { completeHero } from '../test/heroes'
import { GmPage } from './GmPage'
import { JoinPage } from './JoinPage'
import { SessionProvider } from './SessionProvider'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

/** The player's browser: the join page, then the hero's Play page. */
function PlayerApp({ room }: { room?: string }) {
  const route = useRoute()
  return route.name === 'play' ? <PlayPage id={route.id} clock={clock} /> : <JoinPage room={room} />
}

async function setup() {
  window.location.hash = '#/join'
  const net = fakeNetwork()
  const gmStorage = memoryStorage()
  const gmView = render(
    <SessionProvider connect={net.connect} store={localSessionStore(gmStorage)} clock={clock}>
      <GmPage />
    </SessionProvider>,
  )
  const gm = within(gmView.container)
  await userEvent.click(gm.getByRole('button', { name: 'Start a game' }))
  const room = within(gm.getByRole('region', { name: 'Invite players' })).getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/).textContent!

  const heroes = new MemoryHeroStore()
  const hero = { ...completeHero(), id: 'h1' }
  hero.details.name = 'Ace'
  await heroes.save(hero)
  const playerStorage = memoryStorage()
  const playerView = render(
    <StoreContext.Provider value={heroes}>
      <SessionProvider connect={net.connect} store={localSessionStore(playerStorage)} clock={clock}>
        <PlayerApp room={room} />
      </SessionProvider>
    </StoreContext.Provider>,
  )
  const player = within(playerView.container)
  await waitFor(() => expect(player.getByLabelText('Hero')).toHaveDisplayValue('Ace'))
  await userEvent.click(player.getByRole('button', { name: 'Join' }))
  await player.findByRole('region', { name: 'Game' })
  const settle = () => act(() => net.settle())
  await settle()
  return { net, gm, player, room, heroes, gmStorage, settle }
}

afterEach(() => {
  window.location.hash = ''
})

describe('a game session in the app', () => {
  it('joins a hosted game, and the GM sees the hero', async () => {
    const { gm, player, room } = await setup()
    expect(player.getByRole('status')).toHaveTextContent(`In game ${room}.`)
    const card = within(gm.getByRole('listitem', { name: 'Ace' }))
    expect(card.getByText('Connected')).toBeInTheDocument()
    expect(card.getByText(/30 \/ 30/)).toBeInTheDocument()
    expect(gm.getByRole('region', { name: 'Feed' })).toHaveTextContent('GM: Ace joined the game.')
    // The player sees the party too, marked as them.
    expect(within(player.getByRole('region', { name: 'Game' })).getByText('(you)')).toBeInTheDocument()
  })

  it('follows the GM’s scene, which the player can’t change', async () => {
    const { gm, player, settle } = await setup()
    await userEvent.click(within(gm.getByRole('region', { name: 'Scene' })).getByRole('radio', { name: 'Red' }))
    await settle()
    await waitFor(() => expect(player.getByRole('region', { name: 'Health' })).toHaveTextContent('30 / 30 Red'))
    expect(within(player.getByRole('group', { name: 'Scene' })).getByRole('radio', { name: 'Green' })).toBeDisabled()
    expect(player.getByText('The GM sets the scene.')).toBeInTheDocument()
    expect(player.getByRole('region', { name: 'History' })).toHaveTextContent('The GM set the scene to Red.')
  })

  it('shares the player’s history with the table, but not what came before the game', async () => {
    const { gm, player, settle } = await setup()
    await userEvent.type(player.getByLabelText('Amount'), '4')
    await userEvent.click(player.getByRole('button', { name: 'Lose' }))
    await settle()
    const feed = gm.getByRole('region', { name: 'Feed' })
    await waitFor(() => expect(feed).toHaveTextContent('Ace: Lost 4 HP (30 → 26).'))
    expect(within(gm.getByRole('listitem', { name: 'Ace' })).getByText(/26 \/ 30/)).toBeInTheDocument()
  })

  it('leaves the game', async () => {
    const { gm, player, settle } = await setup()
    await userEvent.click(player.getByRole('button', { name: 'Leave the game' }))
    expect(player.getByRole('region', { name: 'Game' })).toHaveTextContent('Not in a game.')
    await settle()
    await waitFor(() => expect(within(gm.getByRole('listitem', { name: 'Ace' })).getByText('Away')).toBeInTheDocument())
    await userEvent.click(gm.getByRole('button', { name: 'Remove' }))
    expect(gm.queryByRole('listitem', { name: 'Ace' })).not.toBeInTheDocument()
  })

  it('says how to copy the link when the clipboard isn’t available', async () => {
    const { gm } = await setup()
    await userEvent.click(gm.getByRole('button', { name: 'Copy link' }))
    expect(gm.getByText(/Select the link and copy it yourself/)).toBeInTheDocument()
  })

  it('ends the game after asking', async () => {
    const { gm, gmStorage } = await setup()
    await userEvent.click(gm.getByRole('button', { name: 'End the game…' }))
    await userEvent.click(gm.getByRole('button', { name: 'Yes, end it' }))
    expect(gm.getByRole('button', { name: 'Start a game' })).toBeInTheDocument()
    expect(gmStorage.data.has('scrpg.session.gm')).toBe(false)
  })
})

describe('joining', () => {
  it('needs a valid room code and a hero', async () => {
    render(
      <StoreContext.Provider value={new MemoryHeroStore()}>
        <JoinPage />
      </StoreContext.Provider>,
    )
    expect(await screen.findByText(/You have no heroes yet/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Room code'), 'abc')
    expect(screen.getByText(/A room code is eight letters and numbers/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled()
  })
})
