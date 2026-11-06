import { completeHero } from '../test/heroes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import { GameStoreContext } from '../app/game-store-context'
import { MemoryGameStore } from '../game/store'
import type { GetResult, HeroStore } from '../hero/store'
import { buildSheet } from '../creation/sheet'
import { exampleHero } from '../hero/example'
import { stepStates } from '../hero/wizard-steps'
import { readImport } from '../transfer/files'
import { downloadFile } from '../transfer/download'
import { loadIconDataUris } from '../transfer/icons'
import { HeroPage } from './HeroPage'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))
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
      <GameStoreContext.Provider value={new MemoryGameStore()}>
        <HeroPage id="x" />
      </GameStoreContext.Provider>
    </StoreContext.Provider>,
  )

/** Chooses an item from the header's Export menu. */
async function exportAs(item: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Export' }))
  await userEvent.click(within(screen.getByRole('list', { name: 'Export as' })).getByRole('button', { name: item }))
}

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

  it("shows a swap's rule issue in the usual banner, leading to Advancement", async () => {
    const power = (id: string) => ({ kind: 'power' as const, id })
    const hero = { ...completeHero(), id: 'x', advancement: [{ id: 'e', at: '2026-11-04T12:00:00Z', kind: 'details' as const, text: 't', change: { kind: 'swapPower' as const, from: power('cold'), to: power('sonic') } }] }
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent('1 rule issue')
    expect(note).toHaveTextContent("you don't have")
    expect(within(note).getByRole('link', { name: 'Open Advancement' })).toHaveAttribute('href', '#/hero/x/advancement')
  })

  it('links a finished hero to Play, Edit and Advancement', async () => {
    renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    // The breadcrumb starts at the library.
    expect(await screen.findByRole('link', { name: 'Library' })).toHaveAttribute('href', '#/')
    // In the header, and in the record strip.
    const advancement = await screen.findAllByRole('link', { name: 'Advancement' })
    expect(advancement).toHaveLength(2)
    for (const link of advancement) expect(link).toHaveAttribute('href', '#/hero/x/advancement')
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '#/hero/x/edit')
    const modes = screen.getByRole('group', { name: 'Mode' })
    expect(within(modes).getByRole('button', { name: 'Sheet' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(modes).getByRole('button', { name: 'Play' }))
    expect(window.location.hash).toBe('#/hero/x/play')
    window.location.hash = ''
  })

  it('offers only Continue for a draft, which still exports as a draft', async () => {
    const draft = { ...exampleHero({ id: 'x' }), status: 'draft' as const, furthestStep: 2 }
    vi.mocked(downloadFile).mockClear()
    renderPage(storeReturning(async () => ({ status: 'found', hero: draft })))
    expect(await screen.findByRole('link', { name: 'Continue making this hero' })).toHaveAttribute('href', '#/hero/x/edit/power-source')
    expect(screen.queryByRole('group', { name: 'Mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Advancement' })).not.toBeInTheDocument()
    await exportAs('JSON')
    expect(readImport(vi.mocked(downloadFile).mock.calls[0]![1] as string)).toMatchObject({ ok: true, heroes: [{ status: 'draft' }] })
  })

  it('names a finished hero’s rule issues in a banner linking to the edit summary', async () => {
    const hero = exampleHero({ id: 'x' })
    hero.redAbilities = []
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    const count = stepStates(hero, buildSheet(hero).warnings).reduce((n, s) => n + s.issues.length, 0)
    expect(count).toBe(1)
    const banner = await screen.findByRole('note')
    const first = stepStates(hero, buildSheet(hero).warnings).flatMap((s) => s.issues)[0]!
    expect(banner).toHaveTextContent(`1 rule issue${first.message}`)
    expect(within(banner).getByRole('link', { name: 'Open in edit' })).toHaveAttribute('href', '#/hero/x/edit')
  })

  it('counts every step’s issues in the banner', async () => {
    const hero = exampleHero({ id: 'x' })
    hero.redAbilities = []
    hero.retcon = { id: 'no-such-retcon', kind: 'upgradeStatusDie' }
    const count = stepStates(hero, buildSheet(hero).warnings).reduce((n, s) => n + s.issues.length, 0)
    expect(count).toBeGreaterThan(1)
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    expect(await screen.findByRole('note')).toHaveTextContent(`${count} rule issues`)
  })

  it('shows no issue banner for a hero without issues, or for a draft', async () => {
    const view = renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    await screen.findByRole('link', { name: 'Edit' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    view.unmount()
    const draft = { ...exampleHero({ id: 'x' }), status: 'draft' as const, redAbilities: [] }
    renderPage(storeReturning(async () => ({ status: 'found', hero: draft })))
    await screen.findByRole('link', { name: 'Continue making this hero' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('closes the Export menu on Escape, returning focus to its button', async () => {
    renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    const button = await screen.findByRole('button', { name: 'Export' })
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('list', { name: 'Export as' })).getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining(['JSON', 'Markdown', 'HTML', 'PDF, Letter', 'PDF, A4']))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('list', { name: 'Export as' })).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes the Export menu when focus leaves it', async () => {
    renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }))
    // Through the five items and out.
    for (let i = 0; i < 6; i++) await userEvent.tab()
    expect(screen.queryByRole('list', { name: 'Export as' })).not.toBeInTheDocument()
  })

  it('keeps the Export menu open on a blur that goes nowhere (Safari, clicking an item)', async () => {
    vi.mocked(downloadFile).mockClear()
    renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    const button = await screen.findByRole('button', { name: 'Export' })
    await userEvent.click(button)
    fireEvent.blur(button, { relatedTarget: null })
    const menu = screen.getByRole('list', { name: 'Export as' })
    await userEvent.click(within(menu).getByRole('button', { name: 'JSON' }))
    expect(downloadFile).toHaveBeenCalled()
  })

  it('in Play mode, hides Roleplaying and swaps Advancement and Export for Solo play and its ⋯', async () => {
    render(
      <StoreContext.Provider value={storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) }))}>
        <GameStoreContext.Provider value={new MemoryGameStore()}>
          <HeroPage id="x" mode="play" />
        </GameStoreContext.Provider>
      </StoreContext.Provider>,
    )
    expect(await screen.findByRole('button', { name: "More for Maya Reyes's Play page" })).toBeInTheDocument()
    expect(screen.getByText('Solo play')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Roleplaying' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Advancement' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Mode' })).getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("offers one working Start over when the hero's play state can't be read", async () => {
    const games = new MemoryGameStore()
    await (games as unknown as { putRecord: (r: unknown) => Promise<void> }).putRecord({ id: 'solo-hero-x', saved: { format: 'scrpg-game', version: 2, game: {} } })
    render(
      <StoreContext.Provider value={storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) }))}>
        <GameStoreContext.Provider value={games}>
          <HeroPage id="x" mode="play" />
        </GameStoreContext.Provider>
      </StoreContext.Provider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent("This hero's play state couldn't be read: saved by an older version of the app (format 2)")
    // Not the ⋯ menu's Start over: that one changes a loaded game, and there isn't one.
    expect(screen.queryByRole('button', { name: "More for Maya Reyes's Play page" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start over…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, start over' }))
    expect(await screen.findByRole('button', { name: "More for Maya Reyes's Play page" })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['JSON', 'maya-reyes.json', 'application/json'],
    ['Markdown', 'maya-reyes.md', 'text/markdown'],
    ['HTML', 'maya-reyes.html', 'text/html'],
  ])('exports the hero as %s that imports back', async (format, fileName, mediaType) => {
    vi.mocked(downloadFile).mockClear()
    const hero = exampleHero({ id: 'x' })
    renderPage(storeReturning(async () => ({ status: 'found', hero })))
    await exportAs(format)
    await waitFor(() => expect(downloadFile).toHaveBeenCalled())
    const [name, text, type] = vi.mocked(downloadFile).mock.calls[0]!
    expect(name).toBe(fileName)
    expect(type).toBe(mediaType)
    expect(readImport(text as string)).toEqual({ ok: true, heroes: [hero], villains: [], games: [], savedSearches: [], templates: { minionTemplates: [], lieutenantTemplates: [], challengeTemplates: [], environmentTemplates: [] }, skipped: [] })
  })

  it('says when the HTML file couldn’t be made', async () => {
    vi.mocked(downloadFile).mockImplementationOnce(() => {
      throw new Error('no space')
    })
    renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
    await exportAs('HTML')
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the HTML file: no space")
  })

  it('makes a PDF by printing the sheet, on the chosen paper with the name in the footer', async () => {
    let rules = ''
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      rules = document.head.querySelector('style[data-print]')?.textContent ?? ''
    })
    try {
      renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
      // Each paper size is its own item.
      await exportAs('PDF, A4')
      expect(print).toHaveBeenCalledOnce()
      expect(rules).toBe('@page { size: A4; @bottom-left { content: "Maya Reyes"; } }')
    } finally {
      print.mockRestore()
    }
  })

  it('explains an export that couldn’t be downloaded: offline, or after an update', async () => {
    const downloadError = () => Object.assign(new Error("couldn't load /assets/html.js (404)"), { name: 'DownloadError' })
    const online = vi.spyOn(navigator, 'onLine', 'get')
    try {
      online.mockReturnValue(false)
      vi.mocked(loadIconDataUris).mockRejectedValueOnce(downloadError())
      const view = renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
      await exportAs('HTML')
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the HTML file: you're offline")
      view.unmount()

      online.mockReturnValue(true)
      vi.mocked(loadIconDataUris).mockRejectedValueOnce(downloadError())
      renderPage(storeReturning(async () => ({ status: 'found', hero: exampleHero({ id: 'x' }) })))
      await exportAs('HTML')
      expect(await screen.findByRole('alert')).toHaveTextContent('If the app offers an update, accept it (or reload the page), then try again.')
    } finally {
      online.mockRestore()
    }
  })
})
