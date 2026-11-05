import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { GameStoreContext } from '../app/game-store-context'
import { StoreContext } from '../app/store-context'
import { createGame } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { addHero } from '../game/table'
import type { Hero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import type { Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { AdvancementPage } from './AdvancementPage'
import { JoinedStoreContext } from '../app/joined-store-context'
import { finishIssue } from '../game/issues'
import { MemoryJoinedStore, type JoinedGame } from '../game/joined-store'
import { project } from '../game/project'

let n = 0
const clock = (): Clock => ({ now: new Date('2026-10-22T12:00:00Z'), newId: () => `id${++n}` })

afterEach(() => {
  window.location.hash = ''
})

const maya = (): Hero => ({ ...completeHero(), id: 'h1', details: { ...completeHero().details, name: 'Maya Reyes' } })

async function setup(hero: Hero = maya(), inGame = true) {
  const heroes = new MemoryHeroStore()
  const games = new MemoryGameStore()
  await heroes.save(hero)
  if (inGame) await games.save(addHero(createGame({ id: 'g1', name: 'Thursday game' }), hero, clock()))
  render(
    <StoreContext.Provider value={heroes}>
      <GameStoreContext.Provider value={games}>
        <AdvancementPage id="h1" clock={clock} />
      </GameStoreContext.Provider>
    </StoreContext.Provider>,
  )
  await screen.findByRole('heading', { level: 1 })
  const saved = async () => {
    const r = await heroes.get('h1')
    if (r.status !== 'found') throw new Error('not saved')
    return r.hero
  }
  return { saved, heroes }
}

const add = async (title: string) => {
  await userEvent.type(screen.getByLabelText('Issue title'), title)
  await userEvent.click(screen.getByRole('button', { name: 'Add back issue' }))
}

const withIssues = (count: number): Hero => ({ ...maya(), backIssues: Array.from({ length: count }, (_, i) => ({ id: `b${i}`, title: `Issue ${i + 1}`, at: '2026-10-08T12:00:00Z' })) })

describe('the Advancement page', () => {
  it('has the breadcrumb, the title and Back to sheet', async () => {
    await setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Reyes · Advancement' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sheet' })).toHaveAttribute('href', '#/hero/h1')
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument()
  })

  it('adds a back issue from a game, with the pips and count following', async () => {
    const { saved } = await setup()
    expect(screen.getByRole('img', { name: '0 of 6 back issues' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('option', { name: 'Thursday game' })).toBeInTheDocument())
    expect(screen.getByLabelText('From an issue')).toHaveValue('another')
    expect(screen.getByLabelText('Game')).toHaveValue('g1')
    await add('The Bank Job')
    expect(screen.getByRole('img', { name: '1 of 6 back issues' })).toBeInTheDocument()
    expect(screen.getByText('1 of 6')).toBeInTheDocument()
    expect(screen.getByLabelText('Issue title')).toHaveValue('')
    await waitFor(async () => expect((await saved()).backIssues).toMatchObject([{ title: 'The Bank Job', gameId: 'g1', gameName: 'Thursday game' }]))
    const row = screen.getByText('The Bank Job').closest('li')!
    expect(row).toHaveTextContent('Thursday game')
    expect(row).toHaveTextContent('Oct 22')
  })

  it('adds one with None, and needs a title', async () => {
    const { saved } = await setup(maya(), false)
    expect(screen.getByRole('button', { name: 'Add back issue' })).toBeDisabled()
    expect(screen.getByLabelText('Game')).toHaveValue('')
    await add('No game here')
    await waitFor(async () => expect((await saved()).backIssues[0]).not.toHaveProperty('gameId'))
  })

  it('edits and removes from ⋯', async () => {
    const { saved } = await setup(withIssues(2))
    await userEvent.click(screen.getByRole('button', { name: 'More for Issue 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Edit back issue' }))
    await userEvent.clear(dialog.getByLabelText('Issue title'))
    await userEvent.type(dialog.getByLabelText('Issue title'), 'Renamed')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Renamed')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'More for Issue 2' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(screen.queryByText('Issue 2')).not.toBeInTheDocument()
    await waitFor(async () => expect((await saved()).backIssues.map((b) => b.title)).toEqual(['Renamed']))
  })

  it('at six, the form gives way to Record collection, with focus on the name, in a polite region', async () => {
    const { saved } = await setup(withIssues(5))
    expect(screen.queryByText('Six back issues. Name a collection to record them.')).not.toBeInTheDocument()
    await add('Issue 6')
    const notice = screen.getByText('Six back issues. Name a collection to record them.')
    expect(notice.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByLabelText('Issue title')).not.toBeInTheDocument()
    const name = screen.getByRole('textbox', { name: 'Collection name' })
    expect(name).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Record collection' })).toBeDisabled()
    await userEvent.type(name, 'The Gravelord Saga{Enter}')
    expect(screen.getByRole('img', { name: '0 of 6 back issues' })).toBeInTheDocument()
    expect(screen.getByLabelText('Issue title')).toBeInTheDocument()
    expect(screen.getByText('1 collection')).toBeInTheDocument()
    expect(screen.getByText('Recorded the collection The Gravelord Saga (6 back issues).')).toBeInTheDocument()
    await waitFor(async () => expect((await saved()).collections[0]!.issues).toHaveLength(6))
    const disclosure = screen.getByText('The Gravelord Saga').closest('details')!
    expect(within(disclosure).getAllByRole('listitem', { hidden: true })).toHaveLength(6)
  })

  it("doesn't take focus when a hero opens already at six, and removing one reopens the form", async () => {
    await setup(withIssues(6))
    expect(screen.getByRole('textbox', { name: 'Collection name' })).not.toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'More for Issue 6' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(screen.getByLabelText('Issue title')).toBeInTheDocument()
  })

  it('offers a starting collection only while there are none', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: '+ Starting collection…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Starting collection' }))
    await userEvent.type(dialog.getByLabelText('Collection name'), 'Origins{Enter}')
    expect(screen.queryByRole('button', { name: '+ Starting collection…' })).not.toBeInTheDocument()
    const disclosure = screen.getByText('Origins').closest('details')!
    expect(disclosure).toHaveTextContent('Allowed by the GM at creation')
    expect(screen.getByText('Started with the collection Origins.')).toBeInTheDocument()
  })

  it('swaps a power: the chips, the die kept, the preview with Was:, and Undo after a confirm', async () => {
    const { saved } = await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Swap a power…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Swap a power' }))
    expect(dialog.getByText('Core Rules p. 143')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Swap' })).toBeDisabled()
    expect(dialog.getByText('Choose the power to replace.')).toBeInTheDocument()
    const group = dialog.getByRole('radiogroup', { name: 'Power to replace' })
    await userEvent.click(within(group).getByRole('radio', { name: /Fire/ }))
    expect(dialog.getByText(/Keeps its d/)).toBeInTheDocument()
    expect(dialog.getByText('Choose a new power.')).toBeInTheDocument()
    await userEvent.selectOptions(dialog.getByLabelText('New power'), 'Cold')
    expect(dialog.getAllByText('Was:').length).toBeGreaterThan(0)
    expect(dialog.getByRole('heading', { name: /Abilities that use Fire/ })).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Swap' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/^Swapped Fire d\d+ for Cold d\d+\./)).toBeInTheDocument()
    await waitFor(async () => expect((await saved()).advancement).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: 'Undo last change' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Undo the last change?' })).getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText(/^Swapped Fire/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo last change' })).not.toBeInTheDocument()
    await waitFor(async () => expect((await saved()).advancement).toEqual([]))
  })

  it('swaps a quality, with the roleplaying quality on offer', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Swap a quality…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Swap a quality' }))
    expect(within(dialog.getByRole('radiogroup')).getAllByRole('radio').length).toBeGreaterThan(1)
    await userEvent.click(within(dialog.getByRole('radiogroup')).getByRole('radio', { name: /Alertness/ }))
    await userEvent.selectOptions(dialog.getByLabelText('New quality'), 'Banter')
    await userEvent.click(dialog.getByRole('button', { name: 'Swap' }))
    expect(screen.getByText(/^Swapped Alertness d\d+ for Banter d\d+\./)).toBeInTheDocument()
  })

  it('changes a cosmetic field from a small prefilled dialog, and the page follows', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Change codename…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Change codename' }))
    const field = dialog.getByLabelText('Codename')
    expect(field).toHaveValue('Maya Reyes')
    await userEvent.clear(field)
    await userEvent.type(field, 'Overclock{Enter}')
    expect(screen.getByRole('heading', { level: 1, name: 'Overclock · Advancement' })).toBeInTheDocument()
    expect(screen.getByText('Codename: Maya Reyes → Overclock.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit appearance…' }))
    const look = within(screen.getByRole('dialog', { name: 'Edit appearance' }))
    await userEvent.type(look.getByLabelText('Hair'), 'Red')
    await userEvent.click(look.getByRole('button', { name: 'Save' }))
    expect(screen.getByText(/Appearance: Hair .* → Red\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit costume…' }))
    await userEvent.type(within(screen.getByRole('dialog', { name: 'Edit costume' })).getByRole('textbox'), ' cape{Enter}')
    expect(screen.getByText(/^Costume: /)).toBeInTheDocument()
  })

  it('swaps a principle, with the old and new side by side', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Swap a principle…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Swap a principle' }))
    const radios = within(dialog.getByRole('radiogroup', { name: 'Principle to replace' })).getAllByRole('radio')
    expect(radios).toHaveLength(2)
    await userEvent.click(radios[0]!)
    const select = dialog.getByLabelText('New principle')
    expect(within(select).getByRole('group', { name: 'Other principles' })).toBeInTheDocument()
    await userEvent.selectOptions(select, 'Principle of Destiny')
    expect(dialog.getByText('New')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Swap' }))
    expect(screen.getByText(/^Swapped .* for Principle of Destiny\.$/)).toBeInTheDocument()
  })

  it('a principle with a blank fills its preview as you type, and an empty field is an issue there', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Swap a principle…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Swap a principle' }))
    await userEvent.click(within(dialog.getByRole('radiogroup', { name: 'Principle to replace' })).getAllByRole('radio')[0]!)
    await userEvent.selectOptions(dialog.getByLabelText('New principle'), 'Principle of [Energy/Element]')
    const field = dialog.getByLabelText(/^Energy\/Element/)
    expect(dialog.getAllByText(/\[energy\/element\]/).length).toBeGreaterThan(0)
    expect(field).toBeInvalid()
    expect(field).toHaveAccessibleDescription('Fill in [Energy/Element] for Principle of [Energy/Element].')
    expect(dialog.getByText(/1 rule issue; you can swap anyway\./)).toBeInTheDocument()
    await userEvent.type(field, 'Lava')
    expect(field).toBeValid()
    expect(dialog.queryByText(/\[energy\/element\]/)).toBeNull()
    expect(dialog.getAllByText(/lava/i).length).toBeGreaterThan(0)
  })

  it('swaps an ability from the same list, with the same trait filled in', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Swap an ability…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Swap an ability' }))
    await userEvent.click(within(dialog.getByRole('radiogroup', { name: 'Ability to replace' })).getByRole('radio', { name: /Inflict/ }))
    const select = dialog.getByLabelText('New ability')
    const first = within(select).getAllByRole('option')[1]!.textContent!
    await userEvent.selectOptions(select, first)
    expect(dialog.getByText(`Inflict becomes ${first}.`)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Swap' }))
    expect(screen.getByText(`Swapped Inflict for ${first}. It uses Fire.`)).toBeInTheDocument()
  })

  it('rebuilds after a confirm, and offers to continue one left open', async () => {
    const { saved } = await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Rebuild Maya Reyes…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Rebuild Maya Reyes?' }))
    expect(dialog.getByText(/Undo last change can restore it/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Rebuild' }))
    await waitFor(() => expect(window.location.hash).toBe('#/hero/h1/edit'))
    expect(await saved()).toMatchObject({ method: 'constructed' })
    expect(screen.getByRole('link', { name: 'Continue rebuilding Maya Reyes…' })).toHaveAttribute('href', '#/hero/h1/edit')
  })

  it('waits for a draft to be finished', async () => {
    await setup({ ...maya(), status: 'draft', furthestStep: 4 }, false).catch(() => {})
    expect(await screen.findByRole('alert')).toHaveTextContent('is still a draft')
    expect(screen.getByRole('link', { name: 'Continue making this hero' })).toHaveAttribute('href', '#/hero/h1/edit/personality')
  })

  it('says when a hero is missing', async () => {
    render(
      <StoreContext.Provider value={new MemoryHeroStore()}>
        <GameStoreContext.Provider value={new MemoryGameStore()}>
          <AdvancementPage id="nope" clock={clock} />
        </GameStoreContext.Provider>
      </StoreContext.Provider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved hero with that link")
  })

  it('reports a failed save', async () => {
    const { heroes } = await setup()
    heroes.save = async () => {
      throw new Error('disk full')
    }
    await add('The Bank Job')
    expect(await screen.findByRole('alert')).toHaveTextContent("Your last change couldn't be saved: disk full")
  })
})

describe('issues on the Advancement page', () => {
  async function finished(hero: Hero = maya(), joined: Partial<JoinedGame> | null = null) {
    const heroes = new MemoryHeroStore()
    const games = new MemoryGameStore()
    const joinedStore = new MemoryJoinedStore()
    await heroes.save(hero)
    const game = finishIssue(addHero(createGame({ id: 'g1', name: 'Thursday game' }), hero, clock()), { title: 'The Gravelord Saga', summary: '', heroIds: [] }, clock())
    const offered = { ...game, issues: game.issues.map((i) => ({ ...i, offeredTo: [{ heroId: game.heroes[0]!.id, sourceId: hero.id, name: 'Maya Reyes' }] })) }
    if (joined) await joinedStore.save({ id: 'g1', room: 'ABCD-EFGH', gm: 'Sam', heroId: offered.heroes[0]!.id, heroSourceId: hero.id, sheet: hero, name: 'Alex', since: 'x', updatedAt: 'x', version: 1, table: project(offered, 'player', offered.heroes[0]!.id), ...joined })
    else await games.save(offered)
    render(
      <StoreContext.Provider value={heroes}>
        <GameStoreContext.Provider value={games}>
          <JoinedStoreContext.Provider value={joinedStore}>
            <AdvancementPage id="h1" clock={clock} />
          </JoinedStoreContext.Provider>
        </GameStoreContext.Provider>
      </StoreContext.Provider>,
    )
    await screen.findByRole('heading', { level: 1 })
    const saved = async () => {
      const r = await heroes.get('h1')
      if (r.status !== 'found') throw new Error('not saved')
      return r.hero
    }
    return { saved, joinedStore }
  }

  it('lists a finished issue as not recorded, and Add records it with the issue', async () => {
    const { saved } = await finished()
    await userEvent.click(await screen.findByRole('button', { name: 'Add The Gravelord Saga' }))
    expect(screen.getByText('Added. Maya Reyes has 1 of 6 back issues.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add The Gravelord Saga' })).not.toBeInTheDocument()
    await waitFor(async () => expect((await saved()).backIssues[0]).toMatchObject({ title: 'The Gravelord Saga', gameName: 'Thursday game', issueNumber: 1 }))
    expect(screen.getByText('The Gravelord Saga').closest('li')).toHaveTextContent('Thursday game · Issue 1')
  })

  it('asks about a collection at five and six', async () => {
    const { saved } = await finished(withIssues(6))
    await userEvent.click(await screen.findByRole('button', { name: 'Add The Gravelord Saga' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Maya Reyes already has six back issues' }))
    expect(dialog.getByRole('button', { name: 'Record collection and add' })).toBeDisabled()
    await userEvent.type(dialog.getByLabelText('Collection name'), 'The Arc')
    await userEvent.click(dialog.getByRole('button', { name: 'Record collection and add' }))
    await waitFor(async () => expect((await saved()).backIssues).toMatchObject([{ title: 'The Gravelord Saga' }]))
    expect((await saved()).collections[0]!.name).toBe('The Arc')
  })

  it('Dismiss on a game you run stays with the hero', async () => {
    const { saved } = await finished()
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss The Gravelord Saga' }))
    expect(screen.queryByRole('button', { name: 'Add The Gravelord Saga' })).not.toBeInTheDocument()
    await waitFor(async () => expect((await saved()).dismissedIssues).toHaveLength(1))
  })

  it('Dismiss on a joined game stays with the joined game', async () => {
    const { joinedStore } = await finished(maya(), {})
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss The Gravelord Saga' }))
    expect(screen.queryByRole('button', { name: 'Add The Gravelord Saga' })).not.toBeInTheDocument()
    await waitFor(async () => expect(Object.values((await joinedStore.get('g1'))!.issuePrompts ?? {})).toEqual(['dismissed']))
  })

  it('From an issue fills the title and carries the issue; one already held says so', async () => {
    const { saved } = await finished()
    const select = await screen.findByLabelText('From an issue')
    await waitFor(() => expect(within(select).getByRole('option', { name: /The Gravelord Saga/ })).toBeInTheDocument())
    const pick = () => userEvent.selectOptions(select, within(select).getByRole('option', { name: /The Gravelord Saga/ }))
    await pick()
    expect(screen.getByLabelText('Issue title')).toHaveValue('The Gravelord Saga')
    expect(screen.queryByLabelText('Game')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add back issue' }))
    await waitFor(async () => expect((await saved()).backIssues[0]).toMatchObject({ issueNumber: 1 }))
    await pick()
    await userEvent.click(screen.getByRole('button', { name: 'Add back issue' }))
    expect(screen.getByText('Already recorded.')).toBeInTheDocument()
    expect((await saved()).backIssues).toHaveLength(1)
  })
})

