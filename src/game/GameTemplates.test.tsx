import { DEFAULT_SETTINGS } from '../settings/model'
import { SettingsProvider } from '../settings/SettingsProvider'
import { MemorySettingsStore } from '../settings/store'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameStoreContext } from '../app/game-store-context'
import { SavedSearchStoreContext } from '../app/saved-search-context'
import { StoreContext } from '../app/store-context'
import { TemplateStoresContext } from '../app/template-store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { MemoryHeroStore } from '../hero/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import { createChallengeTemplate, createEnvironmentTemplate, createMinionTemplate } from '../template/model'
import { memoryTemplateStores } from '../template/store'
import { challengeFromTemplate, groupFromTemplate, templateFromChallenge, templateFromGroup } from '../template/to-table'
import { environmentFromTemplate } from './environment'
import { MemoryVillainStore } from '../villain/store'
import { bullyOverlord } from '../test/villains'
import { GamePage } from './GamePage'
import { createGame } from './model'
import { MemoryGameStore } from './store'
import { addChallenge, addGroup } from './table'
import { gamesHolding } from './useGameEditor'
import { project } from './project'
import { tableViewProblem } from '../session/protocol'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })
const burglar = () => ({ ...createMinionTemplate({ id: 'burglar' }), name: 'Burglar', die: 'd8' as const, groupSize: 4, actions: ['attack' as const, 'hinder' as const] })
const crucible = () => ({ ...createChallengeTemplate({ id: 'crucible' }), name: 'Shut down the crucible', description: 'It is overheating.', steps: [{ label: 'Reach the control room' }, { label: '' }], done: 'The crucible cools.' })

describe('templates on the table', () => {
  it('bring in a fresh group or challenge each time, with what the template gives', () => {
    let g = addGroup(createGame({ id: 'g' }), groupFromTemplate(burglar(), 'minions', 3, true), clock())
    g = addGroup(g, groupFromTemplate(burglar(), 'minions', 2, false), clock())
    expect(g.groups.map((x) => [x.name, x.templateId, x.actions, x.members.map((m) => m.die)])).toEqual([
      ['Burglar', 'burglar', ['attack', 'hinder'], ['d8', 'd8', 'd8']],
      ['Burglar', 'burglar', ['attack', 'hinder'], ['d8', 'd8']],
    ])
    g = addChallenge(g, challengeFromTemplate(crucible(), true), clock())
    expect(g.challenges[0]).toMatchObject({ templateId: 'crucible', steps: [{ label: 'Reach the control room', done: false }, { label: 'Step 2', done: false }], description: 'It is overheating.', whenDone: 'The crucible cools.' })
    expect(gamesHolding([{ ...g, name: 'Thursday' }], 'minion', 'burglar')).toHaveLength(1)
    expect(gamesHolding([g], 'lieutenant', 'burglar')).toEqual([])
    expect(gamesHolding([g], 'challenge', 'crucible')).toHaveLength(1)
  })

  it('bring their color to the table, the environment\'s too, and a saved quick add keeps it', () => {
    const coloured = { ...burglar(), color: 'pink' as const }
    let g = addGroup(createGame({ id: 'g' }), groupFromTemplate(coloured, 'minions', 2, false), clock())
    expect(g.groups[0]!.color).toBe('pink')
    g = addChallenge(g, challengeFromTemplate({ ...crucible(), color: 'grey' }, false), clock())
    expect(g.challenges[0]!.color).toBe('grey')
    expect(environmentFromTemplate({ ...createEnvironmentTemplate({ id: 'e' }), color: 'cyan' }, []).color).toBe('cyan')
    expect(templateFromGroup({ kind: 'minions', name: 'x', die: 'd6', count: 2, color: 'pink' }).color).toBe('pink')
    expect(templateFromChallenge({ name: 'x', steps: 2, color: 'grey' }).color).toBe('grey')
    expect(tableViewProblem(project(g, 'player'))).toBeUndefined()
    expect(project(g, 'player').groups[0]!.color).toBe('pink')
  })

  it('keeps what a template brings within what the table view carries', () => {
    const long = { ...crucible(), name: 'n'.repeat(500), description: 'd'.repeat(3000), done: 'w'.repeat(3000), steps: [{ label: 'l'.repeat(500) }] }
    let g = addChallenge(createGame({ id: 'g' }), challengeFromTemplate(long, false), clock())
    g = addGroup(g, groupFromTemplate({ ...burglar(), name: 'b'.repeat(500) }, 'minions', 1, false), clock())
    const c = g.challenges[0]!
    expect([c.name.length, c.steps[0]!.label.length, c.description!.length, c.whenDone!.length, g.groups[0]!.name.length]).toEqual([200, 200, 2000, 2000, 200])
    expect(tableViewProblem(project(g, 'player'))).toBeUndefined()
  })
})

async function setup(villains = new MemoryVillainStore(), settings = new MemorySettingsStore()) {
  const games = new MemoryGameStore()
  const templates = memoryTemplateStores()
  await templates.minions.save(burglar())
  await templates.challenges.save(crucible())
  await templates.environments.save({
    ...createEnvironmentTemplate({ id: 'heist' }),
    name: 'Rooftop Heist',
    description: 'Slick tiles and a long drop.',
    aspects: [{ name: 'Slick Tiles', die: 'd10' }, { name: 'Howling Wind', die: 'd6' }, { name: 'Night Security', die: 'd8' }],
    twists: [
      { id: 't1', zone: 'green', kind: 'minor', text: 'A gust.' },
      { id: 't2', zone: 'yellow', kind: 'major', name: 'Floodlights', text: 'Everyone is seen.' },
    ],
    attached: [{ kind: 'minion', templateId: 'burglar' }, { kind: 'challenge', templateId: 'crucible' }],
  })
  await games.save(createGame({ id: 'g1', name: 'Thursday game' }))
  render(
    <SettingsProvider store={settings}>
      <StoreContext.Provider value={new MemoryHeroStore()}>
        <VillainStoreContext.Provider value={villains}>
          <GameStoreContext.Provider value={games}>
            <SavedSearchStoreContext.Provider value={new MemorySavedSearchStore()}>
              <TemplateStoresContext.Provider value={templates}>
                <GamePage id="g1" clock={clock} random={() => 0.5} />
              </TemplateStoresContext.Provider>
            </SavedSearchStoreContext.Provider>
          </GameStoreContext.Provider>
        </VillainStoreContext.Provider>
      </StoreContext.Provider>
    </SettingsProvider>,
  )
  await screen.findByRole('button', { name: /Rename game/ })
  const saved = async () => {
    const r = await games.get('g1')
    if (r.status !== 'found') throw new Error('no game')
    return r.game
  }
  return { saved, templates }
}

const gmScreen = () => within(screen.getByRole('complementary', { name: 'GM screen' }))

describe('the GM screen and templates', () => {
  it('brings in a minion template with as many as asked, and a challenge with its labeled steps', async () => {
    const { saved } = await setup()
    const how = await gmScreen().findByRole('spinbutton', { name: 'How many Burglar' })
    expect(how).toHaveValue(4)
    await userEvent.clear(how)
    await userEvent.type(how, '2')
    await userEvent.click(gmScreen().getByRole('button', { name: 'Bring in Burglar' }))
    await userEvent.click(gmScreen().getByRole('button', { name: 'Bring in Shut down the crucible' }))
    await waitFor(async () => expect((await saved()).groups.map((g) => [g.name, g.members.length, g.hidden])).toEqual([['Burglar', 2, true]]))
    expect((await saved()).challenges.map((c) => c.steps.map((x) => x.label))).toEqual([['Reach the control room', 'Step 2']])
    const card = screen.getByRole('article', { name: 'Shut down the crucible' })
    expect(within(card).getByRole('checkbox', { name: 'Reach the control room' })).toBeInTheDocument()
    expect(within(card).getByRole('checkbox', { name: 'Step 2' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('checkbox', { name: 'Reach the control room' }))
    await userEvent.click(within(card).getByRole('checkbox', { name: 'Step 2' }))
    expect(card).toHaveTextContent('The crucible cools.')
    // Templates can come in again: "Add another", still asking how many.
    expect(gmScreen().getByRole('button', { name: 'Add another Burglar' })).toHaveTextContent('Add another')
    expect(gmScreen().getByRole('button', { name: 'Add another Shut down the crucible' })).toBeEnabled()
    expect(gmScreen().getByRole('spinbutton', { name: 'How many Burglar' })).toBeInTheDocument()
  })

  it('saves a quick-added group to the library as a template when asked', async () => {
    const { saved, templates } = await setup()
    await userEvent.click(gmScreen().getByRole('button', { name: '+ Lieutenant' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add lieutenants' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'Static Choir')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Save to library' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Add to table' }))
    await waitFor(async () => expect((await templates.lieutenants.list()).docs.map((d) => [d.name, d.die, d.groupSize])).toEqual([['Static Choir', 'd8', 3]]))
    const id = (await templates.lieutenants.list()).docs[0]!.id
    await waitFor(async () => expect((await saved()).groups[0]!.templateId).toBe(id))
  })

  it('saves a quick-added challenge only when asked', async () => {
    const { templates } = await setup()
    await userEvent.click(gmScreen().getByRole('button', { name: '+ Challenge' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Add a challenge' })).getByRole('button', { name: 'Add to table' }))
    await userEvent.click(gmScreen().getByRole('button', { name: '+ Challenge' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add a challenge' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'Vent it')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Save to library' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Add to table' }))
    // Only the second was saved: the library holds it and the template it started with.
    const names = async () => (await templates.challenges.list()).docs.map((d) => `${d.name} (${d.steps.length})`).sort()
    await waitFor(async () => expect(await names()).toEqual(['Shut down the crucible (2)', 'Vent it (3)']))
  })
})

const openSettings = async (): Promise<MemorySettingsStore> => {
  const store = new MemorySettingsStore()
  await store.save({ ...DEFAULT_SETTINGS, newGame: { trackerPreset: 'epic', startHidden: false, playersSee: 'health' } })
  return store
}

describe('new game defaults from Settings', () => {
  it('bring templates and an environment in shown', async () => {
    const { saved } = await setup(undefined, await openSettings())
    await userEvent.click(await screen.findByRole('button', { name: 'Bring in Burglar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Bring in Shut down the crucible' }))
    await waitFor(async () => expect((await saved()).groups).toMatchObject([{ templateId: 'burglar', hidden: false }]))
    await waitFor(async () => expect((await saved()).challenges).toMatchObject([{ templateId: 'crucible', hidden: false }]))
    await userEvent.click(await screen.findByRole('button', { name: 'Bring in Rooftop Heist' }))
    await waitFor(async () => expect((await saved()).environment).toMatchObject({ templateId: 'heist', hidden: false }))
  })
})

describe('the environment dice, with physical dice', () => {
  it('open the pad, and take the numbers or roll for me', async () => {
    const settings = new MemorySettingsStore()
    await settings.save({ ...DEFAULT_SETTINGS, rolling: 'physical' })
    const { saved } = await setup(undefined, settings)
    await userEvent.click(await screen.findByRole('button', { name: 'Bring in Rooftop Heist' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Run Rooftop Heist' }))
    const panel = () => within(gmScreen().getByRole('region', { name: 'Rooftop Heist' }))
    await userEvent.click(panel().getByRole('button', { name: 'Roll environment dice' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Environment dice' }))
    const pad = within(dialog.getByRole('group', { name: 'Number pad' }))
    expect(pad.getByRole('button', { name: '11' })).toBeDisabled()
    for (const n of ['9', '2', '5']) await userEvent.click(pad.getByRole('button', { name: n }))
    await userEvent.click(dialog.getByRole('button', { name: 'Accept' }))
    expect(panel().getByRole('status', { name: 'Environment roll' })).toHaveTextContent('Min2EnteredMid5EnteredMax9Entered')
    await waitFor(async () => expect((await saved()).feed.at(-1)?.text).toBe('Rolled the environment dice: 9, 5, 2 (physical dice).'))
    await userEvent.click(panel().getByRole('button', { name: 'Roll environment dice' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Environment dice' })).getByRole('button', { name: 'Roll for me' }))
    expect(panel().getByRole('status', { name: 'Environment roll' })).toHaveTextContent('Slick Tiles')
  })
})

describe('templates in a planned scene', () => {
  it('copies an environment and a group off the table, and Bring in says where they are', async () => {
    const { saved } = await setup()
    await userEvent.click(screen.getByRole('tab', { name: 'Scenes' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Plan a scene' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Plan scene 2' }))
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Environment' }), 'Choose from library…')
    await userEvent.click(await within(screen.getByRole('dialog', { name: 'Choose an environment' })).findByRole('button', { name: 'Use Rooftop Heist' }))
    await within(dialog.getByRole('combobox', { name: 'Environment' })).findByRole('option', { name: 'Rooftop Heist (from your library)' })
    expect(dialog.getByRole('checkbox', { name: 'Starts hidden' })).toBeChecked()
    await userEvent.click(dialog.getByRole('button', { name: 'From library…' }))
    const library = within(screen.getByRole('dialog', { name: 'Add from your library' }))
    await userEvent.click(await library.findByRole('button', { name: 'Add Burglar' }))
    await userEvent.click(library.getByRole('button', { name: 'Done' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await saved()).offTable.environments).toMatchObject([{ templateId: 'heist', hidden: true }]))
    expect((await saved()).environment).toBeUndefined()
    expect((await saved()).offTable.groups).toMatchObject([{ templateId: 'burglar', hidden: true }])
    expect(screen.getByRole('article', { name: 'Scene 2: Scene 2' })).toHaveTextContent('Rooftop Heist · 1 in the opposition, 1 start hidden')
    await userEvent.click(screen.getByRole('tab', { name: 'Bring in' }))
    const row = (await screen.findByText('Burglar')).closest('li')!
    expect(row).toHaveTextContent('Planned for scene 2')
  })
})

describe('the environment on the table', () => {
  it('comes in from its template; its Running panel rolls its dice, marks twists and adds its minions', async () => {
    const { saved } = await setup()
    await userEvent.click(await gmScreen().findByRole('button', { name: 'Bring in Rooftop Heist' }))
    await waitFor(async () => expect((await saved()).environment).toMatchObject({ templateId: 'heist', hidden: true, attached: [{ name: 'Burglar', groupSize: 4 }, { name: 'Shut down the crucible', labels: ['Reach the control room', ''] }] }))
    expect(gmScreen().getByText('Hidden')).toBeInTheDocument()
    expect(screen.getByText('Slick tiles and a long drop.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Run Rooftop Heist' }))
    const panel = within(gmScreen().getByRole('region', { name: 'Rooftop Heist' }))
    // 0.5 rolls just over the middle of each die: 6 on a d10, 4 on a d6, 5 on a d8.
    await userEvent.click(panel.getByRole('button', { name: 'Roll environment dice' }))
    const roll = panel.getByRole('status', { name: 'Environment roll' })
    expect(roll).toHaveTextContent('Min4Howling WindMid5Night SecurityMax6Slick Tiles')
    // Twists open on the scene's zone (Green, at the start).
    expect(panel.getByRole('tab', { name: 'GREEN · NOW' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(panel.getByRole('tab', { name: 'YELLOW' }))
    await userEvent.click(panel.getByRole('button', { name: 'Mark used: Floodlights' }))
    expect(panel.getByRole('button', { name: 'Used: Floodlights' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => expect((await saved()).environment!.twists![1]!.used).toEqual({ round: 0 }))
    // Its minions: two, revealed, owned by the environment.
    await userEvent.click(panel.getByRole('button', { name: 'Fewer Burglar to add' }))
    await userEvent.click(panel.getByRole('button', { name: 'Fewer Burglar to add' }))
    await userEvent.click(panel.getByRole('button', { name: 'Add Burglar' }))
    await waitFor(async () => expect((await saved()).groups.map((g) => [g.name, g.members.length, g.hidden, g.owner.kind])).toEqual([['Burglar', 2, false, 'environment']]))
    expect(screen.getByRole('article', { name: 'Burglar' })).toHaveTextContent('Minions · Rooftop Heist')
    expect(panel.getByText('minions · 2 on the table')).toBeInTheDocument()
    // Bringing it in again does nothing: it's already on the table.
    expect(gmScreen().queryByRole('button', { name: 'Bring in Rooftop Heist' })).not.toBeInTheDocument()
  })

  it("adds its challenges from the panel, labels them, and gives them back to the GM", async () => {
    const { saved } = await setup()
    await userEvent.click(await gmScreen().findByRole('button', { name: 'Bring in Rooftop Heist' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Run Rooftop Heist' }))
    const panel = within(gmScreen().getByRole('region', { name: 'Rooftop Heist' }))
    expect(panel.getByText('challenge · none yet')).toBeInTheDocument()
    await userEvent.click(panel.getByRole('button', { name: 'Add Shut down the crucible' }))
    await waitFor(async () => expect((await saved()).challenges.map((c) => [c.name, c.owner.kind, c.hidden])).toEqual([['Shut down the crucible', 'environment', false]]))
    const card = () => screen.getByRole('article', { name: 'Shut down the crucible' })
    expect(card()).toHaveTextContent('Challenge · Rooftop Heist')
    expect(panel.getByText('challenge · 1 on the table')).toBeInTheDocument()
    await userEvent.click(within(card()).getByRole('button', { name: 'More for Shut down the crucible' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Give to the GM' }))
    await waitFor(async () => expect((await saved()).challenges[0]!.owner.kind).toBe('gm'))
    expect(card()).not.toHaveTextContent('Rooftop Heist')
    await userEvent.click(within(card()).getByRole('button', { name: 'More for Shut down the crucible' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Give to the environment' }))
    await waitFor(async () => expect((await saved()).challenges[0]!.owner.kind).toBe('environment'))
    // + Challenge quick-adds one the environment owns.
    await userEvent.click(panel.getByRole('button', { name: '+ Challenge' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add a challenge' }))
    expect(dialog.getByRole('checkbox', { name: 'Belongs to Rooftop Heist' })).toBeChecked()
    await userEvent.type(dialog.getByLabelText('Name'), 'Hold the door')
    await userEvent.click(dialog.getByRole('button', { name: 'Add to table' }))
    await waitFor(async () => expect((await saved()).challenges.at(-1)).toMatchObject({ name: 'Hold the door', owner: { kind: 'environment' } }))
  })

  it('takes a basic action with its dice, through the roll dialog, and logs it', async () => {
    await setup()
    await userEvent.click(await gmScreen().findByRole('button', { name: 'Bring in Rooftop Heist' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Run Rooftop Heist' }))
    const panel = within(gmScreen().getByRole('region', { name: 'Rooftop Heist' }))
    await userEvent.click(panel.getByRole('button', { name: 'Overcome with the environment dice' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Basic action' }))
    expect(dialog.getByRole('group', { name: 'Night Security' })).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText(/^Rooftop Heist used the environment dice: /)).toBeInTheDocument()
  })

  it("opens its panel when the environment's turn starts", async () => {
    await setup()
    await userEvent.click(await gmScreen().findByRole('button', { name: 'Bring in Rooftop Heist' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start round 1' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rooftop Heist' }))
    const panel = within(await gmScreen().findByRole('region', { name: 'Rooftop Heist' }))
    expect(panel.getByText(/the tracker just moved to Green 2/)).toBeInTheDocument()
  })

  it('sets the aspects of a quick-added environment', async () => {
    const { saved } = await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Scene menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Environment…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Set environment' }))
    await userEvent.type(dialog.getByLabelText('Name'), 'Docks')
    await userEvent.click(dialog.getByRole('button', { name: 'Set environment' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Run Docks' }))
    const panel = within(gmScreen().getByRole('region', { name: 'Docks' }))
    expect(panel.getByRole('button', { name: 'Roll environment dice' })).toBeDisabled()
    await userEvent.click(panel.getByRole('button', { name: 'Set aspects…' }))
    const aspects = within(screen.getByRole('dialog', { name: 'Aspects' }))
    await userEvent.type(aspects.getByLabelText('Aspect 1'), 'Fog')
    await userEvent.click(within(aspects.getByRole('group', { name: 'Aspect 1 die' })).getByRole('radio', { name: 'd6' }))
    await userEvent.click(aspects.getByRole('button', { name: 'Save aspects' }))
    await waitFor(async () => expect((await saved()).environment!.aspects).toEqual([{ name: 'Fog', die: 'd6' }, { name: '', die: 'd8' }, { name: '', die: 'd8' }]))
    expect(panel.getByRole('button', { name: 'Roll environment dice' })).toBeEnabled()
  })
})

describe('a villain’s attached templates', () => {
  it('come in with it, checked, signature minions one per hero, as hidden GM groups', async () => {
    const villains = new MemoryVillainStore()
    const v = bullyOverlord()
    v.attached = [
      { templateId: 'burglar', kind: 'minion', role: 'signature' },
      { templateId: 'gone', kind: 'lieutenant', role: 'vehicle' },
    ]
    await villains.save(v)
    const { saved } = await setup(villains)
    await userEvent.click(await gmScreen().findByRole('button', { name: 'Bring in Test Villain' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Bring in Test Villain' }))
    const comes = within(await dialog.findByRole('group', { name: 'Comes with Test Villain' }))
    expect(comes.getByRole('checkbox', { name: /Burglar/ })).toBeChecked()
    expect(comes.getByText(/Missing template/)).toBeInTheDocument()
    // No heroes at the table: one hero, so one burglar; more heroes, more burglars.
    expect(comes.getByRole('group', { name: 'How many Burglar' })).toHaveTextContent('1')
    await userEvent.click(dialog.getByRole('button', { name: 'More heroes' }))
    await userEvent.click(dialog.getByRole('button', { name: 'More heroes' }))
    expect(comes.getByRole('group', { name: 'How many Burglar' })).toHaveTextContent('3')
    await userEvent.click(dialog.getByRole('button', { name: 'Bring in' }))
    await waitFor(async () => expect((await saved()).villains).toHaveLength(1))
    const game = await saved()
    expect(game.villains[0]!.play.heroCount).toBe(3)
    expect(game.groups.map((g) => [g.name, g.templateId, g.members.length, g.hidden, g.owner])).toEqual([['Burglar', 'burglar', 3, true, { kind: 'gm' }]])
  })

  it('can be left behind', async () => {
    const villains = new MemoryVillainStore()
    await villains.save({ ...bullyOverlord(), attached: [{ templateId: 'burglar', kind: 'minion', role: 'signature' }] })
    const { saved } = await setup(villains)
    await userEvent.click(await gmScreen().findByRole('button', { name: 'Bring in Test Villain' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Bring in Test Villain' }))
    await userEvent.click(await dialog.findByRole('checkbox', { name: /Burglar/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Bring in' }))
    await waitFor(async () => expect((await saved()).villains).toHaveLength(1))
    expect((await saved()).groups).toEqual([])
  })
})
