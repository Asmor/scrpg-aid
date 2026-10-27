import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { exampleHero } from './hero/example'
import { MemoryHeroStore } from './hero/store'

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

afterEach(() => {
  window.location.hash = ''
})

describe('App', () => {
  it('renders the app title, linking home', () => {
    render(<App store={new MemoryHeroStore()} />)
    const title = screen.getByRole('heading', { level: 1, name: 'SCRPG Aid' })
    expect(title.querySelector('a')).toHaveAttribute('href', '#/')
  })

  it('shows the hero list, a hero’s sheet, a missing hero, and unknown pages', async () => {
    const store = new MemoryHeroStore()
    await store.save(exampleHero({ id: 'maya' }))
    render(<App store={store} />)
    expect(await screen.findByRole('heading', { name: 'Your heroes' })).toBeInTheDocument()

    go('#/hero/maya')
    expect(await screen.findByRole('heading', { level: 2, name: 'Maya Reyes' })).toBeInTheDocument()

    go('#/hero/nobody')
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved hero with that link.")

    go('#/nowhere')
    expect(screen.getByRole('alert')).toHaveTextContent("That page doesn't exist.")
  })
})
