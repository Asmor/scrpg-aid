import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeHero } from '../test/heroes'
import { MemoryJoinedStore, type JoinedGame } from '../game/joined-store'
import { project } from '../game/project'
import App from '../App'
import { exampleHero } from '../hero/example'
import { createHero, type Hero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { createGame, type Game } from '../game/model'
import { createSoloGame } from '../game/solo'
import { MemoryGameStore } from '../game/store'
import { addHero, addVillain } from '../game/table'
import { localSessionStore, memoryStorage } from '../session/storage'
import { fakeNetwork } from '../session/transport'
import { adaptiveBruiser } from '../test/villains'
import { downloadFile } from '../transfer/download'
import { readImport } from '../transfer/files'
import { MemoryVillainStore } from '../villain/store'
import { localBackupTime } from './backup-time'
import { createSavedSearch, MemorySavedSearchStore, type SavedSearch } from './saved-searches'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

function hero(id: string, name: string, tags: string[] = [], changedDaysAgo = 1): Hero {
  const h = exampleHero({ id })
  h.details.name = name
  h.tags = tags
  h.updatedAt = ago(changedDaysAgo)
  return h
}

interface Setup {
  heroes?: Hero[]
  villains?: ReturnType<typeof adaptiveBruiser>[]
  hash?: string
  backupAt?: string
  storage?: ReturnType<typeof memoryStorage>
  searches?: SavedSearch[]
  games?: Game[]
  joined?: JoinedGame[]
}

async function setup({ heroes = [], villains = [], hash = '#/', backupAt, storage = memoryStorage(), searches = [], games = [], joined = [] }: Setup = {}) {
  const joinedStore = new MemoryJoinedStore()
  for (const j of joined) await joinedStore.save(j)
  const heroStore = new MemoryHeroStore()
  const villainStore = new MemoryVillainStore()
  const gameStore = new MemoryGameStore()
  const searchStore = new MemorySavedSearchStore()
  for (const h of heroes) await heroStore.save(h)
  for (const v of villains) await villainStore.save(v)
  for (const g of games) await gameStore.save(g)
  for (const search of searches) await searchStore.save(search)
  const backupStorage = memoryStorage()
  const backupTime = localBackupTime(backupStorage)
  if (backupAt) backupTime.save(backupAt)
  window.location.hash = hash
  render(<App store={heroStore} villainStore={villainStore} gameStore={gameStore} joinedStore={joinedStore} searchStore={searchStore} backupTime={backupTime} connect={fakeNetwork().connect} sessionStore={localSessionStore(storage)} />)
  return { heroStore, villainStore, gameStore, searchStore, backupStorage }
}

/** The standard library: two heroes, a draft, and two villains, with tags; Maya and Gravelord are in Thursday game (and Maya has a solo game). */
async function standard(options: Omit<Setup, 'heroes' | 'villains' | 'games' | 'joined'> = {}) {
  const gravelord = { ...adaptiveBruiser(), id: 'g', tags: ['thursday-game', 'scene-3'], updatedAt: ago(0.1) }
  gravelord.details.name = 'Gravelord'
  const rust = { ...adaptiveBruiser(), id: 'r', tags: ['scene-3', 'prep'], updatedAt: ago(3) }
  rust.details.name = 'Rust Hound'
  const draft: Hero = { ...createHero('guided', { id: 'd' }), status: 'draft', furthestStep: 2, updatedAt: ago(2) }
  const maya = hero('maya', 'Maya Reyes', ['thursday-game'], 1)
  const clock = { now: new Date(), newId: () => Math.random().toString(36).slice(2) }
  let thursday = { ...createGame({ id: 'thu' }), name: 'Thursday game' }
  thursday = addVillain(addHero(thursday, maya, clock), gravelord, clock)
  // Paradigm is in someone else's game, joined on this device.
  const paradigm = hero('para', 'Paradigm', [], 10)
  let saturday = { ...createGame({ id: 'sat' }), name: 'Saturday game' }
  saturday = addHero(saturday, paradigm, clock, { clientId: 'me', name: 'Alex' })
  const joined: JoinedGame = { id: 'sat', room: 'WXYZ-2345', gm: 'Sam', heroId: saturday.heroes[0]!.id, heroSourceId: 'para', sheet: paradigm, name: 'Alex', since: ago(5), updatedAt: ago(1), version: 1, table: project(saturday, 'player') }
  return setup({ ...options, heroes: [maya, paradigm, draft], villains: [gravelord, rust], games: [thursday, createSoloGame('hero', maya, clock)], joined: [joined] })
}

const table = () => screen.getByRole('table', { name: 'Library' })
const rowNames = () =>
  within(table())
    .queryAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('.library-name')?.textContent)
    .filter(Boolean)
const row = (name: string) => within(within(table()).getByRole('link', { name }).closest('tr')!)
const loaded = () => screen.findByRole('table', { name: 'Library' })

beforeEach(() => vi.mocked(downloadFile).mockClear())
afterEach(() => {
  window.location.hash = ''
})

describe('the library table', () => {
  it('replaces the home page: heroes, villains and drafts are rows, newest first', async () => {
    await standard()
    await loaded()
    expect(screen.getByRole('heading', { level: 1, name: 'All' })).toBeInTheDocument()
    expect(screen.queryByText('In progress')).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['Gravelord', 'Maya Reyes', 'Unnamed hero', 'Rust Hound', 'Paradigm'])
    expect(screen.getByText('5 items')).toBeInTheDocument()

    const maya = row('Maya Reyes')
    expect(maya.getByText('Speedster · Accident')).toBeInTheDocument()
    // Rows show nothing from play: In games lists the games holding a copy, not solo games.
    expect(maya.queryByText(/^(Green|Yellow|Red)$/)).not.toBeInTheDocument()
    expect(maya.getByRole('link', { name: 'Thursday game' })).toHaveAttribute('href', '#/game/thu')
    expect(row('Gravelord').getByRole('link', { name: 'Thursday game' })).toBeInTheDocument()
    // A game joined as a player opens its table.
    expect(row('Paradigm').getByRole('link', { name: 'Saturday game' })).toHaveAttribute('href', '#/table/WXYZ-2345')
    expect(row('Rust Hound').getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'In games' })).toBeInTheDocument()
    expect(maya.getByRole('link', { name: 'Play Maya Reyes' })).toHaveAttribute('href', '#/hero/maya/play')
    expect(maya.getByText('Yesterday')).toBeInTheDocument()

    const draft = row('Unnamed hero')
    expect(draft.getByText('Draft')).toHaveClass('draft-badge')
    expect(draft.getByRole('link', { name: 'Unnamed hero' })).toHaveClass('library-name--unnamed')
    expect(draft.getByText('Step 2 of 8 · Power source')).toBeInTheDocument()
    expect(draft.getByText('—')).toBeInTheDocument()
    expect(draft.getByRole('link', { name: 'Continue Unnamed hero' })).toHaveAttribute('href', '#/hero/d/edit/power-source')

    expect(row('Gravelord').getByText('Adaptive Bruiser · Minor')).toBeInTheDocument()
    expect(row('Gravelord').getByRole('link', { name: 'Gravelord' })).toHaveAttribute('href', '#/villain/g')
  })

  it('has Library | Games tabs, Games with its count of games run and joined (not solo games)', async () => {
    await standard()
    await loaded()
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' }))
    expect(tabs.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(tabs.getByRole('link', { name: /^Games/ })).toHaveTextContent('Games2'))
    expect(tabs.getByRole('link', { name: /^Games/ })).toHaveAttribute('href', '#/games')
  })

  it('sorts by Name, Type and Changed, with aria-sort', async () => {
    await standard()
    await loaded()
    const header = (name: string) => screen.getByRole('button', { name }).closest('th')!
    expect(header('Changed')).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
    expect(header('Changed')).toHaveAttribute('aria-sort', 'none')
    expect(rowNames()).toEqual(['Gravelord', 'Maya Reyes', 'Paradigm', 'Rust Hound', 'Unnamed hero'])
    await userEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending')
    expect(rowNames()[0]).toBe('Unnamed hero')
    await userEvent.click(screen.getByRole('button', { name: 'Type' }))
    // Ties keep the order they were in (Name, descending).
    expect(rowNames().slice(0, 3)).toEqual(['Unnamed hero', 'Paradigm', 'Maya Reyes'])
  })

  it('opens the ⋯ menu with Open, Edit, Duplicate, Export, Send… and Delete…', async () => {
    const { heroStore } = await standard()
    await loaded()
    await userEvent.click(row('Maya Reyes').getByRole('button', { name: 'More actions for Maya Reyes' }))
    const menu = screen.getByRole('menu', { name: 'More actions for Maya Reyes' })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Open', 'Edit', 'Duplicate', 'Export', 'Send…', 'Delete…'])
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toHaveAttribute('href', '#/hero/maya/edit')
    expect(within(menu).getByRole('menuitem', { name: 'Open' })).toHaveFocus()

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Duplicate' }))
    expect(await within(table()).findByRole('link', { name: 'Maya Reyes (copy)' })).toBeInTheDocument()
    const copy = (await heroStore.list()).heroes.find((h) => h.details.name === 'Maya Reyes (copy)')!
    expect(copy.tags).toEqual(['thursday-game'])

    await userEvent.click(row('Maya Reyes').getByRole('button', { name: 'More actions for Maya Reyes' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export' }))
    expect(vi.mocked(downloadFile).mock.calls[0]![0]).toBe('maya-reyes.json')

    await userEvent.click(row('Maya Reyes').getByRole('button', { name: 'More actions for Maya Reyes' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Delete Maya Reyes?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(within(table()).queryByRole('link', { name: 'Maya Reyes' })).not.toBeInTheDocument())
    expect((await heroStore.get('maya')).status).toBe('missing')
  })
})

describe('filtering', () => {
  it('searches names, filters by type chips, and requires every tag, all with AND', async () => {
    await standard()
    await loaded()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name' }), 'U')
    await waitFor(() => expect(rowNames()).toEqual(['Unnamed hero', 'Rust Hound']))
    expect(screen.getByRole('heading', { level: 1, name: 'Search results' })).toBeInTheDocument()
    expect(screen.getByText('Showing 2 of 5')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Villains', pressed: false }))
    expect(rowNames()).toEqual(['Rust Hound'])

    await userEvent.click(screen.getByRole('button', { name: 'Tag' }))
    const pop = within(screen.getByRole('dialog', { name: 'Filter by tags' }))
    expect(pop.getByText('Shows items that have every tag you pick.')).toBeInTheDocument()
    await userEvent.click(pop.getByRole('checkbox', { name: /scene-3/ }))
    await userEvent.click(pop.getByRole('checkbox', { name: /prep/ }))
    expect(rowNames()).toEqual(['Rust Hound'])
    expect(window.location.hash).toBe('#/?q=U&type=villain&tag=scene-3&tag=prep')

    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag filter prep' }))
    await userEvent.click(screen.getByRole('button', { name: 'Villains', pressed: true }))
    expect(rowNames()).toEqual(['Rust Hound'])
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(rowNames()).toHaveLength(5)
    expect(window.location.hash).toBe('#/')
  })

  it('filters by a tag clicked in a row, and says when nothing matches', async () => {
    await standard()
    await loaded()
    await userEvent.click(row('Rust Hound').getByRole('button', { name: 'Filter by prep' }))
    expect(rowNames()).toEqual(['Rust Hound'])
    expect(row('Rust Hound').getByRole('button', { name: 'Filter by prep' }).closest('.tag-chip')).toHaveClass('tag-chip--active')
    await userEvent.click(row('Rust Hound').getByRole('button', { name: 'Filter by scene-3' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name' }), 'zzz')
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument()
    expect(screen.getByText('Nothing has all of these tags: prep, scene-3. Remove a tag to widen the search.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(rowNames()).toHaveLength(5)
  })

  it('restores the view from the address, and follows the address when it changes', async () => {
    await standard({ hash: '#/?tag=scene-3' })
    await loaded()
    expect(rowNames()).toEqual(['Gravelord', 'Rust Hound'])
    expect(screen.getByRole('button', { name: 'Remove tag filter scene-3' })).toBeInTheDocument()
    // A link to another view (a tag on a sheet) sets it up.
    act(() => {
      window.location.hash = '#/?tag=thursday-game'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => expect(rowNames()).toEqual(['Gravelord', 'Maya Reyes']))
  })

  it('shows a saved search from the address', async () => {
    const heroes = [hero('a', 'Ann', ['prep']), hero('b', 'Bea')]
    const heroStore = new MemoryHeroStore()
    for (const h of heroes) await heroStore.save(h)
    const searchStore = new MemorySavedSearchStore()
    await searchStore.save(createSavedSearch('Prep', { text: '', types: [], tags: ['prep'] }, { id: 's1' }))
    window.location.hash = '#/?s=s1'
    render(<App store={heroStore} villainStore={new MemoryVillainStore()} searchStore={searchStore} backupTime={localBackupTime(memoryStorage())} />)
    await loaded()
    expect(screen.getByRole('heading', { level: 1, name: 'Prep' })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Ann'])
    expect(screen.getByRole('button', { name: /^Prep/ })).toHaveAttribute('aria-current', 'page')
  })
})

describe('tags in rows', () => {
  it('removes a tag with its X, keeping the row until Refresh', async () => {
    const { villainStore } = await standard({ hash: '#/?tag=prep' })
    await loaded()
    await userEvent.click(row('Rust Hound').getByRole('button', { name: 'Remove prep from Rust Hound' }))
    await waitFor(async () => expect((await villainStore.get('r')).status === 'found' && (await villainStore.get('r') as { villain: { tags: string[] } }).villain.tags).toEqual(['scene-3']))
    // The row stays, and the footer says it no longer matches.
    expect(rowNames()).toEqual(['Rust Hound'])
    expect(screen.getByText(/1 item no longer matches\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument()
    expect(screen.getByText('0 items shown')).toBeInTheDocument()
  })

  it('doesn’t bring in an item that starts to match', async () => {
    await standard({ hash: '#/?tag=prep' })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag filter prep' }))
    await userEvent.click(row('Paradigm').getByRole('button', { name: 'Add a tag to Paradigm' }))
    await userEvent.keyboard('prep{Enter}')
    await userEvent.click(row('Paradigm').getByRole('button', { name: 'Filter by prep' }))
    expect(rowNames()).toEqual(['Paradigm', 'Rust Hound'])
  })

  it('adds a tag from the + popover: suggestions, Create, Enter, Escape', async () => {
    const { heroStore } = await standard()
    await loaded()
    const plus = row('Paradigm').getByRole('button', { name: 'Add a tag to Paradigm' })
    await userEvent.click(plus)
    const pop = within(screen.getByRole('dialog', { name: 'Add a tag to Paradigm' }))
    const field = pop.getByRole('textbox', { name: 'Tag' })
    expect(field).toHaveFocus()
    expect(pop.getAllByRole('button').map((b) => b.textContent)).toEqual(['prep', 'scene-3', 'thursday-game'])
    await userEvent.type(field, 'Scene')
    expect(pop.getAllByRole('button').map((b) => b.textContent)).toEqual(['scene-3', 'Create tag “Scene”'])
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(plus).toHaveFocus()

    // Typing an existing tag in another case uses its spelling.
    await userEvent.click(plus)
    await userEvent.keyboard('PREP{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(row('Paradigm').getByRole('button', { name: 'Filter by prep' })).toBeInTheDocument()
    await userEvent.click(row('Paradigm').getByRole('button', { name: 'Add a tag to Paradigm' }))
    await userEvent.keyboard('  Brand   new {Enter}')
    await waitFor(async () => expect((await heroStore.get('para') as { hero: Hero }).hero.tags).toEqual(['prep', 'Brand new']))
    expect((await heroStore.get('para') as { hero: Hero }).hero.updatedAt > ago(0.01)).toBe(true)
  })
})

describe('selection', () => {
  it('adds and removes tags in bulk, exports, and deletes the selection', async () => {
    const { heroStore, villainStore } = await standard()
    await loaded()
    await userEvent.click(row('Rust Hound').getByRole('checkbox', { name: 'Select Rust Hound' }))
    await userEvent.click(row('Gravelord').getByRole('checkbox', { name: 'Select Gravelord' }))
    await userEvent.click(row('Paradigm').getByRole('checkbox', { name: 'Select Paradigm' }))
    expect(screen.getByRole('checkbox', { name: 'Select all shown' })).toHaveProperty('indeterminate', true)
    const bar = within(screen.getByRole('region', { name: 'Selected items' }))
    expect(bar.getByText('3 selected')).toBeInTheDocument()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()

    await userEvent.click(bar.getByRole('button', { name: 'Remove tag' }))
    const remove = within(screen.getByRole('dialog', { name: 'Remove a tag from the selected items' }))
    expect(remove.getAllByRole('button').map((b) => b.textContent)).toEqual(['prep1 of 3', 'scene-32 of 3', 'thursday-game1 of 3'])
    await userEvent.click(remove.getByRole('button', { name: /scene-3/ }))
    await waitFor(async () => expect((await villainStore.list()).villains.every((v) => !v.tags.includes('scene-3'))).toBe(true))

    await userEvent.click(bar.getByRole('button', { name: 'Add tag' }))
    await userEvent.keyboard('scene-4{Enter}')
    await waitFor(async () => expect((await heroStore.get('para') as { hero: Hero }).hero.tags).toEqual(['scene-4']))
    expect(bar.getByText('3 selected')).toBeInTheDocument()

    await userEvent.click(bar.getByRole('button', { name: 'Export' }))
    const [name, text] = vi.mocked(downloadFile).mock.calls[0]!
    expect(name).toMatch(/^scrpg-aid-export-\d{4}-\d{2}-\d{2}\.json$/)
    expect(readImport(text as string)).toMatchObject({ ok: true, heroes: [{ id: 'para' }], villains: [{}, {}], savedSearches: [] })

    await userEvent.click(bar.getByRole('button', { name: 'Delete…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Delete 3 items?' }))
    expect(dialog.getByText('Gravelord, Rust Hound, Paradigm')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(rowNames()).toEqual(['Maya Reyes', 'Unnamed hero']))
    expect((await villainStore.list()).villains).toEqual([])
  })

  it('clears the selection with Escape, Clear selection, or a view change', async () => {
    await standard()
    await loaded()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all shown' }))
    expect(screen.getByText('5 selected')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('5 selected')).not.toBeInTheDocument()
    await userEvent.click(row('Paradigm').getByRole('checkbox', { name: 'Select Paradigm' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('search')).toBeInTheDocument()
    await userEvent.click(row('Paradigm').getByRole('checkbox', { name: 'Select Paradigm' }))
    // Tag edits keep it.
    await userEvent.click(row('Rust Hound').getByRole('button', { name: 'Remove prep from Rust Hound' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })
})

describe('saved searches', () => {
  it('saves the filters under a suggested name, rejecting a duplicate, then renames and deletes', async () => {
    const { searchStore } = await standard()
    await loaded()
    expect(screen.getByText('Filter the library by type and tags, then save the search to find it here.')).toBeInTheDocument()
    await userEvent.click(row('Rust Hound').getByRole('button', { name: 'Filter by scene-3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save search' }))
    const field = screen.getByRole('textbox', { name: 'Saved search name' })
    expect(field).toHaveValue('scene-3')
    await userEvent.clear(field)
    await userEvent.type(field, 'Scene 3{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Scene 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
    const search = (await searchStore.list()).searches[0]!
    expect(window.location.hash).toBe(`#/?s=${search.id}`)
    const rail = within(screen.getByRole('navigation', { name: 'Library views' }))
    expect(rail.getByRole('button', { name: 'Scene 3 2' })).toHaveAttribute('aria-current', 'page')

    // Its count is live: removing the tag from an item lowers it, though the row stays.
    await userEvent.click(row('Gravelord').getByRole('button', { name: 'Remove scene-3 from Gravelord' }))
    expect(await rail.findByRole('button', { name: 'Scene 3 1' })).toBeInTheDocument()

    // Changing the filters leaves the saved search.
    await userEvent.click(row('Rust Hound').getByRole('button', { name: 'Filter by prep' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Search results' })).toBeInTheDocument()
    expect(rail.getByRole('button', { name: 'Scene 3 1' })).not.toHaveAttribute('aria-current')
    await userEvent.click(screen.getByRole('button', { name: 'Save search' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Saved search name' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Saved search name' }), 'scene 3{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a saved search with that name.')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Save search' })).toBeInTheDocument()

    await userEvent.click(rail.getByRole('button', { name: 'More actions for Scene 3' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const rename = within(screen.getByRole('dialog', { name: 'Rename Scene 3' }))
    await userEvent.clear(rename.getByRole('textbox', { name: 'Name' }))
    await userEvent.type(rename.getByRole('textbox', { name: 'Name' }), 'Lair{Enter}')
    expect(await rail.findByRole('button', { name: 'Lair 1' })).toBeInTheDocument()

    await userEvent.click(rail.getByRole('button', { name: 'More actions for Lair' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete the saved search Lair?' })).getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(rail.queryByRole('button', { name: /Lair/ })).not.toBeInTheDocument())
    expect((await searchStore.list()).searches).toEqual([])
  })

  it('picks a saved search and All from the rail', async () => {
    await standard({ searches: [createSavedSearch('Prep', { text: '', types: [], tags: ['prep'] }, { id: 's1' })] })
    await loaded()
    const rail = within(screen.getByRole('navigation', { name: 'Library views' }))
    expect(rail.getByRole('button', { name: 'All 5' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(rail.getByRole('button', { name: 'Prep 1' }))
    expect(window.location.hash).toBe('#/?s=s1')
    expect(rowNames()).toEqual(['Rust Hound'])
    expect(screen.getByRole('heading', { level: 1, name: 'Prep' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove tag filter prep' })).toBeInTheDocument()
    await userEvent.click(rail.getByRole('button', { name: 'All 5' }))
    expect(window.location.hash).toBe('#/')
    expect(rowNames()).toHaveLength(5)
  })
})

describe('the header', () => {
  it('Data: backs up everything with saved searches, recording the time, and reminds after 14 days', async () => {
    const { searchStore, backupStorage } = await standard({ backupAt: ago(19) })
    await searchStore.save(createSavedSearch('Prep', { text: '', types: [], tags: ['prep'] }, { id: 's1' }))
    await loaded()
    const data = screen.getByRole('button', { name: 'Data: backup reminder' })
    await userEvent.click(data)
    const menu = within(screen.getByRole('dialog', { name: 'Data' }))
    expect(menu.getByText('Saved in this browser only. Last backup 19 days ago; 5 items changed since.')).toBeInTheDocument()
    await userEvent.click(menu.getByRole('menuitem', { name: 'Back up everything' }))
    const [name, text] = vi.mocked(downloadFile).mock.calls[0]!
    expect(name).toMatch(/^scrpg-aid-backup-/)
    // Games go in too, but not solo games, which belong to their characters' Play pages.
    expect(readImport(text as string)).toMatchObject({ ok: true, heroes: [{}, {}, {}], villains: [{}, {}], games: [{ id: 'thu' }] })
    expect(backupStorage.getItem('scrpg.library.lastBackupAt')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Data' })).toBeInTheDocument()
  })

  it('Data: shows no reminder for a recent backup, and adds the example hero', async () => {
    await standard({ backupAt: ago(3) })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Data' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add an example hero' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/hero\/[^/]+$/))
  })

  it('Play together: host or join, with the last game to rejoin', async () => {
    const storage = memoryStorage()
    localSessionStore(storage).saveLastGame({ v: 1, room: 'K7QX-2MAB', at: ago(3) })
    await standard({ storage })
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Play together' }))
    const pop = within(screen.getByRole('dialog', { name: 'Play together' }))
    expect(pop.getByRole('link', { name: 'Open your GM table' })).toHaveAttribute('href', '#/games')
    expect(pop.getByRole('link', { name: 'Join as a player' })).toHaveAttribute('href', '#/join')
    expect(pop.getByRole('link', { name: 'Watch a game' })).toHaveAttribute('href', '#/watch')
    expect(pop.getByText(/Last game: K7QX-2MAB, 3 days ago/)).toBeInTheDocument()
    expect(pop.getByRole('link', { name: 'Rejoin' })).toHaveAttribute('href', '#/join/K7QX-2MAB')
  })

  it('Play together: while hosting', async () => {
    const storage = memoryStorage()
    localSessionStore(storage).saveHost({ v: 1, room: 'K7QX-2MAB', gameId: 'thu', gm: 'Sam', removed: [] })
    await standard({ storage })
    await loaded()
    await userEvent.click(await screen.findByRole('button', { name: 'In game · K7QX-2MAB' }))
    const pop = within(screen.getByRole('dialog', { name: 'Play together' }))
    expect(pop.getByText("You're hosting K7QX-2MAB · 0 players connected")).toBeInTheDocument()
    expect(pop.getByRole('link', { name: 'Return to table' })).toHaveAttribute('href', '#/game/thu')
  })

  it('Play together: while watching', async () => {
    const storage = memoryStorage()
    localSessionStore(storage).saveWatching({ v: 1, room: 'K7QX-2MAB', screenName: 'TV' })
    await standard({ storage })
    await loaded()
    await userEvent.click(await screen.findByRole('button', { name: 'Watching · K7QX-2MAB' }))
    const pop = within(screen.getByRole('dialog', { name: 'Play together' }))
    expect(pop.getByText('This screen is watching K7QX-2MAB')).toBeInTheDocument()
    expect(pop.getByRole('link', { name: 'Open the display' })).toHaveAttribute('href', '#/watch/K7QX-2MAB')
    await userEvent.click(pop.getByRole('button', { name: 'Stop watching' }))
    expect(await screen.findByRole('button', { name: 'Play together' })).toBeInTheDocument()
    expect(storage.data.has('scrpg.session.watching')).toBe(false)
  })

  it('Play together: while playing a hero', async () => {
    const storage = memoryStorage()
    localSessionStore(storage).savePlaying({ v: 1, room: 'K7QX-2MAB', name: 'Alex', heroSourceId: 'maya', sheet: completeHero() })
    await standard({ storage })
    await loaded()
    await userEvent.click(await screen.findByRole('button', { name: 'In game · K7QX-2MAB' }))
    const pop = within(screen.getByRole('dialog', { name: 'Play together' }))
    expect(pop.getByText("You're in K7QX-2MAB as Maya Reyes")).toBeInTheDocument()
    expect(pop.getByRole('link', { name: 'Open the game' })).toHaveAttribute('href', '#/table/K7QX-2MAB')
    await userEvent.click(pop.getByRole('button', { name: 'Leave game' }))
    expect(await screen.findByRole('button', { name: 'Play together' })).toBeInTheDocument()
  })
})

describe('the empty library', () => {
  it('offers New hero, New villain, the example hero and import', async () => {
    await setup()
    expect(await screen.findByRole('heading', { name: 'Your library is empty' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New hero' })).toHaveClass('button--primary')
    expect(screen.getByRole('button', { name: 'Import from a file…' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'New villain' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/villain\/[^/]+\/edit\/approach$/))
  })

  it('starts a new hero from the New menu', async () => {
    await standard()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'New' }))
    const menu = within(screen.getByRole('menu', { name: 'New' }))
    expect(menu.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Hero', 'Villain', 'Minion', 'Lieutenant', 'Challenge'])
    await userEvent.click(menu.getByRole('menuitem', { name: 'Hero' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/hero\/[^/]+\/edit\/start$/))
  })
})
