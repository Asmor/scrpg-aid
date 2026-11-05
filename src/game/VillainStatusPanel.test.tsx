import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Clock } from '../play/state'
import { setHealth } from '../play/state'
import { adaptiveBruiser } from '../test/villains'
import { villainHealth } from '../villain/play'
import { createGame, type Game } from './model'
import { addGroup, addVillain, changeVillainPlay, setChallengeStep } from './table'
import { setHandCount, setStatusOverride, setWeakness } from './villain-status'
import { VillainStatusPanel, type VillainStatusActions } from './VillainStatusPanel'

const c: Clock = (() => {
  let n = 0
  return { now: new Date('2026-11-04T12:00:00Z'), newId: () => `id${++n}` }
})()

const start = (archetype: string, extra: (g: Game) => Game = (g) => g) => extra(addVillain(createGame({ id: 'g' }), { ...adaptiveBruiser(), id: 'v', details: { ...adaptiveBruiser().details, name: 'Gravelord' }, archetype: { id: archetype, abilities: [] } }, c, false))

function Panel({ initial }: { initial: Game }) {
  const [game, setGame] = useState(initial)
  const id = game.villains[0]!.id
  const actions: VillainStatusActions = {
    setOverride: (o) => setGame((g) => setStatusOverride(g, id, o)),
    setHandCount: (n) => setGame((g) => setHandCount(g, id, n, c)),
    setWeakness: (t, x) => setGame((g) => setWeakness(g, id, t, x, c)),
    setStep: (ch, i, done) => setGame((g) => setChallengeStep(g, ch.id, i, done, c)),
  }
  return <VillainStatusPanel game={game} copy={game.villains[0]!} actions={actions} />
}

const box = () => screen.getByRole('combobox', { name: 'Set the status die by hand' }).parentElement!

const shown = () => box().querySelector('strong')?.textContent

describe('VillainStatusPanel', () => {
  it('counted from the table: the rule, what was counted, the ladder with the current rung, and counting by hand', async () => {
    render(<Panel initial={start('overlord', (g) => addGroup(g, { kind: 'minions', name: 'Grave Guard', die: 'd8', count: 5, hidden: false }, c))} />)
    expect(screen.getByText('Overlord · by GM minions and lieutenants in the scene')).toBeInTheDocument()
    expect(screen.getByText(/Counted from the table: Grave Guard ×5 \(revealed only\)/)).toBeInTheDocument()
    const ladder = screen.getByRole('list', { name: 'Count to die' })
    const on = within(ladder).getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'true')
    expect(on).toHaveLength(1)
    expect(on[0]).toHaveTextContent('5–8')
    expect(shown()).toBe('d10')

    await userEvent.click(screen.getByRole('button', { name: 'One fewer' }))
    await userEvent.click(screen.getByRole('button', { name: 'One fewer' }))
    expect(screen.getByText('Counted by hand. The table says 5.')).toBeInTheDocument()
    expect(shown()).toBe('d8')

    await userEvent.click(screen.getByRole('button', { name: 'Back to automatic' }))
    expect(shown()).toBe('d10')
    expect(screen.queryByRole('button', { name: 'Back to automatic' })).not.toBeInTheDocument()
  })

  it('counted by hand: no way back, since there is no table count', async () => {
    render(<Panel initial={start('predator')} />)
    expect(screen.getByText('Heroes engaged with Gravelord')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'One more' }))
    await userEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(shown()).toBe('d8')
    expect(screen.queryByRole('button', { name: 'Back to automatic' })).not.toBeInTheDocument()
  })

  it('set by hand: the die wins and the rule details step aside until Back to automatic', async () => {
    render(<Panel initial={start('overlord')} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Set the status die by hand' }), 'd12')
    expect(shown()).toBe('d12')
    expect(screen.queryByRole('list', { name: 'Count to die' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to automatic' }))
    expect(screen.getByRole('list', { name: 'Count to die' })).toBeInTheDocument()
  })

  it('clearing the select keeps a count by hand', async () => {
    render(<Panel initial={start('overlord')} />)
    await userEvent.click(screen.getByRole('button', { name: 'One more' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Set the status die by hand' }), 'd12')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Set the status die by hand' }), '')
    expect(screen.getByText('Counted by hand. The table says 0.')).toBeInTheDocument()
  })

  it('Health zone: the three zones, the current one marked', () => {
    const g = start('bruiser')
    const v = g.villains[0]!
    const { healthRanges } = villainHealth(v.sheet, v.play)
    render(<Panel initial={changeVillainPlay(g, v.id, (p, s) => setHealth(p, villainHealth(s, p), healthRanges!.yellow[1], c), c)} />)
    const list = screen.getByRole('list', { name: 'Zone to die' })
    const on = within(list).getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'true')
    expect(on[0]).toHaveTextContent(/yellow/i)
    expect(screen.getByText("Follows Gravelord's own Health zone. Damage changes it.")).toBeInTheDocument()
  })

  it('weakness: three radios that set the die', async () => {
    render(<Panel initial={start('formidable')} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios[2]).toBeChecked()
    expect(shown()).toBe('d12')
    await userEvent.click(radios[0]!)
    expect(shown()).toBe('d4')
  })

  it("challenge: checking its steps moves the die", async () => {
    render(<Panel initial={start('titan')} />)
    expect(screen.getByText('On the table')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Take advantage of the exposed weakness' }))
    expect(shown()).toBe('d10')
  })

  it('challenge: says so when there is none', () => {
    render(<Panel initial={start('titan', (g) => ({ ...g, challenges: [] }))} />)
    expect(screen.getByText("Its challenge isn't on the table.")).toBeInTheDocument()
  })

  it('fixed: nothing to do', () => {
    render(<Panel initial={start('indomitable')} />)
    expect(screen.getByText('Indomitable: always d8. Nothing on the table changes it.')).toBeInTheDocument()
  })

  it('shows nothing before it has an archetype', () => {
    const g = addVillain(createGame({ id: 'g' }), { ...adaptiveBruiser(), id: 'v', archetype: null }, c, false)
    const { container } = render(<Panel initial={g} />)
    expect(container).toBeEmptyDOMElement()
  })
})
