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

  it('opens About from the header on the library and on other pages', async () => {
    render(<App store={new MemoryHeroStore()} villainStore={new MemoryVillainStore()} searchStore={new MemorySavedSearchStore()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'About' }))
    expect(within(screen.getByRole('dialog', { name: 'About SCRPG Aid' })).getByText(/^Version /)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    go('#/join')
    await screen.findByRole('heading', { level: 1, name: 'SCRPG Aid' })
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    expect(screen.getByRole('dialog', { name: 'About SCRPG Aid' })).toBeInTheDocument()
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
