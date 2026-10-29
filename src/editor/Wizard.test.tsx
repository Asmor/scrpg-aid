import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import { createHero, type Hero } from '../hero/model'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
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
