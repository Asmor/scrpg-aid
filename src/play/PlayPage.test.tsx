import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import type { Hero } from '../hero/model'
import { MemoryHeroStore, type HeroStore } from '../hero/store'
import { completeHero } from '../test/heroes'
import { PlayPage } from './PlayPage'

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

const saved = async (store: HeroStore) => {
  const r = await store.get('h1')
  if (r.status !== 'found') throw new Error('not saved')
  return r.hero
}

describe('PlayPage', () => {
  it('starts at full Health in Green, with the Green status die', async () => {
    await setup()
    const health = screen.getByRole('region', { name: 'Health' })
    expect(health).toHaveTextContent('30 / 30 Green')
    expect(within(health).getByRole('img', { name: 'd8' })).toBeInTheDocument()
  })

  it('loses and gains Health, records it, and saves it', async () => {
    const store = await setup()
    const amount = screen.getByLabelText('Amount')
    await userEvent.type(amount, '13')
    await userEvent.click(screen.getByRole('button', { name: 'Lose' }))
    expect(screen.getByRole('region', { name: 'Health' })).toHaveTextContent('17 / 30 Yellow')
    const history = screen.getByRole('region', { name: 'History' })
    expect(history).toHaveTextContent('Lost 13 HP (30 → 17). Entered Yellow status.')
    expect(within(history).getByText('now')).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).play?.health).toBe(17))
    await userEvent.type(amount, '20')
    await userEvent.click(screen.getByRole('button', { name: 'Gain' }))
    expect(screen.getByRole('region', { name: 'Health' })).toHaveTextContent('30 / 30 Green')
  })

  it('follows the scene zone when it’s further along', async () => {
    const store = await setup()
    await userEvent.click(within(screen.getByRole('group', { name: 'Scene' })).getByRole('radio', { name: 'Red' }))
    expect(screen.getByRole('region', { name: 'Health' })).toHaveTextContent('30 / 30 Red')
    await waitFor(async () => expect((await saved(store)).play?.sceneZone).toBe('red'))
  })

  it('tracks hero points and the reaction', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Gain a hero point' }))
    await userEvent.click(screen.getByRole('button', { name: 'Gain a hero point' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spend a hero point' }))
    expect(screen.getByText('1 of 5 hero points')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Reaction used this round' }))
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent('Used this round’s reaction.')
  })

  it('adds and removes mods and twists', async () => {
    const store = await setup()
    const mods = within(screen.getByRole('region', { name: 'Bonuses and penalties' }))
    await userEvent.selectOptions(mods.getByLabelText('Size'), '-3 penalty')
    await userEvent.type(mods.getByLabelText('What it is'), 'tied up')
    await userEvent.click(mods.getByRole('checkbox', { name: 'Persistent' }))
    await userEvent.click(mods.getByRole('button', { name: 'Add' }))
    expect(mods.getByText("'-3 tied up' penalty (persistent)")).toBeInTheDocument()
    await waitFor(async () => expect((await saved(store)).play?.mods).toEqual([{ id: expect.any(String), label: 'tied up', value: -3, persistent: true }]))
    await userEvent.click(mods.getByRole('button', { name: "Remove '-3 tied up' penalty (persistent)" }))
    expect(mods.getByText('None.')).toBeInTheDocument()

    const twists = within(screen.getByRole('region', { name: 'Twists' }))
    await userEvent.type(twists.getByLabelText('Twist'), 'Sprained ankle')
    await userEvent.click(twists.getByRole('button', { name: 'Add' }))
    expect(twists.getByText('Sprained ankle')).toBeInTheDocument()
    await userEvent.click(twists.getByRole('button', { name: 'Clear the minor twist: Sprained ankle' }))
    expect(screen.getByRole('region', { name: 'History' })).toHaveTextContent("Gained '-3 tied up' penalty (persistent).")
  })

  it('starts a new issue after asking', async () => {
    const store = await setup((h) => {
      h.play = { health: 5, heroPoints: 3, reactionUsed: true, mods: [{ id: 'm', label: 'x', value: 2 }], twists: [], history: [] }
    })
    await userEvent.click(screen.getByRole('button', { name: 'New issue…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, new issue' }))
    expect(screen.getByRole('region', { name: 'Health' })).toHaveTextContent('30 / 30 Green')
    await waitFor(async () => expect((await saved(store)).play).toMatchObject({ heroPoints: 0, reactionUsed: false, mods: [], twists: [] }))
  })

  it('waits for saves before going back to the sheet', async () => {
    const store = await setup()
    window.location.hash = '#/hero/h1/play'
    await userEvent.click(screen.getByRole('button', { name: 'Gain a hero point' }))
    await userEvent.click(screen.getByRole('link', { name: '← Sheet' }))
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1'))
    expect((await saved(store)).play?.heroPoints).toBe(1)
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
