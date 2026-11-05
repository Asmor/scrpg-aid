import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PopoverGroup } from '../library/Popover'
import type { Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { applyHeroAction } from './actions'
import { createGame, type Game } from './model'
import { project } from './project'
import { addChallenge, addHero, addVillain, overcomeOptions, setChallengeStep, setHidden } from './table'
import { TableCenter, type GmControls } from './TableCenter'

const c: Clock = (() => {
  let n = 0
  return { now: new Date('2026-11-04T12:00:00Z'), newId: () => `id${++n}` }
})()

function game(): Game {
  let g = addHero(createGame({ id: 'g' }), { ...completeHero(), id: 'a', details: { ...completeHero().details, name: 'Maya Reyes' } }, c, { clientId: 'c1', name: 'Alex' })
  g = addChallenge(g, { name: 'Shut down the furnace', steps: 3, hidden: false, labels: ['Seal the gas line', 'Vent the pressure', 'Kill the main burner'], description: 'It will blow.', whenDone: 'The furnace sputters out.' }, c)
  g = setChallengeStep(g, g.challenges[0]!.id, 0, true, c)
  const r = applyHeroAction(g, g.heroes[0]!.id, { kind: 'overcomeChallenge', challengeId: g.challenges[0]!.id, total: 9, trait: 'Agility' }, { basedOn: 0, versions: {} }, c)
  if (!r.ok) throw new Error(r.reason)
  return r.game
}

const controls = (over: Partial<GmControls> = {}): GmControls =>
  ({ sceneMenu: [], turnMenu: [], heroMenu: () => [], itemMenu: () => [], sheets: false, setStep: vi.fn(), answerRequest: vi.fn(), reveal: vi.fn(), ...over }) as unknown as GmControls

const draw = (g: Game, audience: 'gm' | 'player' | 'observer', gm?: GmControls) =>
  render(
    <PopoverGroup>
      <TableCenter game={project(g, audience, audience === 'player' ? g.heroes[0]?.id : undefined)} heroes={[]} villains={[]} now={new Date('2026-11-04T12:00:00Z')} {...(gm ? { gm } : {})} hideLog />
    </PopoverGroup>,
  )

const card = () => screen.getByRole('article', { name: 'Shut down the furnace' })

describe('the challenge card', () => {
  it("shows the GM the outcome table's reading of a request", () => {
    draw(game(), 'gm', controls())
    expect(within(card()).getByText('Full success')).toBeInTheDocument()
  })

  it('a finished challenge with no "when it\'s done" text has no Done line', () => {
    let g = addChallenge(createGame({ id: 'g' }), { name: 'Shut down the furnace', steps: 1, hidden: false }, c)
    g = setChallengeStep(g, g.challenges[0]!.id, 0, true, c)
    draw(g, 'gm', controls())
    expect(within(card()).getByText('Done')).toBeInTheDocument()
    expect(within(card()).queryByText('Done.')).toBeNull()
  })

  it("the GM's: checkboxes, progress, and a request with Check off and Not this time", async () => {
    const gm = controls()
    draw(game(), 'gm', gm)
    const within_ = within(card())
    expect(within_.getByText('1 of 3')).toBeInTheDocument()
    expect(within_.getByRole('checkbox', { name: 'Seal the gas line' })).toBeChecked()
    expect(within_.getByRole('group', { name: 'Overcome from Maya Reyes' })).toHaveTextContent('Maya Reyes rolled 9 to Overcome on this challenge, using Agility.')
    const check = within_.getByRole('button', { name: 'Check off Vent the pressure for Maya Reyes' })
    expect(check).toHaveTextContent('Check off "Vent the pressure"')
    await userEvent.click(check)
    expect(gm.answerRequest).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shut down the furnace' }), expect.any(String), true)
    await userEvent.click(within_.getByRole('button', { name: 'Not this time for Maya Reyes' }))
    expect(gm.answerRequest).toHaveBeenLastCalledWith(expect.anything(), expect.any(String), false)
    await userEvent.click(within_.getByRole('checkbox', { name: 'Vent the pressure' }))
    expect(gm.setStep).toHaveBeenCalledWith(expect.anything(), 1, true)
  })

  it("a player's: read-only, state in text, and their own waiting line", () => {
    draw(game(), 'player')
    expect(within(card()).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(card()).queryByRole('button')).not.toBeInTheDocument()
    const items = within(card()).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Seal the gas line, done')
    expect(items[1]).toHaveTextContent('Vent the pressure, not done')
    expect(within(card()).getByText('Waiting for the GM: your Overcome (9).')).toBeInTheDocument()
    expect(within(card()).queryByText(/sputters/)).not.toBeInTheDocument()
  })

  it('an observer sees no one waiting', () => {
    draw(game(), 'observer')
    expect(within(card()).queryByText(/Waiting for the GM/)).not.toBeInTheDocument()
  })

  it('done: the pill, the text for everyone, and nothing left to answer', () => {
    let g = game()
    const id = g.challenges[0]!.id
    g = setChallengeStep(setChallengeStep(g, id, 1, true, c), id, 2, true, c)
    draw(g, 'player')
    expect(within(card()).getByText('Done')).toHaveClass('gt-progress--done')
    expect(card()).toHaveTextContent('Done. The furnace sputters out.')
    expect(within(card()).queryByText(/Waiting/)).not.toBeInTheDocument()
  })

  it("a Titan's says what it's linked to, to the GM, with no Reveal of its own", () => {
    const titan = { ...adaptiveBruiser(), id: 'v', details: { ...adaptiveBruiser().details, name: 'Gravelord' }, archetype: { id: 'titan', abilities: [] } }
    let g = addVillain(createGame({ id: 'g' }), titan, c, true)
    const { unmount } = draw(g, 'gm', controls())
    const article = screen.getByRole('article', { name: "Gravelord's Titan challenge" })
    expect(within(article).getByText("Linked to Gravelord's status die")).toBeInTheDocument()
    expect(within(article).queryByRole('button', { name: 'Reveal' })).not.toBeInTheDocument()
    unmount()
    g = setHidden(g, { kind: 'villain', id: g.villains[0]!.id }, false, c)
    draw(g, 'player')
    expect(screen.queryByText(/Linked to/)).not.toBeInTheDocument()
  })
})

describe('overcomeOptions', () => {
  it('lists challenges not yet done, with progress', () => {
    let g = game()
    expect(overcomeOptions(project(g, 'player', g.heroes[0]!.id).challenges)).toEqual([{ id: g.challenges[0]!.id, label: 'Challenge: Shut down the furnace (1 of 3)' }])
    const id = g.challenges[0]!.id
    g = setChallengeStep(setChallengeStep(g, id, 1, true, c), id, 2, true, c)
    expect(overcomeOptions(project(g, 'player', g.heroes[0]!.id).challenges)).toEqual([])
  })
})
