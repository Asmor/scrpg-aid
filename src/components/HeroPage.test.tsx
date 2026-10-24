import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { GetResult, HeroStore } from '../hero/store'
import { HeroPage } from './HeroPage'

const storeReturning = (get: () => Promise<GetResult>): HeroStore => ({
  list: async () => ({ heroes: [], unreadable: [] }),
  get,
  save: async () => {},
  remove: async () => {},
})

const renderPage = (store: HeroStore) =>
  render(
    <StoreContext.Provider value={store}>
      <HeroPage id="x" />
    </StoreContext.Provider>,
  )

describe('HeroPage', () => {
  it('links back to the list while loading', () => {
    renderPage(storeReturning(() => new Promise(() => {})))
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← All heroes' })).toHaveAttribute('href', '#/')
  })

  it('says when a saved hero can’t be read', async () => {
    renderPage(storeReturning(async () => ({ status: 'unreadable', error: 'hero.method has an unknown value' })))
    expect(await screen.findByRole('alert')).toHaveTextContent("This hero couldn't be read: hero.method has an unknown value")
  })

  it('reports storage errors', async () => {
    renderPage(
      storeReturning(async () => {
        throw new Error('database closed')
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('database closed')
  })
})
