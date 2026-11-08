import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlayState } from '../hero/model'
import { PlayProviders } from '../test/play'
import { playStores, savedHero, seedHero, type HeroWithPlay, type PlayStores } from '../test/play-stores'
import { describe, expect, it } from 'vitest'
import { completeHero, dividedHero } from '../test/heroes'
import { readable } from '../test/readable'
import { PlayPage } from '../components/HeroPage'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

// completeHero, rolling the top of every die: Speed d12 12, Fitness d10 10, Green status d8 8.
async function setup(change: (h: HeroWithPlay) => void = () => {}) {
  const store = playStores()
  const hero = { ...completeHero(), id: 'h1' }
  change(hero)
  await seedHero(store, hero)
  render(
    <PlayProviders stores={store}>
      <PlayPage id="h1" clock={clock} random={() => 0.999} />
    </PlayProviders>,
  )
  await screen.findByRole('region', { name: 'Actions' })
  return store
}

const saved = (store: PlayStores) => savedHero(store, 'h1')
const abilities = () => within(screen.getByRole('region', { name: 'Actions' }))
/** An ability's row in its band. */
const row = (name: string) => abilities().getByText(name, { selector: 'strong' }).closest('li')!
const play = (h: Partial<PlayState>) => (hero: HeroWithPlay) => {
  hero.play = { reactionUsed: false, mods: [], twists: [], history: [], ...h }
}

describe('using abilities', () => {
  it('lists abilities, usable by zone, with inherent ones not usable', async () => {
    await setup()
    expect(abilities().getByRole('button', { name: 'Use Always on the Move' })).toBeEnabled()
    // An ability that can't be used shows why in place of Use, faded.
    expect(abilities().queryByRole('button', { name: 'Use Inflict' })).not.toBeInTheDocument()
    expect(row('Inflict')).toHaveTextContent('Needs Yellow zone')
    expect(row('Inflict')).toHaveClass('play-row--blocked')
    expect(row('Paragon Feat')).toHaveTextContent('Needs Red zone')
    expect(row('Out ability')).toHaveTextContent("When you're Out")
    expect(abilities().queryByRole('button', { name: 'Use Immunity' })).not.toBeInTheDocument()
    expect(row('Immunity')).toHaveTextContent('Always on')
    expect(row('Immunity')).not.toHaveClass('play-row--blocked')
    // Each ability's text shows in the list.
    expect(row('Inflict')).toHaveTextContent(/Attack using Fire\. ?Hinder that same target/)
  })

  it('opens the Out ability, and only it, when Out', async () => {
    await setup(play({ health: 0 }))
    expect(abilities().getByRole('button', { name: 'Use Out ability' })).toBeEnabled()
    expect(row('Always on the Move')).toHaveTextContent("You're Out")
    expect(abilities().getByRole('button', { name: 'Attack' })).toBeDisabled()
    expect(abilities().getByText("You're Out", { selector: 'p' })).toBeInTheDocument()
  })

  it('rolls an ability in three steps: dice and mods, results, then what to tell the table', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Always on the Move' }))
    expect(dialog.getByRole('listitem', { current: 'step' })).toHaveTextContent('Dice and mods')
    // Its own power, set by the ability; the best quality, which the player can change; and the Green status die.
    const power = dialog.getByRole('group', { name: 'Power' })
    expect(power).toHaveTextContent('Speed set by the ability')
    expect(within(power).getByRole('img', { name: 'd12' })).toBeInTheDocument()
    expect(dialog.queryByRole('combobox', { name: 'Power' })).not.toBeInTheDocument()
    expect(dialog.getByLabelText('Quality')).toHaveDisplayValue('Fitness (d10)')
    expect(within(dialog.getByLabelText('Quality')).getByRole('option', { name: 'Take a d4' })).toBeInTheDocument()
    expect(dialog.getByRole('group', { name: 'Status' })).toHaveTextContent('Green status')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))

    // Results: the dice sorted Max, Mid, Min with their sources, and a card per effect.
    expect(dialog.getByRole('listitem', { current: 'step' })).toHaveTextContent('Results')
    expect(within(dialog.getByRole('list', { name: 'Dice rolled' })).getAllByRole('listitem').map(readable)).toEqual(['Max12d12Speed', 'Mid10d10Fitness', 'Min8d8Green status'])
    const attack = dialog.getByRole('group', { name: 'Attack (Mid)' })
    expect(attack).toHaveTextContent('Uses Mid (10)')
    expect(attack.querySelector('.roll-effect-card__total')).toHaveTextContent('10')
    expect(dialog.getByRole('group', { name: 'Defend (Min)' })).toHaveTextContent('Uses Min (8)')
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))

    // Resolve: one line per effect for the table.
    expect(dialog.getByText('Deal 10 (Mid) damage.')).toBeInTheDocument()
    expect(dialog.getByText('Defend 8 (Min).')).toBeInTheDocument()
    // The Defend protects the hero unless it's for no one in the app; an Attack picks no target here.
    expect(dialog.getByLabelText('Protect')).toHaveDisplayValue('Unnamed hero (you)')
    expect(dialog.queryByLabelText('Target')).not.toBeInTheDocument()
    // Nothing is recorded until Done.
    expect((await saved(store)).play).toBeUndefined()
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(async () =>
      expect((await saved(store)).play?.history.slice(-2)).toMatchObject([
        {
          text: 'Used ability Always on the Move:',
          details: ['Max: 12 (Speed d12)', 'Mid: 10 (Fitness d10)', 'Min: 8 (Green status d8)', 'Deal 10 (Mid) damage.', 'Defend 8 (Min).'],
        },
        { text: 'Gained a defense: Defend 8.' },
      ]),
    )
    expect((await saved(store)).play?.defenses).toMatchObject([{ value: 8 }])
    expect(screen.getByRole('status')).toHaveTextContent('Roll recorded.')
  })

  it('starts with only penalties checked, keeps one exclusive of each sign, and moves mods between effects', async () => {
    const store = await setup(
      play({
        mods: [
          { id: 'p', label: 'tied up', value: -3 },
          { id: 'b', label: 'cheer', value: 1 },
          { id: 'x', label: 'focus', value: 2, exclusive: true },
          { id: 'y', label: 'high ground', value: 1, exclusive: true },
        ],
      }),
    )
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    const box = (label: string) => dialog.getByText(label).closest('label')!.querySelector('input')!
    // Penalties checked; bonuses, exclusive or not, aren't.
    expect(box('tied up')).toBeChecked()
    expect(box('cheer')).not.toBeChecked()
    expect(box('focus')).not.toBeChecked()
    // Checking an exclusive bonus unchecks the other.
    await userEvent.click(box('high ground'))
    await userEvent.click(box('focus'))
    expect(box('focus')).toBeChecked()
    expect(box('high ground')).not.toBeChecked()
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    // Mods start on the first effect (Attack 10): 10 − 3 + 2.
    const total = (name: string) => dialog.getByRole('group', { name }).querySelector('.roll-effect-card__total')!.textContent
    expect(total('Attack (Mid)')).toBe('9')
    // Move the penalty to Defend with its menu.
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Move tied up' }), 'Move to Defend')
    expect(total('Attack (Mid)')).toBe('12')
    expect(total('Defend (Min)')).toBe('5')
    // Or drag it; on touch screens the polyfill turns touch drags into these events.
    const chip = within(dialog.getByRole('list', { name: 'Mods on Defend' })).getByText('tied up')
    let dragged = ''
    fireEvent.dragStart(chip.closest('li')!, { dataTransfer: { setData: (_: string, v: string) => (dragged = v) } })
    fireEvent.drop(dialog.getByRole('group', { name: 'Attack (Mid)' }), { dataTransfer: { getData: () => dragged } })
    expect(total('Attack (Mid)')).toBe('9')
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    // The one-time mods it used are used up; the toast says which, and Undo puts everything back.
    await waitFor(async () => expect((await saved(store)).play?.mods.map((m) => m.id)).toEqual(['b', 'y']))
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Roll recorded. Used up: tied up, focus.')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await saved(store)).play?.mods.map((m) => m.id).sort()).toEqual(['b', 'p', 'x', 'y']))
    expect((await saved(store)).play?.history).toEqual([])
  })

  describe("a principle's hero point", () => {
    const toResolve = async () => {
      await userEvent.click(abilities().getByRole('button', { name: 'Use Principle of the Gearhead' }))
      const dialog = within(screen.getByRole('dialog', { name: 'Principle of the Gearhead' }))
      await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
      await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
      return dialog
    }

    it('adds to the solo count when taken, and Undo takes it back', async () => {
      const store = await setup((h) => {
        h.heroPoints = 1
        h.play = { reactionUsed: false, mods: [], twists: [], history: [] }
      })
      const dialog = await toResolve()
      expect(dialog.getByText('This ability gains a hero point. You have 1.')).toBeInTheDocument()
      await userEvent.click(dialog.getByRole('button', { name: 'Gain a hero point' }))
      expect(dialog.getByText('Will gain a hero point when done.')).toBeInTheDocument()
      await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
      await waitFor(async () => expect((await saved(store)).heroPoints).toBe(2))
      expect((await saved(store)).play!.history.map((h) => h.text)).toContain('Gained a hero point (now 2).')
      await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
      await waitFor(async () => expect((await saved(store)).heroPoints).toBe(1))
      expect((await saved(store)).play!.history).toEqual([])
    })

    it("isn't added unless taken, and isn't offered past five", async () => {
      const store = await setup((h) => {
        h.heroPoints = 5
        h.play = { reactionUsed: false, mods: [], twists: [], history: [] }
      })
      const dialog = await toResolve()
      expect(dialog.getByText('This ability gains a hero point, but you already have 5.')).toBeInTheDocument()
      expect(dialog.queryByRole('button', { name: 'Gain a hero point' })).not.toBeInTheDocument()
      await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
      await waitFor(async () => expect((await saved(store)).play!.history.length).toBeGreaterThan(0))
      expect((await saved(store)).heroPoints).toBe(5)
    })
  })

  it('gives no defense for a Defend with no target in the app', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Defend' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    // Only the hero is listed: minions take no hits in solo play.
    expect(within(dialog.getByLabelText('Protect')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Unnamed hero (you)', 'No target'])
    await userEvent.selectOptions(dialog.getByLabelText('Protect'), 'No target')
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.history.at(-1)?.text).toBe('Took a basic action (Defend):'))
    expect((await saved(store)).play).not.toHaveProperty('defenses')
  })

  it('changes nothing when cancelled at any step, or closed with Escape', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await saved(store)).play).toBeUndefined()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    let dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await saved(store)).play).toBeUndefined()
    // Back from Results goes to the dice again.
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }))
    expect(dialog.getByRole('button', { name: 'Roll' })).toBeInTheDocument()
  })

  it('takes real dice from the pad, with Enter my own roll', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Enter my own roll' }))
    const pad = within(dialog.getByRole('group', { name: 'Number pad' }))
    for (const n of ['3', '9', '5']) await userEvent.click(pad.getByRole('button', { name: n }))
    await userEvent.click(dialog.getByRole('button', { name: 'Accept' }))
    expect(dialog.getByRole('group', { name: 'Attack (Mid)' })).toHaveTextContent('Uses Mid (5)')
    expect(within(dialog.getByRole('list', { name: 'Dice rolled' })).getAllByText('Entered')).toHaveLength(3)
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.history.find((h) => h.details)?.details?.[0]).toBe('Rolled 9, 5, 3 (physical dice).'))
  })

  it('goes back to Roll when the pad is cancelled, by button or Escape, with nothing changed', async () => {
    await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Enter my own roll' }))
    // Focus goes to the keys, and back to the button that opened them.
    expect(within(dialog.getByRole('group', { name: 'Number pad' })).getByRole('button', { name: '1' })).toHaveFocus()
    await userEvent.click(within(dialog.getByRole('group', { name: 'Number pad' })).getByRole('button', { name: '3' }))
    await userEvent.keyboard('{Escape}')
    expect(dialog.getByRole('button', { name: 'Roll' })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Enter my own roll' })).toHaveFocus()
    await userEvent.click(dialog.getByRole('button', { name: 'Enter my own roll' }))
    expect(dialog.getByRole('list', { name: 'Entered numbers, 0 of 3' })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Roll for me' })).toBeInTheDocument()
    const buttons = dialog.getAllByRole('button', { name: 'Cancel' })
    await userEvent.click(buttons.at(-1)!)
    expect(dialog.getByRole('button', { name: 'Roll' })).toBeInTheDocument()
  })

  it('offers to add the bonus a Boost makes when done, and marks a reaction used', async () => {
    const store = await setup(play({ health: 0 }))
    // The Out ability: "Boost an ally by rolling your single Fitness die." rolls 10: a +3 bonus.
    await userEvent.click(abilities().getByRole('button', { name: 'Use Out ability' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('group', { name: 'Single die' })).toHaveTextContent('Fitness')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(dialog.getByRole('group', { name: 'Boost (single die)' })).toHaveTextContent('Makes a +3 bonus')
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    expect(dialog.getByText('Boost 10 (single die): a +3 bonus.')).toBeInTheDocument()
    const offer = within(dialog.getByRole('group', { name: 'Add the +3 bonus to the mods list?' }))
    await userEvent.clear(offer.getByLabelText('What it is'))
    await userEvent.type(offer.getByLabelText('What it is'), 'rallied')
    await userEvent.click(offer.getByRole('checkbox', { name: 'Persistent' }))
    await userEvent.click(offer.getByRole('button', { name: 'Add +3 bonus' }))
    expect(dialog.getByRole('group', { name: 'Add the +3 bonus to the mods list?' })).toHaveTextContent("Will add '+3 rallied' bonus (persistent) when done.")
    expect((await saved(store)).play?.mods).toEqual([])
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.mods).toEqual([{ id: expect.any(String), label: 'rallied', value: 3, persistent: true }]))
  })

  it('lets a chosen follow-up be changed, and drops it on going back to the results', async () => {
    const store = await setup(play({ health: 0 }))
    await userEvent.click(abilities().getByRole('button', { name: 'Use Out ability' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    const offer = () => within(dialog.getByRole('group', { name: 'Add the +3 bonus to the mods list?' }))
    await userEvent.click(offer().getByRole('button', { name: 'Add +3 bonus' }))
    await userEvent.click(offer().getByRole('button', { name: 'Change' }))
    expect(offer().getByRole('button', { name: 'Add +3 bonus' })).toBeInTheDocument()
    // Focus goes to the offer's first field, not the page.
    await waitFor(() => expect(offer().getByLabelText('What it is')).toHaveFocus())
    await userEvent.click(offer().getByRole('button', { name: 'Add +3 bonus' }))
    // Back to the results (which could change the bonus): the choice is made again.
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    expect(offer().getByRole('button', { name: 'Add +3 bonus' })).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.history.at(-1)?.text).toBe('Used ability Out ability:'))
    expect((await saved(store)).play?.mods).toEqual([])
  })

  it('offers "Take a d4" in place of a power or quality, more than once', async () => {
    await setup((h) => {
      // Divided Psyche: two qualities in civilian form.
      Object.assign(h, { ...dividedHero(), id: h.id })
    })
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.selectOptions(dialog.getByLabelText('Quality'), 'Take a d4')
    await userEvent.selectOptions(dialog.getByLabelText('Second quality'), 'Take a d4')
    // A quality can't go in both slots; a d4 can.
    expect(within(dialog.getByLabelText('Quality')).getByRole('option', { name: 'Fitness (d10)' })).toBeEnabled()
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(within(dialog.getByRole('list', { name: 'Dice rolled' })).getAllByRole('listitem').map(readable)).toEqual(['Max8d8Green status', 'Mid4d4d4', 'Min4d4d4'])
  })

  it('moves focus to the heading on each step, and cancels from the first', async () => {
    const store = await setup()
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    const heading = dialog.getByRole('heading', { name: 'Always on the Move' })
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(heading).toHaveFocus()
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await saved(store)).play).toBeUndefined()
  })

  it('takes a basic action without an ability', async () => {
    const store = await setup()
    // Each basic action opens the roll with it chosen.
    await userEvent.click(abilities().getByRole('button', { name: 'Overcome' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Basic action' }))
    expect(dialog.getByLabelText('Action')).toHaveDisplayValue('Overcome')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    expect(dialog.getByText('Overcome 10 (Mid): Full success.')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await saved(store)).play?.history.at(-1)?.text).toBe('Took a basic action (Overcome):'))
  })

  it('keeps focus where the player is when the page re-renders, and returns it on close', async () => {
    await setup()
    const use = abilities().getByRole('button', { name: 'Use Always on the Move' })
    await userEvent.click(use)
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('heading', { name: 'Always on the Move' })).toHaveFocus()
    const first = dialog.getByLabelText('Quality')
    await userEvent.click(first)
    // A change elsewhere re-renders the page while the dialog is open.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Reaction used this round' }))
    first.focus()
    await userEvent.selectOptions(first, 'Take a d4')
    expect(first).toHaveFocus()
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

  it('notes a used reaction on Reaction rows without blocking them', async () => {
    await setup((h) => {
      h.redAbilities = [{ source: 'red', name: 'Reactive Strike', category: 'power:athletic', uses: [{ kind: 'power', id: 'agility' }] }]
      play({ health: 5, reactionUsed: true })(h)
    })
    expect(screen.getByRole('checkbox', { name: 'Reaction used this round' })).toBeChecked()
    // Noted on Reaction rows, never blocked.
    expect(abilities().getByRole('button', { name: 'Use Reactive Strike' })).toBeEnabled()
    expect(row('Reactive Strike')).toHaveTextContent('Reaction used this round')
    expect(row('Always on the Move')).not.toHaveTextContent('Reaction used this round')
  })

  it('shows the latest roll as a card above the rest of the history', async () => {
    await setup(
      play({
        history: [
          { id: 'a', at: '2026-10-29T10:00:00.000Z', text: 'Used ability Inflict:', details: ['Max: 7 (Speed d12)', 'Deal 7 damage.'], roll: true },
          { id: 'b', at: '2026-10-29T10:01:00.000Z', text: 'Gained a hero point (now 1).' },
          { id: 'c', at: '2026-10-29T10:02:00.000Z', text: 'Added Drone (d8).' },
        ],
      }),
    )
    const history = within(screen.getByRole('region', { name: 'History' }))
    const latest = history.getByLabelText('Latest roll')
    expect(latest).toHaveTextContent('Used ability Inflict:')
    expect(latest).toHaveTextContent('Max: 7 (Speed')
    expect(latest).toHaveTextContent('Deal 7 damage.')
    // Effect lines carry their action's icon; the dice line doesn't.
    expect(within(latest).getByRole('img', { name: 'Attack' }).closest('li')).toHaveTextContent('Deal 7 damage.')
    expect(within(latest).getAllByRole('listitem')[0]!.querySelector('.action-icon')).toBeNull()
    // The rest, newest first, without the roll again.
    const rest = history.getByRole('list', { name: 'Earlier' }).querySelectorAll(':scope > li')
    expect([...rest].map((li) => li.textContent)).toEqual([expect.stringContaining('Added Drone'), expect.stringContaining('Gained a hero point (now 1).')])
    // Dice in the history show as their icons.
    expect(within(rest[0] as HTMLElement).getByRole('img', { name: 'd8' })).toBeInTheDocument()
  })
})

describe('rolling by keyboard', () => {
  it('Enter rolls and steps through, and Ctrl/Cmd + Z undoes the roll while its toast shows', async () => {
    const store = await setup(play({}))
    await userEvent.click(abilities().getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    // Focus starts on the heading: Enter rolls, then confirms, then is done.
    await userEvent.keyboard('{Enter}')
    expect(dialog.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    // Enter on a button does what that button says: Back goes back.
    dialog.getByRole('button', { name: 'Back' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(dialog.getByRole('button', { name: 'Roll' })).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Enter}')
    expect(dialog.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).play?.history).not.toEqual([]))
    await userEvent.keyboard('{Control>}z{/Control}')
    await waitFor(async () => expect((await saved(store)).play?.history).toEqual([]))
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    // With no toast, nothing to undo.
    await userEvent.keyboard('{Meta>}z{/Meta}')
    expect((await saved(store)).play?.history).toEqual([])
  })
})
