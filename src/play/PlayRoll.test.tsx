import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { Hero } from '../hero/model'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { completeHero } from '../test/heroes'
import { PlayPage } from '../components/HeroPage'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

// completeHero, rolling the top of every die: Speed d12 12, Fitness d10 10, Green status d8 8.
async function setup(change: (h: Hero) => void = () => {}) {
  const store = new MemoryHeroStore()
  const hero = { ...completeHero(), id: 'h1' }
  change(hero)
  await store.save(hero)
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
const play = (h: Partial<NonNullable<Hero['play']>>) => (hero: Hero) => {
  hero.play = { heroPoints: 0, reactionUsed: false, mods: [], twists: [], history: [], ...h }
}

describe('using abilities', () => {
  it('lists abilities, usable by zone, with inherent ones not usable', async () => {
    await setup()
    expect(abilities().getByRole('button', { name: 'Use Always on the Move' })).toBeEnabled()
    expect(abilities().getByRole('button', { name: 'Use Inflict' })).toBeDisabled()
    expect(abilities().getByRole('button', { name: 'Use Paragon Feat' })).toBeDisabled()
    expect(abilities().getByRole('button', { name: 'Use Out ability' })).toBeDisabled()
    expect(abilities().queryByRole('button', { name: 'Use Immunity' })).not.toBeInTheDocument()
    // Each ability's text shows in the list.
    expect(abilities().getByText(/Attack using Fire\. Hinder that same target/)).toBeInTheDocument()
  })

  it('opens the Out ability, and only it, when Out', async () => {
    await setup(play({ health: 0 }))
    expect(abilities().getByRole('button', { name: 'Use Out ability' })).toBeEnabled()
    expect(abilities().getByRole('button', { name: 'Use Always on the Move' })).toBeDisabled()
    expect(abilities().getByRole('button', { name: 'Basic action…' })).toBeDisabled()
  })

  it('rolls an ability: its dice, effects, and the history', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Always on the Move' }))
    // Its own power, fixed as text; the best quality, which the player can change; and the Green status die.
    const power = dialog.getByRole('group', { name: 'Power' })
    expect(power).toHaveTextContent('Speed')
    expect(within(power).getByRole('img', { name: 'd12' })).toBeInTheDocument()
    expect(dialog.queryByRole('combobox', { name: 'Power' })).not.toBeInTheDocument()
    expect(dialog.getByLabelText('Quality')).toHaveDisplayValue('Fitness (d10)')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(dialog.getByRole('list', { name: 'Dice rolled' })).toHaveTextContent('Max: 12 (Speed d12)Mid: 10 (Fitness d10)Min: 8 (Green status d8)')
    expect(dialog.getByText('Deal 10 (Mid) damage.')).toBeInTheDocument()
    expect(dialog.getByText('Defend 8 (Min).')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(async () =>
      expect((await saved(store)).play?.history.at(-1)).toMatchObject({
        text: 'Used ability Always on the Move:',
        details: ['Max: 12 (Speed d12)', 'Mid: 10 (Fitness d10)', 'Min: 8 (Green status d8)', 'Deal 10 (Mid) damage.', 'Defend 8 (Min).'],
      }),
    )
  })

  it('applies chosen mods to an effect, and uses up one-time ones', async () => {
    const store = await setup(play({ mods: [{ id: 'p', label: 'tied up', value: -3 }, { id: 'b', label: 'cheer', value: 1 }, { id: 'x', label: 'focus', value: 2, exclusive: true }] }))
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    // The penalty starts checked, the one-time bonus doesn't; the exclusive bonus is picked.
    expect(dialog.getByRole('checkbox', { name: "'-3 tied up' penalty" })).toBeChecked()
    expect(dialog.getByRole('checkbox', { name: "'+1 cheer' bonus" })).not.toBeChecked()
    expect(dialog.getByRole('radio', { name: "'+2 focus' bonus (exclusive)" })).toBeChecked()
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    // Both mods start on the larger effect (Attack 10); move the penalty to Defend.
    expect(dialog.getByText('Deal 9 (Mid, with -3 +2) damage.')).toBeInTheDocument()
    // Dragging; on touch screens the polyfill turns touch drags into these events.
    const chip = dialog.getByText("'-3 tied up' penalty")
    let dragged = ''
    fireEvent.dragStart(chip, { dataTransfer: { setData: (_: string, v: string) => (dragged = v) } })
    fireEvent.drop(dialog.getByRole('group', { name: 'Defend (Min)' }), { dataTransfer: { getData: () => dragged } })
    expect(dialog.queryByRole('combobox')).not.toBeInTheDocument()
    expect(dialog.getByText('Deal 12 (Mid, with +2) damage.')).toBeInTheDocument()
    expect(dialog.getByText('Defend 5 (Min, with -3).')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await waitFor(async () => expect((await saved(store)).play?.mods.map((m) => m.id)).toEqual(['b']))
  })

  it('takes real dice typed in', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Enter my own roll' }))
    const [a, b, c] = dialog.getAllByRole('spinbutton')
    await userEvent.type(a!, '3')
    await userEvent.type(b!, '9')
    await userEvent.type(c!, '5')
    await userEvent.click(dialog.getByRole('button', { name: 'Use these results' }))
    expect(dialog.getByText('Deal 5 (Mid) damage.')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await waitFor(async () => expect((await saved(store)).play?.history.at(-1)?.details?.[0]).toBe('Max: 9 (Fitness d10) (typed in)'))
  })

  it('offers to add the bonus a Boost makes, and marks a reaction used', async () => {
    const store = await setup(play({ health: 0 }))
    // The Out ability: "Boost an ally by rolling your single Fitness die." rolls 10: a +3 bonus.
    await userEvent.click(abilities().getByRole('button', { name: 'Use Out ability' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.queryByText('Power')).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(dialog.getByText('Boost 10 (single die): a +3 bonus.')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    const offer = within(dialog.getByRole('group', { name: 'Add the +3 bonus to the mods list?' }))
    await userEvent.clear(offer.getByLabelText('What it is'))
    await userEvent.type(offer.getByLabelText('What it is'), 'rallied')
    await userEvent.click(offer.getByRole('checkbox', { name: 'Persistent' }))
    await userEvent.click(offer.getByRole('button', { name: 'Add +3 bonus' }))
    expect(offer.getByRole('button', { name: 'Added' })).toBeDisabled()
    await waitFor(async () => expect((await saved(store)).play?.mods).toEqual([{ id: expect.any(String), label: 'rallied', value: 3, persistent: true }]))
  })

  it('takes a basic action without an ability', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Basic action…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Basic action' }))
    await userEvent.selectOptions(dialog.getByLabelText('Action'), 'Overcome')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(dialog.getByText('Overcome 10 (Mid): Full success.')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await waitFor(async () => expect((await saved(store)).play?.history.at(-1)?.text).toBe('Took a basic action (Overcome):'))
  })

  it('keeps focus where the player is when the page re-renders, and returns it on close', async () => {
    await setup()
    const use = abilities().getByRole('button', { name: 'Use Always on the Move' })
    await userEvent.click(use)
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('heading', { name: 'Always on the Move' })).toHaveFocus()
    await userEvent.click(dialog.getByRole('button', { name: 'Enter my own roll' }))
    const first = dialog.getAllByRole('spinbutton')[0]!
    await userEvent.click(first)
    // A change elsewhere re-renders the page while the dialog is open.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Reaction used this round' }))
    await userEvent.click(first)
    await userEvent.type(first, '4')
    expect(first).toHaveFocus()
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(use).toHaveFocus()
  })

  it('uses an ability with no effects without rolling', async () => {
    const store = await setup((h) => {
      h.personality = { ...h.personality!, id: 'apathetic' }
      play({ health: 0 })(h)
    })
    await userEvent.click(abilities().getByRole('button', { name: 'Use Out ability' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('This ability doesn’t roll anything.')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Use it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).play?.history.at(-1)?.text).toBe('Used ability Out ability.'))
  })

  it('won’t use a reaction twice in a round', async () => {
    await setup((h) => {
      h.redAbilities = [{ source: 'red', name: 'Reactive Strike', category: 'power:athletic', uses: [{ kind: 'power', id: 'agility' }] }]
      play({ health: 5, reactionUsed: true })(h)
    })
    expect(abilities().getByRole('button', { name: 'Use Reactive Strike' })).toBeDisabled()
    expect(abilities().getByText('Reaction used this round')).toBeInTheDocument()
  })

  it('closes on Escape without recording anything', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await saved(store)).play).toBeUndefined()
  })
})
