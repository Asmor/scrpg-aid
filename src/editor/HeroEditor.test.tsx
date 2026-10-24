import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import { createHero, type Hero } from '../hero/model'
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
    expect(screen.getByLabelText('d6 #1')).not.toBe(screen.getByLabelText('d6 #2'))
  })

  it('rolls in the app too', async () => {
    const store = await storeWith()
    renderEditor(store, 'background')
    await userEvent.click(await screen.findByRole('button', { name: 'Roll d10 and d10' }))
    expect(screen.getByText(/You rolled/)).not.toHaveTextContent('typed in')
    expect(screen.getByRole('button', { name: 'Reroll' })).toBeInTheDocument()
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
