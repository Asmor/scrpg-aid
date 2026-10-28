import { act, render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { MemoryHeroStore } from '../hero/store'
import { PlayPage } from '../play/PlayPage'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { MemoryVillainStore } from '../villain/store'
import { VillainPlayPage } from '../villain/VillainPlayPage'
import { useSession } from './context'
import { GmPage } from './GmPage'
import { JoinPage } from './JoinPage'
import { SessionProvider } from './SessionProvider'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

function PlayerApp({ room }: { room: string }) {
  const session = useSession()
  return session.player?.heroId === 'h1' ? <PlayPage id="h1" clock={clock} /> : <JoinPage room={room} />
}

describe('villains in a game', () => {
  it('shows the GM’s villain to the table, takes a player’s Hinder on it, and shares its rolls', async () => {
    const net = fakeNetwork()
    const villains = new MemoryVillainStore()
    // It has history from before the game, which stays out of the feed.
    await villains.save({ ...adaptiveBruiser(), play: { reactionUsed: false, mods: [], twists: [], history: [{ id: 'old', at: '2026-10-01T00:00:00.000Z', text: 'An old fight.' }] } })
    // The GM's browser: the GM page and the villain's Play page, in one session.
    const gmView = render(
      <VillainStoreContext.Provider value={villains}>
        <SessionProvider connect={net.connect} store={localSessionStore(memoryStorage())} clock={clock}>
          <GmPage />
          <VillainPlayPage id="v1" clock={clock} />
        </SessionProvider>
      </VillainStoreContext.Provider>,
    )
    const gm = within(gmView.container)
    await userEvent.click(gm.getByRole('button', { name: 'Start a game' }))
    const room = within(gm.getByRole('region', { name: 'Invite players' })).getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/).textContent!
    const villainsRegion = within(gm.getByRole('region', { name: 'Villains' }))
    await waitFor(() => expect(villainsRegion.getByRole('option', { name: 'Ironclad' })).toBeInTheDocument())
    await userEvent.selectOptions(villainsRegion.getByLabelText('Villain to add'), 'Ironclad')
    await userEvent.click(villainsRegion.getByRole('button', { name: 'Add to the game' }))
    expect(gm.getByRole('region', { name: 'Feed' })).toHaveTextContent('GM: Ironclad joined the scene.')
    expect(gm.getByRole('region', { name: 'Feed' })).not.toHaveTextContent('An old fight.')

    // A player joins and sees the villain.
    const heroes = new MemoryHeroStore()
    await heroes.save({ ...completeHero(), id: 'h1' })
    const playerView = render(
      <StoreContext.Provider value={heroes}>
        <SessionProvider connect={net.connect} store={localSessionStore(memoryStorage())} clock={clock}>
          <PlayerApp room={room} />
        </SessionProvider>
      </StoreContext.Provider>,
    )
    const player = within(playerView.container)
    await userEvent.click(await player.findByRole('button', { name: 'Join' }))
    await act(() => net.settle())
    const game = within(await player.findByRole('region', { name: 'Game' }))
    await waitFor(() => expect(game.getByRole('listitem', { name: 'Ironclad' })).toHaveTextContent('55 / 55 · Green'))

    // The player Hinders the villain; its Play page (open in the GM's browser) adds the penalty.
    const mods = within(player.getByRole('region', { name: 'Bonuses and penalties' }))
    await userEvent.selectOptions(mods.getByLabelText('For'), 'Ironclad')
    await userEvent.selectOptions(mods.getByLabelText('Size'), '-2 penalty')
    await userEvent.type(mods.getByLabelText('What it is'), 'tangled')
    await userEvent.click(mods.getByRole('button', { name: 'Give' }))
    await act(() => net.settle())
    const villainMods = within(gm.getAllByRole('region', { name: 'Bonuses and penalties' }).at(-1)!)
    await waitFor(() => expect(villainMods.getByText("'-2 tangled' penalty")).toBeInTheDocument())
    await waitFor(async () => {
      const saved = await villains.get('v1')
      expect(saved.status === 'found' && saved.villain.play?.mods).toHaveLength(1)
    })

    // The villain loses Health: the table sees it, and the feed has it under its name.
    const health = within(gm.getAllByRole('region', { name: 'Health' }).at(-1)!)
    await userEvent.type(health.getByLabelText('Amount'), '20')
    await userEvent.click(health.getByRole('button', { name: 'Lose' }))
    await act(() => net.settle())
    await waitFor(() => expect(game.getByRole('listitem', { name: 'Ironclad' })).toHaveTextContent('35 / 55 · Yellow'))
    await waitFor(() => expect(game.getByRole('listitem', { name: 'Ironclad' })).toHaveTextContent("'-2 tangled' penalty"))
    expect(gm.getByRole('region', { name: 'Feed' })).toHaveTextContent('Ironclad: Lost 20 HP (55 → 35).')
    expect(gm.getByRole('region', { name: 'Feed' })).toHaveTextContent("Ironclad: Gained '-2 tangled' penalty from")

    // Removing it takes it off the table.
    await userEvent.click(within(gm.getByRole('region', { name: 'Villains' })).getByRole('button', { name: 'Remove' }))
    await act(() => net.settle())
    await waitFor(() => expect(game.queryByRole('listitem', { name: 'Ironclad' })).not.toBeInTheDocument())
  }, 30_000)
})
