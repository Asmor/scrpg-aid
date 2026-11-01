import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SavedSearchStoreContext } from '../app/saved-search-context'
import { StoreContext } from '../app/store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { GameStoreContext } from '../app/game-store-context'
import { createGame } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { exampleHero } from '../hero/example'
import { MemoryHeroStore } from '../hero/store'
import { createHero } from '../hero/model'
import { toSaved } from '../hero/serialize'
import { heroHtml } from '../transfer/html'
import { heroMarkdown } from '../transfer/markdown'
import { TEST_ICONS } from '../test/icons'
import { createSavedSearch, MemorySavedSearchStore } from '../library/saved-searches'
import { backupJson } from '../transfer/files'
import { MemoryVillainStore } from '../villain/store'
import { ImportControl } from './ImportControl'

const now = new Date('2026-10-31T12:00:00Z')

function setup() {
  const heroes = new MemoryHeroStore()
  const villains = new MemoryVillainStore()
  const searches = new MemorySavedSearchStore()
  const games = new MemoryGameStore()
  const onImported = vi.fn()
  render(
    <StoreContext.Provider value={heroes}>
      <VillainStoreContext.Provider value={villains}>
        <GameStoreContext.Provider value={games}>
          <SavedSearchStoreContext.Provider value={searches}>
            <ImportControl savedIds={new Set()} unreadableIds={new Set()} disabled={false} onImported={onImported} />
          </SavedSearchStoreContext.Provider>
        </GameStoreContext.Provider>
      </VillainStoreContext.Provider>
    </StoreContext.Provider>,
  )
  const upload = (text: string) => userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([text], 'backup.json', { type: 'application/json' }))
  return { heroes, searches, games, onImported, upload }
}

describe('ImportControl and saved searches', () => {
  it('restores a backup’s saved searches with its items, keeping tags', async () => {
    const { heroes, searches, onImported, upload } = setup()
    await searches.save(createSavedSearch('Scene 3', { text: '', types: [], tags: ['old'] }, { id: 'other', now }))
    const hero = { ...exampleHero({ id: 'h' }), tags: ['scene-3'] }
    const search = createSavedSearch('scene 3', { text: '', types: [], tags: ['scene-3'] }, { id: 's1', now })
    await upload(backupJson({ heroes: [hero], savedSearches: [search] }, now))
    expect(await screen.findByText('Imported one hero and one saved search.')).toBeInTheDocument()
    expect((await heroes.list()).heroes[0]!.tags).toEqual(['scene-3'])
    // The clashing name gets a number, so names stay unique.
    expect((await searches.list()).searches.map((s) => s.name)).toEqual(['Scene 3', 'scene 3 (2)'])
    expect(onImported).toHaveBeenCalled()
  })

  it('imports games, asking about one already saved', async () => {
    const { games, upload } = setup()
    const game = { ...createGame({ id: 'g', now }), name: 'Thursday game', tags: ['campaign'] }
    await games.save({ ...game, name: 'Mine' })
    await upload(backupJson({ heroes: [exampleHero({ id: 'h' })], games: [game] }, now))
    expect(await screen.findByText('You already have this game')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Import one hero and one game' }))
    expect(await screen.findByText('Imported one hero and one game.')).toBeInTheDocument()
    const saved = (await games.list()).games
    expect(saved.map((g) => g.name).sort()).toEqual(['Mine', 'Thursday game'])
    expect(saved.find((g) => g.name === 'Thursday game')!.tags).toEqual(['campaign'])
  })

  it('imports a backup holding only saved searches', async () => {
    const { searches, upload } = setup()
    await upload(backupJson({ savedSearches: [createSavedSearch('Prep', { text: '', types: [], tags: ['prep'] }, { id: 's1', now })] }, now))
    expect(await screen.findByText('Imported one saved search.')).toBeInTheDocument()
    expect((await searches.list()).searches).toHaveLength(1)
  })
})

const named = (id: string, name: string) => {
  const h = createHero('guided', { id })
  h.details.name = name
  return h
}

/** The import control over a hero store, given its saved and unreadable ids as the library does. */
async function renderOver(heroes: MemoryHeroStore, unreadable: string[] = []) {
  const ids = new Set([...(await heroes.list()).heroes.map((h) => h.id), ...unreadable])
  const onImported = vi.fn()
  render(
    <StoreContext.Provider value={heroes}>
      <VillainStoreContext.Provider value={new MemoryVillainStore()}>
        <ImportControl savedIds={ids} unreadableIds={new Set(unreadable)} disabled={false} onImported={onImported} />
      </VillainStoreContext.Provider>
    </StoreContext.Provider>,
  )
  const upload = (text: string, name = 'hero.json') => userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([text], name, { type: 'application/json' }))
  return { upload, onImported }
}

const savedNames = async (store: MemoryHeroStore) => (await store.list()).heroes.map((h) => h.details.name).sort()

describe('ImportControl', () => {
  it('imports a new hero straight away, from JSON, Markdown or HTML', async () => {
    const store = new MemoryHeroStore()
    const { upload, onImported } = await renderOver(store)
    await upload(JSON.stringify(toSaved(named('n1', 'Nova'))))
    expect(await screen.findByRole('status')).toHaveTextContent('Imported one hero.')
    expect(onImported).toHaveBeenCalledTimes(1)
    await upload(heroMarkdown(named('n2', 'Mark')), 'mark.md')
    await upload(heroHtml(named('n3', 'Html'), TEST_ICONS), 'html.html')
    await waitFor(async () => expect(await savedNames(store)).toEqual(['Html', 'Mark', 'Nova']))
  })

  it('explains a file it can’t import, and which heroes in a backup couldn’t be read', async () => {
    const { upload } = await renderOver(new MemoryHeroStore())
    await upload('not json')
    expect(await screen.findByRole('alert')).toHaveTextContent("This file isn't a hero, villain, game, or backup the app can read.")
    await upload(JSON.stringify({ format: 'scrpg-backup', version: 1, heroes: [{ nope: 1 }, toSaved(named('n1', 'Nova'))] }))
    expect(await screen.findByRole('status')).toHaveTextContent("Imported one hero. Hero 1 in the file couldn't be read: not a saved hero.")
  })

  it('asks about each hero that’s already saved: replace or keep both', async () => {
    const store = new MemoryHeroStore()
    await store.save(named('a', 'Old A'))
    await store.save(named('b', 'Old B'))
    const { upload } = await renderOver(store)
    await upload(backupJson({ heroes: [named('a', 'New A'), named('b', 'New B'), named('c', 'New C')] }))
    const a = await screen.findByRole('radiogroup', { name: 'New A' })
    // Keeping both is chosen to start with.
    expect(within(a).getByRole('radio', { name: 'Keep both' })).toBeChecked()
    await userEvent.click(within(a).getByRole('radio', { name: 'Replace mine' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import 3 heroes' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Imported 3 heroes.')
    expect(await savedNames(store)).toEqual(['New A', 'New B', 'New C', 'Old B'])
  })

  it('imports nothing when cancelled, moving focus into the prompt and back to Import', async () => {
    const store = new MemoryHeroStore()
    await store.save(named('a', 'Old A'))
    const { upload } = await renderOver(store)
    await upload(JSON.stringify(toSaved(named('a', 'New A'))))
    await waitFor(() => expect(screen.getByRole('group', { name: 'You already have this hero' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await savedNames(store)).toEqual(['Old A'])
    expect(screen.getByRole('button', { name: 'Import from a file…' })).toHaveFocus()
  })

  it('says when the saved copy a hero would replace couldn’t be read', async () => {
    const store = new MemoryHeroStore()
    const { upload } = await renderOver(store, ['a'])
    await upload(JSON.stringify(toSaved(named('a', 'New A'))))
    expect(await screen.findByRole('radiogroup', { name: /New A/ })).toBeInTheDocument()
    expect(screen.getByText("(your saved copy couldn't be read)")).toBeInTheDocument()
  })

  it('reports a save that fails partway', async () => {
    const store = new MemoryHeroStore()
    let saves = 0
    const save = store.save.bind(store)
    store.save = async (hero) => {
      if (++saves > 1) throw new Error('disk full')
      await save(hero)
    }
    const { upload } = await renderOver(store)
    await upload(backupJson({ heroes: [named('a', 'A'), named('b', 'B')] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The import stopped after one hero of 2 heroes: disk full')
  })
})
