import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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
import { createGame, type Game } from './model'
import { MemoryGameStore } from './store'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

async function setup(change: (g: Game) => void = () => {}) {
  const games = new MemoryGameStore()
  const heroes = new MemoryHeroStore()
  const villains = new MemoryVillainStore()
  const searches = new MemorySavedSearchStore()
  const hero = completeHero()
  hero.details.name = 'Maya Reyes'
  hero.tags = ['scene-3']
  hero.play = { heroPoints: 0, reactionUsed: true, mods: [], twists: [], history: [] }
  await heroes.save(hero)
  const villain = adaptiveBruiser()
  villain.tags = ['scene-3']
  villain.play = { reactionUsed: true, mods: [], twists: [], history: [] }
  await villains.save(villain)
  await searches.save(createSavedSearch('Scene 3', { text: '', types: [], tags: ['scene-3'] }, { id: 's1' }))
  const game = createGame({ id: 'g1', name: 'Thursday game' })
  change(game)
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
  const savedHero = async () => {
    const r = await heroes.get('h')
    if (r.status !== 'found') throw new Error('no hero')
    return r.hero
  }
  const savedVillain = async () => {
    const r = await villains.get('v1')
    if (r.status !== 'found') throw new Error('no villain')
    return r.villain
  }
  return { saved, savedHero, savedVillain }
}

const gmScreen = () => within(screen.getByRole('complementary', { name: 'GM screen' }))
const turns = () => within(screen.getByRole('region', { name: /^Round|^Not started/ }))
const log = () => screen.getByRole('region', { name: 'Table log' })

async function bringIn(name: string) {
  await userEvent.click(await gmScreen().findByRole('button', { name: `Bring in ${name}` }))
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
    await waitFor(async () => expect((await saved()).scene.position).toBe(3))
  })

  it('sets up the scene: name and box counts', async () => {
    const { saved } = await setup()
    await menuItem('Scene setup', 'Scene setup…')
    const dialog = within(screen.getByRole('dialog', { name: 'Scene setup' }))
    await userEvent.type(dialog.getByLabelText('Scene name'), 'The Foundry')
    await userEvent.clear(dialog.getByLabelText('Red'))
    await userEvent.type(dialog.getByLabelText('Red'), '1')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('heading', { name: 'The Foundry' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Scene tracker' })).getAllByRole('button')).toHaveLength(7)
    await waitFor(async () => expect((await saved()).scene).toMatchObject({ name: 'The Foundry', tracker: ['green', 'green', 'green', 'yellow', 'yellow', 'yellow', 'red'] }))
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
    await waitFor(async () => expect((await saved()).villains).toEqual([{ villainId: 'v1', hidden: false, playersSee: 'status' }]))
  })

  it('shows a hero from the library with its Health and zone, and gives it the scene zone', async () => {
    const { savedHero } = await setup((g) => {
      g.scene.position = 4
    })
    await bringIn('Maya Reyes')
    const card = screen.getByRole('article', { name: 'Maya Reyes' })
    await waitFor(() => expect(card).toHaveTextContent('Yellow'))
    expect(card).toHaveTextContent('Reaction used')
    await waitFor(async () => expect((await savedHero()).play?.sceneZone).toBe('yellow'))
  })

  it('runs turns: hands off, clears only the new actor’s reaction, and the environment advances the tracker', async () => {
    const { saved, savedHero, savedVillain } = await setup()
    await bringIn('Maya Reyes')
    await bringIn('Ironclad')
    await userEvent.click(within(screen.getByRole('article', { name: 'Ironclad' })).getByRole('button', { name: 'Reveal' }))
    await menuItem('Scene setup', 'Set environment…')
    const envDialog = within(screen.getByRole('dialog', { name: 'Set environment' }))
    await userEvent.type(envDialog.getByLabelText('Name'), 'Collapsing Foundry')
    await userEvent.click(envDialog.getByLabelText('Hidden from players until revealed'))
    await userEvent.click(envDialog.getByRole('button', { name: 'Set environment' }))
    expect(screen.getByText('Environment: Collapsing Foundry')).toBeInTheDocument()

    await menuItem('Start round 1', 'Ironclad')
    expect(turns().getByRole('heading')).toHaveTextContent('Round 1')
    expect(turns().getByRole('list')).toHaveTextContent('Ironcladacting now')
    // The villain's reaction is ready again; the hero's isn't (it's not their turn yet).
    await waitFor(async () => expect((await savedVillain()).play?.reactionUsed).toBe(false))
    expect((await savedHero()).play?.reactionUsed).toBe(true)

    await userEvent.click(turns().getByRole('button', { name: 'Hand off for Ironclad' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Maya Reyes', 'Collapsing Foundry'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Maya Reyes' }))
    expect(log()).toHaveTextContent('Ironclad handed off to Maya Reyes.')
    expect(screen.getByRole('status')).toHaveTextContent('Ironclad handed off to Maya Reyes.')
    await waitFor(async () => expect((await savedHero()).play?.reactionUsed).toBe(false))

    await menuItem('Hand off for Maya Reyes', 'Collapsing Foundry')
    expect(screen.getByRole('button', { name: 'Green 2, current' })).toBeInTheDocument()
    expect(log()).toHaveTextContent('The scene tracker moved to Green 2.')

    // Nobody is left: end the round and pick who starts.
    await menuItem('Hand off for Collapsing Foundry', 'End round; start round 2')
    const ask = within(await screen.findByRole('dialog', { name: 'Who starts round 2?' }))
    await userEvent.click(ask.getByRole('button', { name: 'Collapsing Foundry' }))
    expect(turns().getByRole('heading')).toHaveTextContent('Round 2')
    expect(screen.getByRole('button', { name: 'Green 3, current' })).toBeInTheDocument()
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

  it('runs a group: shrinks a member and rolls its die', async () => {
    await setup()
    await userEvent.click(gmScreen().getByRole('button', { name: '+ Lieutenant' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add lieutenants' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'Static Choir')
    await userEvent.click(dialog.getByRole('button', { name: 'Add to table' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run Static Choir' }))
    const running = within(screen.getByRole('region', { name: 'Static Choir' }))
    await userEvent.click(running.getByRole('button', { name: 'Shrink Static Choir 1' }))
    expect(within(screen.getByRole('article', { name: 'Static Choir' })).getByRole('list', { name: 'Dice' })).toHaveTextContent('× 2')
    await userEvent.click(running.getByRole('button', { name: 'Roll Static Choir 2' }))
    await userEvent.click(running.getByRole('button', { name: 'Roll d8' }))
    await userEvent.click(running.getByRole('button', { name: 'Done' }))
    expect(log()).toHaveTextContent('Static Choir 2 took Attack:')
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

  it('runs a villain: Health, and its history goes to the log', async () => {
    const { savedVillain } = await setup()
    await bringIn('Ironclad')
    await userEvent.click(screen.getByRole('button', { name: 'Run Ironclad' }))
    const running = within(screen.getByRole('region', { name: 'Ironclad' }))
    await userEvent.click(running.getByRole('button', { name: 'Lose 1 Health' }))
    expect(screen.getByRole('article', { name: 'Ironclad' })).toHaveTextContent('54 / 55')
    expect(log()).toHaveTextContent('Ironclad: Lost 1 HP (55 → 54).')
    await waitFor(async () => expect((await savedVillain()).play?.health).toBe(54))
    expect(running.getByRole('link', { name: 'Open full villain page' })).toHaveAttribute('href', '#/villain/v1/play')
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

  it('makes the GM’s hero changes on the hero, marked as the GM’s', async () => {
    const { savedHero } = await setup()
    await bringIn('Maya Reyes')
    await menuItem('GM actions for Maya Reyes', 'Change Health…')
    const dialog = within(screen.getByRole('dialog', { name: "Change Maya Reyes's Health" }))
    const field = dialog.getByLabelText(/Health/)
    await userEvent.clear(field)
    await userEvent.type(field, '10')
    await userEvent.click(dialog.getByRole('button', { name: 'Change Health' }))
    await waitFor(async () => expect((await savedHero()).play?.health).toBe(10))
    expect((await savedHero()).play?.history.at(-1)?.text).toMatch(/^GM: Lost \d+ HP/)
    expect(log()).toHaveTextContent('Maya Reyes: Lost')
    await menuItem('GM actions for Maya Reyes', 'Mark reaction unused')
    await waitFor(async () => expect((await savedHero()).play?.reactionUsed).toBe(false))
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
