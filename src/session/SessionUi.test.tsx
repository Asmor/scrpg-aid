import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import { MemoryHeroStore } from '../hero/store'
import { PlayPage } from '../play/PlayPage'
import { completeHero } from '../test/heroes'
import { GmPage } from './GmPage'
import { JoinPage } from './JoinPage'
import { useSession } from './context'
import { SessionProvider } from './SessionProvider'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

/** A player's browser: the join page, then (once in the game) the hero's Play page. */
function PlayerApp({ room, heroId }: { room?: string; heroId: string }) {
  const session = useSession()
  return session.player?.heroId === heroId ? <PlayPage id={heroId} clock={clock} /> : <JoinPage room={room} />
}

async function addPlayer(net: ReturnType<typeof fakeNetwork>, room: string, name: string, heroId: string) {
  const heroes = new MemoryHeroStore()
  const hero = { ...completeHero(), id: heroId }
  hero.details.name = name
  await heroes.save(hero)
  const view = render(
    <StoreContext.Provider value={heroes}>
      <SessionProvider connect={net.connect} store={localSessionStore(memoryStorage())} clock={clock}>
        <PlayerApp room={room} heroId={heroId} />
      </SessionProvider>
    </StoreContext.Provider>,
  )
  const player = within(view.container)
  await waitFor(() => expect(player.getByLabelText('Hero')).toHaveDisplayValue(name))
  await userEvent.click(player.getByRole('button', { name: 'Join' }))
  await player.findByRole('region', { name: 'Game' })
  await act(() => net.settle())
  return player
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
  const player = await addPlayer(net, room, 'Ace', 'h1')
  const settle = () => act(() => net.settle())
  return { net, gm, player, room, gmStorage, settle }
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
    // (This test's player app goes back to the join page once out of the game.)
    expect(player.getByRole('heading', { name: 'Join a game' })).toBeInTheDocument()
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

describe('mods between heroes', () => {
  it('lets the GM give a hero a penalty', async () => {
    const { gm, player, settle } = await setup()
    const give = within(gm.getByRole('region', { name: 'Give a bonus or penalty' }))
    expect(give.getByLabelText('For')).toHaveDisplayValue('Ace')
    await userEvent.selectOptions(give.getByLabelText('Size'), '-2 penalty')
    await userEvent.type(give.getByLabelText('What it is'), 'grabbed')
    await userEvent.click(give.getByRole('button', { name: 'Give' }))
    await settle()
    const mods = player.getByRole('region', { name: 'Bonuses and penalties' })
    await waitFor(() => expect(mods).toHaveTextContent("'-2 grabbed' penalty"))
    expect(player.getByRole('region', { name: 'History' })).toHaveTextContent("Gained '-2 grabbed' penalty from GM.")
    await settle()
    await waitFor(() => expect(gm.getByRole('region', { name: 'Feed' })).toHaveTextContent("Ace: Gained '-2 grabbed' penalty from GM."))
  })

  it('lets a player give another hero a bonus, which stays gone once removed', async () => {
    const { net, room, gm, player: ace, settle } = await setup()
    const bolt = await addPlayer(net, room, 'Bolt', 'h2')
    await settle()
    const form = within(ace.getByRole('region', { name: 'Bonuses and penalties' }))
    await waitFor(() => expect(within(form.getByLabelText('For')).getByRole('option', { name: 'Bolt' })).toBeInTheDocument())
    await userEvent.selectOptions(form.getByLabelText('For'), 'Bolt')
    await userEvent.selectOptions(form.getByLabelText('Size'), '+2 bonus')
    await userEvent.type(form.getByLabelText('What it is'), 'rallied')
    await userEvent.click(form.getByRole('button', { name: 'Give' }))
    expect(ace.getByRole('region', { name: 'History' })).toHaveTextContent("Gave '+2 rallied' bonus to Bolt.")
    // Not on Ace's own list.
    expect(form.queryByText("'+2 rallied' bonus")).not.toBeInTheDocument()
    await settle()
    const boltMods = within(bolt.getByRole('region', { name: 'Bonuses and penalties' }))
    await waitFor(() => expect(boltMods.getByText("'+2 rallied' bonus")).toBeInTheDocument())
    expect(bolt.getByRole('region', { name: 'History' })).toHaveTextContent("Gained '+2 rallied' bonus from Ace.")
    await userEvent.click(boltMods.getByRole('button', { name: "Remove '+2 rallied' bonus" }))
    // Another change at the table doesn't bring it back.
    await userEvent.click(within(gm.getByRole('region', { name: 'Scene' })).getByRole('radio', { name: 'Yellow' }))
    await settle()
    await waitFor(() => expect(bolt.getByRole('region', { name: 'Health' })).toHaveTextContent('Yellow'))
    expect(boltMods.queryByText("'+2 rallied' bonus")).not.toBeInTheDocument()
  })

  it('offers a Boost’s bonus to another hero', async () => {
    const { net, room, gm, player: ace, settle } = await setup()
    await addPlayer(net, room, 'Bolt', 'h2')
    await userEvent.click(within(gm.getByRole('region', { name: 'Scene' })).getByRole('radio', { name: 'Yellow' }))
    await settle()
    await waitFor(() => expect(ace.getByRole('button', { name: 'Use Area Alteration' })).toBeEnabled())
    await userEvent.click(ace.getByRole('button', { name: 'Use Area Alteration' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    const offer = within(dialog.getByRole('group', { name: /Add the \+\d bonus to the mods list\?/ }))
    await userEvent.selectOptions(offer.getByLabelText('For'), 'Bolt')
    await userEvent.click(offer.getByRole('button', { name: /^Give \+\d bonus to Bolt$/ }))
    expect(offer.getByRole('button', { name: 'Given' })).toBeDisabled()
    expect(ace.getByRole('region', { name: 'History' })).toHaveTextContent(/Gave '\+\d Area Alteration' bonus to Bolt\./)
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
