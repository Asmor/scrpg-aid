import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MemoryHeroStore } from '../hero/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import { localBackupTime } from '../library/backup-time'
import { localSessionStore, memoryStorage } from '../session/storage'
import { fakeNetwork } from '../session/transport'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { downloadFile } from '../transfer/download'
import { MemoryVillainStore } from '../villain/store'
import { createGame, type Game } from './model'
import { createSoloGame } from './solo'
import { MemoryGameStore } from './store'
import { addChallenge, addGroup, addHero, addVillain, setTrackerPosition, startRound } from './table'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

let n = 0
const clock = { now: new Date(), newId: () => `id${++n}` }

async function setup(games: Game[]) {
  const store = new MemoryGameStore()
  for (const g of games) await store.save(g)
  window.location.hash = '#/games'
  render(
    <App
      store={new MemoryHeroStore()}
      villainStore={new MemoryVillainStore()}
      gameStore={store}
      searchStore={new MemorySavedSearchStore()}
      backupTime={localBackupTime(memoryStorage())}
      connect={fakeNetwork().connect}
      sessionStore={localSessionStore(memoryStorage())}
    />,
  )
  await screen.findByRole('heading', { level: 1, name: 'Games' })
  return store
}

/** Thursday game: started, with Maya Reyes (the GM's own), a revealed villain, a hidden group and a challenge. */
function thursday(): Game {
  const maya = { ...completeHero(), id: 'maya' }
  maya.details.name = 'Maya Reyes'
  let g: Game = { ...createGame({ id: 'thu' }), name: 'Thursday game', tags: ['campaign'], scene: { name: 'The Foundry', tracker: createGame().scene.tracker, position: 0 } }
  g = addHero(g, maya, clock)
  g = addVillain(g, adaptiveBruiser(), clock, false)
  g = addGroup(g, { kind: 'minions', name: 'Scrap drones', die: 'd6', count: 2, hidden: true }, clock)
  g = addChallenge(g, { name: 'Crucible', steps: 3, hidden: false }, clock)
  g = setTrackerPosition(g, 2, clock)
  g = startRound(g, { kind: 'hero', id: g.heroes[0]!.id }, clock)
  return { ...g, updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }
}

const card = (name: string) => within(screen.getByRole('article', { name }))

afterEach(() => {
  window.location.hash = ''
})

describe('the Games page', () => {
  it('shows an empty state with New game and Join as a player', async () => {
    // A solo game isn't listed.
    await setup([createSoloGame('hero', completeHero(), clock)])
    expect(screen.getByRole('heading', { name: 'No games yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Join as a player' })).toHaveAttribute('href', '#/join')
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' }))
    expect(tabs.getByRole('link', { name: /^Games/ })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: /^Games/ })).toHaveTextContent('Games0')
  })

  it('lists games you run as cards: status, scene, round and who is acting, heroes, opposition, tags and when', async () => {
    const fresh = { ...createGame({ id: 'new' }), name: 'Rooftop ambush', updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }
    await setup([thursday(), fresh])
    const section = within(screen.getByRole('region', { name: 'You run' }))
    // Most recently played or edited first.
    expect(section.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent)).toEqual(['Thursday game', 'Rooftop ambush'])
    const thu = card('Thursday game')
    expect(thu.getByText('Not hosting')).toBeInTheDocument()
    expect(thu.getByText('The Foundry')).toBeInTheDocument()
    expect(thu.getByText('· Round 1 · Maya Reyes is acting')).toBeInTheDocument()
    expect(thu.getByRole('img', { name: 'Scene tracker at Green 3 of 8' })).toBeInTheDocument()
    expect(thu.getByText('Maya Reyes')).toBeInTheDocument()
    expect(thu.getByText('Ironclad, Scrap drones, Crucible')).toBeInTheDocument()
    expect(thu.getByText('· 1 hidden')).toBeInTheDocument()
    expect(thu.getByRole('list', { name: 'Tags on Thursday game' })).toHaveTextContent('campaign')
    expect(thu.getByText('Played 1 hour ago')).toBeInTheDocument()
    expect(thu.getByRole('link', { name: 'Run Thursday game' })).toHaveAttribute('href', '#/game/thu')
    const roof = card('Rooftop ambush')
    expect(roof.getByText('Not started')).toBeInTheDocument()
    expect(roof.getByText('No one has joined yet.')).toBeInTheDocument()
    expect(roof.getByText('Edited 2 days ago')).toBeInTheDocument()
    // Search by name keeps the section.
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search games' }), 'roof')
    expect(section.getAllByRole('article')).toHaveLength(1)
  })

  it('renames, tags, duplicates, exports and deletes from the ⋯ menu', async () => {
    const store = await setup([thursday()])
    const more = () => userEvent.click(screen.getByRole('button', { name: 'More actions for Thursday game' }))
    await more()
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Rename', 'Tags', 'Duplicate', 'Export', 'Delete…'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const rename = within(screen.getByRole('dialog'))
    await userEvent.clear(rename.getByLabelText('Game name'))
    await userEvent.type(rename.getByLabelText('Game name'), 'Friday game')
    await userEvent.click(rename.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('article', { name: 'Friday game' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Friday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tags' }))
    const tags = within(screen.getByRole('dialog', { name: 'Tags on Friday game' }))
    await userEvent.click(tags.getByRole('button', { name: 'Remove campaign from Friday game' }))
    await userEvent.click(tags.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await store.list()).games.find((g) => g.id === 'thu')!.tags).toEqual([]))

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Friday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    const copy = within(await screen.findByRole('article', { name: 'Friday game (copy)' }))
    expect(copy.getByText('Not started')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Friday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export' }))
    expect(vi.mocked(downloadFile).mock.calls.at(-1)![0]).toBe('friday-game.json')

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Friday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete Friday game?' })).getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Friday game' })).not.toBeInTheDocument())
    expect(await store.get('thu')).toEqual({ status: 'missing' })
  })

  it('starts a new game and opens its table, which works without hosting', async () => {
    await setup([])
    await userEvent.click(screen.getAllByRole('button', { name: 'New game' })[0]!)
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/game\/[^/]+$/))
    expect(await screen.findByRole('complementary', { name: 'GM screen' })).toBeInTheDocument()
    expect(screen.getByText('Not hosting')).toBeInTheDocument()
  })
})
