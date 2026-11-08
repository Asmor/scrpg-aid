import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { exampleHero } from './hero/example'
import { MemoryHeroStore } from './hero/store'
import { MemorySavedSearchStore } from './library/saved-searches'
import { MemoryVillainStore } from './villain/store'

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

describe('App', () => {
  it('renders the app title, linking home, on the library and on other pages', async () => {
    render(<App store={new MemoryHeroStore()} villainStore={new MemoryVillainStore()} searchStore={new MemorySavedSearchStore()} />)
    expect(screen.getByRole('link', { name: 'SCRPG Aid' })).toHaveAttribute('href', '#/')
    go('#/join')
    const title = await screen.findByRole('heading', { level: 1, name: 'SCRPG Aid' })
    expect(title.querySelector('a')).toHaveAttribute('href', '#/')
  })

  it('opens About and Keyboard shortcuts from the Help menu, and the Help page, on the library and on other pages', async () => {
    render(<App store={new MemoryHeroStore()} villainStore={new MemoryVillainStore()} searchStore={new MemorySavedSearchStore()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Help' }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'Help' })).getByRole('menuitem', { name: 'About SCRPG Aid' }))
    expect(within(screen.getByRole('dialog', { name: 'About SCRPG Aid' })).getByText(/^Version /)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    go('#/join')
    await screen.findByRole('heading', { level: 1, name: 'SCRPG Aid' })
    await userEvent.click(screen.getByRole('button', { name: 'Help' }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'Help' })).getByRole('menuitem', { name: 'Keyboard shortcuts' }))
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(within(screen.getByRole('menu', { name: 'Help' })).getByRole('menuitem', { name: 'Help topics' })).toHaveAttribute('href', '#/help')
    go('#/help/glossary')
    expect(await screen.findByRole('heading', { level: 1, name: 'Glossary' })).toBeInTheDocument()
  })

  it("on phones, the other pages' header has the library's one menu instead of Settings and Help", async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<App store={new MemoryHeroStore()} villainStore={new MemoryVillainStore()} searchStore={new MemorySavedSearchStore()} />)
    for (const hash of ['#/settings', '#/help']) {
      go(hash)
      const header = within((await screen.findByRole('heading', { level: 1, name: 'SCRPG Aid' })).closest('header')!)
      expect(header.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument()
      expect(header.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
      await userEvent.click(header.getByRole('button', { name: 'Menu: color scheme, settings, help' }))
      const menu = within(screen.getByRole('menu', { name: 'Settings and help' }))
      expect(menu.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Settings', 'Help topics', 'Keyboard shortcuts', 'About SCRPG Aid'])
      await userEvent.keyboard('{Escape}')
    }
  })

  it('opens Keyboard shortcuts with ? anywhere outside a text field', async () => {
    const store = new MemoryHeroStore()
    await store.save(exampleHero({ id: 'maya' }))
    render(<App store={store} villainStore={new MemoryVillainStore()} searchStore={new MemorySavedSearchStore()} />)
    const search = await screen.findByRole('searchbox', { name: 'Search by name' })
    await userEvent.click(search)
    await userEvent.keyboard('?')
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()
    expect(search).toHaveValue('?')
    await userEvent.clear(search)
    search.blur()
    await userEvent.keyboard('?')
    const dialog = within(screen.getByRole('dialog', { name: 'Keyboard shortcuts' }))
    expect(dialog.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Anywhere', 'Game table', 'Dice pad', 'Rolling'])
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // "/" goes to the library's search.
    await userEvent.keyboard('/')
    expect(search).toHaveFocus()
    expect(search).toHaveValue('')
  })

  it('shows the hero list, a hero’s sheet, a missing hero, and unknown pages', async () => {
    const store = new MemoryHeroStore()
    await store.save(exampleHero({ id: 'maya' }))
    render(<App store={store} villainStore={new MemoryVillainStore()} searchStore={new MemorySavedSearchStore()} />)
    expect(await screen.findByRole('link', { name: 'Afterimage' })).toHaveAttribute('href', '#/hero/maya')

    go('#/hero/maya')
    expect(await screen.findByRole('heading', { level: 2, name: 'Afterimage' })).toBeInTheDocument()

    // Sheet and Play are one page: switching doesn't load the hero again.
    const get = vi.spyOn(store, 'get')
    go('#/hero/maya/play')
    expect(await screen.findByText('Solo play')).toBeInTheDocument()
    go('#/hero/maya')
    expect(await screen.findByRole('heading', { name: 'Roleplaying' })).toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()

    go('#/hero/nobody')
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved hero with that link.")

    go('#/nowhere')
    expect(screen.getByRole('alert')).toHaveTextContent("That page doesn't exist.")
  })
})
