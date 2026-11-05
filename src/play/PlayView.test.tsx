import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayProviders } from '../test/play'
import { playStores, savedHero, seedHero, type HeroWithPlay, type PlayStores } from '../test/play-stores'
import { describe, expect, it } from 'vitest'
import { completeHero } from '../test/heroes'
import { PlayPage } from '../components/HeroPage'
import { buildSheet } from '../creation/sheet'
import { createGame } from '../game/model'
import { addHero } from '../game/table'
import { emptyPlay } from './state'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

async function setup(change: (h: HeroWithPlay) => void = () => {}) {
  const store = playStores()
  const hero = { ...completeHero(), id: 'h1' }
  change(hero)
  await seedHero(store, hero)
  render(
    <PlayProviders stores={store}>
      <PlayPage id="h1" clock={clock} />
    </PlayProviders>,
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

const saved = (store: PlayStores) => savedHero(store, 'h1')

describe('PlayPage', () => {
  it("won't play a draft, pointing to where it left off", async () => {
    const store = playStores()
    await seedHero(store, { ...completeHero(), id: 'h1', status: 'draft', furthestStep: 7 })
    render(
      <PlayProviders stores={store}>
        <PlayPage id="h1" clock={clock} />
      </PlayProviders>,
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
      h.play = { health: 1, reactionUsed: false, mods: [], twists: [], history: [] }
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

  it('holds defenses: Take damage uses one (the default, or the one chosen), and they can be removed or cleared', async () => {
    const store = await setup((h) => {
      h.play = { ...emptyPlay(), defenses: [{ id: 'd3', value: 3, from: 'Unnamed hero' }, { id: 'd5', value: 5, from: 'Ally' }, { id: 'd9', value: 9, from: 'Ally' }] }
    })
    const health = within(screen.getByRole('region', { name: 'Health' }))
    expect(within(health.getByRole('list', { name: 'Defenses' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Defend 3×', 'Defend 5 from Ally×', 'Defend 9 from Ally×'])
    const amount = health.getByLabelText('Amount')
    await userEvent.type(amount, '8')
    // The default: the largest that doesn't exceed the damage.
    const uses = health.getByLabelText('Take damage uses')
    expect(uses).toHaveDisplayValue('Defend 5 from Ally')
    await userEvent.click(health.getByRole('button', { name: 'Take damage' }))
    expect(healthIs()).toBe('27 of 30 · Green')
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Took 8 damage (Defend 5 blocked 5, 3 taken).')
    // Another hit, with the larger one chosen: it blocks all of it.
    await userEvent.type(amount, '4')
    await userEvent.selectOptions(health.getByLabelText('Take damage uses'), 'Defend 9 from Ally')
    await userEvent.click(health.getByRole('button', { name: 'Take damage' }))
    expect(healthIs()).toBe('27 of 30 · Green')
    // One left: no choice to make. Lose takes Health without using it.
    expect(health.queryByLabelText('Take damage uses')).not.toBeInTheDocument()
    await userEvent.type(amount, '2')
    await userEvent.click(health.getByRole('button', { name: 'Lose' }))
    expect(healthIs()).toBe('25 of 30 · Green')
    await waitFor(async () => expect((await saved(store)).play?.defenses).toEqual([{ id: 'd3', value: 3, from: 'Unnamed hero' }]))
    await userEvent.click(health.getByRole('button', { name: 'Remove Defend 3' }))
    expect(health.queryByRole('list', { name: 'Defenses' })).not.toBeInTheDocument()
    expect(health.queryByRole('button', { name: 'Take damage' })).not.toBeInTheDocument()
  })

  it('clears every defense at once', async () => {
    const store = await setup((h) => {
      h.play = { ...emptyPlay(), defenses: [{ id: 'd3', value: 3, from: 'Ally' }] }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Clear defenses' }))
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Defenses cleared.')
    await waitFor(async () => expect((await saved(store)).play).not.toHaveProperty('defenses'))
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
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Gained a hero point (now 1).')
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Spent a hero point (now 1).')
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

  it('starts over after asking, from the solo game’s ⋯', async () => {
    const store = await setup((h) => {
      h.play = { health: 5, reactionUsed: true, mods: [{ id: 'm', label: 'x', value: 2 }], twists: [], history: [] }
    })
    expect(screen.getByText('Solo play')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^More for .*Play page$/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Start over…' }))
    expect(screen.getByRole('dialog', { name: 'Start over?' })).toHaveTextContent('mods, twists, hero points, minions, form and the play log are cleared')
    await userEvent.click(screen.getByRole('button', { name: 'Yes, start over' }))
    expect(healthIs()).toBe('30 of 30 · Green')
    await waitFor(async () => expect((await saved(store)).play).toEqual({ reactionUsed: false, mods: [], twists: [], history: [] }))
    // The sheet isn't touched.
    expect((await saved(store)).health).toEqual(completeHero().health)
  })

  it('re-copies a changed library sheet into the solo game when Play opens, with reconcile’s adjustments', async () => {
    const stores = playStores()
    const hero = { ...completeHero(), id: 'h1' }
    // The solo game has the older sheet, one below its max.
    const oldMax = buildSheet(hero).maxHealth!
    await seedHero(stores, { ...hero, play: { ...emptyPlay(), health: oldMax - 1 } })
    const lower = structuredClone(hero)
    lower.health = { ...lower.health!, mode: 'roll', rollResult: 1 }
    expect(buildSheet(lower).maxHealth).toBeLessThan(oldMax - 1)
    await stores.heroes.save(lower)
    render(
      <PlayProviders stores={stores}>
        <PlayPage id="h1" clock={clock} />
      </PlayProviders>,
    )
    const history = await screen.findByRole('region', { name: 'History' })
    await waitFor(() => expect(history).toHaveTextContent('The sheet was updated from your sheet.'))
    expect(history).toHaveTextContent(/Health lowered to \d+, the new max\./)
    const max = buildSheet(lower).maxHealth!
    await waitFor(async () => expect((await savedHero(stores, 'h1')).play?.health).toBe(max))
  })

  it('names the other games the hero is in', async () => {
    const stores = playStores()
    const hero = { ...completeHero(), id: 'h1' }
    await seedHero(stores, hero)
    const c = { now: new Date(), newId: () => `g${++n}` }
    await stores.games.save(addHero({ ...createGame({ id: 'thu' }), name: 'Thursday game' }, hero, c))
    render(
      <PlayProviders stores={stores}>
        <PlayPage id="h1" clock={clock} />
      </PlayProviders>,
    )
    const line = await screen.findByText(/is also in/)
    expect(line).toHaveTextContent("is also in Thursday game. What happens here doesn't affect that game.")
    expect(within(line).getByRole('link', { name: 'Thursday game' })).toHaveAttribute('href', '#/game/thu')
  })

  it('waits for saves before leaving for the editor', async () => {
    const store = await setup()
    window.location.hash = '#/hero/h1/play'
    await userEvent.click(screen.getByRole('button', { name: 'Gain a hero point' }))
    await userEvent.click(screen.getByRole('link', { name: 'Edit' }))
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1/edit'))
    expect((await saved(store)).heroPoints).toBe(1)
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
      <PlayProviders stores={playStores()}>
        <PlayPage id="nobody" />
      </PlayProviders>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved hero with that link.")
  })
})
