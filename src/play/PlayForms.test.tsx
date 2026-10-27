import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { Hero } from '../hero/model'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { dividedHero, formChangerHero, modularHero } from '../test/heroes'
import { PlayPage } from './PlayPage'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

async function setup(hero: Hero) {
  const store = new MemoryHeroStore()
  await store.save({ ...hero, id: 'h1' })
  render(
    <StoreContext.Provider value={store}>
      <PlayPage id="h1" clock={clock} random={() => 0.999} />
    </StoreContext.Provider>,
  )
  await screen.findByRole('region', { name: 'Abilities' })
  return store
}

const saved = async (store: HeroStore) => {
  const r = await store.get('h1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.hero
}
const abilities = () => within(screen.getByRole('region', { name: 'Abilities' }))

describe('forms in play', () => {
  it('changes Form-Changer form, rolling that form’s dice and opening its ability', async () => {
    const store = await setup(formChangerHero())
    const section = within(screen.getByRole('region', { name: 'Form' }))
    const select = section.getByLabelText('Current form')
    // The Yellow form needs the Yellow zone.
    expect(within(select).getByRole('option', { name: 'Yellow form 1 (Yellow)' })).toBeDisabled()
    expect(abilities().getByRole('button', { name: 'Use Strong Form' })).toBeDisabled()
    expect(abilities().getByText('Only in Brute')).toBeInTheDocument()

    await userEvent.selectOptions(select, 'Brute')
    expect(section.getByText('Strength')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Changed to Brute.')
    await waitFor(async () => expect((await saved(store)).play?.form).toBe('form:0'))

    await userEvent.click(abilities().getByRole('button', { name: 'Use Strong Form' }))
    expect(within(screen.getByRole('dialog')).getByRole('group', { name: 'Power' })).toHaveTextContent('Strength')
  })

  it('says nothing about zones, and allows any form, while Out', async () => {
    const hero = formChangerHero()
    hero.play = { health: 0, heroPoints: 0, reactionUsed: false, mods: [], twists: [], history: [] }
    await setup(hero)
    const section = within(screen.getByRole('region', { name: 'Form' }))
    expect(section.queryByText(/needs the/)).not.toBeInTheDocument()
    expect(within(section.getByLabelText('Current form')).getByRole('option', { name: 'Yellow form 1 (Yellow)' })).toBeEnabled()
  })

  it('won’t roll one quality twice with Divided Psyche', async () => {
    await setup(dividedHero())
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(within(dialog.getByLabelText('Second quality')).getByRole('option', { name: 'Fitness (d10)' })).toBeDisabled()
  })

  it('leaves a mode’s “can’t” actions out of basic actions', async () => {
    await setup(modularHero())
    const section = within(screen.getByRole('region', { name: 'Mode' }))
    await userEvent.selectOptions(section.getByLabelText('Current mode'), 'Improvement Mode')
    expect(section.getByText("Can't Attack or Hinder.")).toBeInTheDocument()
    await userEvent.click(abilities().getByRole('button', { name: 'Basic action…' }))
    const options = within(within(screen.getByRole('dialog')).getByLabelText('Action')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Defend', 'Boost', 'Overcome'])
  })

  it('switches Divided form, rolling two powers in heroic form with Divided Psyche', async () => {
    const store = await setup(dividedHero())
    const section = within(screen.getByRole('region', { name: 'Form' }))
    expect(section.queryByLabelText('Current form')).not.toBeInTheDocument()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    let dialog = within(screen.getByRole('dialog'))
    // Always on the Move names Speed, a power: in civilian form nothing is fixed (ruling 56).
    expect(dialog.queryByRole('group', { name: 'Quality' })).not.toBeInTheDocument()
    expect(dialog.getByLabelText('Quality')).toHaveDisplayValue('Fitness (d10)')
    expect(dialog.getByLabelText('Second quality')).toHaveDisplayValue('Alertness (d8)')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(section.getByRole('radio', { name: 'Heroic' }))
    await waitFor(async () => expect((await saved(store)).play?.dividedForm).toBe('heroic'))
    expect(section.getByText(/two powers/)).toBeInTheDocument()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    dialog = within(screen.getByRole('dialog'))
    // Always on the Move's own power, Speed, is fixed.
    expect(dialog.getByRole('group', { name: 'Power' })).toHaveTextContent('Speed')
    expect(dialog.getByLabelText('Second power')).toHaveDisplayValue('Agility (d10)')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(dialog.getByRole('list', { name: 'Dice rolled' })).toHaveTextContent('Max: 12 (Speed d12)Mid: 10 (Agility d10)Min: 8 (Green status d8)')
  })
})
