import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { DisplayView } from './DisplayView'
import { createGame, type Game } from './model'
import { project } from './project'
import { addChallenge, addGroup, addHero, addVillain, setHidden, setPlayersSee, startRound } from './table'

let n = 0
const clock = () => ({ now: new Date('2026-11-03T21:00:00Z'), newId: () => `id${++n}` })
const maya = (): Hero => ({ ...completeHero(), id: 'maya-src', details: { ...completeHero().details, name: 'Maya Reyes' } })

function game(): Game {
  let g = createGame({ id: 'g', name: 'Thursday game' })
  g = { ...g, scenes: g.scenes.map((s) => ({ ...s, name: 'The Foundry' })) }
  g = addHero(g, maya(), clock(), { clientId: 'c1', name: 'Alex', since: '2026-11-03T21:00:00Z' })
  g = addVillain(g, { ...adaptiveBruiser(), id: 'gravelord' }, clock())
  const villain = g.villains[0]!
  g = setHidden(g, { kind: 'villain', id: villain.id }, false, clock())
  g = setPlayersSee(g, villain.id, 'name')
  g = addGroup(g, { kind: 'minions', name: 'Scrap drones', die: 'd6', count: 2, hidden: false }, clock())
  g = addGroup(g, { kind: 'lieutenants', name: 'Secret choir', die: 'd8', count: 1, hidden: true }, clock())
  g = addChallenge(g, { name: 'Shut down the crucible', steps: 3, hidden: false }, clock())
  return startRound(g, { kind: 'hero', id: g.heroes[0]!.id }, clock())
}

describe('the display view', () => {
  it('shows the table as an observer receives it, at room scale, with nothing to click', () => {
    const { container } = render(<DisplayView table={project(game(), 'observer')} watching="Watching Thursday game · ABCD-EFGH" />)
    expect(screen.getByRole('heading', { name: 'The Foundry' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Scene tracker at Green 1 of 8$/ })).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    const strip = screen.getByRole('list', { name: 'Turn order this round' })
    expect(within(strip).getByText(/Maya Reyes/)).toHaveTextContent('acting now')
    const hero = screen.getByRole('article', { name: 'Maya Reyes' })
    expect(hero).toHaveTextContent('Alex')
    expect(hero.className).toContain('dv-card--acting')
    // Name only: the condition is kept secret.
    expect(screen.getByRole('article', { name: 'Ironclad' })).toHaveTextContent('The GM is keeping its condition secret.')
    const drones = screen.getByRole('article', { name: 'Scrap drones' })
    expect(within(drones).getByAltText('d6')).toBeInTheDocument()
    expect(drones).toHaveTextContent('× 2')
    expect(screen.getByRole('article', { name: 'Shut down the crucible' })).toHaveTextContent('0 of 3 done')
    // Hidden items never reach observers.
    expect(screen.queryByText('Secret choir')).not.toBeInTheDocument()
    expect(screen.getByText('Watching Thursday game · ABCD-EFGH')).toBeInTheDocument()
    expect(container.querySelectorAll('button, a, input, select, textarea, [tabindex]')).toHaveLength(0)
  })

  it('shows the latest log line and the connection status in the footer', () => {
    const table = project(game(), 'observer')
    render(<DisplayView table={table} watching="Watching" status="Reconnecting to the GM…" />)
    expect(screen.getByText(table.feed.at(-1)!.text)).toBeInTheDocument()
    expect(screen.getByText('Reconnecting to the GM…')).toBeInTheDocument()
  })
})
