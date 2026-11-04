import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App'
import { createGame } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { addGroup } from '../game/table'
import { MemoryHeroStore } from '../hero/store'
import { MemorySavedSearchStore } from '../library/saved-searches'
import { localSessionStore, memoryStorage } from '../session/storage'
import { fakeNetwork } from '../session/transport'
import { MemoryVillainStore } from '../villain/store'
import { createChallengeTemplate, createEnvironmentTemplate, createLieutenantTemplate, createMinionTemplate } from './model'
import { memoryTemplateStores, type TemplateStores } from './store'

afterEach(() => {
  window.location.hash = ''
})

async function setup(hash: string, fill: (t: TemplateStores, games: MemoryGameStore) => Promise<void> = async () => {}) {
  const templates = memoryTemplateStores()
  const games = new MemoryGameStore()
  await fill(templates, games)
  window.location.hash = hash
  render(<App store={new MemoryHeroStore()} villainStore={new MemoryVillainStore()} gameStore={games} searchStore={new MemorySavedSearchStore()} templateStores={templates} connect={fakeNetwork().connect} sessionStore={localSessionStore(memoryStorage())} />)
  return templates
}

const saved = async <T,>(get: () => Promise<{ status: string; doc?: T }>) => {
  const r = await get()
  return r.status === 'found' ? r.doc! : undefined
}

describe('the template library rows', () => {
  it('list minions, lieutenants and challenges with their kind and details, no primary action, and the games using them', async () => {
    await setup('#/', async (t, games) => {
      await t.minions.save({ ...createMinionTemplate({ id: 'm' }), name: 'Burglar', die: 'd8', actions: ['attack', 'hinder'] })
      await t.lieutenants.save({ ...createLieutenantTemplate({ id: 'l' }), name: 'Static Choir', die: 'd10', abilities: [{ name: 'a', type: 'A', text: '' }, { name: 'b', type: 'R', text: '' }] })
      await t.challenges.save({ ...createChallengeTemplate({ id: 'c' }), name: 'Shut down the crucible' })
      await t.environments.save({ ...createEnvironmentTemplate({ id: 'e' }), name: 'Rooftop Heist', twists: [{ id: 't', zone: 'red', kind: 'major', text: 'Fall.' }], attached: [{ kind: 'minion', templateId: 'm' }] })
      let g = addGroup({ ...createGame({ id: 'g' }), name: 'Thursday game' }, { kind: 'minions', name: 'Burglars', die: 'd8', count: 2, hidden: true }, { now: new Date(), newId: () => Math.random().toString(36).slice(2) })
      g = { ...g, groups: g.groups.map((x) => ({ ...x, templateId: 'm' })) }
      await games.save(g)
    })
    const table = await screen.findByRole('table', { name: 'Library' })
    const row = (name: string) => within(within(table).getByRole('link', { name }).closest('tr')!)
    expect(row('Burglar').getByText(/Attack or Hinder · groups of 4/)).toBeInTheDocument()
    // The die is the kind, after the type: "Minion (d8)".
    expect(row('Burglar').getByText('Minion').closest('.library-type')).toHaveTextContent('Minion (d8)')
    expect(row('Static Choir').getByText('Lieutenant').closest('.library-type')).toHaveTextContent('Lieutenant (d10)')
    expect(row('Rooftop Heist').getByText('Environment').closest('.library-type')).toHaveTextContent(/^Environment$/)
    expect(row('Static Choir').getByText('2 abilities')).toBeInTheDocument()
    expect(row('Shut down the crucible').getByText('3 steps')).toBeInTheDocument()
    expect(row('Rooftop Heist').getByText('3 aspects · 1 twist · 1 attached')).toBeInTheDocument()
    // Templates have no primary action; the name opens the editor.
    expect(row('Burglar').queryByRole('link', { name: 'Edit Burglar' })).not.toBeInTheDocument()
    expect(row('Burglar').getByRole('link', { name: 'Burglar' })).toHaveAttribute('href', '#/minion/m')
    expect(row('Burglar').getByText('Thursday game')).toBeInTheDocument()
    expect(row('Static Choir').queryByText('Thursday game')).not.toBeInTheDocument()
  })

  it('start a new minion from the New menu, in its editor', async () => {
    const templates = await setup('#/')
    await screen.findByRole('heading', { level: 1 }).catch(() => undefined)
    await userEvent.click(await screen.findByRole('button', { name: 'New' }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'New' })).getByRole('menuitem', { name: 'Minion' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/minion\/.+$/))
    expect((await templates.minions.list()).docs).toHaveLength(1)
    expect(await screen.findByText('Minion template')).toBeInTheDocument()
  })
})

describe('the template editors', () => {
  it('edit a minion: name, die, group size, actions and notes, saving as they go', async () => {
    const t = await setup('#/minion/m', async (s) => s.minions.save(createMinionTemplate({ id: 'm' })))
    await userEvent.click(await screen.findByRole('button', { name: /Rename minion/ }))
    await userEvent.type(screen.getByRole('textbox', { name: /name/i }), 'Burglar{Enter}')
    await userEvent.click(screen.getByRole('radio', { name: 'd8' }))
    const size = screen.getByLabelText('Usual group size')
    await userEvent.clear(size)
    await userEvent.type(size, '6')
    await userEvent.click(screen.getByRole('radio', { name: 'Only these:' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hinder' }))
    await userEvent.type(screen.getByLabelText('Notes'), 'Grabs what it can.')
    await waitFor(async () => expect(await saved(() => t.minions.get('m'))).toMatchObject({ name: 'Burglar', die: 'd8', groupSize: 6, actions: ['attack', 'hinder'], notes: 'Grabs what it can.' }))
    // Unchecking the last action keeps it: a minion takes at least one.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hinder' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Attack' }))
    await waitFor(async () => expect((await saved(() => t.minions.get('m')))?.actions).toEqual(['attack']))
  })

  it('shows the saved group size again after Revert changes', async () => {
    const t = await setup('#/minion/m', async (s) => s.minions.save(createMinionTemplate({ id: 'm' })))
    const size = await screen.findByLabelText('Usual group size')
    await userEvent.clear(size)
    await userEvent.type(size, '7')
    await waitFor(async () => expect((await saved(() => t.minions.get('m')))?.groupSize).toBe(7))
    await userEvent.click(screen.getByRole('button', { name: 'Revert changes' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Revert changes?' })).getByRole('button', { name: 'Revert changes' }))
    await waitFor(() => expect(screen.getByLabelText('Usual group size')).toHaveValue(4))
    await waitFor(async () => expect((await saved(() => t.minions.get('m')))?.groupSize).toBe(4))
  })

  it("edits a lieutenant's abilities, shown with their action icons", async () => {
    const t = await setup('#/lieutenant/l', async (s) => s.lieutenants.save({ ...createLieutenantTemplate({ id: 'l' }), name: 'Static Choir' }))
    await userEvent.click(await screen.findByRole('button', { name: '+ Add ability' }))
    await userEvent.type(screen.getByLabelText('Ability name'), 'Harmonize')
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Reaction')
    await userEvent.type(screen.getByLabelText('What it does'), 'Boost another lieutenant.')
    expect(screen.getByText('Boost', { selector: '.effect-word' })).toBeInTheDocument()
    await waitFor(async () => expect((await saved(() => t.lieutenants.get('l')))?.abilities).toEqual([{ name: 'Harmonize', type: 'R', text: 'Boost another lieutenant.' }]))
  })

  it('edits a challenge’s steps and what happens when it’s done, and reverts the changes', async () => {
    const t = await setup('#/challenge/c', async (s) => s.challenges.save({ ...createChallengeTemplate({ id: 'c' }), name: 'Crucible' }))
    await userEvent.type(await screen.findByLabelText('Step 1 (optional label)'), 'Reach the control room')
    await userEvent.click(screen.getByRole('button', { name: 'Remove step 3' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Add step' }))
    await userEvent.type(screen.getByLabelText("When it's done"), 'The crucible cools.')
    await waitFor(async () => expect(await saved(() => t.challenges.get('c'))).toMatchObject({ steps: [{ label: 'Reach the control room' }, { label: '' }, { label: '' }], done: 'The crucible cools.' }))
    expect(screen.getByRole('status')).toHaveTextContent('You have changes since you opened this page.')
    await userEvent.click(screen.getByRole('button', { name: 'Revert changes' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Revert changes?' })).getByRole('button', { name: 'Revert changes' }))
    await waitFor(async () => expect(await saved(() => t.challenges.get('c'))).toMatchObject({ steps: [{ label: '' }, { label: '' }, { label: '' }], done: '' }))
  })

  it('edits an environment: aspects, twists by zone, and attached templates', async () => {
    const t = await setup('#/environment/e', async (s) => {
      await s.environments.save({ ...createEnvironmentTemplate({ id: 'e' }), name: 'Rooftop Heist' })
      await s.minions.save({ ...createMinionTemplate({ id: 'm' }), name: 'Security drones', die: 'd6' })
      await s.lieutenants.save({ ...createLieutenantTemplate({ id: 'l' }), name: 'Night Watch Captain', die: 'd10' })
    })
    expect(await screen.findByText('Environment template')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Description'), 'Slick tiles and a long drop.')
    await userEvent.type(screen.getByLabelText('Aspect 1'), 'Slick Tiles')
    await userEvent.click(within(screen.getByRole('group', { name: 'Aspect 1 die' })).getByRole('radio', { name: 'd10' }))
    // Twists: grouped by zone, minor before major.
    const yellow = within(screen.getByRole('region', { name: 'Yellow twists' }))
    await userEvent.click(yellow.getByRole('button', { name: '+ Add Yellow twist' }))
    await userEvent.click(yellow.getByRole('button', { name: '+ Add Yellow twist' }))
    await userEvent.selectOptions(within(yellow.getByRole('group', { name: 'Yellow twist 1' })).getByLabelText('Kind'), 'Major')
    // The major one moves after the minor one.
    const second = within(yellow.getByRole('group', { name: 'Yellow twist 2' }))
    expect(second.getByLabelText('Kind')).toHaveValue('major')
    await userEvent.type(second.getByLabelText('Name (optional)'), 'Floodlights')
    await userEvent.type(second.getByLabelText('What happens'), 'Everyone is seen.')
    expect(yellow.getByText('1 minor, 1 major')).toBeInTheDocument()
    // Attach from the library, searching.
    await userEvent.click(screen.getByRole('button', { name: '+ Attach' }))
    const picker = within(screen.getByRole('dialog', { name: 'Attach a minion or lieutenant' }))
    await userEvent.type(picker.getByLabelText('Search'), 'drones')
    expect(picker.queryByText('Night Watch Captain')).not.toBeInTheDocument()
    await userEvent.click(picker.getByRole('button', { name: 'Attach Security drones' }))
    expect(screen.getByRole('link', { name: 'Security drones' })).toHaveAttribute('href', '#/minion/m')
    await waitFor(async () =>
      expect(await saved(() => t.environments.get('e'))).toMatchObject({
        description: 'Slick tiles and a long drop.',
        aspects: [{ name: 'Slick Tiles', die: 'd10' }, { name: '', die: 'd8' }, { name: '', die: 'd8' }],
        twists: [
          { zone: 'yellow', kind: 'major', name: 'Floodlights', text: 'Everyone is seen.' },
          { zone: 'yellow', kind: 'minor', text: '' },
        ],
        attached: [{ kind: 'minion', templateId: 'm' }],
      }),
    )
    // Already attached: it can't be attached twice.
    await userEvent.click(screen.getByRole('button', { name: '+ Attach' }))
    expect(within(screen.getByRole('dialog', { name: 'Attach a minion or lieutenant' })).getByRole('button', { name: 'Security drones is attached' })).toBeDisabled()
  })

  it('shows a deleted attached template as missing, which can be removed', async () => {
    const t = await setup('#/environment/e', async (s) => s.environments.save({ ...createEnvironmentTemplate({ id: 'e' }), attached: [{ kind: 'lieutenant', templateId: 'gone' }] }))
    expect(await screen.findByText('Missing template')).toBeInTheDocument()
    expect(screen.getByText('This lieutenant template was deleted from the library.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Missing template' }))
    await waitFor(async () => expect((await saved(() => t.environments.get('e')))?.attached).toEqual([]))
  })

  it('makes a new minion from the attach picker, attaches it, and opens its editor', async () => {
    const t = await setup('#/environment/e', async (s) => s.environments.save(createEnvironmentTemplate({ id: 'e' })))
    await userEvent.click(await screen.findByRole('button', { name: '+ Attach' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Attach a minion or lieutenant' })).getByRole('button', { name: 'New minion' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/minion\/.+$/))
    const made = (await t.minions.list()).docs
    expect(made).toHaveLength(1)
    await waitFor(async () => expect((await saved(() => t.environments.get('e')))?.attached).toEqual([{ kind: 'minion', templateId: made[0]!.id }]))
  })

  it('says when there is no such template', async () => {
    await setup('#/challenge/nope')
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved challenge with that link.")
  })
})
