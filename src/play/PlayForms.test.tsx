import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { Hero } from '../hero/model'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { dividedHero, dividedSplitHero, formChangerHero, modularBlasterHero, modularHero } from '../test/heroes'
import { PlayPage } from '../components/HeroPage'
import { readable } from '../test/readable'

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
  await screen.findByRole('region', { name: 'Actions' })
  return store
}

const saved = async (store: HeroStore) => {
  const r = await store.get('h1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.hero
}
const abilities = () => within(screen.getByRole('region', { name: 'Actions' }))

describe('forms in play', () => {
  it('changes Form-Changer form from the list, rolling that form’s dice and opening its ability', async () => {
    const store = await setup(formChangerHero())
    const card = within(screen.getByRole('region', { name: 'Form' }))
    const forms = within(card.getByRole('radiogroup', { name: 'Forms' }))
    expect(card.getByText('Base form', { selector: 'strong' })).toBeInTheDocument()
    expect(card.getByText('Uses your base dice.')).toBeInTheDocument()
    expect(abilities().queryByRole('button', { name: 'Use Strong Form' })).not.toBeInTheDocument()
    expect(abilities().getByText('Only in Brute')).toBeInTheDocument()

    await userEvent.click(forms.getByRole('radio', { name: /Brute/ }))
    expect(card.getByText('Brute', { selector: 'strong' })).toBeInTheDocument()
    // Under the list: what this form changes.
    expect(card.getByRole('list', { name: 'Dice changes' })).toHaveTextContent('Strength')
    expect(card.getByText('Not in this form: Flight')).toBeInTheDocument()
    // The Dice card shows the form's dice, marking what it added.
    expect(within(screen.getByRole('region', { name: 'Dice' })).getByText('Strength').closest('li')).toHaveTextContent('added')
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Changed to Brute.')
    await waitFor(async () => expect((await saved(store)).play?.form).toBe('form:0'))

    await userEvent.click(abilities().getByRole('button', { name: 'Use Strong Form' }))
    expect(within(screen.getByRole('dialog')).getByRole('group', { name: 'Power' })).toHaveTextContent('Strength')
  })

  it('lets the hero pick any mode at any time, noting ones that normally need a worse zone', async () => {
    const store = await setup(modularBlasterHero())
    const modes = within(within(screen.getByRole('region', { name: 'Mode' })).getByRole('radiogroup', { name: 'Modes' }))
    const bombardment = modes.getByRole('radio', { name: /Bombardment Mode/ })
    expect(bombardment).toBeEnabled()
    expect(bombardment.closest('label')).toHaveTextContent('Normally needs Yellow')
    await userEvent.click(bombardment)
    await waitFor(async () => expect((await saved(store)).play?.form).toBe('mode:2'))
  })

  it('keeps a Yellow mode’s dice and ability after healing to Green, locking the other Yellow abilities', async () => {
    const hero = modularBlasterHero()
    hero.play = { health: 28, form: 'mode:2', heroPoints: 0, reactionUsed: false, mods: [], twists: [], history: [] }
    await setup(hero)
    const card = screen.getByRole('region', { name: 'Mode' })
    expect(card).toHaveTextContent("You're in the Green zone: Bombardment Mode keeps its dice and its own ability, but your other Yellow abilities are locked.")
    expect(abilities().getByRole('button', { name: 'Use Bombardment' })).toBeEnabled()
    expect(abilities().getByText('Quick Switch', { selector: 'strong' }).closest('li')).toHaveTextContent('Needs Yellow zone')
    expect(within(card).getByText("Can't Boost, Hinder, or Overcome.")).toBeInTheDocument()
  })

  it('offers the mode picker when an ability changes mode, applied on Done and undone with the roll', async () => {
    const store = await setup(modularHero())
    await userEvent.click(abilities().getByRole('button', { name: 'Use Switch' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    const picker = within(dialog.getByRole('group', { name: 'Change mode to' }))
    expect(picker.getByRole('radio', { name: 'Default mode (now)' })).toBeChecked()
    await userEvent.click(picker.getByRole('radio', { name: 'Improvement Mode' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.form).toBe('mode:0'))
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await saved(store)).play?.form).toBeUndefined())
  })

  it('says nothing about zones while Out', async () => {
    const hero = formChangerHero()
    hero.play = { health: 0, heroPoints: 0, reactionUsed: false, mods: [], twists: [], history: [] }
    await setup(hero)
    const card = within(screen.getByRole('region', { name: 'Form' }))
    expect(card.queryByText(/Normally needs/)).not.toBeInTheDocument()
  })

  it('won’t roll one quality twice with Divided Psyche', async () => {
    await setup(dividedHero())
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(within(dialog.getByLabelText('Second quality')).getByRole('option', { name: 'Fitness (d10)' })).toBeDisabled()
  })

  it('leaves a mode’s “can’t” actions out of basic actions', async () => {
    await setup(modularHero())
    const modes = within(screen.getByRole('region', { name: 'Mode' }))
    await userEvent.click(modes.getByRole('radio', { name: /Improvement Mode/ }))
    expect(modes.getByText("Can't Attack or Hinder.")).toBeInTheDocument()
    // Basic actions the mode forbids can't be taken, and say why.
    expect(abilities().getByRole('button', { name: 'Attack' })).toBeDisabled()
    expect(abilities().getByText("Can't Attack in Improvement Mode")).toBeInTheDocument()
    await userEvent.click(abilities().getByRole('button', { name: 'Defend' }))
    const options = within(within(screen.getByRole('dialog')).getByLabelText('Action')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Defend', 'Boost', 'Overcome'])
  })

  it('switches Divided form with a segmented control, rolling two powers in heroic form with Divided Psyche', async () => {
    const store = await setup(dividedHero())
    const card = within(screen.getByRole('region', { name: 'Divided form' }))
    expect(card.getByText(/Controllable: You choose when to change/)).toBeInTheDocument()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    let dialog = within(screen.getByRole('dialog'))
    // Always on the Move names Speed, a power: in civilian form nothing is fixed (ruling 56).
    expect(dialog.queryByRole('group', { name: 'Quality' })).not.toBeInTheDocument()
    expect(dialog.getByLabelText('Quality')).toHaveDisplayValue('Fitness (d10)')
    expect(dialog.getByLabelText('Second quality')).toHaveDisplayValue('Alertness (d8)')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(card.getByRole('button', { name: 'Heroic' }))
    expect(card.getByRole('button', { name: 'Heroic' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => expect((await saved(store)).play?.dividedForm).toBe('heroic'))
    expect(card.getByText(/two powers/)).toBeInTheDocument()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    dialog = within(screen.getByRole('dialog'))
    // Always on the Move's own power, Speed, is fixed.
    expect(dialog.getByRole('group', { name: 'Power' })).toHaveTextContent('Speed')
    expect(dialog.getByLabelText('Second power')).toHaveDisplayValue('Agility (d10)')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(within(dialog.getByRole('list', { name: 'Dice rolled' })).getAllByRole('listitem').map(readable)).toEqual(['Max12d12Speed', 'Mid10d10Agility', 'Min8d8Green status'])
  })

  it('shows each Divided form’s personality and status dice, what it lacks, and flips with Transform', async () => {
    const store = await setup(dividedSplitHero())
    const card = within(screen.getByRole('region', { name: 'Divided form' }))
    expect(card.getByText('Natural Leader')).toBeInTheDocument()
    expect(card.getByText('Not in this form: Vitality, Agility')).toBeInTheDocument()
    // Transform offers the change, applied on Done.
    await userEvent.click(abilities().getByRole('button', { name: 'Use Transform' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(within(dialog.getByRole('group', { name: 'Change to' })).getByRole('radio', { name: 'Heroic form' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Use it' }))
    await waitFor(async () => expect((await saved(store)).play?.dividedForm).toBe('heroic'))
    expect(card.getByText('Naive')).toBeInTheDocument()
    expect(card.getByText('Not in this form: Acrobatics')).toBeInTheDocument()
  })
})
