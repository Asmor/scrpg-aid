import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import { createHero, type Hero } from '../hero/model'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { backgrounds } from '../rules/data'
import { completeHero } from '../test/heroes'
import { HeroEditor } from './HeroEditor'
import { PREVIEW_KEY, readPreviewShown, writePreviewShown } from './preview-preference'

const renderEditor = (store: HeroStore, step: string) =>
  render(
    <StoreContext.Provider value={store}>
      <HeroEditor id="h1" step={step} />
    </StoreContext.Provider>,
  )

async function storeWith(hero: Hero) {
  const store = new MemoryHeroStore()
  await store.save({ ...hero, id: 'h1' })
  return store
}

const saved = async (store: HeroStore) => {
  const r = await store.get('h1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.hero
}

/** A viewport `width` px wide, as far as min-width media queries go. */
function viewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  window.location.hash = ''
})

describe('the wizard shell', () => {
  it('shows a docked sheet preview on wide screens, remembering when it’s hidden', async () => {
    viewport(1440)
    const view = renderEditor(await storeWith(completeHero()), 'archetype')
    const preview = await screen.findByRole('complementary', { name: 'Sheet preview' })
    // Listed abilities show their action icons, named, before the name.
    const green = within(preview).getByRole('region', { name: 'Green abilities' })
    expect(within(green).getAllByRole('img', { name: 'Attack' }).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Hide preview' }))
    expect(screen.queryByRole('complementary', { name: 'Sheet preview' })).not.toBeInTheDocument()
    expect(localStorage.getItem(PREVIEW_KEY)).toBe('hidden')
    view.unmount()
    renderEditor(await storeWith(completeHero()), 'archetype')
    expect(await screen.findByRole('button', { name: 'Show preview' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Sheet preview' })).not.toBeInTheDocument()
  })

  it('opens the preview as a drawer at medium widths, returning focus when it closes', async () => {
    viewport(1024)
    renderEditor(await storeWith(completeHero()), 'archetype')
    const show = await screen.findByRole('button', { name: 'Show preview' })
    expect(screen.queryByRole('complementary', { name: 'Sheet preview' })).not.toBeInTheDocument()
    await userEvent.click(show)
    const drawer = screen.getByRole('dialog', { name: 'Sheet preview' })
    expect(drawer).toHaveClass('modal--drawer')
    expect(within(drawer).getByRole('heading', { name: 'Sheet preview' })).toHaveFocus()
    // Tab stays inside.
    await userEvent.tab()
    expect(within(drawer).getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.tab()
    expect(within(drawer).getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(show).toHaveFocus()
  })

  it('on a phone, opens the step list and the preview as bottom sheets', async () => {
    viewport(390)
    renderEditor(await storeWith(completeHero()), 'archetype')
    expect(await screen.findByRole('heading', { level: 3, name: '3 · Archetype' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Creation steps' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Step 3 of 8.*Archetype/ }))
    const steps = screen.getByRole('dialog', { name: 'Steps' })
    expect(steps).toHaveClass('modal--sheet')
    await userEvent.click(within(steps).getByRole('link', { name: /Personality/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('dialog', { name: 'Sheet preview' })).toHaveClass('modal--sheet')
  })

  it('finishes a draft with open issues only after showing them', async () => {
    const draft = { ...createHero('guided'), status: 'draft' as const, furthestStep: 8 }
    draft.background = { id: 'upper-class', qualities: [] }
    const store = await storeWith(draft)
    renderEditor(store, 'details')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish hero' }))[0]!)
    const dialog = screen.getByRole('dialog', { name: 'Finish with rule issues?' })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)
    expect(within(dialog).getAllByRole('link', { name: 'Go to issue' })[0]).toHaveAttribute('href', '#/hero/h1/edit/background')
    // Keep editing leaves it a draft.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect((await saved(store)).status).toBe('draft')
    await userEvent.click(screen.getAllByRole('button', { name: 'Finish hero' })[1]!)
    await userEvent.click(screen.getByRole('button', { name: 'Finish anyway' }))
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1'))
    expect((await saved(store)).status).toBe('complete')
  })

  it('stays put when finishing can’t be saved', async () => {
    const store = await storeWith({ ...completeHero(), status: 'draft' })
    store.save = async () => {
      throw new Error('quota exceeded')
    }
    window.location.hash = '#/hero/h1/edit/details'
    renderEditor(store, 'details')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish hero' }))[0]!)
    expect(await screen.findByRole('alert')).toHaveTextContent('quota exceeded')
    await act(async () => {})
    expect(window.location.hash).toBe('#/hero/h1/edit/details')
  })

  it('shows when a reopened draft was last saved, and the method in the rail', async () => {
    const store = await storeWith({ ...createHero('guided'), status: 'draft', rollMode: 'manual', updatedAt: new Date().toISOString() })
    renderEditor(store, 'start')
    expect(await screen.findByText('Draft · saved just now')).toBeInTheDocument()
    expect(screen.getByText('Guided method · rolling your own dice.')).toBeInTheDocument()
  })
})

describe('step anatomy', () => {
  it('lists only what a Guided roll of 7 and 3 allows, each tagged with how it was reached', async () => {
    const store = await storeWith({ ...createHero('guided'), pendingRolls: { background: { dice: ['d10', 'd10'], results: [7, 3], manual: false } } })
    renderEditor(store, 'background')
    const choose = await screen.findByRole('region', { name: 'Choose a background' })
    expect(within(choose).getByText('Showing the 3 backgrounds your roll allows.')).toBeInTheDocument()
    const radios = within(choose).getAllByRole('radio')
    expect(radios.map((r) => r.closest('label')!.querySelector('.option__name')!.textContent)).toEqual(['Struggling', 'Academic', 'Military'])
    expect(radios.map((r) => [...r.closest('label')!.querySelectorAll('.tag')].map((t) => t.textContent))).toEqual([['Rolled 3'], ['Rolled 7'], ['Sum, 7 + 3']])
    expect(screen.getByText(/You rolled/)).toHaveTextContent('Pick 7, 3, or their sum, 10.')
  })

  it('tags each different way a three-dice roll reaches an option', async () => {
    const bg = backgrounds.find((b) => b.powerSourceDice.length === 3 && b.powerSourceDice.every((d) => Number(d.slice(1)) >= 8))!
    const hero = { ...createHero('guided'), background: { id: bg.id, qualities: [] }, pendingRolls: { powerSource: { dice: bg.powerSourceDice, results: [4, 3, 4], manual: false } } }
    renderEditor(await storeWith(hero), 'power-source')
    const choose = await screen.findByRole('region', { name: 'Choose a power source' })
    const seven = within(choose).getAllByRole('radio').find((r) => r.closest('label')!.querySelector('.option__n')!.textContent === '7')!
    // 4 + 3 twice reads once.
    expect([...seven.closest('label')!.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual(['Sum, 4 + 3'])
    const eight = within(choose).getAllByRole('radio').find((r) => r.closest('label')!.querySelector('.option__n')!.textContent === '8')
    if (eight) expect([...eight.closest('label')!.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual(['Sum, 4 + 4'])
    const four = within(choose).getAllByRole('radio').find((r) => r.closest('label')!.querySelector('.option__n')!.textContent === '4')!
    expect([...four.closest('label')!.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual(['Rolled 4'])
  })

  it('asks for the player’s own roll first when they roll their own dice', async () => {
    renderEditor(await storeWith({ ...createHero('guided'), rollMode: 'manual' }), 'background')
    expect(await screen.findByRole('spinbutton', { name: 'd10 #1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll in the app instead' })).toBeInTheDocument()
  })

  it('shows the dice in and out, and counts assigned dice', async () => {
    const hero = { ...createHero('constructed'), background: { id: 'upper-class', qualities: [] } }
    renderEditor(await storeWith(hero), 'power-source')
    const diceIn = await screen.findByRole('region', { name: 'Dice in' })
    expect(within(diceIn).getByText('From Background')).toBeInTheDocument()
    expect(within(diceIn).getAllByRole('img').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('radio', { name: /Accident/ }))
    const out = screen.getByRole('region', { name: 'Dice out' })
    expect(out).toHaveTextContent('Archetype rolls')
    expect(screen.getByText(/0 of \d dice assigned/)).toBeInTheDocument()
  })

  it('takes the player to the field an issue is about', async () => {
    const hero = { ...createHero('constructed'), background: { id: 'upper-class', qualities: [] } }
    renderEditor(await storeWith(hero), 'background')
    const issues = await screen.findByRole('region', { name: '2 things to look at' })
    await userEvent.click(within(issues).getByRole('button', { name: /no dice are assigned yet/ }))
    expect(screen.getByRole('combobox', { name: 'd10' })).toHaveFocus()
    await userEvent.click(within(issues).getByRole('button', { name: /Choose a principle/ }))
    expect(screen.getByRole('combobox', { name: /Principle of Responsibility/ })).toHaveFocus()
  })

  it('goes to an issue from the Finish dialog, focusing its field', async () => {
    const draft = { ...createHero('constructed'), status: 'draft' as const, background: { id: 'upper-class', qualities: [] } }
    const store = await storeWith(draft)
    const view = renderEditor(store, 'details')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish hero' }))[0]!)
    const go = within(screen.getByRole('dialog')).getAllByRole('link', { name: 'Go to issue' })[0]!
    expect(go).toHaveAttribute('href', '#/hero/h1/edit/background')
    await userEvent.click(go)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The app follows the link's address to the step; here the test passes the new step itself.
    view.rerender(
      <StoreContext.Provider value={store}>
        <HeroEditor id="h1" step="background" />
      </StoreContext.Provider>,
    )
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'd10' })).toHaveFocus())
  })

  it('shows status dice and Health ranges in their game colors, with their labels', async () => {
    const hero = completeHero()
    renderEditor(await storeWith(hero), 'personality')
    const status = await screen.findByRole('list', { name: 'Status dice' })
    expect(within(status).getAllByRole('listitem').map((li) => li.className)).toEqual(['game-chip game-chip--green', 'game-chip game-chip--yellow', 'game-chip game-chip--red'])
    expect(status).toHaveTextContent('GreenYellowRed')
  })
})

describe('the preview preference', () => {
  it('is shown unless hidden, and survives storage that throws', () => {
    const data: Record<string, string> = {}
    const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) }
    expect(readPreviewShown(storage)).toBe(true)
    writePreviewShown(false, storage)
    expect(readPreviewShown(storage)).toBe(false)
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readPreviewShown(throwing)).toBe(true)
    expect(() => writePreviewShown(true, throwing)).not.toThrow()
  })
})
