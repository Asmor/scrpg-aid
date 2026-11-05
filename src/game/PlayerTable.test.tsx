import { DEFAULT_SETTINGS } from '../settings/model'
import { MemorySettingsStore } from '../settings/store'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Hero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import { addMod, type Clock } from '../play/state'
import { HostSession } from '../session/host'
import { localSessionStore, memoryStorage } from '../session/storage'
import { defaultChoices, draftOfNew, savePlannedScene, startPlan, startScene } from './scenes'
import { fakeNetwork, type Connect } from '../session/transport'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { MemoryVillainStore } from '../villain/store'
import { createGame } from './model'
import { finishIssue, startIssue } from './issues'
import { createScene } from './model'
import { MemoryGameStore } from './store'
import { addChallenge, addVillain, setChallengeStep, changeHeroPlay, handOff, startRound } from './table'

let n = 0
const clock = (): Clock => ({ now: new Date(), newId: () => `id${++n}` })
const ROOM = 'ABCD-EFGH'

const maya = (name = 'Maya Reyes'): Hero => ({ ...completeHero(), id: 'maya', details: { ...completeHero().details, name } })

afterEach(() => {
  window.location.hash = ''
})

/**
 * A gate on the player's device: while held, messages it sends and receives wait, so the test can
 * look at what shows before the GM answers.
 */
function gated(connect: Connect) {
  let held = false
  const waiting: (() => void)[] = []
  const later = (fn: () => void) => (held ? waiting.push(fn) : fn())
  const gate: Connect = (room) => {
    const t = connect(room)
    return {
      ...t,
      send: (m, to) => later(() => t.send(m, to)),
      onMessage: (h) => t.onMessage((m, peer) => later(() => h(m, peer))),
    }
  }
  return {
    connect: gate,
    hold: () => void (held = true),
    release: () => {
      held = false
      for (const fn of waiting.splice(0)) fn()
    },
  }
}

/** The GM's device hosting Thursday game, and a player's device running the app with Maya Reyes in the library. */
async function setup(library: Hero = maya(), settings = new MemorySettingsStore()) {
  const net = fakeNetwork()
  const gate = gated(net.connect)
  const gmGames = new MemoryGameStore()
  await gmGames.save(addVillain(createGame({ id: 'g1', name: 'Thursday game' }), { ...adaptiveBruiser(), id: 'v1' }, clock(), false))
  const host = new HostSession(net.connect, { room: ROOM, gameId: 'g1', gm: 'Sam', removed: [] }, gmGames, clock)
  const heroes = new MemoryHeroStore()
  await heroes.save(library)
  const storage = memoryStorage()
  window.location.hash = `#/join/${ROOM}`
  render(<App settingsStore={settings} store={heroes} villainStore={new MemoryVillainStore()} gameStore={new MemoryGameStore()} searchStore={new MemorySavedSearchStore()} connect={gate.connect} sessionStore={localSessionStore(storage)} />)
  await screen.findByRole('heading', { name: 'Join a game' })
  const settle = () => act(() => net.settle())
  return { net, host, heroes, storage, settle, gate }
}

async function join(settle: () => Promise<void>) {
  await userEvent.type(screen.getByLabelText('Your name (everyone at the table sees it)'), 'Alex')
  await userEvent.click(screen.getByRole('button', { name: 'Join with Maya Reyes' }))
  // Joining waits on the Join page until the GM's device answers.
  await settle()
  await waitFor(() => expect(window.location.hash).toBe(`#/table/${ROOM}`))
  await settle()
  // The panel, or on a phone the tabs it sits behind.
  await waitFor(() => expect(screen.queryByRole('complementary', { name: 'My hero' }) ?? screen.queryByRole('tablist', { name: 'Game table' })).toBeTruthy())
}

const panel = () => within(screen.getByRole('complementary', { name: 'My hero' }))

describe('a player at the table', () => {
  it('joins with a hero from the library, shows the table and the game’s copy, and explains it once', async () => {
    const { host, settle, storage } = await setup()
    expect(screen.getByLabelText('Game code')).toHaveValue(ROOM)
    await join(settle)
    expect(host.game!.heroes[0]).toMatchObject({ sourceId: 'maya', player: { name: 'Alex' } })
    // Connected: nothing says "Needs the GM", not even to screen readers.
    expect(screen.queryByText('Needs the GM')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Thursday game' })).toBeInTheDocument()
    expect(screen.getByText('Playing as Maya Reyes')).toBeInTheDocument()
    expect(screen.getByText('GM: Sam')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Maya Reyes' })).toHaveTextContent('Alex')
    expect(panel().getByText("My hero · game's copy")).toBeInTheDocument()
    const note = within(screen.getByRole('region', { name: "About the game's copy" }))
    expect(note.getByText('Maya Reyes is in Thursday game.')).toBeInTheDocument()
    await userEvent.click(note.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('region', { name: "About the game's copy" })).not.toBeInTheDocument()
    expect(storage.getItem('scrpg.session.notes')).toContain(host.game!.heroes[0]!.id)
  })

  it('gets "Scene N" with no total, and a toast when a new scene starts, but not on joining or on Undo', async () => {
    const { host, settle } = await setup()
    await join(settle)
    expect(screen.getByText('Scene 1')).toBeInTheDocument()
    expect(screen.queryByText(/^New scene/)).not.toBeInTheDocument()
    const saved = savePlannedScene(host.game!, undefined, { ...draftOfNew(host.game!), name: 'The Foundry' }, clock())
    act(() => host.apply(() => saved.game))
    await settle()
    // A planned scene is nobody's business.
    expect(screen.getByText('Scene 1')).toBeInTheDocument()
    expect(screen.queryByText('The Foundry')).not.toBeInTheDocument()
    const before = host.game!
    const started = startScene(before, saved.sceneId, defaultChoices(startPlan(before, saved.sceneId)), clock())
    act(() => host.apply(() => started))
    await settle()
    expect(await screen.findByText('New scene: The Foundry')).toBeInTheDocument()
    expect(screen.getByText('Scene 2')).toBeInTheDocument()
    await userEvent.click(within(screen.getByText('New scene: The Foundry').closest('.toast')!).getByRole('button'))
    expect(screen.queryByText('New scene: The Foundry')).not.toBeInTheDocument()
    act(() => host.apply(() => before))
    await settle()
    expect(screen.getByText('Scene 1')).toBeInTheDocument()
    expect(screen.queryByText(/^New scene/)).not.toBeInTheDocument()
  })

  it('puts an Overcome against a challenge, waits for the GM, and hears when it closes first', async () => {
    const { host, settle } = await setup()
    await join(settle)
    act(() => host.apply((g) => addChallenge(g, { name: 'Shut down the furnace', steps: 1, hidden: false, labels: ['Vent it'] }, clock())))
    act(() => host.apply((g) => addChallenge(g, { name: 'Secret', steps: 1, hidden: true }, clock())))
    await settle()
    await userEvent.click(panel().getByRole('button', { name: 'Roll' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Basic action' }))
    await userEvent.selectOptions(dialog.getByLabelText('Action'), 'Overcome')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    const select = dialog.getByLabelText('What are you overcoming?')
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Something else (describe it in the log)', 'Challenge: Shut down the furnace (0 of 1)'])
    await userEvent.selectOptions(select, 'Challenge: Shut down the furnace (0 of 1)')
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await settle()
    const request = host.game!.challenges[0]!.requests[0]!
    expect(request.heroId).toBe(host.game!.heroes[0]!.id)
    const card = () => screen.getByRole('article', { name: 'Shut down the furnace' })
    expect(card()).toHaveTextContent(`Waiting for the GM: your Overcome (${request.total}).`)
    act(() => host.apply((g) => setChallengeStep(g, g.challenges[0]!.id, 0, true, clock())))
    await settle()
    expect(await screen.findByText('Shut down the furnace: The GM closed this challenge before answering.', { selector: '.toast *' })).toBeInTheDocument()
    expect(card()).not.toHaveTextContent('Waiting for the GM')
  })

  it("shows the game's hero points read-only, on the heading and the panel, and points a principle to the GM", async () => {
    const { host, settle } = await setup()
    await join(settle)
    host.apply((g) => ({ ...g, heroPoints: 3 }))
    await settle()
    expect(screen.getByRole('heading', { name: 'Heroes · 3 hero points' })).toBeInTheDocument()
    expect(panel().getByText('3 hero points · the GM awards them')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Award a hero point' })).not.toBeInTheDocument()
    expect(panel().queryByRole('button', { name: 'Gain a hero point' })).not.toBeInTheDocument()
    await userEvent.click(panel().getByRole('button', { name: 'Use Principle of the Gearhead' }))
    const roll = within(screen.getByRole('dialog', { name: 'Principle of the Gearhead' }))
    await userEvent.click(roll.getByRole('button', { name: 'Roll' }))
    await userEvent.click(roll.getByRole('button', { name: 'Confirm' }))
    expect(roll.getByText('Hero points go to the whole table. Ask the GM.')).toBeInTheDocument()
    expect(roll.queryByRole('button', { name: 'Gain a hero point' })).not.toBeInTheDocument()
  })

  it("alerts a player to their turn, and to something that needs an answer, not on joining", async () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    const settings = new MemorySettingsStore()
    await settings.save({ ...DEFAULT_SETTINGS, alerts: { ...DEFAULT_SETTINGS.alerts, turn: true, answer: true, vibrate: true } })
    const { host, settle } = await setup(maya(), settings)
    await join(settle)
    expect(vibrate).not.toHaveBeenCalled()
    const heroId = host.game!.heroes[0]!.id
    host.apply((g) => ({ ...g, round: 1, turn: { ...g.turn, current: { kind: 'hero', id: heroId } } }))
    await settle()
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1))
    host.remindUnspent()
    host.apply((g) => ({ ...g, pendingHits: [{ id: 'hit', heroId, amount: 3, by: 'Gravelord', at: 'x' }] as never }))
    await settle()
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(2))
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
  })

  it('sends an action and shows the result from the GM', async () => {
    const { host, settle } = await setup()
    await join(settle)
    await userEvent.click(panel().getByRole('checkbox', { name: 'Reaction used this round' }))
    await settle()
    expect(host.game!.heroes[0]!.play.reactionUsed).toBe(true)
    await waitFor(() => expect(panel().getByRole('checkbox', { name: 'Reaction used this round' })).toBeChecked())
  })

  it('shows "18 → 15, Sending…" until the GM answers', async () => {
    const { settle, gate } = await setup()
    await join(settle)
    gate.hold()
    await userEvent.click(panel().getByRole('button', { name: 'Lose 1 Health' }))
    expect(panel().getByText('Sending…', { selector: '.gt-player__hp .gt-sub' })).toBeInTheDocument()
    expect(panel().getByText(/^\d+$/, { selector: '.gt-old' })).toBeInTheDocument()
    gate.release()
    await settle()
    await waitFor(() => expect(panel().queryByText('Sending…', { selector: '.gt-player__hp .gt-sub' })).not.toBeInTheDocument())
  })

  it("shows why the GM didn't apply an action", async () => {
    const { host, settle, gate } = await setup()
    await join(settle)
    const heroId = host.game!.heroes[0]!.id
    host.apply((g) => changeHeroPlay(g, heroId, (p) => addMod(p, { label: 'Tailwind', value: 2 }, clock()), clock()))
    await settle()
    const remove = await panel().findByRole('button', { name: /^Remove .*Tailwind/ })
    // The GM removes it first; the player's device hasn't heard yet.
    gate.hold()
    host.apply((g) => changeHeroPlay(g, heroId, (p) => ({ ...p, mods: [] }), clock()))
    await settle()
    await userEvent.click(remove)
    gate.release()
    await settle()
    expect(await screen.findByText('Not applied: that bonus or penalty is already gone.')).toBeInTheDocument()
  })

  it('shows Your turn, and hands off to someone who hasn’t acted', async () => {
    const { host, settle } = await setup()
    await join(settle)
    const heroId = host.game!.heroes[0]!.id
    host.apply((g) => startRound(g, { kind: 'hero', id: heroId }, clock()))
    await settle()
    const bar = within(await screen.findByRole('region', { name: 'Your turn' }))
    await userEvent.click(bar.getByRole('button', { name: 'Hand off to…' }))
    await userEvent.click(screen.getByRole('menuitem', { name: host.game!.villains[0]!.sheet.details.name }))
    await settle()
    expect(host.game!.turn.current).toEqual({ kind: 'villain', id: host.game!.villains[0]!.id })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Your turn' })).not.toBeInTheDocument())
  })

  it('pauses actions while the GM is away, saying they need the GM', async () => {
    const { host, settle } = await setup()
    await join(settle)
    host.leave()
    await settle()
    expect(await screen.findByText('Reconnecting to the GM… Actions are paused.')).toBeInTheDocument()
    const gain = panel().getByRole('button', { name: 'Gain 1 Health' })
    expect(gain).toBeDisabled()
    expect(gain).toHaveAccessibleDescription('Needs the GM')
  })

  it('asks to update the game’s copy when the library sheet changed, and shows the GM’s answer', async () => {
    const { host, heroes, settle } = await setup()
    await join(settle)
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    // The player edits their library sheet, then picks Update from my sheet.
    await heroes.save(maya('Maya Reyes II'))
    window.location.hash = '#/'
    await waitFor(() => expect(window.location.hash).toBe('#/'))
    window.location.hash = `#/table/${ROOM}`
    const dialog = within(await screen.findByRole('dialog', { name: 'Your sheet for Maya Reyes has changed' }))
    expect(dialog.getByText('Name')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Ask the GM to update' }))
    expect(await panel().findByText('Waiting for the GM to approve your sheet update. You can keep playing meanwhile.')).toBeInTheDocument()
    await settle()
    expect(host.game!.pendingSyncs).toHaveLength(1)
    host.approveSync(host.game!.heroes[0]!.id)
    await settle()
    expect(await screen.findByText(/^Updated\. The GM approved: Maya Reyes II now matches your sheet\./)).toBeInTheDocument()
    expect(panel().queryByText(/Waiting for the GM/)).not.toBeInTheDocument()
  })

  it('leaves the game from My hero ⋯, back to the Games page', async () => {
    const { host, settle } = await setup()
    await join(settle)
    await userEvent.click(panel().getByRole('button', { name: 'More for Maya Reyes' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave game' }))
    await waitFor(() => expect(window.location.hash).toBe('#/games'))
    await settle()
    expect(host.getSnapshot().connected.size).toBe(0)
    // The hero stays at the table.
    expect(host.game!.heroes).toHaveLength(1)
  })

  it("says it isn't in a game it hasn't joined", async () => {
    await setup()
    window.location.hash = '#/table/WXYZ-2345'
    expect(await screen.findByText(/You're not in game WXYZ-2345 on this device/)).toBeInTheDocument()
  })

  it('announces handoffs as they happen', async () => {
    const { host, settle } = await setup()
    await join(settle)
    const heroId = host.game!.heroes[0]!.id
    const villain = { kind: 'villain' as const, id: host.game!.villains[0]!.id }
    host.apply((g) => startRound(g, villain, clock()))
    await settle()
    await waitFor(() => expect(screen.getByText(/^Round 1 started\./, { selector: '[role="status"]' })).toBeInTheDocument())
    host.apply((g) => handOff(g, { kind: 'hero', id: heroId }, clock()))
    await settle()
    // Handing off to the player's hero: "Your turn" is what's said.
    await waitFor(() => expect(screen.getByText('Your turn.', { selector: '[role="status"]' })).toBeInTheDocument())
  })

  it('on a phone: a top bar with the round and scene, Your turn, and Table and hero tabs', async () => {
    vi.stubGlobal('matchMedia', (query: string) => {
      const max = /max-width:\s*([\d.]+)px/.exec(query)
      const min = /min-width:\s*([\d.]+)px/.exec(query)
      return { matches: max ? 390 <= Number(max[1]) : min ? 390 >= Number(min[1]) : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }
    })
    try {
      const { host, settle } = await setup()
      await join(settle)
      host.apply((g) => startRound(g, { kind: 'hero', id: g.heroes[0]!.id }, clock()))
      await settle()
      expect(await screen.findByRole('region', { name: 'Your turn' })).toBeInTheDocument()
      expect(screen.getByText('Round 1 · Unnamed scene')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to Games' })).toHaveAttribute('href', '#/games')
      const tabs = within(screen.getByRole('tablist', { name: 'Game table' }))
      expect(tabs.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('article', { name: 'Maya Reyes' }).closest('.gt-center')).toHaveClass('gt-center--compact')
      expect(screen.queryByRole('complementary', { name: 'My hero' })).not.toBeInTheDocument()
      await userEvent.click(tabs.getByRole('tab', { name: 'Maya Reyes' }))
      expect(screen.getByRole('complementary', { name: 'My hero' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Heroes' })).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('between issues', () => {
  it('shows players the end card, and turns off what changes play', async () => {
    const { host, settle } = await setup()
    await join(settle)
    host.apply((g) => finishIssue(g, { title: 'The Gravelord Saga', summary: 'He got away.', heroIds: [] }, clock()))
    await settle()
    expect(await screen.findByRole('heading', { name: 'The Gravelord Saga' })).toBeInTheDocument()
    expect(screen.getByText('END OF ISSUE 1')).toBeInTheDocument()
    expect(screen.getByText('He got away.')).toBeInTheDocument()
    expect(screen.getByText(/The table is paused until Sam starts the next issue\./)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Round|^Not started/ })).not.toBeInTheDocument()
    expect(screen.getByText('Paused between issues', { selector: '.gt-paused' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lose 1 Health' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lose 1 Health' })).toHaveAccessibleDescription('Paused between issues')
    expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled()
    // Sheet updates carry on.
    await userEvent.click(screen.getByRole('button', { name: /^More for/ }))
    expect(await screen.findByRole('menuitem', { name: 'Update from my sheet…' })).toBeEnabled()
  })
})

describe('the back issue prompt', () => {
  const finish = (host: HostSession) => host.apply((g) => finishIssue(g, { title: 'The Gravelord Saga', summary: '', heroIds: g.heroes.map((h) => h.id) }, clock()))
  const issues = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, title: `T${i}`, at: '2026-10-08T12:00:00Z' }))
  const stored = async (heroes: MemoryHeroStore) => {
    const r = await heroes.get('maya')
    if (r.status !== 'found') throw new Error('no hero')
    return r.hero
  }

  it('adds the back issue to the library hero, and tells the GM', async () => {
    const { host, settle, heroes } = await setup()
    await join(settle)
    finish(host)
    await settle()
    const dialog = within(await screen.findByRole('dialog', { name: `Add "The Gravelord Saga" to Maya Reyes's back issues?` }))
    expect(dialog.getByText('Sam finished the issue. It becomes back issue 1, from Thursday game.')).toBeInTheDocument()
    expect(dialog.getByRole('img', { name: '0 of 6 back issues, 1 after this' })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Add back issue' })).toHaveFocus()
    await userEvent.click(dialog.getByRole('button', { name: 'Add back issue' }))
    expect(await screen.findByText('Added. Maya Reyes has 1 of 6 back issues.')).toBeInTheDocument()
    expect((await stored(heroes)).backIssues[0]).toMatchObject({ title: 'The Gravelord Saga', gameName: 'Thursday game', issueNumber: 1 })
    await settle()
    expect(host.game!.issues[0]!.acks?.[host.game!.heroes[0]!.id]).toMatchObject({ status: 'added', count: 1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Later closes it for good, and the panel can reopen it', async () => {
    const { host, settle, heroes } = await setup()
    await join(settle)
    finish(host)
    await settle()
    const dialog = within(await screen.findByRole('dialog', { name: /^Add "The Gravelord Saga"/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await settle()
    expect(host.game!.issues[0]!.acks?.[host.game!.heroes[0]!.id]).toMatchObject({ status: 'later' })
    expect(panel().getByText('The Gravelord Saga', { exact: false })).toHaveTextContent('Not recorded yet: The Gravelord Saga')
    await userEvent.click(panel().getByRole('button', { name: 'Add back issue: The Gravelord Saga' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: /^Add "The Gravelord Saga"/ })).getByRole('button', { name: 'Add back issue' }))
    await waitFor(async () => expect((await stored(heroes)).backIssues).toHaveLength(1))
    expect(panel().queryByText(/Not recorded yet/)).not.toBeInTheDocument()
  })

  it('at five offers a collection, or just adding it', async () => {
    const { host, settle, heroes } = await setup({ ...maya(), backIssues: issues(5) })
    await join(settle)
    finish(host)
    await settle()
    const dialog = within(await screen.findByRole('dialog', { name: /^Add "The Gravelord Saga"/ }))
    expect(dialog.getByText(/It becomes Maya Reyes's sixth back issue/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Add and record collection' })).toBeDisabled()
    expect(dialog.getByRole('button', { name: 'Add and record collection' })).toHaveAccessibleDescription('Needs a collection name')
    await userEvent.click(dialog.getByRole('button', { name: 'Just add it' }))
    expect(await screen.findByText(/Maya Reyes has 6 of 6 back issues\. Name a collection/)).toBeInTheDocument()
    expect((await stored(heroes)).backIssues).toHaveLength(6)
  })

  it('at six records the collection first', async () => {
    const { host, settle, heroes } = await setup({ ...maya(), backIssues: issues(6) })
    await join(settle)
    finish(host)
    await settle()
    const dialog = within(await screen.findByRole('dialog', { name: 'Maya Reyes already has six back issues' }))
    await userEvent.type(dialog.getByLabelText('Collection name'), 'The Arc')
    await userEvent.click(dialog.getByRole('button', { name: 'Record collection and add' }))
    expect(await screen.findByText('Recorded the collection and added The Gravelord Saga. Maya Reyes has 1 of 6.')).toBeInTheDocument()
    const hero = await stored(heroes)
    expect(hero.collections[0]!.name).toBe('The Arc')
    expect(hero.backIssues).toMatchObject([{ title: 'The Gravelord Saga' }])
  })

  it("says so when the library hero isn't on this device, and closes when the GM undoes", async () => {
    const { host, settle, heroes } = await setup()
    await join(settle)
    await heroes.remove('maya')
    const before = structuredClone(host.game!)
    finish(host)
    await settle()
    // The hero was looked up on joining: it's found until it's needed, then the dialog changes.
    await userEvent.click(within(await screen.findByRole('dialog', { name: /^Add "The Gravelord Saga"/ })).getByRole('button', { name: 'Add back issue' }))
    expect(await screen.findByText(/isn't in this device's library/)).toBeInTheDocument()
    host.apply(() => before)
    await settle()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it("waits while the player is typing", async () => {
    const { host, settle } = await setup()
    await join(settle)
    // A field of the player's, somewhere that pausing doesn't take away.
    const field = document.body.appendChild(document.createElement('input'))
    field.focus()
    finish(host)
    await settle()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => {
      field.blur()
      await new Promise((r) => setTimeout(r))
    })
    expect(await screen.findByRole('dialog', { name: /^Add "The Gravelord Saga"/ })).toBeInTheDocument()
    field.remove()
  })
})

describe('spending hero points', () => {
  const rich = async () => {
    const page = await setup()
    await join(page.settle)
    page.host.apply((g) => ({ ...g, heroPoints: 3, scenes: [...g.scenes, createScene({ id: 's2', name: 'Tunnels' })] }))
    page.host.apply((g) => finishIssue(g, { title: 'Saga', summary: '', heroIds: [] }, clock()))
    await page.settle()
    return page
  }

  it('buys, returns and hears about them, then the issue starts', async () => {
    const { host, settle } = await rich()
    expect(await screen.findByText('You have 3 hero points to spend on bonuses for issue 2.')).toBeInTheDocument()
    expect(panel().getByRole('img', { name: '3 of 3 hero points left' })).toBeInTheDocument()
    await userEvent.click(panel().getByRole('button', { name: 'Buy a +2 bonus for 2 points' }))
    await settle()
    expect(host.game!.heroes[0]!.play.heroPointBuys).toMatchObject([{ size: 2 }])
    expect(panel().getByRole('button', { name: 'Buy a +3 bonus for 3 points' })).toBeDisabled()
    await userEvent.click(panel().getByRole('button', { name: 'Return the +2 bonus' }))
    await settle()
    expect(host.game!.heroes[0]!.play.heroPointBuys).toEqual([])
    expect(host.game!.heroPoints).toBe(3)

    host.remindUnspent()
    await settle()
    const remind = within(await screen.findByRole('dialog', { name: 'Spend your hero points' }))
    expect(remind.getByText("Sam is about to start issue 2. You have 3 unspent hero points. Spend them now, or they're lost.")).toBeInTheDocument()
    await userEvent.click(remind.getByRole('button', { name: 'Spend now' }))
    await waitFor(() => expect(panel().getByRole('heading', { name: 'Hero points' })).toHaveFocus())

    host.apply((g) => startIssue(g, 's2', { fates: {}, hidden: {}, resets: { round: true, mods: true, once: true, twists: true }, recover: true }, clock()))
    await settle()
    expect(await screen.findByText('Issue 2 began: Tunnels.')).toBeInTheDocument()
    expect(panel().queryByRole('heading', { name: 'Hero points' })).not.toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Lose 1 Health' })).toBeEnabled()
  })
})

describe('a reminder about hero points', () => {
  it("doesn't come back at the end of a later issue", async () => {
    const { host, settle } = await setup()
    await join(settle)
    const points = (g: Parameters<typeof finishIssue>[0]) => ({ ...g, heroPoints: 2, scenes: [...g.scenes, createScene({ id: `s${g.scenes.length + 1}` })] })
    const finish = (g: Parameters<typeof finishIssue>[0]) => finishIssue(g, { title: 'Saga', summary: '', heroIds: [] }, clock())
    host.apply((g) => finish(points(g)))
    await settle()
    host.remindUnspent()
    await settle()
    expect(await screen.findByRole('dialog', { name: 'Spend your hero points' })).toBeInTheDocument()
    host.apply((g) => startIssue(g, 's2', { fates: {}, hidden: {}, resets: { round: true, mods: true, once: true, twists: true }, recover: true }, clock()))
    await settle()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Spend your hero points' })).not.toBeInTheDocument())
    host.apply((g) => finish(points(g)))
    await settle()
    expect(screen.queryByRole('dialog', { name: 'Spend your hero points' })).not.toBeInTheDocument()
  })
})

