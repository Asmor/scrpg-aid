import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { StoreContext } from '../app/store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import { HeroPage } from '../components/HeroPage'
import { exampleHero } from '../hero/example'
import { MemoryHeroStore } from '../hero/store'
import { adaptiveBruiser } from '../test/villains'
import { MemoryVillainStore } from '../villain/store'
import { VillainPage } from '../villain/VillainPage'

afterEach(() => {
  window.location.hash = ''
})

async function stores() {
  const heroes = new MemoryHeroStore()
  const villains = new MemoryVillainStore()
  await heroes.save({ ...exampleHero({ id: 'maya' }), tags: ['thursday-game'] })
  await villains.save({ ...adaptiveBruiser(), tags: ['Scene-3'] })
  return { heroes, villains }
}

const wrap = (s: Awaited<ReturnType<typeof stores>>, ui: React.ReactNode) =>
  render(
    <StoreContext.Provider value={s.heroes}>
      <VillainStoreContext.Provider value={s.villains}>{ui}</VillainStoreContext.Provider>
    </StoreContext.Provider>,
  )

describe('tags on a hero’s sheet', () => {
  it('shows the tag row in Sheet mode, adds with library spellings, removes, and saves', async () => {
    const s = await stores()
    wrap(s, <HeroPage id="maya" />)
    const row = within(await screen.findByRole('group', { name: 'Tags' }))
    expect(row.getByRole('button', { name: 'Filter by thursday-game' })).toBeInTheDocument()
    await userEvent.click(row.getByRole('button', { name: 'Add a tag to Maya Reyes' }))
    // The villain's tag is suggested, and typing it in another case uses its spelling.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scene-3' })).toBeInTheDocument())
    await userEvent.keyboard('scene-3{Enter}')
    await waitFor(async () => expect(((await s.heroes.get('maya')) as { hero: { tags: string[] } }).hero.tags).toEqual(['thursday-game', 'Scene-3']))
    await userEvent.click(row.getByRole('button', { name: 'Remove thursday-game from Maya Reyes' }))
    await waitFor(async () => expect(((await s.heroes.get('maya')) as { hero: { tags: string[] } }).hero.tags).toEqual(['Scene-3']))
  })

  it('opens the library filtered by a tag, and leaves the row out of Play', async () => {
    const s = await stores()
    const { unmount } = wrap(s, <HeroPage id="maya" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Filter by thursday-game' }))
    await waitFor(() => expect(window.location.hash).toBe('#/?tag=thursday-game'))
    unmount()
    wrap(s, <HeroPage id="maya" mode="play" />)
    await screen.findByRole('button', { name: 'New issue…' })
    expect(screen.queryByRole('group', { name: 'Tags' })).not.toBeInTheDocument()
  })
})

describe('tags on a villain’s sheet', () => {
  it('adds and removes tags, saving with a new Changed time, and opens the library by a tag', async () => {
    const s = await stores()
    wrap(s, <VillainPage id="v1" />)
    const row = within(await screen.findByRole('group', { name: 'Tags' }))
    await userEvent.click(row.getByRole('button', { name: 'Add a tag to Ironclad' }))
    await userEvent.keyboard('prep{Enter}')
    await waitFor(async () => expect(((await s.villains.get('v1')) as { villain: { tags: string[] } }).villain.tags).toEqual(['Scene-3', 'prep']))
    expect(((await s.villains.get('v1')) as { villain: { updatedAt: string } }).villain.updatedAt).not.toBe(adaptiveBruiser().updatedAt)
    await userEvent.click(row.getByRole('button', { name: 'Remove Scene-3 from Ironclad' }))
    await waitFor(async () => expect(((await s.villains.get('v1')) as { villain: { tags: string[] } }).villain.tags).toEqual(['prep']))
    await userEvent.click(row.getByRole('button', { name: 'Filter by prep' }))
    await waitFor(() => expect(window.location.hash).toBe('#/?tag=prep'))
  })
})
