import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewVillains, NewVillainsContext } from '../app/new-villains'
import { VillainStoreContext } from '../app/villain-store-context'
import { adaptiveBruiser, bullyOverlord } from '../test/villains'
import { readable } from '../test/readable'
import { createVillain, type Villain } from './model'
import { MemoryVillainStore, type VillainStore } from './store'
import { NewVillain, VillainWizard } from './VillainWizard'

/** A viewport `width` px wide, as far as min-width media queries go. */
function viewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }
  })
}

async function storeWith(villain: Villain = createVillain({ id: 'v1' })) {
  const store = new MemoryVillainStore()
  await store.save(villain)
  return store
}

const wizard = (store: VillainStore, step?: string, id = 'v1', fresh = new NewVillains()) =>
  render(
    <NewVillainsContext.Provider value={fresh}>
      <VillainStoreContext.Provider value={store}>
        <VillainWizard id={id} step={step} />
      </VillainStoreContext.Provider>
    </NewVillainsContext.Provider>,
  )

const saved = async (store: VillainStore, id = 'v1') => {
  const r = await store.get(id)
  if (r.status !== 'found') throw new Error('not saved')
  return r.villain
}

const step = () => within(screen.getByRole('region', { name: /^\d · / }))
const rail = () => within(screen.getByRole('navigation', { name: 'Creation steps' }))

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  window.location.hash = ''
})

describe('a new villain', () => {
  it('is a draft in memory until its first choice, then saved as a draft', async () => {
    viewport(1440)
    const fresh = new NewVillains()
    const store = new MemoryVillainStore()
    const start = render(
      <NewVillainsContext.Provider value={fresh}>
        <NewVillain />
      </NewVillainsContext.Provider>,
    )
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/villain\/[^/]+\/edit\/concept$/))
    start.unmount()
    const id = /^#\/villain\/([^/]+)\//.exec(window.location.hash)![1]!
    expect(fresh.get(id)).toMatchObject({ status: 'draft' })
    wizard(store, 'concept', id, fresh)
    await screen.findByRole('heading', { name: '1 · Concept' })
    expect(document.querySelector('.crumb')).toHaveTextContent('Library / New villain')
    expect(screen.getByText('Draft · not saved yet')).toBeInTheDocument()
    expect((await store.list()).villains).toEqual([])
    await userEvent.type(screen.getByLabelText('What they want'), 'Rule the docks')
    await waitFor(async () => expect((await saved(store, id)).details.concept).toBe('Rule the docks'))
    expect((await saved(store, id)).status).toBe('draft')
    expect(screen.getByText('Draft · saved just now')).toBeInTheDocument()
  })

  it('remembers the furthest step a saved draft reached', async () => {
    viewport(1440)
    const store = await storeWith({ ...adaptiveBruiser(), status: 'draft', furthestStep: 2 })
    wizard(store, 'upgrades')
    await screen.findByRole('heading', { name: '4 · Upgrades' })
    await waitFor(async () => expect((await saved(store)).furthestStep).toBe(4))
  })
})

describe('the villain wizard shell', () => {
  it('shows the type chip, greys out Mastery while minor, and skips it from Upgrades', async () => {
    viewport(1440)
    const store = await storeWith({ ...adaptiveBruiser(), status: 'draft', furthestStep: 4 })
    wizard(store, 'upgrades')
    expect(await screen.findByText('Minor villain')).toBeInTheDocument()
    expect(rail().getByRole('link', { name: /Mastery Not needed/ })).toHaveClass('rail__item--skipped')
    expect(screen.getByText('Built for 4 heroes. Each game recalculates Health for its own table.')).toBeInTheDocument()
    expect(step().getByRole('link', { name: 'Health →' })).toHaveAttribute('href', '#/villain/v1/edit/health')
    await userEvent.click(screen.getByRole('checkbox', { name: /^Mook Squad/ }))
    expect(screen.getByText('Major villain')).toHaveClass('type-chip--major')
    const mastery = rail().getByRole('link', { name: /Mastery/ })
    expect(mastery).not.toHaveClass('rail__item--skipped')
    expect(mastery).toHaveTextContent('1')
    expect(step().getByRole('link', { name: 'Mastery →' })).toBeInTheDocument()
  })

  it('shows the preview with the identity line and abilities by source', async () => {
    viewport(1440)
    wizard(await storeWith(bullyOverlord()), 'approach', 'v2')
    const preview = within(await screen.findByRole('complementary', { name: 'Sheet preview' }))
    expect(preview.getByText('Major villain · Bully · Overlord')).toBeInTheDocument()
    expect(preview.getAllByRole('region').map((r) => r.getAttribute('aria-label')).filter((l) => l?.endsWith(' abilities'))).toEqual(['Bully abilities', 'Overlord abilities', 'Mook Squad abilities', 'Mastery abilities'])
    expect(preview.getByText('for 4 heroes')).toBeInTheDocument()
  })

  it('finishes a draft, asking first when there are rule issues', async () => {
    viewport(1440)
    const store = await storeWith({ ...createVillain({ id: 'v1' }), status: 'draft', furthestStep: 7 })
    wizard(store, 'details')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish villain' }))[0]!)
    const dialog = within(screen.getByRole('dialog', { name: 'Finish with rule issues?' }))
    expect(dialog.getByText(/2 · Approach:/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Finish anyway' }))
    await waitFor(async () => expect((await saved(store)).status).toBe('complete'))
    expect((await saved(store)).furthestStep).toBeUndefined()
    await waitFor(() => expect(window.location.hash).toBe('#/villain/v1'))
  })

  it('opens a finished villain at the edit summary, and reverts changes', async () => {
    viewport(1440)
    const store = await storeWith(adaptiveBruiser())
    wizard(store)
    expect(await screen.findByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change Approach' })).toHaveAttribute('href', '#/villain/v1/edit/approach')
    expect(screen.getByText('Not needed: a minor villain.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rename villain: Ironclad' }))
    await userEvent.keyboard('{Control>}a{/Control}Steel Tyrant{Enter}')
    await waitFor(async () => expect((await saved(store)).details.name).toBe('Steel Tyrant'))
    await userEvent.click(screen.getByRole('button', { name: 'Revert changes' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Revert changes?' })).getByRole('button', { name: 'Revert changes' }))
    await waitFor(async () => expect((await saved(store)).details.name).toBe('Ironclad'))
  })

  it('says when a villain is missing', async () => {
    wizard(new MemoryVillainStore(), 'approach', 'nobody')
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved villain with that link.")
  })
})

describe('step 2, Approach', () => {
  it('chooses an approach, assigns its dice with suggestions first, and takes abilities', async () => {
    const store = await storeWith({ ...createVillain({ id: 'v1' }), status: 'draft' })
    wizard(store, 'approach')
    const cards = within(await screen.findByRole('radiogroup', { name: 'Approach' }))
    expect(cards.getAllByRole('radio')).toHaveLength(18)
    const bully = cards.getByRole('radio', { name: /^Bully/ }).closest('label')!
    expect(within(bully).getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['d10', 'd8', 'd8', 'd8', 'd8'])
    expect(bully).toHaveTextContent('Health25 baseAbilitiesChoose 2 of 6')
    await userEvent.click(cards.getByRole('radio', { name: /^Bully/ }))
    // Suggestions come first, in their own group.
    const d10 = screen.getByRole('combobox', { name: 'd10 power' })
    const groups = within(d10).getAllByRole('group')
    expect(groups[0]).toHaveAttribute('label', 'Suggested by Bully')
    expect(within(groups[0]!).getAllByRole('option').map((o) => o.textContent)).toEqual(['Fire', 'Presence', 'Strength', 'Vitality'])
    await userEvent.selectOptions(d10, 'Strength')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd8 power #1' }), 'Strength')
    // The same power twice is an issue at the field.
    expect(screen.getAllByText('Strength is already assigned.').length).toBeGreaterThan(0)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd8 power #1' }), 'Fire')
    await userEvent.type(screen.getByRole('textbox', { name: 'd8 roleplaying quality name' }), 'Petty Tyrant')
    expect(screen.getByText('Choose 2 · 0 chosen')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /Bust Their Heads/ }))
    expect(screen.getByText('Choose 2 · 1 chosen')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).approach).toMatchObject({ id: 'bully', abilities: [{ source: 'approach', name: 'Bust Their Heads' }] }))
    expect((await saved(store)).traitNames['quality:roleplaying-quality']).toBe('Petty Tyrant')
  }, 20_000)

  it('shows Focused’s constraint, and its pattern as an issue on the list', async () => {
    const v = adaptiveBruiser()
    v.approach = {
      id: 'focused',
      traits: [
        { trait: { kind: 'power', id: 'fire' }, die: 'd12' },
        { trait: { kind: 'power', id: 'agility' }, die: 'd8' },
        { trait: { kind: 'quality', id: 'fitness' }, die: 'd10' },
        { trait: { kind: 'quality', id: 'science' }, die: 'd8' },
      ],
      abilities: [
        { source: 'approach', name: 'Defensive Charging', uses: [{ kind: 'power', id: 'fire' }] },
        { source: 'approach', name: 'Pour it On', uses: [{ kind: 'power', id: 'agility' }] },
        { source: 'approach', name: 'Vicious Entanglement', uses: [{ kind: 'quality', id: 'science' }] },
      ],
    }
    wizard(await storeWith(v), 'approach')
    expect((await screen.findByText('Focused:')).closest('p')).toHaveTextContent('Focused: Two use the same power and the third uses a different power.')
    const list = screen.getByRole('group', { name: 'Focused abilities' })
    expect(list).toHaveAttribute('aria-invalid', 'true')
    expect(list).toHaveTextContent('Focused abilities: Two use the same power and the third uses a different power.')
  })

  it('asks before changing the approach, then clears its dice and abilities but keeps the roleplaying name', async () => {
    const store = await storeWith(adaptiveBruiser())
    wizard(store, 'approach')
    await userEvent.click(await screen.findByRole('radio', { name: /^Ninja/ }))
    const dialog = within(screen.getByRole('dialog', { name: 'Change to Ninja?' }))
    expect(dialog.getByText("Ironclad's power and quality dice and Adaptive abilities will be cleared.")).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect((await saved(store)).approach?.id).toBe('adaptive')
    await userEvent.click(screen.getByRole('radio', { name: /^Ninja/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Change to Ninja' }))
    await waitFor(async () => expect((await saved(store)).approach).toEqual({ id: 'ninja', traits: [], abilities: [] }))
    expect((await saved(store)).traitNames['quality:roleplaying-quality']).toBe('Relentless')
  })
})

describe('step 3, Archetype', () => {
  it('lists archetypes paired with the approach first, and draws a count-based status', async () => {
    const v = bullyOverlord()
    v.approach!.id = 'mastermind'
    v.archetype = null
    wizard(await storeWith(v), 'archetype', 'v2')
    const paired = within(await screen.findByRole('radiogroup', { name: 'Archetypes often paired with Mastermind' }))
    expect(paired.getAllByRole('radio').map((r) => r.closest('label')!.querySelector('.vw-card__name')!.textContent)).toEqual(['Inventor', 'Overlord'])
    const others = within(screen.getByRole('radiogroup', { name: 'Other archetypes' }))
    expect(paired.getAllByRole('radio').length + others.getAllByRole('radio').length).toBe(14)
    await userEvent.click(paired.getByRole('radio', { name: /^Overlord/ }))
    const ladder = screen.getByRole('list', { name: 'Status die by count' })
    expect(within(ladder).getAllByRole('listitem').map(readable)).toEqual(['0 d4', '1–2 d6', '3–4 d8', '5–8 d10', '9+ d12'])
    expect(screen.getByText(/the GM can always set it by hand/)).toBeInTheDocument()
    // Overlord's Creator note shows only with Creator.
    expect(screen.queryByText('If pairing with Creator, avoid overlapping abilities.')).not.toBeInTheDocument()
  })

  it('draws a Health-zone status in game colors, and fixed, weakness and challenge statuses', async () => {
    const store = await storeWith(adaptiveBruiser())
    const view = wizard(store, 'archetype')
    const zones = await screen.findByRole('list', { name: 'Status die by Health zone' })
    expect(within(zones).getAllByRole('listitem').map((li) => li.className)).toEqual(['game-chip game-chip--green', 'game-chip game-chip--yellow', 'game-chip game-chip--red'])
    view.unmount()
    for (const [id, text] of [
      ['indomitable', /Always.*It never changes\./],
      ['titan', /each completed part of its challenge lowers it one size/],
    ] as const) {
      const v = adaptiveBruiser()
      v.archetype = { id, abilities: [] }
      const u = wizard(await storeWith(v), 'archetype')
      expect(await screen.findByText(text)).toBeInTheDocument()
      u.unmount()
    }
    const f = adaptiveBruiser()
    f.archetype = { id: 'formidable', abilities: [] }
    wizard(await storeWith(f), 'archetype')
    expect(within(await screen.findByRole('list', { name: 'Status die by weakness' })).getAllByRole('listitem')).toHaveLength(3)
  })

  it('shows Legion’s fixed ability and its need for a minion maker until one is chosen, and the Creator note with Creator', async () => {
    const v = adaptiveBruiser()
    v.approach = { id: 'creator', traits: [], abilities: [] }
    v.archetype = { id: 'legion', abilities: [] }
    const store = await storeWith(v)
    wizard(store, 'archetype')
    expect(await screen.findByRole('group', { name: 'Always included' })).toHaveTextContent('Uncoordinated Actions')
    expect(screen.getByText('If pairing with Creator, avoid overlapping abilities.')).toBeInTheDocument()
    expect(screen.getByText(/A Legion villain needs some way to create more minions/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /Split Up/ }))
    expect(await screen.findByText('Done: Ironclad has a way to make minions.')).toBeInTheDocument()
  })

  it('asks before changing the archetype once abilities are chosen', async () => {
    const store = await storeWith(adaptiveBruiser())
    wizard(store, 'archetype')
    await userEvent.click(await screen.findByRole('radio', { name: /^Fragile/ }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Change to Fragile?' })).getByRole('button', { name: 'Change to Fragile' }))
    await waitFor(async () => expect((await saved(store)).archetype).toEqual({ id: 'fragile', abilities: [] }))
  })
})

describe('the later steps', () => {
  it('ignores a hero count that isn’t a whole number of 1 or more, and says so', async () => {
    const store = await storeWith(adaptiveBruiser())
    wizard(store, 'health')
    const count = await screen.findByLabelText("Number of heroes it's built to face")
    for (const typed of ['', '0', '-1']) {
      await userEvent.clear(count)
      if (typed) await userEvent.type(count, typed)
      expect(count).toHaveAttribute('aria-invalid', 'true')
    }
    expect((await saved(store)).heroCount).toBe(4)
    await userEvent.clear(count)
    await userEvent.type(count, '3')
    await waitFor(async () => expect((await saved(store)).heroCount).toBe(3))
  })

  it('fills in an upgrade ability’s blank', async () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'defense-shield', abilities: [] }]
    const store = await storeWith(v)
    wizard(store, 'upgrades')
    const gives = within(await screen.findByRole('group', { name: 'Defense Shield gives' }))
    await userEvent.selectOptions(gives.getAllByRole('combobox', { name: '[power]' })[0]!, 'Robotics (d10)')
    await waitFor(async () => expect((await saved(store)).upgrades[0]!.abilities).toEqual([{ source: 'upgrade', name: 'Defense Shield', uses: [{ kind: 'power', id: 'robotics' }] }]))
  })
})
