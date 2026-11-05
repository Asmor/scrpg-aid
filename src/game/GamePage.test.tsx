import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GameStoreContext } from '../app/game-store-context'
import { SavedSearchStoreContext } from '../app/saved-search-context'
import { StoreContext } from '../app/store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { MemoryHeroStore } from '../hero/store'
import { createSavedSearch, MemorySavedSearchStore } from '../library/saved-searches'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { MemoryVillainStore } from '../villain/store'
import { GamePage } from './GamePage'
import type { Hero } from '../hero/model'
import type { Villain } from '../villain/model'
import { emptyPlay } from '../play/state'
import { createGame, createScene, currentScene, heroCopy, villainCopy, type Game } from './model'
import { MemoryGameStore } from './store'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

async function setup(change: (g: Game, docs: { hero: Hero; villain: Villain }) => void = () => {}, more: { villains?: Villain[] } = {}) {
  const games = new MemoryGameStore()
  const heroes = new MemoryHeroStore()
  const villains = new MemoryVillainStore()
  const searches = new MemorySavedSearchStore()
  const hero = completeHero()
  hero.details.name = 'Maya Reyes'
  hero.tags = ['scene-3']
  await heroes.save(hero)
  const villain = adaptiveBruiser()
  villain.tags = ['scene-3']
  await villains.save(villain)
  for (const v of more.villains ?? []) await villains.save(v)
  await searches.save(createSavedSearch('Scene 3', { text: '', types: [], tags: ['scene-3'] }, { id: 's1' }))
  const game = createGame({ id: 'g1', name: 'Thursday game' })
  change(game, { hero, villain })
  await games.save(game)
  render(
    <StoreContext.Provider value={heroes}>
      <VillainStoreContext.Provider value={villains}>
        <GameStoreContext.Provider value={games}>
          <SavedSearchStoreContext.Provider value={searches}>
            <GamePage id="g1" clock={clock} random={() => 0.5} />
          </SavedSearchStoreContext.Provider>
        </GameStoreContext.Provider>
      </VillainStoreContext.Provider>
    </StoreContext.Provider>,
  )
  await screen.findByRole('button', { name: /Rename game/ })
  const saved = async () => {
    const r = await games.get('g1')
    if (r.status !== 'found') throw new Error('no game')
    return r.game
  }
  // The game's copies, where play state lives.
  const savedHero = async () => (await saved()).heroes[0]!
  const savedVillain = async () => (await saved()).villains[0]!
  const libraryVillain = async () => {
    const r = await villains.get('v1')
    if (r.status !== 'found') throw new Error('no villain')
    return r.villain
  }
  const libraryHero = async () => {
    const r = await heroes.get(hero.id)
    if (r.status !== 'found') throw new Error('no hero')
    return r.hero
  }
  return { saved, savedHero, savedVillain, libraryHero, libraryVillain }
}

const gmScreen = () => within(screen.getByRole('complementary', { name: 'GM screen' }))
const turns = () => within(screen.getByRole('region', { name: /^Round|^Not started/ }))
const log = () => screen.getByRole('region', { name: 'Table log' })

async function bringIn(name: string) {
  await userEvent.click(await gmScreen().findByRole('button', { name: `Bring in ${name}` }))
  // A villain asks how many heroes are at the table first.
  const dialog = screen.queryByRole('dialog', { name: `Bring in ${name}` })
  if (dialog) await userEvent.click(within(dialog).getByRole('button', { name: 'Bring in' }))
}

async function menuItem(button: string | RegExp, item: string | RegExp) {
  await userEvent.click(screen.getByRole('button', { name: button }))
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
}

describe('the game table', () => {
  it('says when the game is missing', async () => {
    render(
      <StoreContext.Provider value={new MemoryHeroStore()}>
        <VillainStoreContext.Provider value={new MemoryVillainStore()}>
          <GameStoreContext.Provider value={new MemoryGameStore()}>
            <GamePage id="nope" />
          </GameStoreContext.Provider>
        </VillainStoreContext.Provider>
      </StoreContext.Provider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved game with that link.")
  })

  it('shows the scene tracker, and the GM corrects it', async () => {
    const { saved } = await setup()
    const tracker = screen.getByRole('group', { name: 'Scene tracker' })
    expect(within(tracker).getAllByRole('button')).toHaveLength(8)
    expect(within(tracker).getByRole('button', { name: 'Green 1, current' })).toHaveAttribute('aria-current', 'step')
    await userEvent.click(within(tracker).getByRole('button', { name: 'Yellow 1' }))
    expect(within(tracker).getByRole('button', { name: 'Yellow 1, current' })).toBeInTheDocument()
    expect(log()).toHaveTextContent('The GM moved the scene tracker to Yellow 1.')
    await waitFor(async () => expect(currentScene(await saved()).position).toBe(2))
  })

  it('edits the current scene: name, tracker preset, custom counts and keeping the box', async () => {
    const { saved } = await setup()
    await userEvent.click(within(screen.getByRole('group', { name: 'Scene tracker' })).getByRole('button', { name: 'Yellow 1' }))
    expect(screen.getByText('Scene 1 of 1')).toBeInTheDocument()
    await menuItem('Scene menu', 'Edit this scene…')
    const dialog = within(screen.getByRole('dialog', { name: 'Edit scene 1' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'The Foundry')
    expect(dialog.getByRole('radio', { name: /Standard/ })).toBeChecked()
    await userEvent.click(dialog.getByRole('radio', { name: /Prolonged/ }))
    expect(dialog.getByText('11 boxes · starts at the first')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('radio', { name: /Custom/ }))
    // Custom starts from the last preset chosen.
    await userEvent.click(dialog.getByRole('button', { name: 'Fewer red boxes' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    const ask = within(screen.getByRole('dialog', { name: 'Keep the tracker at Green 3?' }))
    await userEvent.click(ask.getByRole('button', { name: 'Keep' }))
    expect(screen.getByRole('heading', { name: 'The Foundry' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Scene tracker' })).getAllByRole('button')).toHaveLength(10)
    await waitFor(async () => expect(currentScene(await saved())).toMatchObject({ name: 'The Foundry', tracker: { green: 3, yellow: 5, red: 2 }, position: 2 }))
  })

  it('edits the current scene: a custom tracker needs a box, and starting over goes to the first', async () => {
    const { saved } = await setup()
    await userEvent.click(within(screen.getByRole('group', { name: 'Scene tracker' })).getByRole('button', { name: 'Yellow 1' }))
    await menuItem('Scene menu', 'Edit this scene…')
    const dialog = within(screen.getByRole('dialog', { name: 'Edit scene 1' }))
    await userEvent.click(dialog.getByRole('radio', { name: /Custom/ }))
    for (const zone of ['green', 'green', 'yellow', 'yellow', 'yellow', 'yellow', 'red', 'red']) await userEvent.click(dialog.getByRole('button', { name: `Fewer ${zone} boxes` }))
    expect(dialog.getByRole('alert')).toHaveTextContent('A tracker needs at least one box.')
    expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('button', { name: 'More red boxes' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Keep the tracker at Red 1?' })).getByRole('button', { name: 'Start over at the first box' }))
    await waitFor(async () => expect(currentScene(await saved())).toMatchObject({ tracker: { green: 0, yellow: 0, red: 1 }, position: 0 }))
  })

  it('shows the Scenes tab with the current scene, from the tab and from the scene card', async () => {
    await setup()
    await menuItem('Scene menu', 'Plan scenes')
    const row = screen.getByRole('article', { name: 'Scene 1: Unnamed scene' })
    expect(row).toHaveTextContent('Now')
    expect(row).toHaveTextContent('Standard · Green 1')
    expect(row).toHaveTextContent('No environment · not started')
    await userEvent.click(within(row).getByRole('button', { name: 'Edit Unnamed scene' }))
    expect(screen.getByRole('dialog', { name: 'Edit scene 1' })).toBeInTheDocument()
  })

  it('plans a scene: tracker, quick add, library, by tag, then edits, reorders and deletes it, nothing reaching the table', async () => {
    const { saved, libraryVillain } = await setup()
    await menuItem('Scene menu', 'Plan the next scene…')
    let dialog = within(screen.getByRole('dialog', { name: 'Plan scene 2' }))
    expect(dialog.getByText('Players see nothing here until you start it.')).toBeInTheDocument()
    expect(dialog.getByLabelText('Name')).toHaveValue('Scene 2')
    await userEvent.click(dialog.getByRole('radio', { name: /Epic/ }))
    // Quick add.
    await userEvent.click(dialog.getByRole('button', { name: '+ Minion' }))
    const quick = within(screen.getByRole('dialog', { name: 'Add minions' }))
    await userEvent.type(quick.getByLabelText('Name'), 'Grave Guard')
    await userEvent.click(quick.getByRole('button', { name: 'Add to scene' }))
    // From the library: the same villain dialog as Bring in.
    await userEvent.click(dialog.getByRole('button', { name: 'From library…' }))
    await userEvent.click(await within(screen.getByRole('dialog', { name: 'Add from your library' })).findByRole('button', { name: 'Add Ironclad' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Bring in Ironclad' })).getByRole('button', { name: 'Bring in' }))
    expect(within(await screen.findByRole('dialog', { name: 'Add from your library' })).getByText('In this scene')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Add from your library' })).getByRole('button', { name: 'Done' }))
    dialog = within(screen.getByRole('dialog', { name: 'Plan scene 2' }))
    expect(dialog.getByText('2 in the opposition · 2 start hidden')).toBeInTheDocument()
    expect(dialog.getByText('Quick added')).toBeInTheDocument()
    expect(dialog.getByText('From library')).toBeInTheDocument()
    await userEvent.click(dialog.getAllByRole('checkbox', { name: 'Starts hidden' })[0]!)
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))

    // On the tab; nothing on the table.
    await menuItem('Scene menu', 'Plan scenes')
    const row = screen.getByRole('article', { name: 'Scene 2: Scene 2' })
    expect(row).toHaveTextContent('Next')
    expect(row).toHaveTextContent('Epic · 1 / 3 / 4')
    expect(row).toHaveTextContent('Grave Guard ×3')
    expect(screen.getByText('Scene 1 of 2')).toBeInTheDocument()
    await waitFor(async () => expect((await saved()).offTable.villains).toMatchObject([{ sourceId: (await libraryVillain()).id }]))
    expect((await saved()).villains).toEqual([])

    // Editing it keeps what it holds.
    await userEvent.click(within(row).getByRole('button', { name: 'Edit Scene 2' }))
    dialog = within(screen.getByRole('dialog', { name: 'Plan scene 2' }))
    expect(dialog.getByRole('radio', { name: /Epic/ })).toBeChecked()
    await userEvent.click(dialog.getByRole('button', { name: 'Delete scene…' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete scene 2?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await saved()).scenes).toHaveLength(1))
    expect((await saved()).offTable.villains).toEqual([])
  })

  it('adds everything with a tag, hidden; heroes are not offered', async () => {
    await setup()
    await menuItem('Scene menu', 'Plan the next scene…')
    const dialog = within(screen.getByRole('dialog', { name: 'Plan scene 2' }))
    const select = await dialog.findByRole('option', { name: 'scene-3 (1)' })
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Add everything tagged' }), select)
    await userEvent.click(within(dialog.getByRole('combobox', { name: 'Add everything tagged' }).parentElement!).getByRole('button', { name: 'Add' }))
    expect(dialog.getByText('Tagged scene-3')).toBeInTheDocument()
    expect(dialog.getByText('1 in the opposition · 1 start hidden')).toBeInTheDocument()
  })

  it('reorders planned scenes with the keyboard, announcing politely; duplicates from the menu', async () => {
    const { saved } = await setup()
    await userEvent.click(screen.getByRole('tab', { name: 'Scenes' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Plan a scene' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Plan scene 2' })).getByRole('button', { name: 'Save' }))
    await menuItem('More for Scene 2', 'Duplicate')
    const handle = screen.getByRole('button', { name: 'Move Scene 2 (copy)' })
    handle.focus()
    await userEvent.keyboard(' ')
    expect(screen.getByText(/picked up/)).toBeInTheDocument()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByText('Scene 2 (copy) moved to scene 2.')).toBeInTheDocument()
    // Not past the current scene.
    await userEvent.keyboard('{ArrowUp} ')
    await waitFor(async () => expect((await saved()).scenes.map((s) => s.name)).toEqual(['', 'Scene 2 (copy)', 'Scene 2']))
    expect(screen.getByText('Scene 2 (copy) dropped at scene 2.')).toBeInTheDocument()
  })

  it('shows what is set aside, adds it to a scene or the table, and removes it', async () => {
    const { saved } = await setup((g) => {
      const v = villainCopy(adaptiveBruiser(), 'v1', true)
      g.offTable.villains.push(v)
      g.aside.push({ ref: { kind: 'villain', id: 'v1' }, afterScene: 1 })
      g.scenes[0]!.summary = undefined
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Scenes' }))
    expect(screen.getByText(/^Ironclad ·/)).toBeInTheDocument()
    // Bring in says it's set aside, and brings the same copy.
    await userEvent.click(screen.getByRole('tab', { name: 'Bring in' }))
    expect(await gmScreen().findByText('Set aside')).toBeInTheDocument()
    await userEvent.click(gmScreen().getByRole('button', { name: 'Bring in Ironclad now' }))
    await waitFor(async () => expect((await saved()).villains).toMatchObject([{ id: 'v1', hidden: true }]))
    expect((await saved()).aside).toEqual([])
  })

  it('tags something set aside with the scene planning on it, and stops offering that scene', async () => {
    await setup((g) => {
      g.offTable.villains.push(villainCopy(adaptiveBruiser(), 'v1', true))
      g.aside.push({ ref: { kind: 'villain', id: 'v1' } })
      for (const n of [2, 3]) g.scenes.push({ ...g.scenes[0]!, id: `s${n}`, name: `Scene ${n}`, state: 'planned', opposition: [] })
      g.scenes[1]!.opposition = [{ ref: { kind: 'villain', id: 'v1' }, startHidden: false, source: { kind: 'aside' } }]
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Scenes' }))
    const box = within(screen.getByRole('region', { name: 'Set aside' }))
    expect(box.getByText('· Planned for scene 2')).toBeInTheDocument()
    await userEvent.click(box.getByRole('button', { name: 'Actions for Ironclad' }))
    expect(screen.queryByRole('menuitem', { name: /^Add to scene 2/ })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^Add to scene 3/ })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    // In the editor it's tagged for other scenes, and not for the one being edited.
    await userEvent.click(screen.getByRole('button', { name: 'Edit Scene 3' }))
    expect(within(screen.getByRole('dialog', { name: 'Plan scene 3' })).getByRole('button', { name: /^\+ Ironclad/ })).toHaveTextContent('Planned for scene 2')
  })

  it('removes something set aside after a confirm, from its chip', async () => {
    const { saved } = await setup((g) => {
      g.offTable.villains.push(villainCopy(adaptiveBruiser(), 'v1', true))
      g.aside.push({ ref: { kind: 'villain', id: 'v1' } })
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Scenes' }))
    await menuItem('Actions for Ironclad', 'Remove from the game…')
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove Ironclad from the game?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(async () => expect((await saved()).offTable.villains).toEqual([]))
  })

  it('starts the next scene: fates, Hidden, resets, a preview, the log line and Undo', async () => {
    const { saved } = await setup((g, { hero }) => {
      g.heroes.push({ ...heroCopy(hero, 'h1'), play: { ...emptyPlay(), mods: [{ id: 'm', label: 'Pumped', value: 2 }] } })
      g.villains.push(villainCopy(adaptiveBruiser(), 'v1', false))
      g.round = 3
      g.turn = { order: [{ kind: 'hero', id: 'h1' }, { kind: 'villain', id: 'v1' }], acted: [{ kind: 'hero', id: 'h1' }], current: { kind: 'villain', id: 'v1' } }
      g.scenes[0]!.name = 'Rooftop chase'
      g.scenes.push({ ...createScene({ id: 's2', name: 'The Foundry' }), tracker: { green: 3, yellow: 5, red: 3 } })
    })
    await menuItem('Scene menu', 'Start the next scene: The Foundry…')
    const dialog = within(screen.getByRole('dialog', { name: 'Start scene 2: The Foundry?' }))
    expect(dialog.getByText('Scene 1, Rooftop chase, ends after round 3.')).toBeInTheDocument()
    expect(dialog.getByRole('combobox', { name: 'What happens to Ironclad' })).toHaveValue('aside')
    expect(dialog.getByText(/The heroes stay: Maya Reyes keep their Health/)).toBeInTheDocument()
    expect(dialog.getByText('Prolonged · 3 / 5 / 3')).toBeInTheDocument()
    expect(dialog.getByText('They get a toast: "New scene: The Foundry".')).toBeInTheDocument()
    expect(dialog.getByText('nothing yet', { exact: false })).toBeInTheDocument()
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'What happens to Ironclad' }), 'along')
    expect(dialog.getByText('Ironclad', { selector: 'div' , exact: false })).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('checkbox', { name: /Twist use/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Start scene 2' }))

    expect(screen.getByRole('heading', { name: 'The Foundry' })).toBeInTheDocument()
    expect(screen.getByText('Scene 2 of 2')).toBeInTheDocument()
    expect(turns().getByRole('heading')).toHaveTextContent('Not started')
    expect(log()).toHaveTextContent('Scene 2 began: The Foundry.')
    await waitFor(async () => expect((await saved()).currentSceneId).toBe('s2'))
    expect((await saved()).heroes[0]!.play.mods).toEqual([])
    expect((await saved()).scenes[0]).toMatchObject({ state: 'done', summary: 'Ended after round 3.' })

    // Undo puts the previous scene back exactly.
    await userEvent.click(within(log()).getByRole('button', { name: 'Undo starting scene 2' }))
    expect(screen.getByRole('heading', { name: 'Rooftop chase' })).toBeInTheDocument()
    await waitFor(async () => expect((await saved()).currentSceneId).not.toBe('s2'))
    const back = await saved()
    expect(back).toMatchObject({ round: 3, scenes: [{ state: 'now' }, { state: 'planned' }] })
    expect(back.heroes[0]!.play.mods).toHaveLength(1)
    expect(within(log()).queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument()
  })

  it('closes the Undo window after 30 seconds', async () => {
    await setup((g) => {
      g.scenes.push(createScene({ id: 's2', name: 'The Foundry' }))
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Scenes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start The Foundry' }))
    const spy = vi.spyOn(globalThis, 'setTimeout')
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Start scene 2: The Foundry?' })).getByRole('button', { name: 'Start scene 2' }))
    expect(within(log()).getByRole('button', { name: 'Undo starting scene 2' })).toBeInTheDocument()
    const call = spy.mock.calls.find((c: unknown[]) => c[1] === 30_000)
    spy.mockRestore()
    expect(call).toBeDefined()
    act(() => (call![0] as () => void)())
    expect(within(log()).queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument()
  })

  it('Save and start on a new scene when nothing is planned, and Edit first from the dialog', async () => {
    const { saved } = await setup()
    await menuItem('Scene menu', 'Plan the next scene…')
    const dialog = within(screen.getByRole('dialog', { name: 'Plan scene 2' }))
    await userEvent.clear(dialog.getByLabelText('Name'))
    await userEvent.type(dialog.getByLabelText('Name'), 'The Foundry')
    await userEvent.click(dialog.getByRole('button', { name: 'Save and start…' }))
    const start = within(await screen.findByRole('dialog', { name: 'Start scene 2: The Foundry?' }))
    await userEvent.click(start.getByRole('button', { name: 'Edit scene 2 first' }))
    const again = within(screen.getByRole('dialog', { name: 'Plan scene 2' }))
    expect(again.getByLabelText('Name')).toHaveValue('The Foundry')
    await userEvent.click(again.getByRole('button', { name: 'Save and start…' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Start scene 2: The Foundry?' })).getByRole('button', { name: 'Start scene 2' }))
    await waitFor(async () => expect((await saved()).scenes[1]!.state).toBe('now'))
  })

  it('offers Save and start only on the next planned scene', async () => {
    await setup((g) => {
      g.scenes.push(createScene({ id: 's2', name: 'One' }), createScene({ id: 's3', name: 'Two' }))
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Scenes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Two' }))
    expect(within(screen.getByRole('dialog', { name: 'Plan scene 3' })).queryByRole('button', { name: 'Save and start…' })).not.toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Plan scene 3' })).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit One' }))
    expect(within(screen.getByRole('dialog', { name: 'Plan scene 2' })).getByRole('button', { name: 'Save and start…' })).toBeInTheDocument()
  })

  it('lets a running villain advance the scene tracker once per scene (p. 154)', async () => {
    const { savedVillain, saved } = await setup()
    await userEvent.click(await gmScreen().findByRole('button', { name: 'Bring in Ironclad' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Bring in Ironclad' })).getByRole('button', { name: 'Bring in' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run Ironclad' }))
    const panel = within(screen.getByRole('region', { name: 'Ironclad' }))
    await userEvent.click(panel.getByRole('button', { name: 'Advance the scene tracker (once per scene)' }))
    expect(panel.getByRole('button', { name: 'Scene tracker advanced (once per scene)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Green 2, current' })).toBeInTheDocument()
    await waitFor(async () => expect((await savedVillain()).play.sceneAdvanced).toBe(true))
    expect(currentScene(await saved()).position).toBe(1)
  })

  it('asks how many heroes a villain faces, and recalculates its Health later keeping its damage', async () => {
    const { savedVillain } = await setup()
    await bringIn('Maya Reyes')
    await userEvent.click(await gmScreen().findByRole('button', { name: 'Bring in Ironclad' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Bring in Ironclad' }))
    // The game's one hero, by default.
    expect(dialog.getByRole('group', { name: 'Heroes at this table:' })).toHaveTextContent('1')
    expect(dialog.getByText('Max Health 40')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'More heroes' }))
    await userEvent.click(dialog.getByRole('button', { name: 'More heroes' }))
    expect(dialog.getByText('Max Health 50')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Bring in' }))
    await waitFor(async () => expect((await savedVillain()).play.heroCount).toBe(3))
    await userEvent.click(screen.getByRole('button', { name: 'Run Ironclad' }))
    await userEvent.click(within(screen.getByRole('region', { name: 'Ironclad' })).getByRole('button', { name: 'Lose 1 Health' }))
    await waitFor(async () => expect((await savedVillain()).play.health).toBe(49))
    await menuItem('More for Ironclad', 'Recalculate Health…')
    const recalc = within(screen.getByRole('dialog', { name: 'Recalculate Health' }))
    await userEvent.click(recalc.getByRole('button', { name: 'More heroes' }))
    expect(recalc.getByText('Max Health 55')).toBeInTheDocument()
    await userEvent.click(recalc.getByRole('button', { name: 'Recalculate' }))
    await waitFor(async () => expect((await savedVillain()).play).toMatchObject({ heroCount: 4, health: 54 }))
  })

  it('leaves draft villains out of Bring in', async () => {
    await setup(undefined, { villains: [{ ...adaptiveBruiser(), id: 'v2', status: 'draft', details: { ...adaptiveBruiser().details, name: 'Half-made' } }] })
    await gmScreen().findByRole('button', { name: 'Bring in Ironclad' })
    expect(gmScreen().queryByRole('button', { name: 'Bring in Half-made' })).not.toBeInTheDocument()
  })

  it('brings in a hero and a villain from a saved search; the villain arrives hidden', async () => {
    const { saved } = await setup()
    await gmScreen().findByRole('option', { name: 'Scene 3 (saved search)' })
    await userEvent.selectOptions(gmScreen().getByLabelText('From your library'), 'Scene 3 (saved search)')
    expect(gmScreen().getByRole('button', { name: 'Bring in the rest (1), hidden' })).toBeInTheDocument()
    await bringIn('Maya Reyes')
    await bringIn('Ironclad')
    expect(gmScreen().getByRole('list', { name: 'Library' })).toHaveTextContent('Maya ReyesHeroscene-3On the table')
    expect(gmScreen().getByRole('list', { name: 'Library' })).toHaveTextContent('IroncladVillainscene-3Hidden')
    const villain = screen.getByRole('article', { name: 'Ironclad' })
    expect(villain).toHaveTextContent('Hidden from players')
    // Only revealed actors are in the turn order.
    expect(turns().getByRole('list', { name: 'Turn order this round' })).toHaveTextContent('Maya Reyes')
    expect(turns().getByRole('list', { name: 'Turn order this round' })).not.toHaveTextContent('Ironclad')
    await userEvent.click(within(villain).getByRole('button', { name: 'Reveal' }))
    expect(turns().getByRole('list', { name: 'Turn order this round' })).toHaveTextContent('Ironclad')
    expect(log()).toHaveTextContent('The GM revealed Ironclad.')
    // Both are copies in the game, at fresh play state.
    await waitFor(async () => expect((await saved()).villains).toMatchObject([{ sourceId: 'v1', hidden: false, playersSee: 'status', play: { reactionUsed: false, mods: [], twists: [], history: [] } }]))
    expect((await saved()).heroes).toMatchObject([{ sourceId: expect.any(String), sheet: { details: { name: 'Maya Reyes' } }, play: { heroPoints: 0, reactionUsed: false } }])
  })

  it('shows a hero’s copy with its Health, and the scene zone raises its zone', async () => {
    const { savedHero, libraryHero } = await setup((g) => {
      g.scenes[0]!.position = 4
    })
    await bringIn('Maya Reyes')
    const card = screen.getByRole('article', { name: 'Maya Reyes' })
    expect(card).toHaveTextContent("GM's hero")
    expect(screen.getByRole('link', { name: '← Games' })).toHaveAttribute('href', '#/games')
    await waitFor(() => expect(card).toHaveTextContent('Yellow'))
    expect(card).toHaveTextContent(/30 \/ 30/)
    // The game's state isn't written into the hero: the library document is a sheet.
    await waitFor(async () => expect((await savedHero()).play.health).toBeUndefined())
    expect(await libraryHero()).not.toHaveProperty('play')
  })

  it('runs turns: hands off, clears only the new actor’s reaction, and the environment advances the tracker', async () => {
    const { saved, savedHero, savedVillain } = await setup()
    await bringIn('Maya Reyes')
    await bringIn('Ironclad')
    await userEvent.click(within(screen.getByRole('article', { name: 'Ironclad' })).getByRole('button', { name: 'Reveal' }))
    await menuItem('Scene menu', 'Environment…')
    const envDialog = within(screen.getByRole('dialog', { name: 'Set environment' }))
    await userEvent.type(envDialog.getByLabelText('Name'), 'Collapsing Foundry')
    await userEvent.click(envDialog.getByLabelText('Hidden from players until revealed'))
    await userEvent.click(envDialog.getByRole('button', { name: 'Set environment' }))
    expect(screen.getByText('Environment: Collapsing Foundry')).toBeInTheDocument()
    // Both have used their reactions.
    await menuItem('GM actions for Maya Reyes', 'Mark reaction used')
    await userEvent.click(screen.getByRole('button', { name: 'Run Ironclad' }))
    await userEvent.click(within(screen.getByRole('region', { name: 'Ironclad' })).getByLabelText('Reaction used this round'))
    await waitFor(async () => expect((await savedVillain()).play.reactionUsed).toBe(true))

    await menuItem('Start round 1', 'Ironclad')
    expect(turns().getByRole('heading')).toHaveTextContent('Round 1')
    expect(turns().getByRole('list')).toHaveTextContent('Ironcladacting now')
    // The villain's reaction is ready again; the hero's isn't (it's not their turn yet).
    await waitFor(async () => expect((await savedVillain()).play.reactionUsed).toBe(false))
    expect((await savedHero()).play.reactionUsed).toBe(true)

    await userEvent.click(turns().getByRole('button', { name: 'Hand off for Ironclad' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Maya Reyes', 'Collapsing Foundry'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Maya Reyes' }))
    expect(log()).toHaveTextContent('Ironclad handed off to Maya Reyes.')
    expect(screen.getByRole('status')).toHaveTextContent('Ironclad handed off to Maya Reyes.')
    await waitFor(async () => expect((await savedHero()).play.reactionUsed).toBe(false))

    await menuItem('Hand off for Maya Reyes', 'Collapsing Foundry')
    expect(screen.getByRole('button', { name: 'Green 2, current' })).toBeInTheDocument()
    expect(log()).toHaveTextContent('The scene tracker moved to Green 2.')

    // Nobody is left: end the round and pick who starts.
    await menuItem('Hand off for Collapsing Foundry', 'End round; start round 2')
    const ask = within(await screen.findByRole('dialog', { name: 'Who starts round 2?' }))
    await userEvent.click(ask.getByRole('button', { name: 'Collapsing Foundry' }))
    expect(turns().getByRole('heading')).toHaveTextContent('Round 2')
    expect(screen.getByRole('button', { name: 'Yellow 1, current' })).toBeInTheDocument()
    await waitFor(async () => expect((await saved()).round).toBe(2))
  })

  it('quick adds minions, shrinks them, and drops the group when the last is gone', async () => {
    const { saved } = await setup()
    await userEvent.click(gmScreen().getByRole('button', { name: '+ Minion' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add minions' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'Scrap drones')
    await userEvent.selectOptions(dialog.getByLabelText('Die'), 'd4')
    await userEvent.clear(dialog.getByLabelText('How many'))
    await userEvent.type(dialog.getByLabelText('How many'), '2')
    expect(dialog.getByLabelText('Hidden from players until revealed')).toBeChecked()
    await userEvent.click(dialog.getByRole('button', { name: 'Add to table' }))
    const card = screen.getByRole('article', { name: 'Scrap drones' })
    expect(within(card).getByRole('list', { name: 'Dice' })).toHaveTextContent('× 2')
    expect(card).toHaveTextContent('Hidden from players')
    await userEvent.click(within(card).getByRole('button', { name: 'Show each' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Remove Scrap drones 1' }))
    expect(within(card).getByRole('list', { name: 'Members of Scrap drones' })).toHaveTextContent('Minion 2')
    await userEvent.click(within(card).getByRole('button', { name: 'Remove Scrap drones 2' }))
    expect(screen.queryByRole('article', { name: 'Scrap drones' })).not.toBeInTheDocument()
    expect(log()).toHaveTextContent('All of Scrap drones are gone; the group left the table.')
    expect(log()).toHaveTextContent('only you see this')
    await waitFor(async () => expect((await saved()).groups).toEqual([]))
  })

  it('runs a group: shrinks a member, rolls its die, and marks it acted', async () => {
    await setup()
    await userEvent.click(gmScreen().getByRole('button', { name: '+ Lieutenant' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add lieutenants' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'Static Choir')
    await userEvent.click(dialog.getByRole('button', { name: 'Add to table' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run Static Choir' }))
    const running = within(screen.getByRole('region', { name: 'Static Choir' }))
    await userEvent.click(running.getByRole('button', { name: 'More actions for Static Choir 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Shrink' }))
    expect(within(screen.getByRole('article', { name: 'Static Choir' })).getByRole('list', { name: 'Dice' })).toHaveTextContent('× 2')
    expect(running.getByText('0 of 3 acted')).toBeInTheDocument()
    await userEvent.click(running.getByRole('button', { name: 'Roll Static Choir 2' }))
    const roll = within(screen.getByRole('dialog', { name: 'Static Choir 2 rolls Attack' }))
    expect(roll.getByRole('row', { name: /Static Choir 2/ })).toHaveTextContent('5')
    await userEvent.click(roll.getByRole('button', { name: 'Apply' }))
    expect(log()).toHaveTextContent('Static Choir 2 took Attack: 5, with no target.')
    expect(running.getByText('1 of 3 acted')).toBeInTheDocument()
    expect(running.getByRole('button', { name: 'Roll Static Choir 2' })).toBeDisabled()
  })

  it('adds a challenge and checks its steps', async () => {
    await setup()
    await userEvent.click(gmScreen().getByRole('button', { name: '+ Challenge' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add a challenge' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'Shut down the crucible')
    await userEvent.click(dialog.getByRole('button', { name: 'Add to table' }))
    const card = screen.getByRole('article', { name: 'Shut down the crucible' })
    await userEvent.click(within(card).getByRole('checkbox', { name: 'Step 1' }))
    expect(card).toHaveTextContent('1 of 3 done')
  })

  it('runs a villain: Health on its copy, and its history goes to the log', async () => {
    const { savedVillain, libraryVillain } = await setup()
    await bringIn('Ironclad')
    await userEvent.click(screen.getByRole('button', { name: 'Run Ironclad' }))
    const running = within(screen.getByRole('region', { name: 'Ironclad' }))
    await userEvent.click(running.getByRole('button', { name: 'Lose 1 Health' }))
    // No heroes at the table yet, so it came in sized for one: 15 + 20 + 5.
    expect(screen.getByRole('article', { name: 'Ironclad' })).toHaveTextContent('39 / 40')
    expect(log()).toHaveTextContent('Ironclad: Lost 1 HP (40 → 39).')
    await waitFor(async () => expect((await savedVillain()).play.health).toBe(39))
    // Damage stays in this game.
    expect(await libraryVillain()).not.toHaveProperty('play')
    expect(running.getByRole('link', { name: "Open this villain's sheet" })).toHaveAttribute('href', '#/villain/v1')
  })

  it("gives a villain's Hinder penalty to a hero it picks", async () => {
    const { savedHero } = await setup()
    await bringIn('Maya Reyes')
    await bringIn('Ironclad')
    await userEvent.click(screen.getByRole('button', { name: 'Run Ironclad' }))
    await userEvent.click(within(screen.getByRole('region', { name: 'Ironclad' })).getByRole('button', { name: 'Roll' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Basic action' }))
    await userEvent.selectOptions(dialog.getByLabelText('Action'), 'Hinder')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    const forWho = dialog.getByLabelText('For')
    expect([...forWho.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Maya Reyes'])
    await userEvent.click(dialog.getByRole('button', { name: /Give .* penalty to Maya Reyes/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await savedHero()).play.mods).toMatchObject([{ value: expect.any(Number) }]))
    expect((await savedHero()).play.mods[0]!.value).toBeLessThan(0)
  })

  it('sets what players see of a revealed villain', async () => {
    const { saved } = await setup()
    await bringIn('Ironclad')
    await userEvent.click(within(screen.getByRole('article', { name: 'Ironclad' })).getByRole('button', { name: 'Reveal' }))
    await userEvent.click(screen.getByRole('button', { name: 'What players see of Ironclad' }))
    expect(screen.getByRole('menuitemradio', { name: 'Status' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Name only' }))
    expect(screen.getByRole('article', { name: 'Ironclad' })).toHaveTextContent('Players see name only.')
    await waitFor(async () => expect((await saved()).villains[0]!.playersSee).toBe('name'))
  })

  it('makes the GM’s hero changes on the game’s copy, marked as the GM’s', async () => {
    const { savedHero } = await setup()
    await bringIn('Maya Reyes')
    await menuItem('GM actions for Maya Reyes', 'Change Health…')
    const dialog = within(screen.getByRole('dialog', { name: "Change Maya Reyes's Health" }))
    const field = dialog.getByLabelText(/Health/)
    await userEvent.clear(field)
    await userEvent.type(field, '10')
    await userEvent.click(dialog.getByRole('button', { name: 'Change Health' }))
    await waitFor(async () => expect((await savedHero()).play.health).toBe(10))
    expect((await savedHero()).play.history.at(-1)?.text).toMatch(/^GM: Lost \d+ HP/)
    expect(log()).toHaveTextContent('Maya Reyes: Lost')
    expect(screen.getByRole('article', { name: 'Maya Reyes' })).toHaveTextContent(/10 \/ 30/)
    await menuItem('GM actions for Maya Reyes', 'Mark reaction used')
    await waitFor(async () => expect((await savedHero()).play.reactionUsed).toBe(true))
    expect(screen.getByRole('article', { name: 'Maya Reyes' })).toHaveTextContent('Reaction used')
    await menuItem('GM actions for Maya Reyes', 'Give a bonus or penalty…')
    expect(screen.getByRole('dialog', { name: 'Give Maya Reyes a bonus or penalty' })).toBeInTheDocument()
  })

  it('updates a villain from the library: the menu says it changed, the dialog shows the diff and adjustments, and only this copy changes', async () => {
    const { savedVillain, libraryVillain } = await setup((g, { villain }) => {
      // The game's copy is older: built for 5 heroes (60 Health), and down to 58.
      const old = { ...structuredClone(villain), heroCount: 5 }
      old.details.name = 'Ironclad'
      g.villains = [{ ...villainCopy(old, 'cv', false), play: { reactionUsed: false, mods: [{ id: 'm', label: 'cornered', value: -1 }], twists: [], history: [], health: 58 } }]
      g.turn.order = [{ kind: 'villain', id: 'cv' }]
    })
    const card = screen.getByRole('article', { name: 'Ironclad' })
    await userEvent.click(within(card).getByRole('button', { name: 'More for Ironclad' }))
    // A muted line at the top of the menu, not an action.
    expect(await screen.findByText(/^Library sheet changed /)).toHaveClass('popover__note')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Update from library…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Update Ironclad from your library?' }))
    expect(dialog.getByText('Max Health 60 → 55')).toBeInTheDocument()
    expect(dialog.getByText('Health lowered to 55, the new max.')).toBeInTheDocument()
    expect(dialog.getByText("Only this game's Ironclad changes. Other games keep their own copy.")).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Update' }))
    await waitFor(async () => expect((await savedVillain()).sheet.heroCount).toBe(4))
    expect((await savedVillain()).play).toMatchObject({ health: 55, mods: [{ label: 'cornered' }] })
    expect(log()).toHaveTextContent('Ironclad: The sheet was updated from the library.')
    expect(await libraryVillain()).toMatchObject({ heroCount: 4 })
    // Now it matches, so the menu no longer offers it.
    await userEvent.click(within(card).getByRole('button', { name: 'More for Ironclad' }))
    expect(screen.queryByRole('menuitem', { name: 'Update from library…' })).not.toBeInTheDocument()
  })

  it('offers Update in Bring in for a villain whose library sheet changed', async () => {
    await setup((g, { villain }) => {
      g.villains = [villainCopy({ ...structuredClone(villain), heroCount: 5 }, 'cv', true)]
    })
    const list = await gmScreen().findByRole('list', { name: 'Library' })
    await waitFor(() => expect(list).toHaveTextContent('IroncladVillainscene-3Library changed'))
    await userEvent.click(within(list).getByRole('button', { name: 'Update Ironclad from your library' }))
    expect(screen.getByRole('dialog', { name: 'Update Ironclad from your library?' })).toBeInTheDocument()
  })

  it('removes a hero from the game after asking', async () => {
    const { saved } = await setup()
    await bringIn('Maya Reyes')
    await menuItem('GM actions for Maya Reyes', 'Remove from the game…')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    expect(screen.queryByRole('article', { name: 'Maya Reyes' })).not.toBeInTheDocument()
    await waitFor(async () => expect((await saved()).heroes).toEqual([]))
  })

  it('keeps private notes with the game', async () => {
    const { saved } = await setup()
    await userEvent.click(gmScreen().getByRole('tab', { name: 'Notes' }))
    await userEvent.type(gmScreen().getByLabelText('Private notes'), 'Rust Hound at Yellow')
    await waitFor(async () => expect((await saved()).notes).toBe('Rust Hound at Yellow'))
  })

  it('renames the game', async () => {
    const { saved } = await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Rename game: Thursday game' }))
    await userEvent.clear(screen.getByLabelText('Rename game'))
    await userEvent.type(screen.getByLabelText('Rename game'), 'Friday game{Enter}')
    await waitFor(async () => expect((await saved()).name).toBe('Friday game'))
  })
})
