import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createGame, heroCopy, type ActorRef, type Game } from './model'
import { actorColors } from './colors'
import { heroOnTableName, project, viewName } from './project'
import { addChallenge, addGroup, addVillain } from './table'
import { TurnStrip } from './TurnStrip'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { heroView } from './views'

const clock = { now: new Date('2026-11-05T12:00:00Z'), newId: () => crypto.randomUUID() }

function table(change: (g: Game) => Game = (g) => g): Game {
  let g = createGame({ id: 'g' })
  g = { ...g, heroes: [heroCopy({ ...completeHero(), id: 'a', details: { ...completeHero().details, name: 'Paradigm' }, appearance: { primary: 'cyan', secondary: 'pink', gradient: 'radial' } }, 'h1'), heroCopy({ ...completeHero(), id: 'b', details: { ...completeHero().details, name: 'Duality' } }, 'h2')] }
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v1', details: { ...adaptiveBruiser().details, name: 'Gravelord' }, appearance: { primary: 'purple' } }, clock, false)
  g = addGroup(g, { kind: 'minions', name: 'Burglars', die: 'd6', count: 2, hidden: false }, clock)
  return change(g)
}

const strip = (g: Game) => {
  const view = project(g, 'gm')
  render(<TurnStrip game={view} name={(ref: ActorRef) => viewName(view, ref, heroOnTableName)} />)
  return within(screen.getByRole('list', { name: 'Turn order this round' }))
}
const turn = (g: Game, acted: ActorRef[], current?: ActorRef): Game => ({ ...g, round: 1, turn: { order: [{ kind: 'hero', id: 'h1' }, { kind: 'hero', id: 'h2' }, { kind: 'villain', id: g.villains[0]!.id }], acted, ...(current ? { current } : {}) } })

describe('what colors an actor has', () => {
  it('reads each kind, with sides following who owns it', () => {
    const g = table()
    const view = project(g, 'gm')
    expect(actorColors(view, { kind: 'hero', id: 'h1' })).toEqual({ side: 'heroes', appearance: { primary: 'cyan', secondary: 'pink', gradient: 'radial' } })
    expect(actorColors(view, { kind: 'hero', id: 'h2' })).toEqual({ side: 'heroes', appearance: { primary: 'blue' } })
    expect(actorColors(view, { kind: 'villain', id: g.villains[0]!.id })).toEqual({ side: 'gm', appearance: { primary: 'purple' } })
    expect(actorColors(view, { kind: 'group', id: g.groups[0]!.id })).toEqual({ side: 'gm', appearance: { primary: 'red' } })
    expect(actorColors({ ...view, environment: { id: 'e', name: 'E', hidden: false } }, { kind: 'environment', id: 'e' })).toEqual({ side: 'environment', appearance: { primary: 'green' } })
  })

  it('reach players and observers, whatever else they see of a villain', () => {
    const g = table()
    const named = { ...g, villains: g.villains.map((v) => ({ ...v, playersSee: 'name' as const })) }
    expect(project(named, 'player').villains[0]!.appearance).toEqual({ primary: 'purple' })
    expect(project(named, 'observer').villains[0]!.appearance).toEqual({ primary: 'purple' })
  })

  it('reach the card', () => {
    const g = table()
    expect(heroView(g.heroes[0]!, project(g, 'gm')).appearance).toEqual({ primary: 'cyan', secondary: 'pink', gradient: 'radial' })
  })
})

describe('the turn strip', () => {
  it('names each by actor and side, never by color', () => {
    const list = strip(turn(table(), [{ kind: 'hero', id: 'h1' }], { kind: 'hero', id: 'h2' }))
    const items = list.getAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual(['Paradigm, heroes, has acted', 'Duality, heroes, acting now', expect.stringMatching(/^Gravelord, GM side$/)])
  })

  it('shows side shapes, a grey ring and check once acted, with nothing faded', () => {
    const g = turn(table(), [{ kind: 'hero', id: 'h1' }], { kind: 'villain', id: table().villains[0]?.id ?? '' })
    const list = strip(g)
    const acted = list.getByText('Paradigm').closest('.char-chip') as HTMLElement
    expect(acted).toHaveClass('char-chip--heroes')
    expect(acted.style.getPropertyValue('--char-side')).toBe('var(--ui-muted)')
    expect(acted.querySelector('svg')).not.toBeNull()
    const waiting = list.getByText('Duality').closest('.char-chip') as HTMLElement
    expect(waiting.style.getPropertyValue('--char-side')).toBe('var(--char-blue)')
    expect(waiting.querySelector('svg')).toBeNull()
    expect(list.getByText('Gravelord').closest('.char-chip')).toHaveClass('char-chip--gm')
  })

  it('puts a divider between the acted and the rest, only when there are both', () => {
    const v = (g: Game) => g.villains[0]!.id
    const none = table()
    const { unmount } = render(<div />)
    unmount()
    let list = strip(turn(none, []))
    expect(screen.getByRole('list').querySelector('.turn-strip__divider')).toBeNull()
    expect(list.getAllByRole('listitem')).toHaveLength(3)
    screen.getByRole('list').parentElement!.remove()
    list = strip(turn(none, [{ kind: 'hero', id: 'h1' }]))
    expect(screen.getByRole('list').querySelector('.turn-strip__divider')).not.toBeNull()
    screen.getByRole('list').parentElement!.remove()
    strip(turn(none, [{ kind: 'hero', id: 'h1' }, { kind: 'hero', id: 'h2' }, { kind: 'villain', id: v(none) }]))
    expect(screen.getByRole('list').querySelector('.turn-strip__divider')).toBeNull()
  })

  it('puts the chevron over the acting chip, on whichever row it wrapped to', () => {
    const offsets = { offsetLeft: 200, offsetTop: 90, offsetWidth: 100 }
    const restore = Object.entries(offsets).map(([key, value]) => {
      const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)!
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value })
      return () => Object.defineProperty(HTMLElement.prototype, key, before)
    })
    strip(turn(table(), [], { kind: 'hero', id: 'h2' }))
    const chevron = screen.getByRole('list').querySelector<HTMLElement>('.turn-strip__chevron')!
    expect(chevron.style.transform).toBe('translate(250px, 72px)')
    restore.forEach((r) => r())
  })

  it('shows no chevron when nobody is acting', () => {
    strip(turn(table(), []))
    expect(screen.getByRole('list').querySelector('.turn-strip__chevron')).toBeNull()
  })

  it('keeps challenges out, as they never act', () => {
    const g = addChallenge(table(), { name: 'Furnace', steps: 2, hidden: false }, clock)
    expect(strip(turn(g, [])).queryByText('Furnace')).not.toBeInTheDocument()
  })
})
