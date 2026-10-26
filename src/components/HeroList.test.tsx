import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreContext } from '../app/store-context'
import { exampleHero } from '../hero/example'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { createHero } from '../hero/model'
import { toSaved } from '../hero/serialize'
import { downloadFile } from '../transfer/download'
import { backupJson, readImport } from '../transfer/files'
import { heroHtml } from '../transfer/html'
import { TEST_ICONS } from '../test/icons'
import { heroMarkdown } from '../transfer/markdown'
import { HeroList } from './HeroList'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

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

  describe('import and backup', () => {
    beforeEach(() => vi.mocked(downloadFile).mockClear())

    const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!
    const upload = async (text: string, name = 'hero.json') => {
      await screen.findByRole('button', { name: 'Import from a file…' })
      await userEvent.upload(fileInput(), new File([text], name, { type: 'application/json' }))
    }
    const named = (id: string, name: string) => {
      const h = createHero('guided', { id })
      h.details.name = name
      return h
    }

    it('backs up every hero to one file', async () => {
      const store = new MemoryHeroStore()
      await store.save(exampleHero({ id: 'maya' }))
      renderList(store)
      await userEvent.click(await screen.findByRole('button', { name: 'Back up all heroes' }))
      const [name, text, type] = vi.mocked(downloadFile).mock.calls[0]!
      expect(name).toMatch(/^scrpg-heroes-\d{4}-\d{2}-\d{2}\.json$/)
      expect(type).toBe('application/json')
      expect(readImport(text as string)).toMatchObject({ ok: true, heroes: [{ id: 'maya', details: { name: 'Maya Reyes' } }], skipped: [] })
    })

    it('offers no backup with no heroes', async () => {
      renderList(new MemoryHeroStore())
      await screen.findByText(/No heroes yet/)
      expect(screen.queryByRole('button', { name: 'Back up all heroes' })).not.toBeInTheDocument()
    })

    it('imports a new hero straight away', async () => {
      const store = new MemoryHeroStore()
      renderList(store)
      await upload(JSON.stringify(toSaved(named('n1', 'Nova'))))
      expect(await screen.findByRole('status')).toHaveTextContent('Imported one hero.')
      expect(await screen.findByRole('link', { name: /Nova/ })).toHaveAttribute('href', '#/hero/n1')
    })

    it('imports a hero from a Markdown export', async () => {
      const store = new MemoryHeroStore()
      renderList(store)
      await upload(heroMarkdown(named('n1', 'Nova')), 'nova.md')
      expect(await screen.findByRole('link', { name: /Nova/ })).toHaveAttribute('href', '#/hero/n1')
    })

    it('imports a hero from an HTML export', async () => {
      const store = new MemoryHeroStore()
      renderList(store)
      await upload(heroHtml(named('n1', 'Nova'), TEST_ICONS), 'nova.html')
      expect(await screen.findByRole('link', { name: /Nova/ })).toHaveAttribute('href', '#/hero/n1')
    })

    it('explains a file it can’t import', async () => {
      renderList(new MemoryHeroStore())
      await upload('not json')
      expect(await screen.findByRole('alert')).toHaveTextContent("This file isn't a hero or a backup the app can read.")
    })

    it('says which heroes in a backup couldn’t be read', async () => {
      const store = new MemoryHeroStore()
      renderList(store)
      await upload(JSON.stringify({ format: 'scrpg-backup', version: 1, heroes: [{ nope: 1 }, toSaved(named('n1', 'Nova'))] }))
      expect(await screen.findByRole('status')).toHaveTextContent("Imported one hero. Hero 1 in the file couldn't be read: not a saved hero.")
    })

    it('asks about each hero that’s already saved: replace or keep both', async () => {
      const store = new MemoryHeroStore()
      await store.save(named('a', 'Old A'))
      await store.save(named('b', 'Old B'))
      renderList(store)
      await screen.findByRole('link', { name: /Old A/ })
      await upload(backupJson([named('a', 'New A'), named('b', 'New B'), named('c', 'New C')]))
      const a = await screen.findByRole('radiogroup', { name: 'New A' })
      // Keeping both is chosen to start with.
      expect(within(a).getByRole('radio', { name: 'Keep both' })).toBeChecked()
      expect(within(screen.getByRole('radiogroup', { name: 'New B' })).getByRole('radio', { name: 'Keep both' })).toBeChecked()
      await userEvent.click(within(a).getByRole('radio', { name: 'Replace mine' }))
      await userEvent.click(screen.getByRole('button', { name: 'Import 3 heroes' }))
      expect(await screen.findByRole('status')).toHaveTextContent('Imported 3 heroes.')
      const names = (await store.list()).heroes.map((h) => h.details.name).sort()
      expect(names).toEqual(['New A', 'New B', 'New C', 'Old B'])
      expect(screen.queryByRole('radiogroup', { name: 'New A' })).not.toBeInTheDocument()
    })

    it('imports nothing when the player cancels, moving focus into the prompt and back', async () => {
      const store = new MemoryHeroStore()
      await store.save(named('a', 'Old A'))
      renderList(store)
      await upload(JSON.stringify(toSaved(named('a', 'New A'))))
      await waitFor(() => expect(screen.getByRole('group', { name: 'You already have this hero' })).toHaveFocus())
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect((await store.list()).heroes.map((h) => h.details.name)).toEqual(['Old A'])
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Import from a file…' })).toHaveFocus()
    })

    it('puts focus back on Import after importing', async () => {
      const store = new MemoryHeroStore()
      await store.save(named('a', 'Old A'))
      renderList(store)
      await upload(JSON.stringify(toSaved(named('a', 'New A'))))
      await userEvent.click(await screen.findByRole('button', { name: 'Import one hero' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Import from a file…' })).toHaveFocus())
    })

    it('says when the saved copy a hero would replace couldn’t be read', async () => {
      const store = new MemoryHeroStore()
      await store.save(named('a', 'Old A'))
      store.list = async () => ({ heroes: [], unreadable: [{ id: 'a', error: 'broken' }] })
      renderList(store)
      await screen.findByText(/couldn't be read/)
      await upload(JSON.stringify(toSaved(named('a', 'New A'))))
      expect(await screen.findByRole('radiogroup', { name: /New A/ })).toBeInTheDocument()
      expect(screen.getByText("(your saved copy couldn't be read)")).toBeInTheDocument()
    })

    it('holds the rest of the list while an import saves', async () => {
      const store = new MemoryHeroStore()
      renderList(store)
      let finish: (() => void) | undefined
      const save = store.save.bind(store)
      store.save = (hero) => new Promise((resolve) => (finish = () => void save(hero).then(resolve)))
      await upload(JSON.stringify(toSaved(named('n1', 'Nova'))))
      await waitFor(() => expect(screen.getByRole('button', { name: 'New hero' })).toBeDisabled())
      await act(async () => finish!())
      await waitFor(() => expect(screen.getByRole('button', { name: 'New hero' })).toBeEnabled())
    })

    it('reports a save that fails partway', async () => {
      const store = new MemoryHeroStore()
      renderList(store)
      let saves = 0
      const save = store.save.bind(store)
      store.save = async (hero) => {
        if (++saves > 1) throw new Error('disk full')
        await save(hero)
      }
      await upload(backupJson([named('a', 'A'), named('b', 'B')]))
      expect(await screen.findByRole('alert')).toHaveTextContent('The import stopped after one hero of 2: disk full')
      expect(await screen.findByRole('link', { name: /^A/ })).toBeInTheDocument()
    })
  })
})
