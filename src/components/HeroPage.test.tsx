import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { GetResult, HeroStore } from '../hero/store'
import { buildSheet } from '../creation/sheet'
import { exampleHero } from '../hero/example'
import { stepStates } from '../hero/wizard-steps'
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

  it('links a finished hero to Play, Edit and Advancement', async () => {
    renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    expect(await screen.findByRole('link', { name: 'Advancement' })).toHaveAttribute('href', '#/hero/x/advancement')
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '#/hero/x/play')
    expect(screen.getByRole('link', { name: 'Edit hero' })).toHaveAttribute('href', '#/hero/x/edit')
  })

  it('offers Play and Edit for a finished hero, but only Continue for a draft, which still exports as a draft', async () => {
    const draft = { ...exampleHero({ id: 'x' }), status: 'draft' as const, furthestStep: 2 }
    vi.mocked(downloadFile).mockClear()
    renderPage(storeReturning(async () => ({ status: 'found', hero: draft })))
    expect(await screen.findByRole('link', { name: 'Continue making this hero' })).toHaveAttribute('href', '#/hero/x/edit/power-source')
    expect(screen.queryByRole('link', { name: 'Play' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    expect(readImport(vi.mocked(downloadFile).mock.calls[0]![1] as string)).toMatchObject({ ok: true, heroes: [{ status: 'draft' }] })
  })

  it('names a finished hero’s rule issues in a banner linking to the edit summary', async () => {
    const hero = exampleHero({ id: 'x' })
    hero.redAbilities = []
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    const count = stepStates(hero, buildSheet(hero).warnings).reduce((n, s) => n + s.issues.length, 0)
    expect(count).toBe(1)
    const banner = await screen.findByRole('note')
    expect(banner).toHaveTextContent('This hero has one rule issue.')
    expect(within(banner).getByRole('link', { name: 'Review in edit summary' })).toHaveAttribute('href', '#/hero/x/edit')
  })

  it('counts every step’s issues in the banner', async () => {
    const hero = exampleHero({ id: 'x' })
    hero.redAbilities = []
    hero.retcon = { id: 'no-such-retcon', kind: 'upgradeStatusDie' }
    const count = stepStates(hero, buildSheet(hero).warnings).reduce((n, s) => n + s.issues.length, 0)
    expect(count).toBeGreaterThan(1)
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    expect(await screen.findByRole('note')).toHaveTextContent(`This hero has ${count} rule issues.`)
  })

  it('shows no issue banner for a hero without issues, or for a draft', async () => {
    const view = renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    await screen.findByRole('link', { name: 'Edit hero' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    view.unmount()
    const draft = { ...exampleHero({ id: 'x' }), status: 'draft' as const, redAbilities: [] }
    renderPage(storeReturning(async () => ({ status: 'found', hero: draft })))
    await screen.findByRole('link', { name: 'Continue making this hero' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
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
