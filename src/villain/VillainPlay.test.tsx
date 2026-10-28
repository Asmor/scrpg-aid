import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { VillainStoreContext } from '../app/villain-store-context'
import { adaptiveBruiser } from '../test/villains'
import type { Villain } from './model'
import { MemoryVillainStore } from './store'
import { VillainPlayPage } from './VillainPlayPage'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

async function setup(change: (v: Villain) => void = () => {}) {
  const store = new MemoryVillainStore()
  const v = adaptiveBruiser()
  change(v)
  await store.save(v)
  render(
    <VillainStoreContext.Provider value={store}>
      <VillainPlayPage id="v1" clock={clock} random={() => 0.999} />
    </VillainStoreContext.Provider>,
  )
  await screen.findByRole('region', { name: 'Abilities' })
  return store
}

const saved = async (store: MemoryVillainStore) => {
  const r = await store.get('v1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.villain
}
const region = (name: string) => within(screen.getByRole('region', { name }))

describe('a villain in the game aid', () => {
  it('loses Health, changing zone and (for a Bruiser) its status die', async () => {
    const store = await setup()
    expect(screen.getByRole('region', { name: 'Health' })).toHaveTextContent('55 / 55 Green')
    expect(region('Status die').getByRole('img', { name: 'd6' })).toBeInTheDocument()
    await userEvent.type(region('Health').getByLabelText('Amount'), '20')
    await userEvent.click(region('Health').getByRole('button', { name: 'Lose' }))
    expect(screen.getByRole('region', { name: 'Health' })).toHaveTextContent('35 / 55 Yellow')
    expect(region('Status die').getByRole('img', { name: 'd8' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Lost 20 HP (55 → 35). Entered Yellow status.')
    await waitFor(async () => expect((await saved(store)).play?.health).toBe(35))
  })

  it('sizes Health for the heroes in this scene', async () => {
    const store = await setup()
    const heroes = region('Health').getByLabelText('Heroes in this scene')
    await userEvent.clear(heroes)
    await userEvent.type(heroes, '2')
    expect(screen.getByRole('region', { name: 'Health' })).toHaveTextContent('45 / 45')
    await waitFor(async () => expect((await saved(store)).play?.heroCount).toBe(2))
  })

  it('takes the count, weakness, or challenge its status rule needs', async () => {
    await setup((v) => {
      v.archetype = { id: 'domain', abilities: [] }
    })
    const count = region('Status die').getByLabelText(/^How many /)
    await userEvent.clear(count)
    await userEvent.type(count, '3')
    expect(region('Status die').getByRole('img', { name: 'd10' })).toBeInTheDocument()
  })

  it('tracks a Formidable villain’s weakness', async () => {
    await setup((v) => {
      v.archetype = { id: 'formidable', abilities: [] }
    })
    // The current die comes first; each weakness option shows its own die after it.
    const current = () => region('Status die').getAllByRole('img')[0]
    expect(current()).toHaveAttribute('alt', 'd12')
    await userEvent.click(region('Status die').getAllByRole('radio')[0]!)
    expect(current()).toHaveAttribute('alt', 'd4')
  })

  it('tracks the Titan’s challenge', async () => {
    await setup((v) => {
      v.archetype = { id: 'titan', abilities: [] }
    })
    expect(region('Status die').getByRole('img', { name: 'd12' })).toBeInTheDocument()
    await userEvent.click(region('Status die').getAllByRole('checkbox')[0]!)
    expect(region('Status die').getByRole('img', { name: 'd10' })).toBeInTheDocument()
  })

  it('rolls an ability with its power, quality, and status die, and records it', async () => {
    const store = await setup()
    await userEvent.click(region('Abilities').getByRole('button', { name: 'Use Lash Out' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Lash Out' }))
    expect(dialog.getByRole('group', { name: 'Power' })).toHaveTextContent('Strength')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(dialog.getByRole('list', { name: 'Dice rolled' })).toHaveTextContent('Max: 10 (Technology d10)Mid: 8 (Strength d8)Min: 6 (Status d6)')
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.history.at(-1)?.text).toBe('Used ability Lash Out:'))
  })

  it('uses its reaction once a round, advances the scene once, and takes only minor twists', async () => {
    await setup((v) => {
      v.archetype!.abilities = [
        { source: 'archetype', name: 'Bring It On!' },
        { source: 'archetype', name: 'Lash Out', uses: [{ kind: 'power', id: 'strength' }] },
      ]
    })
    await userEvent.click(region('This scene').getByRole('checkbox', { name: 'Reaction used this round' }))
    expect(region('Abilities').getByRole('button', { name: 'Use Bring It On!' })).toBeDisabled()
    await userEvent.click(region('This scene').getByRole('button', { name: 'Advance the scene tracker' }))
    expect(region('This scene').getByRole('button', { name: 'Scene advanced (once per scene)' })).toBeDisabled()
    await userEvent.click(region('This scene').getByRole('button', { name: 'New scene' }))
    expect(region('Abilities').getByRole('button', { name: 'Use Bring It On!' })).toBeEnabled()
    await userEvent.type(region('Twists').getByLabelText('Minor twist'), 'Cornered')
    await userEvent.click(region('Twists').getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Took a minor twist: Cornered.')
  })

  it('lists a vehicle’s abilities for reference, apart from the villain’s own', async () => {
    await setup((v) => {
      v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd10', abilities: [{ source: 'vehicle', name: 'Bombard' }, { source: 'vehicle', name: 'Escape Plan' }] } }]
      v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    })
    const abilities = region('Abilities')
    expect(abilities.getByRole('heading', { name: /Vehicle/ })).toContainElement(abilities.getByRole('img', { name: 'd10' }))
    expect(abilities.getByText('Bombard')).toBeInTheDocument()
    expect(abilities.queryByRole('button', { name: 'Use Bombard' })).not.toBeInTheDocument()
    expect(abilities.queryByRole('button', { name: 'Use Escape Plan' })).not.toBeInTheDocument()
  })

  it('takes a count that can be cleared and retyped', async () => {
    await setup((v) => {
      v.archetype = { id: 'domain', abilities: [] }
    })
    const count = region('Status die').getByLabelText(/^How many /)
    await userEvent.clear(count)
    expect(count).toHaveValue(null)
    await userEvent.type(count, '1')
    expect(region('Status die').getAllByRole('img')[0]).toHaveAttribute('alt', 'd8')
  })

  it('adds mods, starts over after asking, and says when a villain is missing', async () => {
    const store = await setup()
    await userEvent.type(region('Bonuses and penalties').getByLabelText('What it is'), 'cornered')
    await userEvent.click(region('Bonuses and penalties').getByRole('button', { name: 'Add' }))
    expect(region('Bonuses and penalties').getByText("'-1 cornered' penalty")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start over…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, start over' }))
    await waitFor(async () => expect((await saved(store)).play?.mods).toEqual([]))
    render(
      <VillainStoreContext.Provider value={store}>
        <VillainPlayPage id="nobody" />
      </VillainStoreContext.Provider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved villain with that link.")
  })
})
