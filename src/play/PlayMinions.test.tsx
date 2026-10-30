import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import { PlayPage } from '../components/HeroPage'
import type { Hero } from '../hero/model'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { completeHero, minionMakerHero, P } from '../test/heroes'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

/** The Minion-Maker test hero with Make Minion and Power Up, rolling the top of every die. */
async function setup(change: (h: Hero) => void = () => {}) {
  const store = new MemoryHeroStore()
  const hero = { ...minionMakerHero(), id: 'h1' }
  hero.archetype!.abilities = [
    { source: 'archetype.fixedGreen', name: 'Make Minion', uses: [P('fire')] },
    { source: 'archetype.fixedGreen', name: 'Power Up', uses: [P('fire')] },
  ]
  change(hero)
  await store.save(hero)
  render(
    <StoreContext.Provider value={store}>
      <PlayPage id="h1" clock={clock} random={() => 0.999} />
    </StoreContext.Provider>,
  )
  await screen.findByRole('region', { name: 'Your minions' })
  return store
}

const saved = async (store: HeroStore) => {
  const r = await store.get('h1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.hero
}
const panel = () => within(screen.getByRole('region', { name: 'Your minions' }))
const minion = (name: string) => within(panel().getByText(name, { selector: 'strong' }).closest('li')!)

describe('Your minions', () => {
  it('shows only for a Minion-Maker', async () => {
    const store = new MemoryHeroStore()
    await store.save({ ...completeHero(), id: 'h2' })
    render(
      <StoreContext.Provider value={store}>
        <PlayPage id="h2" clock={clock} />
      </StoreContext.Provider>,
    )
    await screen.findByRole('region', { name: 'Actions' })
    expect(screen.queryByRole('region', { name: 'Your minions' })).not.toBeInTheDocument()
  })

  it('adds a minion by hand, gives it its own mods, and rolls its die for its one action', async () => {
    const store = await setup()
    await userEvent.click(panel().getByRole('button', { name: '+ Add' }))
    await userEvent.type(panel().getByLabelText('Name'), 'Kix')
    await userEvent.selectOptions(panel().getByLabelText('Size'), 'd8')
    await userEvent.selectOptions(panel().getByLabelText('Action'), 'Hinder')
    await userEvent.click(panel().getByRole('button', { name: 'Add' }))
    expect(minion('Kix').getByRole('img', { name: 'd8' })).toBeInTheDocument()
    expect(minion('Kix').getByText('Hinder')).toBeInTheDocument()

    // Its own penalty, separate from the hero's.
    await userEvent.click(minion('Kix').getByRole('button', { name: '+ Mod' }))
    await userEvent.selectOptions(minion('Kix').getByLabelText('Size'), '-1 penalty')
    await userEvent.type(minion('Kix').getByLabelText('What it is'), 'dazed')
    await userEvent.click(minion('Kix').getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect((await saved(store)).play?.minions?.[0]?.mods).toMatchObject([{ label: 'dazed', value: -1 }]))
    expect((await saved(store)).play?.mods).toEqual([])

    // Use: its one die, with its own mods; no choice of action.
    await userEvent.click(minion('Kix').getByRole('button', { name: 'Use Kix' }))
    const use = within(panel().getByRole('group', { name: "Kix's roll" }))
    expect(use.getByText('Can only Hinder, the action it was made with.')).toBeInTheDocument()
    expect(use.getByText('dazed').closest('label')!.querySelector('input')).toBeChecked()
    // The die shows as its icon.
    expect(within(use.getByRole('button', { name: 'Roll d8' })).getByRole('img', { name: 'd8' })).toBeInTheDocument()
    await userEvent.click(use.getByRole('button', { name: 'Roll d8' }))
    expect(use.getByText('7 (8 − 1)')).toBeInTheDocument()
    expect(use.getByText(/Hinder 7 \(single die, with -1\): a -2 penalty\./)).toBeInTheDocument()
    await userEvent.click(use.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.minions?.[0]?.mods).toEqual([]))
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Kix took Hinder:')
  })

  it('lets an Autonomous minion take any basic action, and removes a d4 minion that shrinks', async () => {
    const store = await setup((h) => {
      h.play = { heroPoints: 0, reactionUsed: false, mods: [], twists: [], history: [], minions: [{ id: 'm1', name: 'Bolt', die: 'd4', action: 'any', form: 'Autonomous', mods: [] }] }
    })
    expect(minion('Bolt').getByText('Any basic action')).toBeInTheDocument()
    await userEvent.click(minion('Bolt').getByRole('button', { name: 'Use Bolt' }))
    expect(within(panel().getByRole('group', { name: "Bolt's roll" })).getByLabelText('Action')).toBeInTheDocument()
    await userEvent.click(minion('Bolt').getByRole('button', { name: 'Cancel' }))
    await userEvent.click(minion('Bolt').getByRole('button', { name: 'Shrink Bolt' }))
    await waitFor(async () => expect((await saved(store)).play?.minions).toEqual([]))
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Shrank away: Bolt (d4).')
  })

  it('makes a minion with Make Minion, sized from the Mid die (ruling 62), and undoes it with the roll', async () => {
    const store = await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Use Make Minion' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    // The test hero's Mid die rolls 8 here: a d10 minion on the chart (8–11).
    const card = dialog.getByRole('group', { name: 'Minion (Mid)' })
    expect(within(card).getByRole('img', { name: 'd10' })).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'Golem')
    await userEvent.selectOptions(dialog.getByLabelText('Action it can take'), 'Defend')
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.minions).toMatchObject([{ name: 'Golem', die: 'd10', action: 'defend' }]))
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await saved(store)).play?.minions).toEqual([]))
  })

  it('uses up and logs the hero’s mods that sized a minion, and Undo brings them back', async () => {
    const store = await setup((h) => {
      h.play = { heroPoints: 0, reactionUsed: false, mods: [{ id: 'p', label: 'shaky', value: -2 }], twists: [], history: [] }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Use Make Minion' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    // The checked penalty starts on the minion: Mid 8 − 2 = 6, a d8 instead of a d10.
    const card = dialog.getByRole('group', { name: 'Minion (Mid)' })
    expect(card.querySelector('.roll-effect-card__total')).toHaveTextContent('6')
    expect(within(card).getByRole('img', { name: 'd8' })).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.mods).toEqual([]))
    const roll = (await saved(store)).play!.history.find((h) => h.roll)!
    expect(roll.details).toEqual(expect.arrayContaining(['Minion (Mid): 8 − 2 → a d8 minion.', "Applied '-2 shaky' penalty."]))
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await saved(store)).play?.mods.map((m) => m.id)).toEqual(['p']))
  })

  it('frees the other minions’ Use when the one being used is removed', async () => {
    await setup((h) => {
      h.play = {
        heroPoints: 0,
        reactionUsed: false,
        mods: [],
        twists: [],
        history: [],
        minions: [
          { id: 'm1', name: 'Kix', die: 'd6', action: 'attack', mods: [] },
          { id: 'm2', name: 'Bolt', die: 'd8', action: 'defend', mods: [] },
        ],
      }
    })
    await userEvent.click(minion('Kix').getByRole('button', { name: 'Use Kix' }))
    expect(minion('Bolt').getByRole('button', { name: 'Use Bolt' })).toBeDisabled()
    // No shrinking a minion mid-roll.
    expect(minion('Kix').getByRole('button', { name: 'Shrink Kix' })).toBeDisabled()
    await userEvent.click(minion('Kix').getByRole('button', { name: 'Remove Kix' }))
    expect(minion('Bolt').getByRole('button', { name: 'Use Bolt' })).toBeEnabled()
  })

  it('can give a Boost’s bonus to one of the hero’s own minions, even playing alone', async () => {
    const store = await setup((h) => {
      h.play = { heroPoints: 0, reactionUsed: false, mods: [], twists: [], history: [], minions: [{ id: 'm1', name: 'Kix', die: 'd6', action: 'attack', mods: [] }] }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Use Power Up' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    const offer = within(dialog.getByRole('group', { name: /Add the \+\d bonus to the mods list\?/ }))
    await userEvent.selectOptions(offer.getByLabelText('For'), 'Kix (your minion)')
    await userEvent.click(offer.getByRole('button', { name: /^Give \+\d bonus to Kix \(your minion\)$/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.minions?.[0]?.mods).toHaveLength(1))
    expect((await saved(store)).play?.mods).toEqual([])
  })
})
