import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { VillainStoreContext } from '../app/villain-store-context'
import { adaptiveBruiser } from '../test/villains'
import { createVillain, type Villain } from './model'
import { MemoryVillainStore, type VillainStore } from './store'
import { VillainEditor } from './VillainEditor'
import { VillainList } from './VillainList'
import { VillainPage } from './VillainPage'

async function storeWith(villain: Villain = createVillain({ id: 'v1' })) {
  const store = new MemoryVillainStore()
  await store.save(villain)
  return store
}

const withStore = (store: VillainStore, ui: React.ReactNode) => render(<VillainStoreContext.Provider value={store}>{ui}</VillainStoreContext.Provider>)

const saved = async (store: VillainStore) => {
  const r = await store.get('v1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.villain
}

afterEach(() => {
  window.location.hash = ''
})

describe('the villain list', () => {
  it('starts a new villain in the editor, lists saved ones, and deletes after asking', async () => {
    const store = await storeWith(adaptiveBruiser())
    withStore(store, <VillainList />)
    const card = await screen.findByRole('link', { name: /Ironclad/ })
    expect(card).toHaveTextContent('Adaptive Bruiser')
    expect(card).toHaveAttribute('href', '#/villain/v1')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Ironclad' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await screen.findByText('No villains yet.')
    await userEvent.click(screen.getByRole('button', { name: 'New villain' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/villain\/.+\/edit\/approach$/))
    expect((await store.list()).villains).toHaveLength(1)
  })
})

describe('the villain editor', () => {
  it('builds an approach: choose it, assign its dice, name the roleplaying quality, and take abilities', async () => {
    const store = await storeWith()
    withStore(store, <VillainEditor id="v1" step="approach" />)
    await userEvent.click(await screen.findByRole('radio', { name: /^Adaptive/ }))
    const powers = within(screen.getByRole('group', { name: 'Adaptive power dice' }))
    await userEvent.selectOptions(powers.getByRole('combobox', { name: 'd10' }), 'Robotics')
    await userEvent.selectOptions(powers.getByRole('combobox', { name: 'd8 #1' }), 'Power Suit')
    await userEvent.selectOptions(powers.getByRole('combobox', { name: 'd8 #2' }), 'Strength')
    await userEvent.selectOptions(powers.getByRole('combobox', { name: 'd6' }), 'Agility')
    const qualities = within(screen.getByRole('group', { name: 'Adaptive quality dice' }))
    await userEvent.selectOptions(qualities.getByRole('combobox', { name: 'd10' }), 'Technology')
    await userEvent.selectOptions(qualities.getByRole('combobox', { name: 'd8 #1' }), 'Science')
    await userEvent.selectOptions(qualities.getByRole('combobox', { name: 'd8 #2' }), 'Fitness')
    await userEvent.type(screen.getByLabelText('Roleplaying quality (d8)'), 'Relentless')
    const abilities = within(screen.getByRole('group', { name: 'Adaptive abilities: choose 3' }))
    await userEvent.click(abilities.getByRole('checkbox', { name: /Initiate Upgrade Procedure/ }))
    await userEvent.selectOptions(abilities.getByRole('combobox', { name: '[power]' }), 'Robotics (d10)')
    await userEvent.click(abilities.getByRole('checkbox', { name: /Powerful Imitation/ }))
    // Two of three taken: the step says so.
    expect(screen.getByRole('region', { name: 'Rule issues in this step' })).toHaveTextContent('Choose 3 of the Adaptive abilities; you have 2.')
    await userEvent.click(abilities.getByRole('checkbox', { name: /The Pain of Perfection/ }))
    expect(screen.getByText('No rule issues so far.')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).approach?.abilities).toHaveLength(3))
    expect((await saved(store)).traitNames['quality:roleplaying-quality']).toBe('Relentless')
  })

  it('chooses an archetype and its abilities, with its status rule shown', async () => {
    const v = adaptiveBruiser()
    v.archetype = null
    const store = await storeWith(v)
    withStore(store, <VillainEditor id="v1" step="archetype" />)
    await userEvent.click(await screen.findByRole('radio', { name: /^Bruiser/ }))
    expect(screen.getByText('Status die.')).toBeInTheDocument()
    const abilities = within(screen.getByRole('group', { name: 'Bruiser abilities: choose 2' }))
    await userEvent.click(abilities.getByRole('checkbox', { name: /Feel No Pain/ }))
    await userEvent.click(abilities.getByRole('checkbox', { name: /Living Wall/ }))
    expect(screen.getByText('No rule issues so far.')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).archetype?.abilities.map((p) => p.name)).toEqual(['Feel No Pain', 'Living Wall']))
  })

  it('takes upgrades, a vehicle, and a mastery', async () => {
    const store = await storeWith(adaptiveBruiser())
    withStore(store, <VillainEditor id="v1" step="upgrades" />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /^Villainous Vehicle/ }))
    expect(screen.getByText('A villain with upgrades takes one villainous mastery.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /d12: 2 vehicle abilities/ }))
    const vehicle = within(screen.getByRole('group', { name: 'Vehicle abilities: choose 2' }))
    await userEvent.click(vehicle.getByRole('checkbox', { name: /Sturdy/ }))
    await userEvent.click(vehicle.getByRole('checkbox', { name: /Escape Plan/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Master of Annihilation/ }))
    expect(screen.getByText('No rule issues so far.')).toBeInTheDocument()
    const v = await saved(store)
    expect(v.upgrades).toEqual([{ id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd12', abilities: [{ source: 'vehicle', name: 'Sturdy' }, { source: 'vehicle', name: 'Escape Plan' }] } }])
    expect(v.mastery).toEqual({ source: 'mastery', name: 'Master of Annihilation' })
  })

  it('sets the number of heroes and shows how Health adds up', async () => {
    const store = await storeWith(adaptiveBruiser())
    withStore(store, <VillainEditor id="v1" step="health" />)
    const count = await screen.findByLabelText("Number of heroes it's built to face")
    expect(screen.getByText(/Max Health 55/)).toBeInTheDocument()
    await userEvent.clear(count)
    await userEvent.type(count, '2')
    expect(screen.getByText(/Max Health 45/)).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).heroCount).toBe(2))
  })

  it('edits details, and says when a villain is missing', async () => {
    const store = await storeWith(adaptiveBruiser())
    withStore(store, <VillainEditor id="v1" step="details" />)
    await userEvent.type(await screen.findByLabelText('Motivation'), 'Revenge')
    await waitFor(async () => expect((await saved(store)).details.motivation).toBe('Revenge'))
    expect(screen.getByRole('link', { name: /Approach/ })).toHaveAttribute('href', '#/villain/v1/edit/approach')
    withStore(store, <VillainEditor id="nobody" />)
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved villain with that link.")
  })
})

describe('the villain sheet', () => {
  it('shows the villain’s dice, Health, status, and abilities', async () => {
    const store = await storeWith(adaptiveBruiser())
    withStore(store, <VillainPage id="v1" />)
    const sheet = await screen.findByRole('article', { name: 'Ironclad villain sheet' })
    expect(within(sheet).getByRole('region', { name: 'Characteristics' })).toHaveTextContent('AdaptiveArchetypeBruiserKindMinor villain')
    expect(within(sheet).getByRole('region', { name: 'Health' })).toHaveTextContent('55 max Health')
    expect(within(sheet).getByRole('region', { name: 'Powers' })).toHaveTextContent('Robotics')
    expect(within(sheet).getByRole('region', { name: 'Abilities' })).toHaveTextContent('Lash Out')
    expect(screen.getByRole('link', { name: 'Edit villain' })).toHaveAttribute('href', '#/villain/v1/edit')
  })

  it('shows upgrades, a vehicle, a mastery, details, and what’s left to fix', async () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd10', abilities: [{ source: 'vehicle', name: 'Sturdy' }] } }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    v.details.appearance = 'Seven feet of steel'
    v.notes = 'Hates rust.'
    const store = await storeWith(v)
    withStore(store, <VillainPage id="v1" />)
    const sheet = await screen.findByRole('article')
    const upgrades = within(sheet).getByRole('region', { name: 'Upgrades and mastery' })
    expect(upgrades).toHaveTextContent('Villainous Vehicle.')
    expect(upgrades).toHaveTextContent('Sturdy')
    expect(upgrades).toHaveTextContent('Master of Annihilation')
    expect(within(sheet).getByRole('region', { name: 'Details' })).toHaveTextContent('AppearanceSeven feet of steelNotesHates rust.')
    // A d10 vehicle takes three abilities; one is chosen.
    expect(within(sheet).getByText('1 rule issue to look at')).toBeInTheDocument()
    expect(within(sheet).getByRole('region', { name: 'Upgrades' })).toHaveTextContent('Choose 3 of the Villainous Vehicle abilities; you have 1.')
  })
})

describe('more of the editor', () => {
  it('ignores a hero count that isn’t a whole number of 1 or more, and says so', async () => {
    const store = await storeWith(adaptiveBruiser())
    withStore(store, <VillainEditor id="v1" step="health" />)
    const count = await screen.findByLabelText("Number of heroes it's built to face")
    for (const typed of ['', '0', '-1']) {
      await userEvent.clear(count)
      if (typed) await userEvent.type(count, typed)
      expect(count).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText('Enter a whole number of heroes, 1 or more.')).toBeInTheDocument()
    }
    expect((await saved(store)).heroCount).toBe(4)
    await userEvent.clear(count)
    await userEvent.type(count, '3')
    expect(count).toHaveAttribute('aria-invalid', 'false')
    await waitFor(async () => expect((await saved(store)).heroCount).toBe(3))
  })

  it('shows Legion’s fixed ability, and fills in an upgrade ability’s blank', async () => {
    const v = adaptiveBruiser()
    v.archetype = { id: 'legion', abilities: [] }
    v.upgrades = [{ id: 'defense-shield', abilities: [] }]
    const store = await storeWith(v)
    withStore(store, <VillainEditor id="v1" step="archetype" />)
    expect(await screen.findByRole('group', { name: 'Legion always has' })).toHaveTextContent('Uncoordinated Actions')
    withStore(store, <VillainEditor id="v1" step="upgrades" />)
    const gives = within(await screen.findByRole('group', { name: 'Defense Shield gives' }))
    await userEvent.selectOptions(gives.getAllByRole('combobox', { name: '[power]' })[0]!, 'Robotics (d10)')
    await waitFor(async () => expect((await saved(store)).upgrades[0]!.abilities).toEqual([{ source: 'upgrade', name: 'Defense Shield', uses: [{ kind: 'power', id: 'robotics' }] }]))
  })
})

