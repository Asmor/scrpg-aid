import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import { exampleHero } from '../hero/example'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { HeroList } from './HeroList'

const renderList = (store: HeroStore) =>
  render(
    <StoreContext.Provider value={store}>
      <HeroList />
    </StoreContext.Provider>,
  )

afterEach(() => {
  window.location.hash = ''
})

describe('HeroList', () => {
  it('says when there are no heroes', async () => {
    renderList(new MemoryHeroStore())
    expect(await screen.findByText(/No heroes yet/)).toBeInTheDocument()
  })

  it('lists saved heroes with links to their sheets', async () => {
    const store = new MemoryHeroStore()
    const hero = exampleHero({ id: 'maya' })
    await store.save(hero)
    renderList(store)
    const link = await screen.findByRole('link', { name: /Maya Reyes/ })
    expect(link).toHaveAttribute('href', '#/hero/maya')
    expect(link).toHaveTextContent('Speedster')
  })

  it('creates a new hero or the example hero, and opens it', async () => {
    const store = new MemoryHeroStore()
    renderList(store)
    await userEvent.click(await screen.findByRole('button', { name: 'New hero' }))
    const [created] = (await store.list()).heroes
    expect(created?.method).toBe('guided')
    // A new hero opens in the editor…
    expect(window.location.hash).toBe(`#/hero/${created!.id}/edit/background`)

    // …and the example hero as a finished sheet.
    await userEvent.click(screen.getByRole('button', { name: 'Add example hero' }))
    const example = (await store.list()).heroes.find((h) => h.details.name === 'Maya Reyes')
    expect(window.location.hash).toBe(`#/hero/${example!.id}`)
  })

  it('asks before deleting, keeping keyboard focus in place', async () => {
    const store = new MemoryHeroStore()
    await store.save(exampleHero({ id: 'maya' }))
    renderList(store)
    const deleteButton = await screen.findByRole('button', { name: 'Delete Maya Reyes' })
    await userEvent.click(deleteButton)
    const confirm = screen.getByRole('group', { name: 'Delete Maya Reyes?' })
    // Focus moves to the safe choice…
    expect(within(confirm).getByRole('button', { name: 'Keep' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    // …and back to the Delete button when the player keeps the hero.
    expect(screen.getByRole('button', { name: 'Delete Maya Reyes' })).toHaveFocus()
    expect((await store.list()).heroes).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Delete Maya Reyes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByText(/No heroes yet/)).toBeInTheDocument()
    expect((await store.list()).heroes).toHaveLength(0)
    // After deleting, focus goes to the list heading.
    expect(screen.getByRole('heading', { name: 'Your heroes' })).toHaveFocus()
  })

  it('reports a failed delete, disabling the choices while it runs and refocusing Keep after', async () => {
    const store = new MemoryHeroStore()
    await store.save(exampleHero({ id: 'maya' }))
    let fail!: (e: Error) => void
    store.remove = () =>
      new Promise((_, reject) => {
        fail = reject
      })
    renderList(store)
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Maya Reyes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    const confirm = screen.getByRole('group', { name: 'Delete Maya Reyes?' })
    expect(within(confirm).getByRole('button', { name: 'Yes, delete' })).toBeDisabled()
    expect(within(confirm).getByRole('button', { name: 'Keep' })).toBeDisabled()
    await act(async () => fail(new Error('locked')))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete it: locked")
    await waitFor(() => expect(within(confirm).getByRole('button', { name: 'Keep' })).toHaveFocus())
    expect((await store.list()).heroes).toHaveLength(1)
  })

  it('shows saved heroes it can’t read, and deletes one only after confirming', async () => {
    const removed: string[] = []
    const unreadable = [
      { id: 'old', error: 'hero.id is missing' },
      { id: 'new', error: 'version 9 is newer than this app' },
    ]
    const store: HeroStore = {
      list: async () => ({ heroes: [], unreadable: unreadable.filter((u) => !removed.includes(u.id)) }),
      get: async () => ({ status: 'missing' }),
      save: async () => {},
      remove: async (id) => {
        removed.push(id)
      },
    }
    renderList(store)
    expect(await screen.findByRole('heading', { name: "2 saved heroes couldn't be read" })).toBeInTheDocument()
    expect(screen.getByText(/old: hero.id is missing/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete unreadable record old' }))
    expect(removed).toEqual([])
    await userEvent.click(within(screen.getByRole('group', { name: 'Delete unreadable record old?' })).getByRole('button', { name: 'Yes, delete' }))
    expect(removed).toEqual(['old'])
    expect(await screen.findByRole('heading', { name: "One saved hero couldn't be read" })).toBeInTheDocument()
  })

  it('reports a failed save next to the list, without losing it', async () => {
    const store = new MemoryHeroStore()
    await store.save(exampleHero({ id: 'maya' }))
    store.save = async () => {
      throw new Error('quota exceeded')
    }
    renderList(store)
    await userEvent.click(await screen.findByRole('button', { name: 'New hero' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the hero: quota exceeded")
    expect(screen.getByRole('link', { name: /Maya Reyes/ })).toBeInTheDocument()
  })

  it('disables creating heroes until the list has loaded', () => {
    const store: HeroStore = {
      list: () => new Promise(() => {}),
      get: async () => ({ status: 'missing' }),
      save: async () => {},
      remove: async () => {},
    }
    renderList(store)
    expect(screen.getByRole('button', { name: 'New hero' })).toBeDisabled()
  })

  it('reports storage errors', async () => {
    const store: HeroStore = {
      list: async () => {
        throw new Error('quota exceeded')
      },
      get: async () => ({ status: 'missing' }),
      save: async () => {},
      remove: async () => {},
    }
    renderList(store)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your saved heroes: quota exceeded")
  })
})
