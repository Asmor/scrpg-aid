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
import { backupJson, readImport } from '../transfer/files'
import { MemoryVillainStore } from '../villain/store'
import { createGame, type Game } from './model'
import { MemoryJoinedStore, type JoinedGame } from './joined-store'
import { project } from './project'
import { createSoloGame } from './solo'
import { MemoryGameStore } from './store'
import { addChallenge, addGroup, addHero, addVillain, setTrackerPosition, startRound } from './table'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

let n = 0
const clock = { now: new Date(), newId: () => `id${++n}` }
/** A game with its scene named. */
const named = (g: Game, name: string): Game => ({ ...g, scenes: g.scenes.map((s) => ({ ...s, name })) })

/** A saved game this version of the app can't read. */
const plantUnreadable = (store: MemoryGameStore, id: string) => (store as unknown as { putRecord: (r: unknown) => Promise<void> }).putRecord({ id, saved: { format: 'scrpg-game', version: 2, game: {} } })

async function setup(games: Game[], sessionStorage = memoryStorage(), joined: JoinedGame[] = [], unreadable: string[] = []) {
  const store = new MemoryGameStore()
  for (const g of games) await store.save(g)
  for (const id of unreadable) await plantUnreadable(store, id)
  const joinedStore = new MemoryJoinedStore()
  for (const j of joined) await joinedStore.save(j)
  window.location.hash = '#/games'
  render(
    <App
      store={new MemoryHeroStore()}
      villainStore={new MemoryVillainStore()}
      gameStore={store}
      joinedStore={joinedStore}
      searchStore={new MemorySavedSearchStore()}
      backupTime={localBackupTime(memoryStorage())}
      connect={fakeNetwork().connect}
      sessionStore={localSessionStore(sessionStorage)}
    />,
  )
  await screen.findByRole('heading', { level: 1, name: 'Games' })
  return Object.assign(store, { joinedStore })
}

/** Friday game, joined on this device as Alex with Duality, cached as of Oct 28, 9:42 PM. */
function friday(): JoinedGame {
  const c = clock
  const duality = { ...completeHero(), id: 'duality', details: { ...completeHero().details, name: 'Duality' } }
  const jo = { ...completeHero(), id: 'jo', details: { ...completeHero().details, name: 'Jo' } }
  let g: Game = named({ ...createGame({ id: 'fri' }), name: 'Friday game' }, 'The Docks')
  g = addHero(g, duality, c, { clientId: 'me', name: 'Alex' })
  g = addHero(g, jo, c, { clientId: 'other', name: 'Priya' })
  g = addVillain(g, { ...adaptiveBruiser(), id: 'secret', details: { ...adaptiveBruiser().details, name: 'Secret Boss' } }, c, true)
  g = startRound(g, { kind: 'hero', id: g.heroes[1]!.id }, c)
  return { id: 'fri', room: 'WXYZ-2345', gm: 'Sam', heroId: g.heroes[0]!.id, heroSourceId: 'duality', sheet: duality, name: 'Alex', since: '2026-10-20T20:00:00.000Z', updatedAt: '2026-10-28T21:42:00.000Z', version: 7, table: project(g, 'player') }
}

/** Session storage saying this device hosts the game: the app picks hosting back up when it starts. */
function hosting(gameId: string) {
  const storage = memoryStorage()
  storage.setItem('scrpg.session.host', JSON.stringify({ v: 1, room: 'ABCD-EFGH', gameId, gm: 'Sam', removed: [] }))
  return storage
}

/** Thursday game: started, with Maya Reyes (the GM's own), a revealed villain, a hidden group and a challenge. */
function thursday(): Game {
  const maya = { ...completeHero(), id: 'maya' }
  maya.details.name = 'Maya Reyes'
  let g: Game = named({ ...createGame({ id: 'thu' }), name: 'Thursday game', tags: ['campaign'] }, 'The Foundry')
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
  it("lists games it can't read, without solo ones, and deletes them", async () => {
    const store = await setup([], memoryStorage(), [], ['old-game', 'solo-hero-maya'])
    const section = within(await screen.findByRole('region', { name: "One saved game couldn't be read" }))
    expect(section.getByText(/^Game old-game: /)).toBeInTheDocument()
    expect(screen.queryByText(/solo-hero-maya/)).not.toBeInTheDocument()
    await userEvent.click(section.getByRole('button', { name: 'Delete unreadable game old-game' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: /couldn't be read/ })).not.toBeInTheDocument())
    expect((await store.list()).unreadable.map((u) => u.id)).toEqual(['solo-hero-maya'])
  })

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
    expect(thu.getByRole('img', { name: 'Scene tracker at Yellow 1 of 8' })).toBeInTheDocument()
    expect(thu.getByText('Maya Reyes')).toBeInTheDocument()
    expect(thu.getByText("GM's hero")).toBeInTheDocument()
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

  it('shares the library header, with Data: backs up the games with everything else', async () => {
    await setup([thursday(), createSoloGame('hero', completeHero(), clock)])
    await userEvent.click(screen.getByRole('button', { name: /^Data/ }))
    const menu = within(screen.getByRole('dialog', { name: 'Data' }))
    expect(menu.getByRole('menuitem', { name: 'Import from a file…' })).toBeEnabled()
    expect(menu.getByRole('menuitem', { name: 'Add an example hero' })).toBeEnabled()
    await userEvent.click(menu.getByRole('menuitem', { name: 'Back up everything' }))
    const [name, text] = vi.mocked(downloadFile).mock.calls.at(-1)!
    expect(name).toMatch(/^scrpg-aid-backup-/)
    // Not the solo game, which belongs to its character's Play page.
    expect(readImport(text as string)).toMatchObject({ ok: true, games: [{ id: 'thu' }] })
  })

  it('starts a new game and opens its table, which works without hosting', async () => {
    await setup([])
    await userEvent.click(screen.getAllByRole('button', { name: 'New game' })[0]!)
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/game\/[^/]+$/))
    expect(await screen.findByRole('complementary', { name: 'GM screen' })).toBeInTheDocument()
    expect(screen.getByText('Not hosting')).toBeInTheDocument()
  })

  it('changes a hosted game through the hosting session, so the next change at the table keeps it', async () => {
    const store = await setup([thursday()], hosting('thu'))
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Thursday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const rename = within(screen.getByRole('dialog'))
    await userEvent.clear(rename.getByLabelText('Game name'))
    await userEvent.type(rename.getByLabelText('Game name'), 'Friday game')
    await userEvent.click(rename.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('article', { name: 'Friday game' })).toBeInTheDocument()
    await waitFor(async () => {
      const r = await store.get('thu')
      expect(r.status === 'found' && r.game.name).toBe('Friday game')
    })
  })

  it('imports over a hosted game through the hosting session', async () => {
    const store = await setup([thursday()], hosting('thu'))
    await userEvent.click(screen.getByRole('button', { name: /^Data/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Import from a file…' }))
    const imported = { ...thursday(), name: 'Imported game', tags: ['from-file'] }
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File([backupJson({ heroes: [], games: [imported] })], 'backup.json', { type: 'application/json' }))
    await userEvent.click(within(await screen.findByRole('radiogroup', { name: 'Imported game' })).getByRole('radio', { name: 'Replace mine' }))
    await userEvent.click(screen.getByRole('button', { name: /^Import/ }))
    await waitFor(async () => {
      const r = await store.get('thu')
      expect(r.status === 'found' && r.game.name).toBe('Imported game')
    })
    // The hosting session has the imported game: its next change keeps it.
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Imported game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const rename = within(screen.getByRole('dialog'))
    await userEvent.clear(rename.getByLabelText('Game name'))
    await userEvent.type(rename.getByLabelText('Game name'), 'Renamed')
    await userEvent.click(rename.getByRole('button', { name: 'Save' }))
    await waitFor(async () => {
      const r = await store.get('thu')
      expect(r.status === 'found' && { name: r.game.name, tags: r.game.tags }).toEqual({ name: 'Renamed', tags: ['from-file'] })
    })
  })

  it('stops hosting a game before deleting it, so it stays deleted', async () => {
    const store = await setup([thursday()], hosting('thu'))
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Thursday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete Thursday game?' })).getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Thursday game' })).not.toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 20))
    expect(await store.get('thu')).toEqual({ status: 'missing' })
  })

  it('lists joined games from this device’s cache, read-only, with a switch between the sections', async () => {
    await setup([thursday()], memoryStorage(), [friday()])
    expect(screen.getByRole('region', { name: 'You run' })).toBeInTheDocument()
    const card = within(screen.getByRole('region', { name: 'Joined' }).querySelector('article')!)
    expect(card.getByText('Friday game')).toBeInTheDocument()
    expect(card.getByText('GM: Sam · you play Duality')).toBeInTheDocument()
    expect(card.getByText('GM offline')).toBeInTheDocument()
    expect(card.getByText(/^As of /)).toBeInTheDocument()
    expect(card.getByText('The Docks')).toBeInTheDocument()
    expect(card.getByText('· Round 1 · Jo is acting')).toBeInTheDocument()
    expect(card.getByText('Jo')).toBeInTheDocument()
    // Hidden things never appear.
    expect(screen.queryByText(/Secret Boss/)).not.toBeInTheDocument()
    // Joined games count in the Games tab.
    expect(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name: /^Games/ })).toHaveTextContent('Games2')

    const show = within(screen.getByRole('group', { name: 'Show' }))
    await userEvent.click(show.getByRole('button', { name: 'Joined' }))
    expect(screen.queryByRole('region', { name: 'You run' })).not.toBeInTheDocument()
    await userEvent.click(show.getByRole('button', { name: 'You run' }))
    expect(screen.queryByRole('region', { name: 'Joined' })).not.toBeInTheDocument()
    await userEvent.click(show.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('region', { name: 'Joined' })).toBeInTheDocument()
  })

  it('opens a joined game from the cache without the GM, read-only, as of when it was cached', async () => {
    await setup([], memoryStorage(), [friday()])
    await userEvent.click(screen.getByRole('button', { name: 'Open Friday game' }))
    await waitFor(() => expect(window.location.hash).toBe('#/table/WXYZ-2345'))
    expect(await screen.findByText(/The GM isn't connected\./)).toBeInTheDocument()
    expect(screen.getByText(/This is Friday game as of Oct 28/)).toBeInTheDocument()
    const panel = within(screen.getByRole('complementary', { name: 'My hero' }))
    expect(panel.getByRole('button', { name: 'Gain a hero point' })).toBeDisabled()
    expect(panel.getByRole('button', { name: 'Gain a hero point' })).toHaveAccessibleDescription('Needs the GM')
    // Reading still works: the table and the log.
    expect(screen.getByRole('article', { name: 'Jo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try to reconnect' })).toBeInTheDocument()
  })

  it('leaves a joined game and removes it from this device, after asking', async () => {
    const store = await setup([], memoryStorage(), [friday()])
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Friday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave and remove from this device…' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Leave Friday game and remove it from this device?' })).getByRole('button', { name: 'Leave and remove' }))
    await waitFor(() => expect(screen.queryByText('Friday game')).not.toBeInTheDocument())
    expect(await store.joinedStore.list()).toEqual([])
  })

  it('starts hosting a game from its card, then shows it hosting with Invite', async () => {
    await setup([thursday()])
    const card = within(screen.getByRole('article', { name: 'Thursday game' }))
    await userEvent.click(card.getByRole('button', { name: 'Start hosting' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Start hosting' }))
    await userEvent.type(dialog.getByLabelText('Your name (players see it)'), 'Sam')
    await userEvent.click(dialog.getByRole('button', { name: 'Start hosting' }))
    expect(await card.findByText('Hosting · 0 connected')).toBeInTheDocument()
    await userEvent.click(card.getByRole('button', { name: 'Invite' }))
    expect(screen.getByRole('dialog', { name: 'Invite to Thursday game' })).toBeInTheDocument()
  })

  it('shows a joined game from the cache after a reload, until the GM answers', async () => {
    const j = friday()
    const storage = memoryStorage()
    storage.setItem('scrpg.session.playing', JSON.stringify({ v: 1, room: j.room, name: 'Alex', heroSourceId: 'duality', sheet: j.sheet }))
    await setup([], storage, [j])
    window.location.hash = `#/table/${j.room}`
    expect(await screen.findByRole('complementary', { name: 'My hero' })).toBeInTheDocument()
    expect(screen.getByText(/This is Friday game as of Oct 28/)).toBeInTheDocument()
  })

  it("offers to open a cached game from its table link when this device isn't connected to it", async () => {
    await setup([], memoryStorage(), [friday()])
    window.location.hash = '#/table/WXYZ-2345'
    expect(await screen.findByText(/This device isn't connected to it right now\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open Friday game' }))
    expect(await screen.findByText(/This is Friday game as of Oct 28/)).toBeInTheDocument()
  })

  it('keeps what changed while hosting, and the code, when the game is edited here after hosting stops', async () => {
    const store = await setup([thursday()], memoryStorage())
    // Hosted from this page (the name is asked the first time).
    const card = () => within(screen.getByRole('article', { name: /game$/ }))
    await userEvent.click(card().getByRole('button', { name: 'Start hosting' }))
    await userEvent.type(within(screen.getByRole('dialog', { name: 'Start hosting' })).getByLabelText('Your name (players see it)'), 'Sam')
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Start hosting' })).getByRole('button', { name: 'Start hosting' }))
    await card().findByText('Hosting · 0 connected')
    // A change while hosting (through the hosting session), then stop.
    await userEvent.click(card().getByRole('button', { name: 'More actions for Thursday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tags' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Tags on Thursday game' })).getByRole('button', { name: 'Remove campaign from Thursday game' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(card().getByRole('button', { name: 'Invite' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop hosting…' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Stop hosting?' })).getByRole('button', { name: 'Stop hosting' }))
    await card().findByText('Not hosting')
    // Renamed here afterwards: the tag change and the code survive.
    await userEvent.click(card().getByRole('button', { name: 'More actions for Thursday game' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const rename = within(screen.getByRole('dialog'))
    await userEvent.clear(rename.getByLabelText('Game name'))
    await userEvent.type(rename.getByLabelText('Game name'), 'Friday game')
    await userEvent.click(rename.getByRole('button', { name: 'Save' }))
    await waitFor(async () => {
      const r = await store.get('thu')
      expect(r.status === 'found' && { name: r.game.name, tags: r.game.tags, code: Boolean(r.game.code) }).toEqual({ name: 'Friday game', tags: [], code: true })
    })
  })
})
