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
import { finishIssue } from './issues'
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
async function setup(library: Hero = maya()) {
  const net = fakeNetwork()
  const gate = gated(net.connect)
  const gmGames = new MemoryGameStore()
  await gmGames.save(addVillain(createGame({ id: 'g1', name: 'Thursday game' }), { ...adaptiveBruiser(), id: 'v1' }, clock(), false))
  const host = new HostSession(net.connect, { room: ROOM, gameId: 'g1', gm: 'Sam', removed: [] }, gmGames, clock)
  const heroes = new MemoryHeroStore()
  await heroes.save(library)
  const storage = memoryStorage()
  window.location.hash = `#/join/${ROOM}`
  render(<App store={heroes} villainStore={new MemoryVillainStore()} gameStore={new MemoryGameStore()} searchStore={new MemorySavedSearchStore()} connect={gate.connect} sessionStore={localSessionStore(storage)} />)
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

  it('sends an action and shows the result from the GM', async () => {
    const { host, settle } = await setup()
    await join(settle)
    await userEvent.click(panel().getByRole('button', { name: 'Gain a hero point' }))
    await settle()
    expect(host.game!.heroes[0]!.play.heroPoints).toBe(1)
    await waitFor(() => expect(panel().getByRole('button', { name: 'Spend a hero point' })).toBeEnabled())
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
    const gain = panel().getByRole('button', { name: 'Gain a hero point' })
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
    host.apply((g) => finishIssue(g, { title: 'The Gravelord Saga', summary: 'He got away.', heroIds: g.heroes.map((h) => h.id) }, clock()))
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

