import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { Hero } from '../hero/model'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { completeHero } from '../test/heroes'
import { PlayPage } from '../components/HeroPage'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

async function setup(change: (h: Hero) => void = () => {}) {
  const store = new MemoryHeroStore()
  const hero = { ...completeHero(), id: 'h1' }
  change(hero)
  await store.save(hero)
  render(
    <StoreContext.Provider value={store}>
      <PlayPage id="h1" clock={clock} />
    </StoreContext.Provider>,
  )
  await screen.findByRole('region', { name: 'Health' })
  return store
}

/** "17 of 30 · Yellow": current Health, the max, and the zone chip. */
function healthIs(): string {
  const health = screen.getByRole('region', { name: 'Health' })
  const value = health.querySelector('.play-health')!.textContent!.replace(/\s+/g, ' ').trim()
  return `${value} · ${health.querySelector('.zone-chip')?.textContent}`
}

const saved = async (store: HeroStore) => {
  const r = await store.get('h1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.hero
}

describe('PlayPage', () => {
  it("won't play a draft, pointing to where it left off", async () => {
    const store = new MemoryHeroStore()
    await store.save({ ...completeHero(), id: 'h1', status: 'draft', furthestStep: 7 })
    render(
      <StoreContext.Provider value={store}>
        <PlayPage id="h1" clock={clock} />
      </StoreContext.Provider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('is still a draft')
    expect(screen.getByRole('link', { name: 'Continue making this hero' })).toHaveAttribute('href', '#/hero/h1/edit/health')
    expect(screen.queryByRole('region', { name: 'Health' })).not.toBeInTheDocument()
  })

  it('starts at full Health in Green, with the Green status die', async () => {
    await setup()
    expect(healthIs()).toBe('30 of 30 · Green')
    const scene = screen.getByRole('region', { name: 'Scene' })
    expect(within(scene).getByRole('img', { name: 'd8' })).toBeInTheDocument()
    expect(scene).toHaveTextContent('Status die: Green')
    expect(scene).toHaveTextContent('You: Green · Scene: Green. The more severe one sets your status die and abilities.')
  })

  it('steps Health by one, never past 0 or the max, and is Out at 0', async () => {
    await setup((h) => {
      h.play = { health: 1, heroPoints: 0, reactionUsed: false, mods: [], twists: [], history: [] }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Lose 1 Health' }))
    expect(healthIs()).toBe('0 of 30 · Out')
    await userEvent.click(screen.getByRole('button', { name: 'Lose 1 Health' }))
    expect(healthIs()).toBe('0 of 30 · Out')
    expect(screen.getByRole('region', { name: 'Scene' })).toHaveTextContent("You're Out: only your Out ability is available.")
    await userEvent.click(screen.getByRole('button', { name: 'Gain 1 Health' }))
    expect(healthIs()).toBe('1 of 30 · Red')
  })

  it('loses and gains Health, records it, and saves it', async () => {
    const store = await setup()
    const amount = screen.getByLabelText('Amount')
    await userEvent.type(amount, '13')
    await userEvent.click(screen.getByRole('button', { name: 'Lose' }))
    expect(healthIs()).toBe('17 of 30 · Yellow')
    const history = screen.getByRole('region', { name: 'History' })
    expect(history).toHaveTextContent('Lost 13 HP (30 → 17). Entered Yellow status.')
    expect(within(history).getByText('now')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).play?.health).toBe(17))
    await userEvent.type(amount, '20')
    await userEvent.click(screen.getByRole('button', { name: 'Gain' }))
    expect(healthIs()).toBe('30 of 30 · Green')
  })

  it('follows the scene zone when it’s further along', async () => {
    const store = await setup()
    const zones = screen.getByRole('group', { name: 'Scene zone' })
    await userEvent.click(within(zones).getByRole('button', { name: 'Red' }))
    expect(within(zones).getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
    const scene = screen.getByRole('region', { name: 'Scene' })
    expect(scene).toHaveTextContent('Status die: Red')
    expect(scene).toHaveTextContent('You: Green · Scene: Red.')
    await waitFor(async () => expect((await saved(store)).play?.sceneZone).toBe('red'))
  })

  it('tracks hero points and the reaction', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Gain a hero point' }))
    await userEvent.click(screen.getByRole('button', { name: 'Gain a hero point' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spend a hero point' }))
    expect(screen.getByLabelText('1 of 5 hero points')).toHaveTextContent('1')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Reaction used this round' }))
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Used this round’s reaction.')
  })

  it('adds and removes mods and twists', async () => {
    const store = await setup()
    const mods = within(screen.getByRole('region', { name: 'Bonuses and penalties' }))
    // The form is closed until "+ Add".
    expect(mods.queryByLabelText('What it is')).not.toBeInTheDocument()
    await userEvent.click(mods.getByRole('button', { name: '+ Add' }))
    await userEvent.selectOptions(mods.getByLabelText('Size'), '-3 penalty')
    await userEvent.type(mods.getByLabelText('What it is'), 'tied up')
    await userEvent.click(mods.getByRole('checkbox', { name: 'Persistent' }))
    await userEvent.click(mods.getByRole('button', { name: 'Add' }))
    // A row: the size, the name, and its tags.
    const row = mods.getByText('tied up').closest('li')!
    expect(row).toHaveTextContent('−3tied upPersistent')
    expect(mods.queryByLabelText('What it is')).not.toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).play?.mods).toEqual([{ id: expect.any(String), label: 'tied up', value: -3, persistent: true }]))
    await userEvent.click(mods.getByRole('button', { name: "Remove '-3 tied up' penalty (persistent)" }))
    expect(mods.getByText('None.')).toBeInTheDocument()

    const twists = within(screen.getByRole('region', { name: 'Twists' }))
    await userEvent.click(twists.getByRole('button', { name: '+ Add' }))
    await userEvent.type(twists.getByLabelText('Twist'), 'Sprained ankle')
    await userEvent.click(twists.getByRole('button', { name: 'Add' }))
    expect(twists.getByText('Sprained ankle')).toBeInTheDocument()
    await userEvent.click(twists.getByRole('button', { name: 'Resolve the minor twist: Sprained ankle' }))
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent("Gained '-3 tied up' penalty (persistent).")
  })

  it('starts a new issue after asking', async () => {
    const store = await setup((h) => {
      h.play = { health: 5, heroPoints: 3, reactionUsed: true, mods: [{ id: 'm', label: 'x', value: 2 }], twists: [], history: [] }
    })
    await userEvent.click(screen.getByRole('button', { name: 'New issue…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, new issue' }))
    expect(healthIs()).toBe('30 of 30 · Green')
    await waitFor(async () => expect((await saved(store)).play).toMatchObject({ heroPoints: 0, reactionUsed: false, mods: [], twists: [] }))
  })

  it('waits for saves before leaving for the editor', async () => {
    const store = await setup()
    window.location.hash = '#/hero/h1/play'
    await userEvent.click(screen.getByRole('button', { name: 'Gain a hero point' }))
    await userEvent.click(screen.getByRole('link', { name: 'Edit' }))
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1/edit'))
    expect((await saved(store)).play?.heroPoints).toBe(1)
  })

  it('switches to Sheet mode from the header', async () => {
    await setup()
    window.location.hash = '#/hero/h1/play'
    const modes = screen.getByRole('group', { name: 'Mode' })
    expect(within(modes).getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(modes).getByRole('button', { name: 'Sheet' }))
    expect(window.location.hash).toBe('#/hero/h1')
  })

  it('says when the hero is missing', async () => {
    render(
      <StoreContext.Provider value={new MemoryHeroStore()}>
        <PlayPage id="nobody" />
      </StoreContext.Provider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved hero with that link.")
  })
})
