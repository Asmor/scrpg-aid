import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TemplateStoresContext } from '../app/template-store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { createLieutenantTemplate, createMinionTemplate } from '../template/model'
import { memoryTemplateStores } from '../template/store'
import { adaptiveBruiser, bullyOverlord } from '../test/villains'
import { readable } from '../test/readable'
import { createVillain, type Villain } from './model'
import { MemoryVillainStore, type VillainStore } from './store'
import { VillainPage } from './VillainPage'
import { VillainSheetView } from './VillainSheetView'

async function storeWith(villain: Villain = createVillain({ id: 'v1' })) {
  const store = new MemoryVillainStore()
  await store.save(villain)
  return store
}

const withStore = (store: VillainStore, ui: React.ReactNode) => render(<VillainStoreContext.Provider value={store}>{ui}</VillainStoreContext.Provider>)

afterEach(() => {
  window.location.hash = ''
})

describe('the villain sheet', () => {
  it('shows the header, About, Mechanics, and abilities by where they came from', async () => {
    const store = await storeWith(adaptiveBruiser())
    withStore(store, <VillainPage id="v1" />)
    expect(await screen.findByRole('heading', { level: 2, name: 'Ironclad' })).toBeInTheDocument()
    expect(screen.getByText('Minor villain · Adaptive · Bruiser')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '#/villain/v1/edit')
    const modes = screen.getByRole('group', { name: 'Mode' })
    expect(within(modes).getByRole('button', { name: 'Sheet' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(modes).getByRole('button', { name: 'Play' }))
    expect(window.location.hash).toBe('#/villain/v1/play')
    window.location.hash = ''
    const sheet = screen.getByRole('article', { name: 'Ironclad villain sheet' })
    expect(within(sheet).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['About', 'Mechanics', 'Abilities'])
    expect(within(sheet).getByRole('region', { name: 'Build' })).toHaveTextContent('KindMinor villainApproachAdaptiveArchetypeBruiserUpgrades—Mastery—')
    expect(within(sheet).getByRole('region', { name: 'Health' })).toHaveTextContent('55 max')
    expect(within(sheet).getByRole('region', { name: 'Powers and qualities' })).toHaveTextContent('Robotics')
    expect(within(sheet).getByRole('region', { name: 'Bruiser abilities' })).toHaveTextContent('Lash Out')
    expect(within(sheet).getByRole('region', { name: 'Adaptive abilities' })).toHaveTextContent('Adapt and Thrive')
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })

  it('lists what the villain comes with, each linking to its template', async () => {
    const templates = memoryTemplateStores()
    await templates.minions.save({ ...createMinionTemplate({ id: 'm1' }), name: 'Burglar' })
    await templates.lieutenants.save({ ...createLieutenantTemplate({ id: 'l1' }), name: 'Siege Crawler', die: 'd10' })
    const store = await storeWith({
      ...adaptiveBruiser(),
      attached: [
        { templateId: 'm1', kind: 'minion', role: 'signature' },
        { templateId: 'l1', kind: 'lieutenant', role: 'vehicle' },
        { templateId: 'gone', kind: 'minion', role: 'signature' },
      ],
    })
    render(
      <TemplateStoresContext.Provider value={templates}>
        <VillainStoreContext.Provider value={store}>
          <VillainPage id="v1" />
        </VillainStoreContext.Provider>
      </TemplateStoresContext.Provider>,
    )
    const section = within(await screen.findByRole('region', { name: 'Comes with' }))
    expect(await section.findByRole('link', { name: 'Burglar minions (signature)' })).toHaveAttribute('href', '#/minion/m1')
    expect(section.getByRole('link', { name: 'Siege Crawler, d10 lieutenant (vehicle)' })).toHaveAttribute('href', '#/lieutenant/l1')
    expect(section.getByText('Missing template')).toBeInTheDocument()
  })

  it('shows the test villain’s status table, Health breakdown, and ability groups', async () => {
    const store = await storeWith(bullyOverlord())
    withStore(store, <VillainPage id="v2" />)
    const sheet = await screen.findByRole('article', { name: 'Test Villain villain sheet' })
    const status = within(sheet).getByRole('region', { name: 'Status die' })
    expect(status).toHaveTextContent('Status depends on the number of minions and lieutenants loyal to the villain in the scene.')
    expect(within(status).getAllByRole('listitem').map(readable)).toEqual(['9 or mored12', '5 to 8d10', '3 or 4d8', '1 or 2d6', 'Noned4'])
    expect(within(sheet).getByRole('region', { name: 'Health' })).toHaveTextContent('Built for 4 heroes: Bully 25, Overlord +15, 5 per hero.')
    const groups = within(sheet).getAllByRole('region').filter((r) => r.getAttribute('aria-label')?.endsWith(' abilities'))
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Bully abilities', 'Overlord abilities', 'Mook Squad abilities', 'Master of Conquest abilities'])
    expect(groups[2]).toHaveTextContent('Alert!')
    // What the upgrade does, from the data.
    expect(groups[2]).toHaveTextContent('A set of signature minions appears in the scene with the villain, and the villain can keep refilling them.')
    expect(within(sheet).getByRole('region', { name: 'Concept' })).toHaveTextContent('A crime boss who runs a crew of enforcers.')
    // Villain abilities aren't zoned: no game colors on them.
    for (const g of groups) expect(g.querySelector('[class*="zone-"]')).toBeNull()
  })

  it('prints its sheet as the PDF, with the villain’s name in the footer', async () => {
    let rules = ''
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      rules = document.head.querySelector('style[data-print]')?.textContent ?? ''
    })
    try {
      withStore(await storeWith(adaptiveBruiser()), <VillainPage id="v1" />)
      await userEvent.click(await screen.findByRole('button', { name: 'Export' }))
      await userEvent.click(screen.getByRole('button', { name: 'PDF, Letter' }))
      expect(rules).toBe('@page { size: letter; @bottom-left { content: "Ironclad"; } }')
    } finally {
      print.mockRestore()
    }
  })

  it('leaves out About in Play mode', () => {
    render(<VillainSheetView villain={bullyOverlord()} mode="play" />)
    expect(screen.queryByRole('heading', { name: 'About' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mechanics' })).toBeInTheDocument()
  })

  it('shows a vehicle’s abilities with its upgrade, a mastery, filled-in details, and the issues banner', async () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd10', abilities: [{ source: 'vehicle', name: 'Sturdy' }] } }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    v.details.appearance = 'Seven feet of steel'
    v.notes = 'Hates rust.'
    const store = await storeWith(v)
    withStore(store, <VillainPage id="v1" />)
    const sheet = await screen.findByRole('article')
    const vehicle = within(sheet).getByRole('region', { name: 'Villainous Vehicle abilities' })
    expect(vehicle).toHaveTextContent('Upgrade · vehicle d10')
    expect(vehicle).toHaveTextContent('Sturdy')
    expect(within(sheet).getByRole('region', { name: 'Master of Annihilation abilities' })).toHaveTextContent('Villainous mastery')
    expect(within(sheet).getByRole('region', { name: 'Concept' })).toHaveTextContent('AppearanceSeven feet of steelNotesHates rust.')
    expect(within(sheet).getByRole('region', { name: 'Concept' })).not.toHaveTextContent('Costume')
    // A d10 vehicle takes three abilities; one is chosen.
    const banner = screen.getByRole('note')
    expect(banner).toHaveTextContent('1 rule issueChoose 3 of the Villainous Vehicle abilities; you have 1.')
    expect(within(banner).getByRole('link', { name: 'Open in edit' })).toHaveAttribute('href', '#/villain/v1/edit')
  })
})
