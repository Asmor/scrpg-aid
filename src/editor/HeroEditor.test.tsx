import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import { createHero, type Hero } from '../hero/model'
import { A, P, Q, heroWithAbilities } from '../test/heroes'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { backgrounds } from '../rules/data'
import { tableOptions } from '../rules/rolling'
import { HeroEditor } from './HeroEditor'

const renderEditor = (store: HeroStore, step?: string, id = 'h1') =>
  render(
    <StoreContext.Provider value={store}>
      <HeroEditor id={id} step={step} />
    </StoreContext.Provider>,
  )

async function storeWith(change: (h: Hero) => void = () => {}) {
  const store = new MemoryHeroStore()
  const hero = createHero('guided', { id: 'h1' })
  change(hero)
  await store.save(hero)
  return store
}

const saved = async (store: HeroStore) => {
  const result = await store.get('h1')
  if (result.status !== 'found') throw new Error('not saved')
  return result.hero
}

describe('HeroEditor', () => {
  it('says when the hero is missing', async () => {
    renderEditor(new MemoryHeroStore(), undefined, 'nobody')
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved hero with that link.")
  })

  it('edits details and the creation method, saving each change', async () => {
    const store = await storeWith()
    renderEditor(store, 'details')
    await userEvent.type(await screen.findByLabelText('Hero name'), 'Nova')
    expect(screen.getByRole('heading', { level: 2, name: 'Nova' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Costume / equipment'), 'Star cape')
    await userEvent.click(screen.getByRole('radio', { name: /Constructed/ }))
    await waitFor(async () => {
      const hero = await saved(store)
      expect(hero.details.name).toBe('Nova')
      expect(hero.details.costume).toBe('Star cape')
      expect(hero.method).toBe('constructed')
    })
  })

  it('navigates between steps, with each step’s issue count', async () => {
    const store = await storeWith((h) => {
      h.background = { id: 'upper-class', qualities: [] }
    })
    renderEditor(store, 'background')
    const nav = await screen.findByRole('navigation', { name: 'Creation steps' })
    const current = within(nav).getByRole('link', { current: 'step' })
    expect(current).toHaveTextContent('Background')
    expect(current).toHaveTextContent(/issues?/)
    expect(within(nav).getByRole('link', { name: /Details/ })).toHaveAttribute('href', '#/hero/h1/edit/details')
    expect(screen.getByRole('link', { name: 'Power source →' })).toHaveAttribute('href', '#/hero/h1/edit/power-source')
    expect(screen.getByRole('link', { name: '← Details' })).toBeInTheDocument()
  })

  it('shows unbuilt steps as coming later, and the last step leads to the sheet', async () => {
    renderEditor(await storeWith(), 'health')
    expect(await screen.findByText(/This step isn't built yet/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'View sheet' }).at(-1)).toHaveAttribute('href', '#/hero/h1')
  })

  it('falls back to the first step for an unknown step', async () => {
    renderEditor(await storeWith(), 'nope')
    expect(await screen.findByRole('heading', { level: 3, name: 'Details' })).toBeInTheDocument()
  })

  it('builds a background the constructed way, with no issues left', async () => {
    const store = await storeWith((h) => {
      h.method = 'constructed'
    })
    renderEditor(store, 'background')
    await userEvent.click(await screen.findByRole('radio', { name: /Upper Class/ }))
    await userEvent.selectOptions(screen.getByLabelText('d10'), 'Fitness')
    await userEvent.selectOptions(screen.getByLabelText('d8'), 'Persuasion')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Principle of Responsibility' }), 'Principle of Business')
    expect(await screen.findByText('No rule issues so far.')).toBeInTheDocument()
    await waitFor(async () =>
      expect((await saved(store)).background).toEqual({
        id: 'upper-class',
        qualities: [
          { trait: { kind: 'quality', id: 'fitness' }, die: 'd10' },
          { trait: { kind: 'quality', id: 'persuasion' }, die: 'd8' },
        ],
        principle: { id: 'business' },
      }),
    )
  })

  it('rolls for a background the guided way, with one reroll', async () => {
    const store = await storeWith()
    renderEditor(store, 'background')
    expect(await screen.findByRole('button', { name: 'Roll d10 and d10' })).toBeInTheDocument()
    // Typed-in rolls: a d10's 0 counts as 10.
    await userEvent.click(screen.getByRole('button', { name: 'Enter my own roll' }))
    const [first, second] = screen.getAllByRole('spinbutton')
    await userEvent.type(first!, '1')
    await userEvent.type(second!, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(screen.getByText(/You rolled/)).toHaveTextContent('You rolled 1 and 10 on d10 and d10 (typed in).')

    const reachable = tableOptions(backgrounds, [1, 10]).map((o) => o.entry.name)
    const radios = screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent)
    expect(radios).toHaveLength(reachable.length)
    reachable.forEach((name, i) => expect(radios[i]).toContain(name))

    // Bad typed-in values are explained.
    await userEvent.click(screen.getByRole('button', { name: 'Enter my own reroll' }))
    const [a, b] = screen.getAllByRole('spinbutton')
    await userEvent.type(a!, '11')
    await userEvent.type(b!, '2')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(screen.getByRole('alert')).toHaveTextContent("A d10 can't roll 11.")
    await userEvent.clear(a!)
    await userEvent.type(a!, '3')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(screen.getByText(/You rolled/)).toHaveTextContent('after using your reroll')
    expect(screen.queryByRole('button', { name: 'Reroll' })).not.toBeInTheDocument()

    // The roll is saved with the chosen background.
    await userEvent.click(screen.getAllByRole('radio')[0]!)
    await waitFor(async () => expect((await saved(store)).background?.roll).toEqual({ dice: ['d10', 'd10'], results: [3, 2], manual: true, rerolled: true }))
  })

  it('keeps earlier choices when switching background, flagging the ones that no longer fit', async () => {
    const store = await storeWith((h) => {
      h.method = 'constructed'
      h.background = {
        id: 'upper-class',
        qualities: [
          { trait: { kind: 'quality', id: 'fitness' }, die: 'd10' },
          { trait: { kind: 'quality', id: 'persuasion' }, die: 'd8' },
        ],
        principle: { id: 'business' },
      }
    })
    renderEditor(store, 'background')
    expect(await screen.findByText('No rule issues so far.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Adventurer/ }))
    // Persuasion isn't on Adventurer's list, but it's kept and offered as the current choice.
    expect(screen.getByLabelText('d8')).toHaveDisplayValue('Persuasion (not on this list)')
    expect(screen.getByRole('region', { name: 'Rule issues in this step' })).toBeInTheDocument()
    await waitFor(async () =>
      expect((await saved(store)).background).toEqual({
        id: 'adventurer',
        qualities: [
          { trait: { kind: 'quality', id: 'fitness' }, die: 'd10' },
          { trait: { kind: 'quality', id: 'persuasion' }, die: 'd8' },
        ],
        principle: { id: 'business' },
      }),
    )
  })

  it('saves a reroll made after choosing a background', async () => {
    const store = await storeWith((h) => {
      h.background = { id: 'upper-class', qualities: [], roll: { dice: ['d10', 'd10'], results: [1, 5], manual: false, rerolled: false } }
    })
    renderEditor(store, 'background')
    await userEvent.click(await screen.findByRole('button', { name: 'Enter my own reroll' }))
    const [a, b] = screen.getAllByRole('spinbutton')
    await userEvent.type(a!, '4')
    await userEvent.type(b!, '6')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    await waitFor(async () => expect((await saved(store)).background).toEqual({ id: 'upper-class', qualities: [], roll: { dice: ['d10', 'd10'], results: [4, 6], manual: true, rerolled: true } }))
    // Upper Class (1) isn't reached by 4 and 6 any more, so it's flagged as the current choice.
    expect(screen.getByRole('radio', { name: /Upper Class.*not reached by this roll/ })).toBeChecked()
  })

  it('labels the current choice plainly when a guided hero has no roll yet', async () => {
    renderEditor(
      await storeWith((h) => {
        h.background = { id: 'upper-class', qualities: [] }
      }),
      'background',
    )
    const label = (await screen.findByRole('radio', { checked: true })).closest('label')!
    expect(label).toHaveTextContent('Upper Class (your current choice)')
    expect(label).not.toHaveTextContent('not reached')
  })

  it('tells apart dice of the same size', async () => {
    renderEditor(
      await storeWith((h) => {
        h.background = { id: 'struggling', qualities: [] }
      }),
      'background',
    )
    expect(await screen.findByLabelText('d8')).toBeInTheDocument()
    // The number is part of what a screen reader announces, with its space.
    expect(screen.getByRole('combobox', { name: 'd6 #1' })).not.toBe(screen.getByRole('combobox', { name: 'd6 #2' }))
  })

  it('keeps a roll made before choosing, so leaving the step doesn’t give a fresh one', async () => {
    const store = await storeWith()
    const view = renderEditor(store, 'background')
    await userEvent.click(await screen.findByRole('button', { name: 'Roll d10 and d10' }))
    await waitFor(async () => expect((await saved(store)).pendingRolls?.background).toMatchObject({ dice: ['d10', 'd10'], manual: false }))
    const { results } = (await saved(store)).pendingRolls!.background!
    view.unmount()

    renderEditor(store, 'background')
    expect(await screen.findByText(/You rolled/)).toHaveTextContent(`You rolled ${results[0]} and ${results[1]}`)
    expect(screen.queryByRole('button', { name: 'Roll d10 and d10' })).not.toBeInTheDocument()
    // Choosing moves the roll onto the choice.
    await userEvent.click(screen.getAllByRole('radio')[0]!)
    await waitFor(async () => {
      const hero = await saved(store)
      expect(hero.background?.roll?.results).toEqual(results)
      expect(hero.pendingRolls).toBeUndefined()
    })
  })

  it('rolls in the app too', async () => {
    const store = await storeWith()
    renderEditor(store, 'background')
    await userEvent.click(await screen.findByRole('button', { name: 'Roll d10 and d10' }))
    expect(screen.getByText(/You rolled/)).not.toHaveTextContent('typed in')
    expect(screen.getByRole('button', { name: 'Reroll' })).toBeInTheDocument()
  })

  it('asks for a background before rolling for a power source', async () => {
    renderEditor(await storeWith(), 'power-source')
    expect(await screen.findByText(/Choose a background first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Roll/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('builds a power source the constructed way: powers, abilities, and bonus, with no issues left', async () => {
    const store = await storeWith((h) => {
      h.method = 'constructed'
      h.background = { id: 'upper-class', qualities: [{ trait: { kind: 'quality', id: 'fitness' }, die: 'd10' }, { trait: { kind: 'quality', id: 'persuasion' }, die: 'd8' }], principle: { id: 'business' } }
    })
    renderEditor(store, 'power-source')
    await userEvent.click(await screen.findByRole('radio', { name: /Mystical/ }))
    await userEvent.selectOptions(screen.getByLabelText('d10'), 'Flight')
    await userEvent.selectOptions(screen.getByLabelText('d8 #1'), 'Awareness')
    await userEvent.selectOptions(screen.getByLabelText('d8 #2'), 'Teleportation')

    await userEvent.click(screen.getByRole('checkbox', { name: /Modification Wave/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Sever Link/ }))
    const [first, second] = screen.getAllByRole('combobox', { name: '[power]' })
    await userEvent.selectOptions(first!, 'Flight (d10)')
    await userEvent.selectOptions(second!, 'Teleportation (d8)')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Quality' }), 'History at d10')
    expect(await screen.findByText('No rule issues so far.')).toBeInTheDocument()
    await waitFor(async () =>
      expect((await saved(store)).powerSource).toEqual({
        id: 'mystical',
        powers: [
          { trait: { kind: 'power', id: 'flight' }, die: 'd10' },
          { trait: { kind: 'power', id: 'awareness' }, die: 'd8' },
          { trait: { kind: 'power', id: 'teleportation' }, die: 'd8' },
        ],
        abilities: [
          { source: 'powerSource.yellow', name: 'Modification Wave', uses: [{ kind: 'power', id: 'flight' }] },
          { source: 'powerSource.yellow', name: 'Sever Link', uses: [{ kind: 'power', id: 'teleportation' }] },
        ],
        bonus: [{ trait: { kind: 'quality', id: 'history' }, die: 'd10' }],
      }),
    )
  })

  it('takes Green abilities apart from Yellow ones, and flags rule issues', async () => {
    const store = await storeWith((h) => {
      h.method = 'constructed'
      h.background = { id: 'upper-class', qualities: [] }
      h.powerSource = { id: 'accident', powers: [{ trait: { kind: 'power', id: 'fire' }, die: 'd10' }], abilities: [{ source: 'powerSource.yellow', name: 'Inflict', uses: [{ kind: 'power', id: 'fire' }] }], bonus: [] }
    })
    renderEditor(store, 'power-source')
    const green = await screen.findByRole('group', { name: 'Green abilities: choose 1' })
    await userEvent.click(within(green).getByRole('checkbox', { name: /Immunity/ }))
    await userEvent.type(within(green).getByRole('textbox', { name: '[energy/element]' }), 'Fire')
    await waitFor(async () =>
      expect((await saved(store)).powerSource?.abilities).toEqual([
        { source: 'powerSource.yellow', name: 'Inflict', uses: [{ kind: 'power', id: 'fire' }] },
        { source: 'powerSource.green', name: 'Immunity', blanks: { 'energy/element': 'Fire' } },
      ]),
    )
    // Only one Yellow ability so far, and dice are missing.
    expect(screen.getByRole('region', { name: 'Rule issues in this step' })).toBeInTheDocument()
  })

  it('rolls for a power source with the background’s dice, keeping the roll', async () => {
    const store = await storeWith((h) => {
      h.background = { id: 'upper-class', qualities: [] }
    })
    renderEditor(store, 'power-source')
    await userEvent.click(await screen.findByRole('button', { name: 'Roll d10, d8 and d8' }))
    await waitFor(async () => expect((await saved(store)).pendingRolls?.powerSource?.dice).toEqual(['d10', 'd8', 'd8']))
  })

  it('asks for a fresh power source roll when the background’s dice changed, without using the reroll', async () => {
    const store = await storeWith((h) => {
      // Rolled (and rerolled) with Upper Class's d10, d8, d8, then switched to Academic's d10, d8.
      h.background = { id: 'academic', qualities: [] }
      h.pendingRolls = { powerSource: { dice: ['d10', 'd8', 'd8'], results: [1, 2, 3], manual: false, rerolled: true } }
    })
    renderEditor(store, 'power-source')
    expect(await screen.findByRole('alert')).toHaveTextContent("You rolled 1, 2 and 3 on d10, d8 and d8, but this step's dice are now d10 and d8")
    // The old roll no longer offers entries.
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Enter my own roll' }))
    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs).toHaveLength(2)
    await userEvent.type(inputs[0]!, '4')
    await userEvent.type(inputs[1]!, '5')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(screen.getByText(/You rolled/)).toHaveTextContent('You rolled 4 and 5 on d10 and d8 (typed in).')
    expect(screen.getByRole('button', { name: 'Reroll' })).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).pendingRolls?.powerSource).toEqual({ dice: ['d10', 'd8'], results: [4, 5], manual: true }))
  })

  it('asks for a power source before rolling for an archetype', async () => {
    renderEditor(await storeWith((h) => (h.background = { id: 'upper-class', qualities: [] })), 'archetype')
    expect(await screen.findByText(/Choose a power source first/)).toBeInTheDocument()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('rolls for an archetype with the power source’s dice', async () => {
    const store = await storeWith((h) => {
      h.background = { id: 'upper-class', qualities: [] }
      h.powerSource = { id: 'accident', powers: [], abilities: [], bonus: [] }
    })
    renderEditor(store, 'archetype')
    await userEvent.click(await screen.findByRole('button', { name: 'Roll d12 and d6' }))
    await waitFor(async () => expect((await saved(store)).pendingRolls?.archetype?.dice).toEqual(['d12', 'd6']))
  })

  it('builds an archetype the constructed way: dice, abilities, and principle, with no issues left', async () => {
    const store = await storeWith((h) => {
      const legal = heroWithAbilities()
      h.method = 'constructed'
      h.background = { ...legal.background!, principle: { id: 'business' } }
      h.powerSource = legal.powerSource
    })
    renderEditor(store, 'archetype')
    await userEvent.click(await screen.findByRole('radio', { name: /Speedster/ }))
    expect(screen.getByText('Speedster needs a die on Speed. If you already have it, you may skip it, or swap one of this step’s dice onto it and assign the old die elsewhere.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd12' }), 'Speed')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd6' }), 'Flight')

    const green = screen.getByRole('group', { name: 'Green abilities: choose 2' })
    await userEvent.click(within(green).getByRole('checkbox', { name: /Always on the Move/ }))
    await userEvent.selectOptions(within(green).getByRole('combobox', { name: '[power/quality]' }), 'Speed (d12)')
    await userEvent.click(within(green).getByRole('checkbox', { name: /Non-stop Assault/ }))
    await userEvent.selectOptions(within(green).getByRole('combobox', { name: '[quality]' }), 'Alertness (d8)')
    const yellow = screen.getByRole('group', { name: 'Yellow abilities: choose 1' })
    await userEvent.click(within(yellow).getByRole('checkbox', { name: /Speedy Analysis/ }))
    await userEvent.selectOptions(within(yellow).getByRole('combobox', { name: '[power]' }), 'Flight (d6)')
    await userEvent.selectOptions(screen.getByLabelText('Principle of Expertise'), 'Principle of the Gearhead')

    expect(await screen.findByText('No rule issues so far.')).toBeInTheDocument()
    await waitFor(async () =>
      expect((await saved(store)).archetype).toEqual({
        id: 'speedster',
        traits: [A(P('speed'), 'd12'), A(P('flight'), 'd6')],
        abilities: [
          { source: 'archetype.green', name: 'Always on the Move', uses: [P('speed')] },
          { source: 'archetype.green', name: 'Non-stop Assault', uses: [Q('alertness')] },
          { source: 'archetype.yellow', name: 'Speedy Analysis', uses: [P('flight')] },
        ],
        bonus: [],
        principle: { id: 'gearhead' },
      }),
    )
  })

  it('takes Training’s extra quality, and an archetype’s bonus', async () => {
    const store = await storeWith((h) => {
      h.method = 'constructed'
      h.background = { id: 'upper-class', qualities: [A(Q('fitness'), 'd10'), A(Q('alertness'), 'd8')] }
      h.powerSource = { id: 'training', powers: [A(P('agility'), 'd10'), A(P('gadgets'), 'd8'), A(P('deduction'), 'd8')], abilities: [], bonus: [] }
      h.archetype = { id: 'robot-cyborg', traits: [A(P('strength'), 'd10'), A(Q('investigation'), 'd8'), A(Q('self-discipline'), 'd8')], abilities: [], bonus: [] }
    })
    renderEditor(store, 'archetype')
    const extra = await screen.findByRole('group', { name: "Training's extra quality" })
    await userEvent.selectOptions(within(extra).getByRole('combobox', { name: 'Quality' }), 'Science at d8')
    const bonus = screen.getByRole('group', { name: "Robot/Cyborg's bonus" })
    await userEvent.selectOptions(within(bonus).getByRole('combobox', { name: 'Power' }), 'Robotics at d10')
    await waitFor(async () => {
      const hero = await saved(store)
      expect(hero.powerSource?.bonus).toEqual([A(Q('science'), 'd8')])
      expect(hero.archetype?.bonus).toEqual([A(P('robotics'), 'd10')])
    })
  })

  it('lets choices left from another archetype be removed', async () => {
    const store = await storeWith((h) => {
      h.method = 'constructed'
      h.archetype = {
        id: 'robot-cyborg',
        traits: [],
        abilities: [{ source: 'archetype.yellow', name: 'Metal Skin' }],
        bonus: [A(P('robotics'), 'd10')],
      }
    })
    renderEditor(store, 'archetype')
    // Robot/Cyborg's Yellow ability comes from its Green list.
    const yellow = await screen.findByRole('group', { name: 'Yellow abilities: choose 1' })
    expect(within(yellow).getByRole('checkbox', { name: /Metal Skin/ })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: /Speedster/ }))
    expect(screen.getByText("You have a bonus from another archetype, which Speedster doesn't use.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove them' }))
    expect(screen.queryByRole('button', { name: 'Remove them' })).not.toBeInTheDocument()

    // Armored has no Yellow choices, so the Yellow pick shows on its own, to be removed.
    await userEvent.click(screen.getByRole('radio', { name: /Armored/ }))
    expect(within(screen.getByRole('group', { name: 'Green abilities you always have' })).getByText('Armored', { selector: '.choice__title *, .choice__title' })).toBeInTheDocument()
    const stray = screen.getByRole('group', { name: 'Yellow abilities from another archetype' })
    await userEvent.click(within(stray).getByRole('checkbox', { name: /Metal Skin/ }))
    expect(screen.queryByRole('group', { name: 'Yellow abilities from another archetype' })).not.toBeInTheDocument()
    await waitFor(async () => {
      const hero = await saved(store)
      expect(hero.archetype?.bonus).toEqual([])
      expect(hero.archetype?.abilities).toEqual([])
    })
  })

  it('says forms aren’t in the editor yet', async () => {
    renderEditor(await storeWith((h) => (h.archetype = { id: 'minion-maker', traits: [], abilities: [], bonus: [] })), 'archetype')
    expect(await screen.findByText("Minion-Maker's forms aren't in the editor yet. They're coming in a later update.")).toBeInTheDocument()
  })

  it('says the archetypes that build on a second archetype aren’t in the editor yet', async () => {
    renderEditor(await storeWith((h) => (h.archetype = { id: 'divided', traits: [], abilities: [], bonus: [] })), 'archetype')
    expect(await screen.findByText(/Building on a second archetype isn't in the editor yet/)).toBeInTheDocument()
  })

  it('reports a failed save', async () => {
    const store = await storeWith()
    store.save = async () => {
      throw new Error('disk full')
    }
    renderEditor(store, 'details')
    await userEvent.type(await screen.findByLabelText('Hero name'), 'X')
    expect(await screen.findByRole('alert')).toHaveTextContent("Your last change couldn't be saved: disk full")
  })

  it('saves changes in order, even when an earlier save is slow', async () => {
    const inner = await storeWith()
    const resolvers: (() => void)[] = []
    const store: HeroStore = {
      list: () => inner.list(),
      get: (id) => inner.get(id),
      remove: (id) => inner.remove(id),
      save: (hero) =>
        new Promise((resolve) => {
          resolvers.push(() => void inner.save(hero).then(resolve))
        }),
    }
    renderEditor(store, 'details')
    await userEvent.type(await screen.findByLabelText('Hero name'), 'AB')
    // Only the first save has started; the second waits for it.
    expect(resolvers).toHaveLength(1)
    await act(async () => resolvers.shift()!())
    await waitFor(() => expect(resolvers).toHaveLength(1))
    await act(async () => resolvers.shift()!())
    await waitFor(async () => expect((await saved(inner)).details.name).toBe('AB'))
  })
})
