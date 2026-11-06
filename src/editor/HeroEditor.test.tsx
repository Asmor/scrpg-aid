import { startRewrite } from '../advancement/rewrite'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NewHeroes, NewHeroesContext } from '../app/new-heroes'
import { StoreContext } from '../app/store-context'
import { createHero, type Hero } from '../hero/model'
import { A, P, Q, completeHero, dividedHero, formChangerHero, heroWithAbilities, minionMakerHero, modularHero, validHero } from '../test/heroes'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { backgrounds, redAbilityCategories } from '../rules/data'
import { categoryName } from '../creation/red'
import { tableOptions } from '../rules/rolling'
import { HeroEditor } from './HeroEditor'
import { HealthStep } from './HealthStep'
import { useHeroEditor } from './useHeroEditor'
import { readable } from '../test/readable'

/** The Health step with a fixed random number (the top of the die), for the in-app roll. */
function HealthHarness() {
  const { state, update } = useHeroEditor('h1')
  return state.status === 'ready' ? <HealthStep hero={state.hero} update={update} random={() => 0.999} /> : null
}

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

/** The background choices, without the creation method's radios above them. */
const backgroundRadios = () => within(screen.getByRole('group', { name: 'Choose a background' })).getAllByRole('radio')

/** Opens a complex archetype's part card (closed when it's done), returning the card. */
async function openPart(label: string) {
  const card = await screen.findByRole('region', { name: label })
  const head = card.querySelector<HTMLButtonElement>('.part__head')!
  if (head.getAttribute('aria-expanded') === 'false') await userEvent.click(head)
  return card
}

/** Opens every part card on the step. */
async function openAllParts() {
  for (const head of document.querySelectorAll<HTMLButtonElement>('.part__head[aria-expanded="false"]')) await userEvent.click(head)
}

const saved = async (store: HeroStore) => {
  const result = await store.get('h1')
  if (result.status !== 'found') throw new Error('not saved')
  return result.hero
}

describe('HeroEditor drafts', () => {
  const renderNew = (store: HeroStore, newHeroes: NewHeroes, step: string) =>
    render(
      <NewHeroesContext.Provider value={newHeroes}>
        <StoreContext.Provider value={store}>
          <HeroEditor id="n1" step={step} />
        </StoreContext.Provider>
      </NewHeroesContext.Provider>,
    )

  it('keeps a new hero in memory until its first choice, then autosaves it', async () => {
    const store = new MemoryHeroStore()
    const newHeroes = new NewHeroes()
    newHeroes.add({ ...createHero('guided', { id: 'n1' }), status: 'draft' })
    renderNew(store, newHeroes, 'start')
    expect(await screen.findByRole('status')).toHaveTextContent('Draft · not saved yet')
    expect((await store.list()).heroes).toHaveLength(0)
    await userEvent.click(screen.getByRole('radio', { name: /Constructed/ }))
    expect(await screen.findByText('Draft · saved just now')).toBeInTheDocument()
    const result = await store.get('n1')
    expect(result.status === 'found' && result.hero).toMatchObject({ status: 'draft', method: 'constructed' })
    // Saved, it's no longer held in memory.
    expect(newHeroes.get('n1')).toBeUndefined()
  })

  it("remembers a saved draft's furthest step, but not an unsaved one's", async () => {
    const store = new MemoryHeroStore()
    const newHeroes = new NewHeroes()
    newHeroes.add({ ...createHero('guided', { id: 'n1' }), status: 'draft' })
    const view = renderNew(store, newHeroes, 'archetype')
    await screen.findByRole('heading', { level: 3, name: '3 · Archetype' })
    expect((await store.list()).heroes).toHaveLength(0)
    view.unmount()

    await store.save({ ...createHero('guided', { id: 'h1' }), status: 'draft', furthestStep: 1 })
    renderEditor(store, 'archetype')
    await waitFor(async () => expect((await saved(store)).furthestStep).toBe(3))
  })

  it('finishes a draft, making it complete and opening its page', async () => {
    const store = await storeWith((h) => {
      h.status = 'draft'
      h.furthestStep = 8
    })
    renderEditor(store, 'details')
    // The last step leads to Finish hero, not Advancement.
    expect(screen.queryByRole('link', { name: 'Advancement →' })).not.toBeInTheDocument()
    const [header, footer] = await screen.findAllByRole('button', { name: 'Finish hero' })
    expect(footer).toBeDefined()
    await userEvent.click(header!)
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1'))
    const hero = await saved(store)
    expect(hero.status).toBe('complete')
    expect(hero.furthestStep).toBeUndefined()
  })
})

describe('HeroEditor', () => {
  it('says when the hero is missing', async () => {
    renderEditor(new MemoryHeroStore(), undefined, 'nobody')
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved hero with that link.")
  })

  it('edits details, saving each change', async () => {
    const store = await storeWith()
    renderEditor(store, 'details')
    await userEvent.type(await screen.findByLabelText('Hero name'), 'Nova')
    expect(screen.getByRole('button', { name: 'Rename hero: Nova' }).closest('h2')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Costume / equipment'), 'Star cape')
    await waitFor(async () => {
      const hero = await saved(store)
      expect(hero.details.name).toBe('Nova')
      expect(hero.details.costume).toBe('Star cape')
    })
  })

  it('chooses the creation method, and for Guided who rolls, on the Start step', async () => {
    const store = await storeWith()
    renderEditor(store, 'start')
    await userEvent.click(await screen.findByRole('radio', { name: /My own dice/ }))
    await waitFor(async () => expect((await saved(store)).rollMode).toBe('manual'))
    await userEvent.click(screen.getByRole('radio', { name: /Constructed/ }))
    await waitFor(async () => expect((await saved(store)).method).toBe('constructed'))
    // Who rolls only matters for Guided.
    expect(screen.queryByRole('radio', { name: /My own dice/ })).not.toBeInTheDocument()
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
    expect(current).toHaveTextContent(/Background.*, 2 issues$/)
    expect(screen.getByRole('heading', { level: 3, name: '1 · Background' })).toBeInTheDocument()
    expect(screen.getAllByText('Core Rules, p. 49')[0]).toBeInTheDocument()
    // Steps not started yet show a hollow mark; started ones without issues a check.
    expect(within(nav).getByRole('link', { name: /Details/ })).toHaveAttribute('href', '#/hero/h1/edit/details')
    expect(within(nav).getByRole('link', { name: /Details/ })).toHaveTextContent('Details, not started')
    expect(within(nav).getByRole('link', { name: /Start/ })).toHaveTextContent('Start, done')
    // The step buttons are named for their steps.
    expect(screen.getByRole('link', { name: 'Power source' })).toHaveAttribute('href', '#/hero/h1/edit/power-source')
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute('href', '#/hero/h1/edit/start')
  })

  it('picks colors in Details, which affect no rule issues', async () => {
    const store = await storeWith()
    renderEditor(store, 'details')
    const primary = within(await screen.findByRole('group', { name: 'Primary' }))
    await userEvent.click(primary.getByRole('radio', { name: 'Purple' }))
    await waitFor(async () => expect((await saved(store)).appearance).toEqual({ primary: 'purple' }))
  })

  it('ends at Details; a finished hero then goes back to its page', async () => {
    renderEditor(await storeWith(), 'details')
    expect(await screen.findByRole('link', { name: 'Health' })).toHaveAttribute('href', '#/hero/h1/edit/health')
    const done = screen.getAllByRole('link', { name: 'Done editing' })
    expect(done).toHaveLength(2)
    expect(done.at(-1)).toHaveAttribute('href', '#/hero/h1')
    expect(screen.queryByRole('link', { name: /Advancement/ })).not.toBeInTheDocument()
  })

  it('in a major rewrite: the header says so, and Done editing logs it and goes to Advancement', async () => {
    const store = await storeWith((h) => Object.assign(h, startRewrite({ ...completeHero(), id: 'h1', details: { ...completeHero().details, name: 'Maya Reyes' } }, { now: new Date('2026-11-04T12:00:00Z'), newId: () => 'e1' })))
    renderEditor(store)
    expect(await screen.findByRole('button', { name: /Rebuilding Maya Reyes/ })).toBeInTheDocument()
    const done = screen.getAllByRole('link', { name: 'Done editing' })[0]!
    expect(done).toHaveAttribute('href', '#/hero/h1/advancement')
    await userEvent.click(done)
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1/advancement'))
    const hero = await saved(store)
    expect(hero.advancement).toHaveLength(1)
    expect(hero.advancement[0]).toMatchObject({ kind: 'rewrite', text: 'Rebuilt with the constructed method. Nothing changed.' })
    expect(hero.advancement[0]!.open).toBeUndefined()
  })

  it('falls back to the first step for an unknown step, fixing the address', async () => {
    window.location.hash = '#/hero/h1/edit/nope'
    renderEditor(await storeWith(), 'nope')
    expect(await screen.findByRole('heading', { level: 3, name: 'Start' })).toBeInTheDocument()
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1/edit/start'))
  })

  it('builds a background the constructed way, with no issues left', async () => {
    const store = await storeWith((h) => {
      h.method = 'constructed'
    })
    renderEditor(store, 'background')
    await userEvent.click(await screen.findByRole('radio', { name: /Upper Class/ }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd10' }), 'Fitness')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd8' }), 'Persuasion')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Principle of Responsibility' }), 'Principle of Business')
    expect(await screen.findByText('No rule issues in this step.')).toBeInTheDocument()
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
    const roll = await screen.findByRole('button', { name: 'Roll d10 and d10' })
    // The dice show as icons, not text.
    expect(within(roll).getAllByRole('img', { name: 'd10' })).toHaveLength(2)
    // Typed-in rolls: a d10's 0 counts as 10.
    await userEvent.click(screen.getByRole('button', { name: 'Enter my own roll' }))
    // Each input is named by its die's icon and number.
    expect(screen.getByRole('spinbutton', { name: 'd10 #2' })).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('spinbutton')
    await userEvent.type(first!, '1')
    await userEvent.type(second!, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(readable(screen.getByText(/You rolled/))).toContain('You rolled 1 and 10 on d10 and d10 (typed in).')

    const reachable = tableOptions(backgrounds, [1, 10]).map((o) => o.entry.name)
    const radios = backgroundRadios().map((r) => r.closest('label')!.textContent)
    expect(radios).toHaveLength(reachable.length)
    reachable.forEach((name, i) => expect(radios[i]).toContain(name))

    // Bad typed-in values are explained.
    await userEvent.click(screen.getByRole('button', { name: 'Enter my own re-roll' }))
    const [a, b] = screen.getAllByRole('spinbutton')
    await userEvent.type(a!, '11')
    await userEvent.type(b!, '2')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(screen.getByRole('alert')).toHaveTextContent("A d10 can't roll 11.")
    await userEvent.clear(a!)
    await userEvent.type(a!, '3')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(screen.getByText(/You rolled/)).toHaveTextContent('after using your re-roll')
    expect(screen.queryByRole('button', { name: 'Re-roll (1 left)' })).not.toBeInTheDocument()

    // The roll is saved with the chosen background.
    await userEvent.click(backgroundRadios()[0]!)
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
    expect(await screen.findByText('No rule issues in this step.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Adventurer/ }))
    // Persuasion isn't on Adventurer's list, but it's kept and offered as the current choice.
    expect(screen.getByRole('combobox', { name: 'd8' })).toHaveDisplayValue('Persuasion (not on this list)')
    expect(screen.getByRole('region', { name: /things? to look at/ })).toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('button', { name: 'Enter my own re-roll' }))
    const [a, b] = screen.getAllByRole('spinbutton')
    await userEvent.type(a!, '4')
    await userEvent.type(b!, '6')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    await waitFor(async () => expect((await saved(store)).background).toEqual({ id: 'upper-class', qualities: [], roll: { dice: ['d10', 'd10'], results: [4, 6], manual: true, rerolled: true } }))
    // Upper Class (1) isn't reached by 4 and 6 any more, so it's flagged as the current choice.
    expect(screen.getByRole('radio', { name: /Upper Class.*Not reached by this roll/ })).toBeChecked()
    // It stays chosen, and the roll check flags it.
    expect(screen.getByRole('region', { name: /things? to look at/ })).toHaveTextContent("Your background roll (4 and 6) doesn't reach Upper Class.")
  })

  it('labels the current choice plainly when a guided hero has no roll yet', async () => {
    renderEditor(
      await storeWith((h) => {
        h.background = { id: 'upper-class', qualities: [] }
      }),
      'background',
    )
    const label = (await screen.findByRole('radio', { name: /Upper Class/, checked: true })).closest('label')!
    expect(label).toHaveTextContent('Upper Class')
    expect(label).toHaveTextContent('Your current choice')
    expect(label).not.toHaveTextContent('Not reached')
  })

  it('tells apart dice of the same size', async () => {
    renderEditor(
      await storeWith((h) => {
        h.background = { id: 'struggling', qualities: [] }
      }),
      'background',
    )
    expect(await screen.findByRole('combobox', { name: 'd8' })).toBeInTheDocument()
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
    await userEvent.click(backgroundRadios()[0]!)
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
    expect(screen.getByRole('button', { name: 'Re-roll (1 left)' })).toBeInTheDocument()
  })

  it('builds a power source the constructed way: powers, abilities, and bonus, with no issues left', async () => {
    const store = await storeWith((h) => {
      h.method = 'constructed'
      h.background = { id: 'upper-class', qualities: [{ trait: { kind: 'quality', id: 'fitness' }, die: 'd10' }, { trait: { kind: 'quality', id: 'persuasion' }, die: 'd8' }], principle: { id: 'business' } }
    })
    renderEditor(store, 'power-source')
    await userEvent.click(await screen.findByRole('radio', { name: /Mystical/ }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd10' }), 'Flight')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd8 #1' }), 'Awareness')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd8 #2' }), 'Teleportation')

    await userEvent.click(screen.getByRole('checkbox', { name: /Modification Wave/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Sever Link/ }))
    const [first, second] = screen.getAllByRole('combobox', { name: /^Power for / })
    await userEvent.selectOptions(first!, 'Flight (d10)')
    await userEvent.selectOptions(second!, 'Teleportation (d8)')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Quality' }), 'History at d10')
    expect(await screen.findByText('No rule issues in this step.')).toBeInTheDocument()
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
    await userEvent.type(within(green).getByRole('textbox', { name: /^Energy\/element for / }), 'Fire')
    await waitFor(async () =>
      expect((await saved(store)).powerSource?.abilities).toEqual([
        { source: 'powerSource.yellow', name: 'Inflict', uses: [{ kind: 'power', id: 'fire' }] },
        { source: 'powerSource.green', name: 'Immunity', blanks: { 'energy/element': 'Fire' } },
      ]),
    )
    // Only one Yellow ability so far, and dice are missing.
    expect(screen.getByRole('region', { name: /things? to look at/ })).toBeInTheDocument()
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
    expect(readable(await screen.findByRole('alert'))).toContain("You rolled 1, 2 and 3 on d10, d8 and d8, but this step's dice are now d10 and d8")
    // The old roll no longer offers entries.
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Enter my own roll' }))
    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs).toHaveLength(2)
    await userEvent.type(inputs[0]!, '4')
    await userEvent.type(inputs[1]!, '5')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(readable(screen.getByText(/You rolled/))).toContain('You rolled 4 and 5 on d10 and d8 (typed in).')
    expect(screen.getByRole('button', { name: 'Re-roll (1 left)' })).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).pendingRolls?.powerSource).toEqual({ dice: ['d10', 'd8'], results: [4, 5], manual: true }))
  })

  it.each([
    ['background', 'power-source', () => {}],
    ['power source', 'archetype', (h: Hero) => (h.background = { id: 'upper-class', qualities: [] })],
    ['archetype', 'personality', () => {}],
  ])('asks for a %s before rolling for the %s', async (needed, step, change) => {
    renderEditor(await storeWith(change), step)
    expect(await screen.findByText(new RegExp(`Choose an? ${needed} first`))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Roll/ })).not.toBeInTheDocument()
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
    await userEvent.selectOptions(within(green).getByRole('combobox', { name: /^Power\/quality for / }), 'Speed (d12)')
    await userEvent.click(within(green).getByRole('checkbox', { name: /Non-stop Assault/ }))
    await userEvent.selectOptions(within(green).getByRole('combobox', { name: /^Quality for / }), 'Alertness (d8)')
    const yellow = screen.getByRole('group', { name: 'Yellow abilities: choose 1' })
    await userEvent.click(within(yellow).getByRole('checkbox', { name: /Speedy Analysis/ }))
    await userEvent.selectOptions(within(yellow).getByRole('combobox', { name: /^Power for / }), 'Flight (d6)')
    await userEvent.selectOptions(screen.getByLabelText('Principle of Expertise'), 'Principle of the Gearhead')

    expect(await screen.findByText('No rule issues in this step.')).toBeInTheDocument()
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
    expect(screen.getByText("Speedster doesn't use these earlier choices: a bonus.")).toBeInTheDocument()
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

  // Many steps through the wizard: about 3 s alone, slower when the whole suite runs at once.
  it('builds Form-Changer forms: powers, a name, the Yellow form’s raised dice, and one ability each', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...formChangerHero(), id: 'h1' })
      h.archetype!.forms = []
    })
    renderEditor(store, 'archetype')
    const green = await screen.findByRole('group', { name: 'Green form 1' })
    await userEvent.selectOptions(within(green).getByRole('combobox', { name: 'd12' }), 'Strength')
    await userEvent.type(within(green).getByLabelText('Form name (optional)'), 'Brute')
    const brute = screen.getByRole('group', { name: 'Brute' })
    const ability = within(brute).getByRole('group', { name: 'Brute ability: choose 1' })
    await userEvent.click(within(ability).getByRole('checkbox', { name: /Strong Form/ }))
    await userEvent.click(within(ability).getByRole('checkbox', { name: /Tough Form/ }))
    expect(within(ability).getByRole('checkbox', { name: /Strong Form/ })).not.toBeChecked()

    const yellow = screen.getByRole('group', { name: 'Yellow form 1' })
    await userEvent.selectOptions(within(yellow).getByRole('combobox', { name: 'Raise die 1' }), 'Fitness: d10 → d12')
    // A die can't be raised twice.
    expect(within(within(yellow).getByRole('combobox', { name: 'Raise die 2' })).queryByRole('option', { name: 'Fitness: d10 → d12' })).not.toBeInTheDocument()
    await waitFor(async () =>
      expect((await saved(store)).archetype?.forms).toEqual([
        { zone: 'green', powers: [A(P('strength'), 'd12')], name: 'Brute', ability: { source: 'archetype.form', name: 'Tough Form' } },
        { zone: 'yellow', powers: [], upgrades: [Q('fitness')] },
      ]),
    )
  }, 20_000)

  it('lets an extra form be removed', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...formChangerHero(), id: 'h1' })
      h.archetype!.forms!.push({ zone: 'green', powers: [], name: 'Spare' })
    })
    renderEditor(store, 'archetype')
    await userEvent.click(within(await screen.findByRole('group', { name: 'Spare' })).getByRole('button', { name: 'Remove this extra form' }))
    await waitFor(async () => expect((await saved(store)).archetype?.forms).toEqual(formChangerHero().archetype!.forms))
  })

  it('chooses Minion-Maker’s minion forms, as many as the chosen quality’s die', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...minionMakerHero(), id: 'h1' })
      delete h.archetype!.minionForms
    })
    renderEditor(store, 'archetype')
    const group = await screen.findByRole('group', { name: 'Minion forms' })
    await userEvent.selectOptions(within(group).getByRole('combobox', { name: 'Quality that sets how many' }), 'Creativity (d6)')
    // The tally, not the same words in the issue at the top of the group.
    expect(readable(within(group).getAllByText(/^Choose 6/).find((el) => !el.closest('.inline-issues'))!)).toBe('Choose 6 (your Creativity is d6); you have 0.')
    await userEvent.click(within(group).getByRole('checkbox', { name: /Floating/ }))
    await waitFor(async () => expect((await saved(store)).archetype?.minionForms).toEqual({ quality: Q('creativity'), forms: ['Floating'] }))
  })

  it('shows a legal Divided hero with no issues, choosing the second archetype apart from Divided and Modular', async () => {
    renderEditor(await storeWith((h) => Object.assign(h, { ...dividedHero(), id: 'h1' })), 'archetype')
    // Done parts start closed.
    expect((await screen.findByRole('region', { name: 'Second archetype' })).querySelector('.part__head')).toHaveAttribute('aria-expanded', 'false')
    const second = await openPart('Second archetype')
    expect(within(second).getByRole('radio', { name: /Speedster/ })).toBeChecked()
    expect(within(second).queryByRole('radio', { name: /Modular/ })).not.toBeInTheDocument()
    expect(within(second).queryByRole('radio', { name: /Divided/ })).not.toBeInTheDocument()
    expect(within(second).getByRole('group', { name: 'Green abilities: choose 2' })).toBeInTheDocument()
    expect(within(await openPart('Transition')).getByRole('radio', { name: /Controllable Transition/ })).toBeChecked()
    expect(screen.getByText('No rule issues in this step.')).toBeInTheDocument()
  })

  it('builds Divided’s own choices: second archetype, transition, and Split Form', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...dividedHero(), id: 'h1' })
      const secondary = h.archetype!.secondary!
      h.archetype = { id: 'divided', traits: [], abilities: [], bonus: [], secondary: { ...secondary, id: 'shadow' } }
    })
    renderEditor(store, 'archetype')
    const second = await screen.findByRole('region', { name: 'Second archetype' })
    await userEvent.click(within(second).getByRole('radio', { name: /Speedster/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Device Transition/ }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Device Transition ability: choose 1' })).getByRole('checkbox', { name: /Device Transform/ }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Divided ability: choose 1' })).getByRole('checkbox', { name: /Split Form/ }))
    const split = screen.getByRole('group', { name: 'Split Form' })
    // A table: each power and quality with its die and a Both/Civilian/Heroic control, and live tallies.
    expect(within(split).getByRole('rowheader', { name: /Speed/ }).closest('tr')).toContainElement(within(split).getByRole('img', { name: 'd12' }))
    expect(split).toHaveTextContent('Both forms, powers: 0 of 2')
    await userEvent.click(within(within(split).getByRole('group', { name: 'Speed form' })).getByRole('button', { name: 'Both' }))
    await userEvent.click(within(within(split).getByRole('group', { name: 'Flight form' })).getByRole('button', { name: 'Heroic' }))
    expect(within(within(split).getByRole('group', { name: 'Speed form' })).getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true')
    expect(split).toHaveTextContent('Both forms, powers: 1 of 2')
    await waitFor(async () => {
      const a = (await saved(store)).archetype!
      expect(a.secondary?.id).toBe('speedster')
      expect(a.divided).toEqual({
        transitionMethod: 'device',
        transitionAbility: { source: 'archetype.transition', name: 'Device Transform' },
        split: { always: [P('speed')], civilian: [], heroic: [P('flight')] },
      })
      expect(a.abilities).toEqual([{ source: 'archetype.green', name: 'Split Form' }])
    })
  })

  it('rolls again for Divided’s second archetype (ruling 45)', async () => {
    const store = await storeWith((h) => {
      h.background = { id: 'upper-class', qualities: [] }
      h.powerSource = { id: 'accident', powers: [], abilities: [], bonus: [] }
      h.archetype = { id: 'divided', traits: [], abilities: [], bonus: [], roll: { dice: ['d12', 'd6'], results: [12, 6], manual: false, rerolled: true } }
    })
    renderEditor(store, 'archetype')
    const second = await screen.findByRole('region', { name: 'Second archetype' })
    await userEvent.click(within(second).getByRole('button', { name: 'Roll d12 and d6' }))
    await waitFor(async () => expect((await saved(store)).pendingRolls?.secondaryArchetype?.dice).toEqual(['d12', 'd6']))
    // A roll of its own, with its own reroll (ruling 46).
    expect(within(second).getByRole('button', { name: 'Re-roll (1 left)' })).toBeInTheDocument()
  })

  it('picks Modular’s base archetype from the archetype roll, or a fresh one (ruling 47), and adds filler powers', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...modularHero(), id: 'h1' })
      h.method = 'guided'
      h.archetype = { id: 'modular', traits: [], abilities: [], bonus: [], roll: { dice: ['d12', 'd6'], results: [1, 3], manual: false } }
    })
    renderEditor(store, 'archetype')
    const base = await openPart('Base archetype')
    expect(within(base).getByText(/Your archetype roll was/)).toBeInTheDocument()
    await userEvent.click(within(base).getByRole('radio', { name: /Speedster/ }))
    // Modular skips the base archetype's abilities.
    expect(within(base).queryByRole('group', { name: 'Green abilities: choose 2' })).not.toBeInTheDocument()
    // With only the power source's three powers, Modular adds a d6 power.
    expect(screen.getByText('You have 3 powers; add 1 d6 power so you have 4.')).toBeInTheDocument()
    await userEvent.selectOptions(within(screen.getByRole('group', { name: 'Filler powers' })).getByRole('combobox', { name: 'd6' }), 'Leaping')
    expect(within(await openPart('Switch abilities')).getByRole('group', { name: 'Green abilities you always have' })).toHaveTextContent('Switch')
    await waitFor(async () => {
      const a = (await saved(store)).archetype!
      expect(a.secondary).toEqual({ id: 'speedster', traits: [], abilities: [], bonus: [] })
      expect(a.traits).toEqual([A(P('leaping'), 'd6')])
    })
  })

  it('removes Modular’s skipped base-archetype abilities when unticked', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...modularHero(), id: 'h1' })
      h.archetype!.secondary!.abilities = [
        { source: 'archetype.green', name: 'Always on the Move', uses: [P('speed')] },
        { source: 'archetype.green', name: 'Fast Fingers', uses: [P('flight')] },
      ]
    })
    renderEditor(store, 'archetype')
    const skipped = await screen.findByRole('group', { name: 'Speedster abilities' })
    await userEvent.click(within(skipped).getByRole('checkbox', { name: /Always on the Move/ }))
    await waitFor(async () => expect((await saved(store)).archetype?.secondary?.abilities).toEqual([{ source: 'archetype.green', name: 'Fast Fingers', uses: [P('flight')] }]))
  })

  it('clears a Split Form division left after switching to Divided Psyche', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...dividedHero(), id: 'h1' })
      h.archetype!.divided!.split = { always: [P('speed')], civilian: [], heroic: [] }
    })
    renderEditor(store, 'archetype')
    expect(await screen.findByText("Divided doesn't use these earlier choices: Split Form's division of your powers and qualities.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove them' }))
    expect(await screen.findByText('No rule issues in this step.')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).archetype?.divided?.split).toBeUndefined())
  })

  it('keeps the second archetype’s roll when removing it, so it can’t be rolled afresh (ruling 46)', async () => {
    const secondRoll = { dice: ['d12', 'd6'] as const, results: [1, 2], manual: false, rerolled: true as const }
    const store = await storeWith((h) => {
      Object.assign(h, { ...dividedHero(), id: 'h1' })
      h.method = 'constructed'
      h.archetype!.secondary!.roll = { ...secondRoll, dice: [...secondRoll.dice] }
    })
    renderEditor(store, 'archetype')
    // The list is collapsed into Divided's card until the player asks to change it.
    await userEvent.click(await screen.findByRole('button', { name: 'Change archetype' }))
    await userEvent.click(screen.getAllByRole('radio', { name: /Shadow/ })[0]!)
    // Divided's parts go, and its second archetype's roll stays as the pending roll.
    await waitFor(async () => {
      const hero = await saved(store)
      expect(hero.archetype?.id).toBe('shadow')
      expect(hero.archetype?.secondary).toBeUndefined()
      expect(hero.archetype?.divided).toBeUndefined()
      expect(hero.pendingRolls?.secondaryArchetype).toEqual({ ...secondRoll, dice: ['d12', 'd6'] })
    })
    // Switching back in the same visit restores them, roll and all.
    await userEvent.click(screen.getByRole('radio', { name: /Divided/ }))
    await waitFor(async () => {
      const hero = await saved(store)
      expect(hero.archetype?.secondary?.roll).toEqual({ ...secondRoll, dice: ['d12', 'd6'] })
      expect(hero.archetype?.divided?.transitionMethod).toBe('controllable')
      expect(hero.pendingRolls?.secondaryArchetype).toBeUndefined()
    })
  })

  it('builds Modular’s modes and Powerless mode', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...modularHero(), id: 'h1' })
      h.archetype!.modular = { modes: [] }
    })
    renderEditor(store, 'archetype')
    const green = await screen.findByRole('group', { name: 'Green mode 1' })
    await userEvent.selectOptions(within(green).getByRole('combobox', { name: 'Green mode' }), 'Debilitator Mode')
    const card = screen.getByRole('group', { name: 'Debilitator Mode' })
    expect(within(card).getByText(/Debilitator Mode uses 4 default-mode powers/)).toBeInTheDocument()
    // One row per change in the recipe, each with an issue until it's filled.
    const rows = within(card).getByRole('group', { name: 'Debilitator Mode powers' })
    expect(within(rows).getAllByRole('combobox').map((c) => (c as HTMLSelectElement).labels[0]?.textContent)).toEqual(['Raise 1 size (1)', 'Raise 1 size (2)', 'Lower 1 size', 'Same size'])
    expect(within(rows).getByRole('combobox', { name: 'Lower 1 size' })).toHaveAccessibleDescription('Choose a power to lower one size.')
    // Each option says what the change does to that power.
    await userEvent.selectOptions(within(rows).getByRole('combobox', { name: 'Raise 1 size (1)' }), 'Fire d8 → d10')
    // A power used in one row is shown, but can't be picked, in the others.
    expect(within(within(rows).getByRole('combobox', { name: 'Raise 1 size (2)' })).getByRole('option', { name: 'Fire d8 → d10 (in another row)' })).toBeDisabled()
    // Past d12 the die stays put (ruling 40), and the option says so.
    expect(within(within(rows).getByRole('combobox', { name: 'Raise 1 size (2)' })).getByRole('option', { name: 'Speed d12 → d12 (already the largest)' })).toBeEnabled()
    expect(within(rows).getByText(/^Not in this mode:/)).toHaveTextContent('Not in this mode: Agility, Awareness, Speed, Flight')
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: /^Power for / }), 'Fire (d10)')

    const powerless = screen.getByRole('group', { name: 'Powerless mode' })
    await userEvent.click(within(powerless).getByRole('checkbox', { name: 'Take a Powerless mode' }))
    await userEvent.selectOptions(within(powerless).getByRole('combobox', { name: 'd10' }), 'Speed')
    await waitFor(async () =>
      expect((await saved(store)).archetype?.modular).toEqual({
        modes: [{ id: 'debilitator', powers: [A(P('fire'), 'd10')], ability: { source: 'archetype.mode', name: 'Debilitator', uses: [P('fire')] } }],
        powerless: [A(P('speed'), 'd10')],
      }),
    )
  })

  it('opens a mode saved the old way with the rows that fit filled, and an issue on the rest', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...modularHero(), id: 'h1' })
      // Improvement raises 2 and keeps 2: Awareness at d10 kept "the same" doesn't fit, and Flight (d6 at d12) is one too many.
      h.archetype!.modular!.modes[0]!.powers = [A(P('speed'), 'd12'), A(P('agility'), 'd12'), A(P('fire'), 'd10'), A(P('awareness'), 'd10'), A(P('flight'), 'd12')]
    })
    renderEditor(store, 'archetype')
    await screen.findByRole('region', { name: 'Red mode' })
    await openAllParts()
    const rows = within(screen.getByRole('group', { name: 'Improvement Mode' })).getByRole('group', { name: 'Improvement Mode powers' })
    const misfit = within(rows).getByRole('combobox', { name: 'Same size (2)' })
    expect(misfit).toHaveDisplayValue("Awareness d8 → d10 (saved, doesn't fit)")
    expect(misfit).toHaveAttribute('aria-invalid', 'true')
    expect(misfit).toHaveAccessibleDescription('Awareness is d10 in Improvement Mode, but same size makes it d8. Choose it again, or another power.')
    // Choosing it again gives it the row's die.
    await userEvent.selectOptions(misfit, 'Awareness d8 → d8')
    expect(misfit).not.toHaveAttribute('aria-invalid')
    // The extra one can be taken out.
    expect(within(rows).getByText('Also saved: Flight d12')).toBeInTheDocument()
    await userEvent.click(within(rows).getByRole('button', { name: 'Remove' }))
    await waitFor(async () => expect((await saved(store)).archetype?.modular?.modes[0]?.powers).toEqual([A(P('agility'), 'd12'), A(P('fire'), 'd10'), A(P('speed'), 'd12'), A(P('awareness'), 'd8')]))
  })

  it('switches, removes, and drops modes', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...modularHero(), id: 'h1' })
      h.archetype!.modular!.modes.push({ id: 'scout', powers: [] })
    })
    renderEditor(store, 'archetype')
    await screen.findByRole('region', { name: 'Red mode' })
    await openAllParts()
    // Switching records the new mode's ability, even one with no blanks to fill.
    await userEvent.selectOptions(within(await screen.findByRole('group', { name: 'Hunter/Killer Mode' })).getByRole('combobox', { name: 'Red mode' }), 'Destroyer Mode')
    // A mode taken in another slot isn't offered again.
    expect(within(screen.getByRole('group', { name: 'Improvement Mode' })).queryByRole('option', { name: 'Scout Mode' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Scout Mode' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Take a Powerless mode' }))
    await waitFor(async () => {
      const modular = (await saved(store)).archetype!.modular!
      expect(modular.modes.map((m) => m.id)).toEqual(['improvement', 'analysis', 'regeneration', 'destroyer'])
      expect(modular.modes[3]!.ability).toEqual({ source: 'archetype.mode', name: 'Destroyer' })
      expect(modular.powerless).toBeUndefined()
    })
    const issues = screen.getByRole('region', { name: /things? to look at/ })
    expect(issues).not.toHaveTextContent('Fill in Destroyer')
  })

  it('shows a legal Modular hero with no issues', async () => {
    renderEditor(await storeWith((h) => Object.assign(h, { ...modularHero(), id: 'h1' })), 'archetype')
    await openPart('Green mode')
    await openAllParts()
    expect(await screen.findByRole('group', { name: 'Patch Job' })).toBeInTheDocument()
    expect(screen.getByText('No rule issues in this step.')).toBeInTheDocument()
  })

  it('rolls for a personality with the archetype’s dice', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...validHero(), id: 'h1' })
      h.method = 'guided'
      h.personality = null
    })
    renderEditor(store, 'personality')
    await userEvent.click(await screen.findByRole('button', { name: 'Roll d10 and d10' }))
    await waitFor(async () => expect((await saved(store)).pendingRolls?.personality?.dice).toEqual(['d10', 'd10']))
  })

  it('builds a personality the constructed way: roleplaying quality and Out ability, with no issues left', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...completeHero(), id: 'h1' })
      h.personality = null
      h.traitNames = {}
    })
    renderEditor(store, 'personality')
    await userEvent.click(await screen.findByRole('radio', { name: /Lone Wolf/ }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Roleplaying quality (d8)' }), 'Old Money')
    const out = screen.getByRole('group', { name: 'Out ability' })
    expect(within(out).queryByLabelText('Your name for it (optional)')).not.toBeInTheDocument()
    await userEvent.selectOptions(within(out).getByRole('combobox', { name: /^Quality for / }), 'Fitness (d10)')
    expect(await screen.findByText('No rule issues in this step.')).toBeInTheDocument()
    await waitFor(async () => {
      const hero = await saved(store)
      expect(hero.personality).toEqual({ id: 'lone-wolf', bonus: [], outUses: [Q('fitness')] })
      expect(hero.traitNames).toEqual({ 'quality:roleplaying-quality': 'Old Money' })
    })
  })

  it('takes a personality’s bonus', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...completeHero(), id: 'h1' })
      h.personality = { id: 'impulsive', bonus: [] }
    })
    renderEditor(store, 'personality')
    await userEvent.selectOptions(within(await screen.findByRole('group', { name: "Impulsive's bonus" })).getByRole('combobox', { name: 'Upgrade' }), 'Flight: d6 → d8')
    await waitFor(async () => expect((await saved(store)).personality?.bonus).toEqual([A(P('flight'), 'd8')]))
  })

  it('gives a Divided hero a second personality for the heroic form, and whose Out ability to use', async () => {
    const store = await storeWith((h) => Object.assign(h, { ...dividedHero(), id: 'h1' }))
    renderEditor(store, 'personality')
    const heroic = await screen.findByRole('region', { name: 'Heroic form personality' })
    // Not the civilian form's personality.
    expect(within(heroic).queryByRole('radio', { name: /Lone Wolf/ })).not.toBeInTheDocument()
    await userEvent.click(within(heroic).getByRole('radio', { name: /Natural Leader/ }))
    await userEvent.click(within(heroic).getByRole('radio', { name: /Heroic form \(Natural Leader\)/ }))
    const out = screen.getByRole('group', { name: 'Out ability (heroic form)' })
    await userEvent.selectOptions(within(out).getByRole('combobox', { name: /^Quality for / }), 'Alertness (d8)')
    await waitFor(async () =>
      expect((await saved(store)).archetype?.divided).toMatchObject({ heroicPersonality: { id: 'natural-leader', bonus: [], outUses: [Q('alertness')] }, outFrom: 'heroic' }),
    )
    await userEvent.click(within(heroic).getByRole('button', { name: 'Use one personality for both forms' }))
    await waitFor(async () => {
      const divided = (await saved(store)).archetype?.divided
      expect(divided?.heroicPersonality).toBeUndefined()
      expect(divided?.outFrom).toBeUndefined()
    })
  })

  it('offers the heroic form personality before any of Divided’s own choices are recorded', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...dividedHero(), id: 'h1' })
      delete h.archetype!.divided
    })
    renderEditor(store, 'personality')
    await userEvent.click(within(await screen.findByRole('region', { name: 'Heroic form personality' })).getByRole('radio', { name: /Natural Leader/ }))
    await waitFor(async () => expect((await saved(store)).archetype?.divided).toEqual({ heroicPersonality: { id: 'natural-leader', bonus: [] } }))
  })

  it('chooses Red abilities by category, with no issues left', async () => {
    const store = await storeWith((h) => {
      Object.assign(h, { ...completeHero(), id: 'h1' })
      h.redAbilities = [{ source: 'red', name: 'Gone' }]
    })
    renderEditor(store, 'red-abilities')
    // A pick that isn't on any list can be removed.
    await userEvent.click(within(await screen.findByRole('group', { name: 'Red abilities not on any list' })).getByRole('checkbox', { name: /Gone/ }))
    const athletic = screen.getByRole('group', { name: 'Athletic power Red abilities' })
    await userEvent.click(within(athletic).getByRole('checkbox', { name: /Paragon Feat/ }))
    // Only Athletic powers are offered; Fire isn't one.
    const power = within(athletic).getByRole('combobox', { name: /^Power for / })
    expect(within(power).getByRole('option', { name: 'Agility (d10)' })).toBeInTheDocument()
    expect(within(power).queryByRole('option', { name: 'Fire (d8)' })).not.toBeInTheDocument()
    await userEvent.selectOptions(power, 'Agility (d10)')
    await userEvent.click(within(athletic).getByRole('checkbox', { name: /Push Your Limits/ }))
    // Each group shows how many are chosen, of the two allowed.
    expect(athletic.closest('details')!.querySelector('summary')).toHaveTextContent('Athletic power Red abilities2 chosen')
    expect(screen.getByText('2 of 2 chosen')).toBeInTheDocument()
    // Categories the hero has nothing in are hidden until the filter's turned off.
    const filter = screen.getByRole('checkbox', { name: 'Only ones I can take' })
    expect(filter).toBeChecked()
    expect(screen.queryByRole('group', { name: 'Psychic power Red abilities' })).not.toBeInTheDocument()
    expect(screen.getByText(/more categories need a power or quality you don't have/)).toBeInTheDocument()
    await userEvent.click(filter)
    expect(screen.getByRole('group', { name: 'Psychic power Red abilities' })).toBeInTheDocument()
    expect(await screen.findByText('No rule issues in this step.')).toBeInTheDocument()
    await waitFor(async () =>
      expect((await saved(store)).redAbilities).toEqual([
        { source: 'red', name: 'Paragon Feat', category: 'power:athletic', uses: [P('agility')] },
        { source: 'red', name: 'Push Your Limits', category: 'power:athletic' },
      ]),
    )
  })

  it('keeps a pick from a category the hero can’t use listed, and its group open while editing', async () => {
    const psychic = redAbilityCategories.find((c) => c.powerCategory === 'psychic')!
    const store = await storeWith((h) => {
      Object.assign(h, { ...completeHero(), id: 'h1' })
      h.redAbilities = [{ source: 'red', name: psychic.abilities[0]!.name, category: 'power:psychic' }]
    })
    renderEditor(store, 'red-abilities')
    // Shown though the filter is on, and open, since it has a pick.
    const group = await screen.findByRole('group', { name: 'Psychic power Red abilities' })
    const details = group.closest('details')!
    expect(screen.getByRole('checkbox', { name: 'Only ones I can take' })).toBeChecked()
    expect(details.open).toBe(true)
    // Groups without a pick start closed.
    expect(screen.getByRole('group', { name: 'Athletic power Red abilities' }).closest('details')!.open).toBe(false)
    // The hint counts only the categories it hides.
    const hidden = redAbilityCategories.filter((c) => c.powerCategory !== 'psychic' && !screen.queryByRole('group', { name: new RegExp(`^${categoryName(c)} Red abilities$`) })).length
    expect(screen.getByText(new RegExp(`^${hidden} more categories need`))).toBeInTheDocument()
    // With the filter off, unticking the only pick leaves the group open.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Only ones I can take' }))
    await userEvent.click(within(group).getByRole('checkbox', { name: new RegExp(psychic.abilities[0]!.name) }))
    expect(screen.getByRole('group', { name: 'Psychic power Red abilities' }).closest('details')!.open).toBe(true)
    // With it on, a category with nothing chosen that the hero can't use is hidden again.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Only ones I can take' }))
    expect(screen.queryByRole('group', { name: 'Psychic power Red abilities' })).not.toBeInTheDocument()
  })

  it('lists Minion-Maker’s extra Red options', async () => {
    renderEditor(await storeWith((h) => Object.assign(h, { ...minionMakerHero(), id: 'h1' })), 'red-abilities')
    const extras = await screen.findByRole('group', { name: 'Extra Red abilities from your archetype' })
    expect(within(extras).getByRole('checkbox', { name: /Sacrifice/ })).toBeInTheDocument()
  })

  describe('retcon', () => {
    const complete = async (change: (h: Hero) => void = () => {}) =>
      storeWith((h) => {
        Object.assign(h, { ...completeHero(), id: 'h1' })
        change(h)
      })
    const savedRetcon = async (store: HeroStore) => (await saved(store)).retcon

    it('swaps two dice once both are chosen', async () => {
      const store = await complete()
      renderEditor(store, 'retcon')
      await userEvent.click(await screen.findByRole('radio', { name: 'Swap any two of your power dice.' }))
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Swap this die' }), 'Speed (d12)')
      expect(await savedRetcon(store)).toBeNull()
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'With this one' }), 'Flight (d6)')
      await waitFor(async () => expect(await savedRetcon(store)).toEqual({ id: 'swap-power-dice', kind: 'swapDice', traits: [P('speed'), P('flight')] }))
    })

    it('adds a d6 power or quality the hero doesn’t have', async () => {
      const store = await complete()
      renderEditor(store, 'retcon')
      await userEvent.click(await screen.findByRole('radio', { name: /Add any power or quality/ }))
      const gain = screen.getByRole('combobox', { name: 'Gain at d6' })
      expect(within(gain).queryByRole('option', { name: 'Speed (power)' })).not.toBeInTheDocument()
      await userEvent.selectOptions(gain, 'Leaping (power)')
      await waitFor(async () => expect(await savedRetcon(store)).toEqual({ id: 'add-d6-trait', kind: 'gainPowerOrQuality', gained: A(P('leaping'), 'd6') }))
      expect(await screen.findByText('No rule issues in this step.')).toBeInTheDocument()
    })

    it('changes what an ability uses', async () => {
      const store = await complete()
      renderEditor(store, 'retcon')
      await userEvent.click(await screen.findByRole('radio', { name: /Change which power or quality/ }))
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ability' }), 'Inflict')
      await userEvent.selectOptions(within(screen.getByRole('group', { name: 'What Inflict uses now' })).getByRole('combobox', { name: /^Power for / }), 'Agility (d10)')
      await waitFor(async () =>
        expect(await savedRetcon(store)).toEqual({ id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'powerSource.yellow', name: 'Inflict' }, uses: [P('agility')] }),
      )
    })

    it('replaces a principle with any other', async () => {
      const store = await complete()
      renderEditor(store, 'retcon')
      await userEvent.click(await screen.findByRole('radio', { name: /Replace either of your principles/ }))
      await userEvent.click(screen.getByRole('radio', { name: 'Your background principle' }))
      await userEvent.selectOptions(screen.getByLabelText('New principle'), 'Principle of Destiny')
      await waitFor(async () => expect(await savedRetcon(store)).toEqual({ id: 'change-principle', kind: 'changePrinciple', replace: 'background', with: { id: 'destiny' } }))
    })

    it('gains one more Red ability, and can be undone', async () => {
      const store = await complete()
      renderEditor(store, 'retcon')
      await userEvent.click(await screen.findByRole('radio', { name: /Gain one more Red ability/ }))
      await userEvent.click(within(screen.getByRole('group', { name: 'Athletic power Red abilities' })).getByRole('checkbox', { name: /Reactive Strike/ }))
      await waitFor(async () => expect((await savedRetcon(store))?.kind).toBe('gainRedAbility'))
      // The retcon gains one.
      expect(screen.getByText('1 of 1 chosen')).toBeInTheDocument()
      expect((await savedRetcon(store)) as unknown).toMatchObject({ ability: { source: 'retcon', name: 'Reactive Strike', category: 'power:athletic' } })
      await userEvent.click(screen.getByRole('button', { name: 'Take no retcon yet' }))
      await waitFor(async () => expect(await savedRetcon(store)).toBeNull())
    })

    it('lets a Divided hero with two personalities pick whose status die goes up', async () => {
      const store = await storeWith((h) => {
        Object.assign(h, { ...dividedHero(), id: 'h1' })
        h.archetype!.divided!.heroicPersonality = { id: 'natural-leader', bonus: [] }
        h.archetype!.divided!.outFrom = 'civilian'
      })
      renderEditor(store, 'retcon')
      await userEvent.click(await screen.findByRole('radio', { name: /Raise your Red status die/ }))
      await userEvent.click(screen.getByRole('radio', { name: 'Heroic form' }))
      await waitFor(async () => expect((await saved(store)).retcon).toEqual({ id: 'upgrade-red-status', kind: 'upgradeStatusDie', form: 'heroic' }))
    })

    it('raises the Red status die straight away, but isn’t offered when it’s already d12', async () => {
      const store = await complete()
      const { unmount } = renderEditor(store, 'retcon')
      await userEvent.click(await screen.findByRole('radio', { name: /Raise your Red status die/ }))
      await waitFor(async () => expect(await savedRetcon(store)).toEqual({ id: 'upgrade-red-status', kind: 'upgradeStatusDie' }))
      unmount()
      renderEditor(await complete((h) => (h.personality = { id: 'nurturing', bonus: [], outUses: [Q('fitness')] })), 'retcon')
      await screen.findByRole('radio', { name: /Swap any two of your power dice/ })
      expect(screen.queryByRole('radio', { name: /Raise your Red status die/ })).not.toBeInTheDocument()
    })
  })

  describe('Health', () => {
    const noHealth = async () =>
      storeWith((h) => {
        Object.assign(h, { ...completeHero(), id: 'h1' })
        h.health = null
      })

    it('takes a trait and the flat value, showing Max Health with no issues left', async () => {
      const store = await noHealth()
      renderEditor(store, 'health')
      await userEvent.selectOptions(await screen.findByLabelText('Power or quality for Health'), 'Agility (d10)')
      // The formula's dice show as icons.
      const formula = screen.getByText(/Max Health = /)
      expect(within(formula).getByRole('img', { name: 'd8' })).toBeInTheDocument()
      expect(formula.textContent).not.toMatch(/\bd(4|8)\b/)
      await userEvent.click(screen.getByRole('radio', { name: 'Take 4' }))
      // 8 + Lone Wolf's d8 Red status die + Agility's d10 + 4.
      expect(await screen.findByRole('region', { name: 'Health' })).toHaveTextContent('Max 30')
      expect(screen.getByText('No rule issues in this step.')).toBeInTheDocument()
      await waitFor(async () => expect((await saved(store)).health).toEqual({ mode: 'fixed', trait: P('agility') }))
    })

    it('uses the fallback die with no eligible trait, and a trait left from before can be cleared', async () => {
      const store = await storeWith((h) => {
        Object.assign(h, { ...completeHero(), id: 'h1' })
        // No Athletic power or Mental quality left.
        h.background!.qualities = [A(Q('fitness'), 'd10'), A(Q('banter'), 'd8')]
        h.powerSource!.powers[0] = A(P('cold'), 'd10')
        h.archetype!.traits = [A(P('leaping'), 'd12'), A(P('flight'), 'd6')]
        h.health = { trait: P('agility'), mode: 'fixed' }
      })
      renderEditor(store, 'health')
      expect(await screen.findByText(/You have no power or quality that can add to Health, so you use d4/)).toBeInTheDocument()
      const select = screen.getByLabelText('Power or quality for Health')
      expect(select).toHaveDisplayValue("Agility (can't be used)")
      await userEvent.selectOptions(select, 'Choose…')
      await waitFor(async () => expect((await saved(store)).health).toEqual({ mode: 'fixed' }))
      expect(screen.queryByLabelText('Power or quality for Health')).not.toBeInTheDocument()
      expect(screen.getByText('No rule issues in this step.')).toBeInTheDocument()
    })

    it('rolls once in the app, after which the flat value is off the table', async () => {
      const store = await noHealth()
      render(
        <StoreContext.Provider value={store}>
          <HealthHarness />
        </StoreContext.Provider>,
      )
      await userEvent.click(await screen.findByRole('radio', { name: 'Roll d8' }))
      await userEvent.click(screen.getByRole('button', { name: 'Roll d8' }))
      expect(screen.getByText(/You rolled/)).toHaveTextContent('You rolled 8.')
      expect(screen.getByRole('radio', { name: /Take 4/ })).toBeDisabled()
      await waitFor(async () => expect((await saved(store)).health).toEqual({ mode: 'roll', rollResult: 8 }))
    })

    it('takes a typed-in roll, checking it, and lets it be corrected', async () => {
      const store = await noHealth()
      renderEditor(store, 'health')
      await userEvent.click(await screen.findByRole('radio', { name: 'Roll d8' }))
      await userEvent.click(screen.getByRole('button', { name: 'Enter my own roll' }))
      await userEvent.type(screen.getByRole('spinbutton', { name: 'Your d8 roll' }), '9')
      await userEvent.click(screen.getByRole('button', { name: 'Use this result' }))
      expect(screen.getByRole('alert')).toBeInTheDocument()
      await userEvent.clear(screen.getByRole('spinbutton', { name: 'Your d8 roll' }))
      await userEvent.type(screen.getByRole('spinbutton', { name: 'Your d8 roll' }), '5')
      await userEvent.click(screen.getByRole('button', { name: 'Use this result' }))
      expect(screen.getByText(/You rolled/)).toHaveTextContent('You rolled 5 (typed in).')
      expect(screen.getByRole('radio', { name: /Take 4/ })).toBeEnabled()
      await userEvent.click(screen.getByRole('button', { name: 'Correct it' }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByText(/You rolled/)).toHaveTextContent('You rolled 5 (typed in).')
      await waitFor(async () => expect((await saved(store)).health).toEqual({ mode: 'roll', rollResult: 5, manual: true }))
      // A typed-in roll can still give way to the flat value, which drops it.
      await userEvent.click(screen.getByRole('radio', { name: /Take 4/ }))
      await waitFor(async () => expect((await saved(store)).health).toEqual({ mode: 'fixed' }))
    })
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

  it('waits for saves before leaving the editor, and asks before closing the page mid-save', async () => {
    const inner = await storeWith()
    let finish: (() => void) | undefined
    const store: HeroStore = {
      list: () => inner.list(),
      get: (id) => inner.get(id),
      remove: (id) => inner.remove(id),
      save: (hero) =>
        new Promise((resolve) => {
          finish = () => void inner.save(hero).then(resolve)
        }),
    }
    window.location.hash = '#/hero/h1/edit/details'
    renderEditor(store, 'details')
    await userEvent.type(await screen.findByLabelText('Hero name'), 'A')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await userEvent.click(screen.getAllByRole('link', { name: 'Done editing' })[0]!)
    // Still here until the save lands.
    expect(window.location.hash).toBe('#/hero/h1/edit/details')
    await act(async () => finish!())
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1'))
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
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
