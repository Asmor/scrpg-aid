import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { GetResult, HeroStore } from '../hero/store'
import { exampleHero } from '../hero/example'
import { readImport } from '../transfer/files'
import { downloadFile } from '../transfer/download'
import { HeroPage } from './HeroPage'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

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

  it('exports the hero as JSON that imports back', async () => {
    vi.mocked(downloadFile).mockClear()
    const hero = exampleHero({ id: 'x' })
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    await userEvent.click(await screen.findByRole('button', { name: 'Download JSON' }))
    const [name, text, type] = vi.mocked(downloadFile).mock.calls[0]!
    expect(name).toBe('maya-reyes.json')
    expect(type).toBe('application/json')
    expect(readImport(text as string)).toEqual({ ok: true, heroes: [hero], skipped: [] })
  })

  it('exports the hero as Markdown that imports back', async () => {
    vi.mocked(downloadFile).mockClear()
    const hero = exampleHero({ id: 'x' })
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    await userEvent.click(await screen.findByRole('button', { name: 'Download Markdown' }))
    const [name, text, type] = vi.mocked(downloadFile).mock.calls[0]!
    expect(name).toBe('maya-reyes.md')
    expect(type).toBe('text/markdown')
    expect(text).toMatch(/^# Maya Reyes\n/)
    expect(readImport(text as string)).toEqual({ ok: true, heroes: [hero], skipped: [] })
  })
})
