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
import { createChallengeTemplate, createMinionTemplate } from '../template/model'
import { memoryTemplateStores } from '../template/store'
import { challengeFromTemplate, groupFromTemplate } from '../template/to-table'
import { MemoryVillainStore } from '../villain/store'
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
    expect(g.challenges[0]).toMatchObject({ templateId: 'crucible', steps: [false, false], labels: ['Reach the control room', ''], description: 'It is overheating.', whenDone: 'The crucible cools.' })
    expect(gamesHolding([{ ...g, name: 'Thursday' }], 'minion', 'burglar')).toHaveLength(1)
    expect(gamesHolding([g], 'lieutenant', 'burglar')).toEqual([])
    expect(gamesHolding([g], 'challenge', 'crucible')).toHaveLength(1)
  })

  it('keeps what a template brings within what the table view carries', () => {
    const long = { ...crucible(), name: 'n'.repeat(500), description: 'd'.repeat(3000), done: 'w'.repeat(3000), steps: [{ label: 'l'.repeat(500) }] }
    let g = addChallenge(createGame({ id: 'g' }), challengeFromTemplate(long, false), clock())
    g = addGroup(g, groupFromTemplate({ ...burglar(), name: 'b'.repeat(500) }, 'minions', 1, false), clock())
    const c = g.challenges[0]!
    expect([c.name.length, c.labels![0]!.length, c.description!.length, c.whenDone!.length, g.groups[0]!.name.length]).toEqual([200, 200, 2000, 2000, 200])
    expect(tableViewProblem(project(g, 'player'))).toBeUndefined()
  })
})

async function setup() {
  const games = new MemoryGameStore()
  const templates = memoryTemplateStores()
  await templates.minions.save(burglar())
  await templates.challenges.save(crucible())
  await games.save(createGame({ id: 'g1', name: 'Thursday game' }))
  render(
    <StoreContext.Provider value={new MemoryHeroStore()}>
      <VillainStoreContext.Provider value={new MemoryVillainStore()}>
        <GameStoreContext.Provider value={games}>
          <SavedSearchStoreContext.Provider value={new MemorySavedSearchStore()}>
            <TemplateStoresContext.Provider value={templates}>
              <GamePage id="g1" clock={clock} random={() => 0.5} />
            </TemplateStoresContext.Provider>
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
    expect((await saved()).challenges.map((c) => c.labels)).toEqual([['Reach the control room', '']])
    const card = screen.getByRole('article', { name: 'Shut down the crucible' })
    expect(within(card).getByRole('checkbox', { name: 'Reach the control room' })).toBeInTheDocument()
    expect(within(card).getByRole('checkbox', { name: 'Step 2' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('checkbox', { name: 'Reach the control room' }))
    await userEvent.click(within(card).getByRole('checkbox', { name: 'Step 2' }))
    expect(card).toHaveTextContent('The crucible cools.')
    // Templates can come in again.
    expect(gmScreen().getByRole('button', { name: 'Bring in Burglar' })).toBeEnabled()
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
