import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { GetResult, HeroStore } from '../hero/store'
import { exampleHero } from '../hero/example'
import { readImport } from '../transfer/files'
import { downloadFile } from '../transfer/download'
import { exportPdf } from '../transfer/pdf'
import { HeroPage } from './HeroPage'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))
vi.mock('../transfer/pdf', () => ({ exportPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }))
vi.mock('../transfer/icons', async (original) => {
  const { TEST_ICONS } = await import('../test/icons')
  return { ...(await original<typeof import('../transfer/icons')>()), loadIconDataUris: vi.fn(async () => TEST_ICONS) }
})

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
    expect(readImport(text as string)).toEqual({ ok: true, heroes: [hero], villains: [], skipped: [] })
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
    expect(readImport(text as string)).toEqual({ ok: true, heroes: [hero], villains: [], skipped: [] })
  })

  it('exports the hero as an HTML page that imports back', async () => {
    vi.mocked(downloadFile).mockClear()
    const hero = exampleHero({ id: 'x' })
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    await userEvent.click(await screen.findByRole('button', { name: 'Download HTML' }))
    await waitFor(() => expect(downloadFile).toHaveBeenCalled())
    const [name, text, type] = vi.mocked(downloadFile).mock.calls[0]!
    expect(name).toBe('maya-reyes.html')
    expect(type).toBe('text/html')
    expect(readImport(text as string)).toEqual({ ok: true, heroes: [hero], villains: [], skipped: [] })
  })

  it('says when the HTML file couldn’t be made', async () => {
    vi.mocked(downloadFile).mockImplementationOnce(() => {
      throw new Error('no space')
    })
    renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    await userEvent.click(await screen.findByRole('button', { name: 'Download HTML' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the HTML file: no space")
  })

  it('exports a PDF on the chosen page size', async () => {
    vi.mocked(downloadFile).mockClear()
    const hero = exampleHero({ id: 'x' })
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    // The page size options sit after the button, as radio buttons.
    const sizes = await screen.findByRole('radiogroup', { name: 'Page size' })
    await userEvent.click(within(sizes).getByRole('radio', { name: 'A4' }))
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(downloadFile).toHaveBeenCalled())
    expect(exportPdf).toHaveBeenCalledWith(hero, 'a4')
    const [name, bytes, type] = vi.mocked(downloadFile).mock.calls[0]!
    expect(name).toBe('maya-reyes.pdf')
    expect(type).toBe('application/pdf')
    expect(bytes).toEqual(new Uint8Array([37, 80, 68, 70]))
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled()
  })

  it('says when the PDF couldn’t be made', async () => {
    vi.mocked(exportPdf).mockRejectedValueOnce(new Error('font missing'))
    renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the PDF: font missing")
  })

  it('explains a PDF maker that couldn’t be downloaded: offline, or after an update', async () => {
    const downloadError = () => Object.assign(new Error("couldn't load /assets/font.ttf (404)"), { name: 'DownloadError' })
    const online = vi.spyOn(navigator, 'onLine', 'get')
    try {
      online.mockReturnValue(false)
      vi.mocked(exportPdf).mockRejectedValueOnce(downloadError())
      const view = renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
      await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the PDF: you're offline, and part of it downloads the first time it's used")
      view.unmount()

      online.mockReturnValue(true)
      vi.mocked(exportPdf).mockRejectedValueOnce(downloadError())
      renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
      await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('If the app offers an update, accept it (or reload the page), then try again.')
    } finally {
      online.mockRestore()
    }
  })
})
