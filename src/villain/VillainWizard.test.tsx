import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewVillains, NewVillainsContext } from '../app/new-villains'
import { TemplateStoresContext } from '../app/template-store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { createLieutenantTemplate, createMinionTemplate } from '../template/model'
import { memoryTemplateStores, type TemplateStores } from '../template/store'
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

/** Suggest 3's random source: always the first option left, so draws are predictable. */
let random = () => 0

const ui = (store: VillainStore, step: string | undefined, id: string, fresh: NewVillains, templates?: TemplateStores) => (
  <TemplateStoresContext.Provider value={templates ?? null}>
    <NewVillainsContext.Provider value={fresh}>
      <VillainStoreContext.Provider value={store}>
        <VillainWizard id={id} step={step} random={() => random()} />
      </VillainStoreContext.Provider>
    </NewVillainsContext.Provider>
  </TemplateStoresContext.Provider>
)

const wizard = (store: VillainStore, step?: string, id = 'v1', fresh = new NewVillains(), templates?: TemplateStores) => {
  const view = render(ui(store, step, id, fresh, templates))
  return { ...view, goTo: (next: string | undefined) => view.rerender(ui(store, next, id, fresh, templates)) }
}

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
    const chip = () => document.querySelector('.wizard__title .type-chip')!
    await screen.findByRole('heading', { name: '4 · Upgrades' })
    expect(chip()).toHaveTextContent('Minor villain')
    expect(chip()).toHaveAttribute('aria-live', 'polite')
    expect(rail().getByRole('link', { name: /Mastery Not needed/ })).toHaveClass('rail__item--skipped')
    expect(screen.getByText('Built for 4 heroes. Each game recalculates Health for its own table.')).toBeInTheDocument()
    expect(step().getByRole('link', { name: 'Health →' })).toHaveAttribute('href', '#/villain/v1/edit/health')
    await userEvent.click(screen.getByRole('checkbox', { name: /^Mook Squad/ }))
    expect(chip()).toHaveTextContent('Major villain')
    expect(chip()).toHaveClass('type-chip--major')
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
  it('fills in an upgrade ability’s blank', async () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'defense-shield', abilities: [] }]
    const store = await storeWith(v)
    wizard(store, 'upgrades')
    const gives = within(await screen.findByRole('group', { name: 'Defense Shield gives' }))
    await userEvent.selectOptions(gives.getAllByRole('combobox', { name: '[power]' })[0]!, 'Robotics (d10)')
    await waitFor(async () => expect((await saved(store)).upgrades[0]!.abilities).toEqual([{ source: 'upgrade', name: 'Defense Shield', uses: [{ kind: 'power', id: 'robotics' }] }]))
  })

  it('adds Health and a type in the totals bar, and asks before removing the last upgrade', async () => {
    const store = await storeWith(bullyOverlord())
    wizard(store, 'upgrades', 'v2')
    const totals = await screen.findByRole('group', { name: 'Totals' })
    expect(totals).toHaveTextContent('1 upgrade+0 HealthMajor villainChoose a mastery next.')
    await userEvent.click(screen.getByRole('checkbox', { name: /^Calming Aura/ }))
    expect(totals).toHaveTextContent('2 upgrades+10 Health')
    await userEvent.click(screen.getByRole('checkbox', { name: /^Calming Aura/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /^Mook Squad/ }))
    const dialog = within(screen.getByRole('dialog', { name: 'Remove the last upgrade?' }))
    expect(dialog.getByText('Test Villain becomes a minor villain and loses Master of Conquest.')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Remove it' }))
    await waitFor(async () => expect(await saved(store, 'v2')).toMatchObject({ upgrades: [], mastery: null }))
    expect(totals).toHaveTextContent('No mastery needed.')
  })

  it('shows Power Upgrade’s dice before and after, and asks for an archetype ability for a d12', async () => {
    const v = adaptiveBruiser()
    v.approach!.traits[0] = { trait: { kind: 'power', id: 'robotics' }, die: 'd12' }
    v.upgrades = [{ id: 'power-upgrade', abilities: [] }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    const store = await storeWith(v)
    wizard(store, 'upgrades')
    const dice = await screen.findByRole('list', { name: 'Power Upgrade dice' })
    expect(within(dice).getAllByRole('listitem').map(readable)).toEqual(['Robotics d12 →to d12 (already the largest)', 'Power Suit d8 →to d10', 'Strength d8 →to d10', 'Agility d6 →to d8'])
    const extra = within(screen.getByRole('group', { name: /^Extra Bruiser abilities: Choose 1 · 0 chosen/ }))
    // The archetype's own picks aren't offered again.
    expect(extra.queryByRole('checkbox', { name: /^Lash Out/ })).not.toBeInTheDocument()
    await userEvent.click(extra.getByRole('checkbox', { name: /^Feel No Pain/ }))
    await waitFor(async () => expect((await saved(store)).upgrades[0]!.extra).toEqual([{ source: 'archetype', name: 'Feel No Pain' }]))
  })

  it('builds the vehicle: a die with its ability count, and that many abilities', async () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [] }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    const store = await storeWith(v)
    wizard(store, 'upgrades')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Siege Crawler')
    await userEvent.click(screen.getByRole('button', { name: 'd12 2 abilities' }))
    const abilities = within(screen.getByRole('group', { name: /^Vehicle abilities: Choose 2/ }))
    await userEvent.click(abilities.getByRole('checkbox', { name: /^Sturdy/ }))
    expect(screen.getByRole('group', { name: /^Vehicle abilities/ })).toHaveTextContent('Choose 2 of the Villainous Vehicle abilities; you have 1.')
    await userEvent.click(abilities.getByRole('checkbox', { name: /^Escape Plan/ }))
    await waitFor(async () => expect((await saved(store)).upgrades[0]!.vehicle).toEqual({ name: 'Siege Crawler', die: 'd12', abilities: [{ source: 'vehicle', name: 'Sturdy' }, { source: 'vehicle', name: 'Escape Plan' }] }))
  })
})

describe('step 5, Mastery', () => {
  it('says a minor villain doesn’t take one, and a major one must', async () => {
    const minor = wizard(await storeWith(adaptiveBruiser()), 'mastery')
    expect(await screen.findByText(/A minor villain doesn't take a mastery\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an upgrade in step 4' })).toHaveAttribute('href', '#/villain/v1/edit/upgrades')
    minor.unmount()
    const v = bullyOverlord()
    v.mastery = null
    const store = await storeWith(v)
    wizard(store, 'mastery', 'v2')
    const list = await screen.findByRole('radiogroup', { name: 'Villainous mastery' })
    expect(list).toHaveAttribute('aria-invalid', 'true')
    expect(list).toHaveTextContent('Choose a mastery (a major villain has one).')
    await userEvent.click(within(list).getByRole('radio', { name: /^Master of Mysticism/ }))
    await waitFor(async () => expect((await saved(store, 'v2')).mastery).toEqual({ source: 'mastery', name: 'Master of Mysticism' }))
  })
})

describe('step 6, Health', () => {
  it('steps the hero count from 1 to 8 and lists every term of the formula', async () => {
    const store = await storeWith(bullyOverlord())
    wizard(store, 'health', 'v2')
    const sum = await screen.findByRole('table')
    expect(within(sum).getAllByRole('row').map(readable)).toEqual(['Bully approach base25', 'Overlord archetype+15', '5 × 4 heroes+20', 'Mook Squad upgrade+0', 'Total60'])
    await userEvent.click(screen.getByRole('button', { name: 'More heroes' }))
    expect(within(sum).getByText('5 × 5 heroes')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store, 'v2')).heroCount).toBe(5))
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByRole('button', { name: 'Fewer heroes' }))
    expect(screen.getByRole('button', { name: 'Fewer heroes' })).toBeDisabled()
    await waitFor(async () => expect((await saved(store, 'v2')).heroCount).toBe(1))
    // Overlord's status doesn't follow Health: the zones are behind a disclosure.
    expect(screen.getByText("Overlord's status doesn't follow Health, so the zones are only for reference.")).toBeInTheDocument()
    expect(screen.getByText('Show the ranges for 45')).toBeInTheDocument()
  })

  it('shows the zones for a Health-zone status, and asks for the missing steps', async () => {
    const view = wizard(await storeWith(adaptiveBruiser()), 'health')
    expect(await screen.findByText("Bruiser's status follows its Health zone, so these ranges matter on the table.")).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Health zones' })).getAllByRole('listitem').map((li) => li.className)).toEqual(['zone-green', 'zone-yellow', 'zone-red'])
    view.unmount()
    wizard(await storeWith(createVillain({ id: 'v1' })), 'health')
    expect(await screen.findByText('Choose an approach in step 2')).toBeInTheDocument()
    expect(screen.getByText('Choose an archetype in step 3')).toBeInTheDocument()
  })
})

describe('templates the villain comes with', () => {
  const withVehicle = () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { name: 'Siege Crawler', die: 'd12', abilities: [{ source: 'vehicle', name: 'Sturdy' }, { source: 'vehicle', name: 'Escape Plan' }] } }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    v.tags = ['docks']
    return v
  }

  it('saves the vehicle as a lieutenant template on leaving Upgrades, then updates it when it changes', async () => {
    viewport(1440)
    const store = await storeWith(withVehicle())
    const templates = memoryTemplateStores()
    const view = wizard(store, 'upgrades', 'v1', new NewVillains(), templates)
    await screen.findByRole('heading', { name: '4 · Upgrades' })
    expect((await templates.lieutenants.list()).docs).toEqual([])
    view.goTo('mastery')
    await waitFor(async () => expect((await saved(store)).attached).toHaveLength(1))
    const [vehicle] = (await templates.lieutenants.list()).docs
    expect(vehicle).toMatchObject({ name: 'Siege Crawler', die: 'd12', tags: ['docks'], abilities: [{ name: 'Sturdy' }, { name: 'Escape Plan' }] })
    expect((await saved(store)).attached).toEqual([{ templateId: vehicle!.id, kind: 'lieutenant', role: 'vehicle' }])
    // The preview lists it.
    expect(within(await screen.findByRole('region', { name: 'Comes with' })).getByText('Lieutenant · d12 · 2 abilities')).toBeInTheDocument()
    // A change in the wizard updates the same template.
    view.goTo('upgrades')
    const name = await screen.findByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Bone Barge')
    view.goTo('health')
    await waitFor(async () => expect((await templates.lieutenants.list()).docs.map((d) => [d.id, d.name])).toEqual([[vehicle!.id, 'Bone Barge']]))
  })

  it('detaches the vehicle when its upgrade is unchecked, and deletes its template if asked', async () => {
    const v = withVehicle()
    const templates = memoryTemplateStores()
    await templates.lieutenants.save({ ...createLieutenantTemplate({ id: 'l1' }), name: 'Siege Crawler' })
    v.attached = [{ templateId: 'l1', kind: 'lieutenant', role: 'vehicle' }]
    v.upgrades.push({ id: 'calming-aura', abilities: [] })
    const store = await storeWith(v)
    wizard(store, 'upgrades', 'v1', new NewVillains(), templates)
    await userEvent.click(await screen.findByRole('checkbox', { name: /^Villainous Vehicle/ }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Delete the vehicle too?' }))
    expect(dialog.getByText('Delete Siege Crawler from your library as well?')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).attached).toEqual([]))
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await templates.lieutenants.get('l1')).status).toBe('missing'))
  })

  it('attaches signature minions from the library, or a new one made in a dialog', async () => {
    const templates = memoryTemplateStores()
    await templates.minions.save({ ...createMinionTemplate({ id: 'm1' }), name: 'Grave Guard', die: 'd8', actions: ['attack', 'hinder'] })
    const store = await storeWith(bullyOverlord())
    wizard(store, 'upgrades', 'v2', new NewVillains(), templates)
    const select = await screen.findByRole('combobox', { name: 'Signature minions' })
    await screen.findByRole('option', { name: 'Grave Guard · d8 · Attack or Hinder' })
    await userEvent.selectOptions(select, 'Grave Guard · d8 · Attack or Hinder')
    await waitFor(async () => expect((await saved(store, 'v2')).attached).toEqual([{ templateId: 'm1', kind: 'minion', role: 'signature' }]))
    expect(screen.getByText('Attached to Test Villain. Bringing Test Villain into a game offers to bring them too, one per hero.')).toBeInTheDocument()
    await userEvent.selectOptions(select, 'Make a new minion template…')
    const dialog = within(screen.getByRole('dialog', { name: 'New minion template' }))
    await userEvent.type(dialog.getByRole('textbox', { name: 'Name' }), 'Thug')
    await userEvent.click(dialog.getByRole('button', { name: 'Save and attach' }))
    await waitFor(async () => expect((await templates.minions.list()).docs.map((d) => d.name).sort()).toEqual(['Grave Guard', 'Thug']))
    const thug = (await templates.minions.list()).docs.find((d) => d.name === 'Thug')!
    await waitFor(async () => expect((await saved(store, 'v2')).attached).toEqual([{ templateId: thug.id, kind: 'minion', role: 'signature' }]))
    // Unchecking Mook Squad detaches them.
    await userEvent.click(screen.getByRole('checkbox', { name: /^Mook Squad/ }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove the last upgrade?' })).getByRole('button', { name: 'Remove it' }))
    await waitFor(async () => expect((await saved(store, 'v2')).attached).toEqual([]))
  })

  it('saves the vehicle when a draft is finished', async () => {
    const store = await storeWith({ ...withVehicle(), status: 'draft', furthestStep: 7 })
    const templates = memoryTemplateStores()
    wizard(store, 'details', 'v1', new NewVillains(), templates)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Finish villain' }))[0]!)
    await waitFor(async () => expect((await saved(store)).status).toBe('complete'))
    expect((await saved(store)).attached).toHaveLength(1)
    expect((await templates.lieutenants.list()).docs).toHaveLength(1)
  })
})

describe('Suggest 3', () => {
  it('shows 3 approaches with the pick kept visible, re-rolls, saves with the draft, and returns to the full list', async () => {
    const v = { ...createVillain({ id: 'v1' }), status: 'draft' as const }
    v.approach = { id: 'ninja', traits: [], abilities: [] }
    const store = await storeWith(v)
    wizard(store, 'approach')
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest 3' }))
    expect(screen.getByText('Showing 3 random approaches. Not official, just for inspiration.')).toBeInTheDocument()
    const names = () => within(screen.getByRole('radiogroup', { name: 'Approach' })).getAllByRole('radio').map((r) => r.closest('label')!.querySelector('.vw-card__name')!.textContent)
    // Ninja isn't among the first three, so it stays first, marked as the pick.
    expect(names()).toEqual(['Ninja', 'Adaptive', 'Ancient', 'Bully'])
    expect(screen.getByText('Your pick')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).suggest).toEqual({ approach: ['adaptive', 'ancient', 'bully'] }))
    random = () => 0.9999
    try {
      const reroll = screen.getByRole('button', { name: 'Re-roll' })
      await userEvent.click(reroll)
      // Shown in the list's own order.
      expect(names()).toEqual(['Ninja', 'Specialized', 'Tactician', 'Underpowered'])
      expect(reroll).toHaveFocus()
      expect(screen.getByText('3 new suggestions: Underpowered, Tactician, Specialized.')).toBeInTheDocument()
    } finally {
      random = () => 0
    }
    await userEvent.click(screen.getByRole('button', { name: 'Show all 18' }))
    expect(names()).toHaveLength(18)
    await waitFor(async () => expect((await saved(store)).suggest).toBeUndefined())
    expect((await saved(store)).approach?.id).toBe('ninja')
  })

  it('tags archetypes that pair with the approach, without weighting them', async () => {
    const v = { ...adaptiveBruiser(), status: 'draft' as const, suggest: { archetype: ['legion', 'domain', 'fragile'] } }
    wizard(await storeWith(v), 'archetype')
    const group = within(await screen.findByRole('radiogroup', { name: 'Archetype' }))
    expect(group.getAllByRole('radio')).toHaveLength(4)
    expect(group.getByRole('radio', { name: /^Legion.*Often paired with Adaptive/ })).toBeInTheDocument()
    expect(group.getByRole('radio', { name: /^Bruiser.*Your pick/ })).toBeInTheDocument()
  })

  it('keeps every checked upgrade visible and draws from the rest', async () => {
    const v = { ...bullyOverlord(), status: 'draft' as const }
    const store = await storeWith(v)
    wizard(store, 'upgrades', 'v2')
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest 3' }))
    expect(screen.getByText("Showing 3 random upgrades, plus any you've already checked. Not official, just for inspiration.")).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: /Health|p\./ }).length).toBeGreaterThan(0)
    await waitFor(async () => expect((await saved(store, 'v2')).suggest).toEqual({ upgrades: ['hardier-minions', 'group-fighter', 'villainous-vehicle'] }))
    expect(screen.getByRole('checkbox', { name: /^Mook Squad/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /^Hardier Minions/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /^Calming Aura/ })).not.toBeInTheDocument()
  })

  it('starts off when editing a finished villain, and isn’t saved there', async () => {
    const store = await storeWith({ ...bullyOverlord(), suggest: { mastery: ['Master of Mysticism', 'Master Mercenary', 'Master of Superiority'] } })
    wizard(store, 'mastery', 'v2')
    expect(within(await screen.findByRole('radiogroup', { name: 'Villainous mastery' })).getAllByRole('radio')).toHaveLength(11)
    await userEvent.click(screen.getByRole('button', { name: 'Suggest 3' }))
    // The first three drawn include the pick, Master of Conquest.
    expect(within(screen.getByRole('radiogroup', { name: 'Villainous mastery' })).getAllByRole('radio').map((r) => r.closest('label')!.querySelector('.choice__title')!.textContent)).toEqual(['Master of Annihilation', 'Master Behind the Curtain', 'Master of Conquest'])
    expect((await saved(store, 'v2')).suggest?.mastery).toEqual(['Master of Mysticism', 'Master Mercenary', 'Master of Superiority'])
  })
})
