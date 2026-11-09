/**
 * A view that fails `tableViewProblem` is dropped by every player, so whatever the game holds,
 * `fitView(project(...))` must pass it (review 2026-11-09, item 1).
 */
import { describe, expect, it } from 'vitest'
import { applyHeroAction } from '../game/actions'
import { createGame, type Game } from '../game/model'
import { project } from '../game/project'
import { addChallenge, addGroup, addHero, addVillain, changeHeroPlay, changeVillainPlay, setEnvironment } from '../game/table'
import { defend } from '../game/hits'
import type { Hero } from '../hero/model'
import { addTwist, type Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { cut, fitView, MAX_NAME, MAX_TEXT, tableViewProblem, VIEW_FEED, VIEW_LIMITS } from './protocol'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-09T12:00:00Z'), newId: () => `id${++n}` }
}

const long = (n: number) => 'x'.repeat(n)
const hero = (i: number, name = `Hero ${i}`): Hero => ({ ...completeHero(), id: `src-${i}`, details: { ...completeHero().details, name } })

function withPlayer(c: Clock): Game {
  return addHero(createGame({ id: 'g' }), hero(0, 'Maya Reyes'), c, { clientId: 'c0', name: 'Alex', since: '2026-11-09T11:00:00Z' })
}

const problems = (g: Game) => (['player', 'observer'] as const).map((a) => tableViewProblem(fitView(project(g, a, g.heroes[0]?.id)))).filter(Boolean)

describe('fitView', () => {
  it('keeps a twist of almost 2,000 characters readable: its log line is cut, not the view', () => {
    const c = clock()
    let g = withPlayer(c)
    const heroId = g.heroes[0]!.id
    const result = applyHeroAction(g, heroId, { kind: 'addTwist', twist: { kind: 'minor', text: long(1990) } }, { basedOn: 0, versions: {}, random: () => 0.5 }, c)
    expect(result.ok).toBe(true)
    g = (result as { game: Game }).game
    // Unfitted, the log line is over the limit, which froze every player before.
    expect(tableViewProblem(project(g, 'player', heroId))).toBeDefined()
    expect(problems(g)).toEqual([])
    const line = fitView(project(g, 'player', heroId)).feed.at(-1)!.text
    expect(line).toHaveLength(MAX_TEXT)
    expect(line.endsWith('…')).toBe(true)
  })

  it('keeps the newest defenses when a villain holds more than the view carries', () => {
    const c = clock()
    let g = addVillain(withPlayer(c), adaptiveBruiser(), c, false, undefined, 'status')
    const villainId = g.villains[0]!.id
    for (let i = 1; i <= 25; i++) g = defend(g, { kind: 'villain', id: villainId }, i, 'Gravelord', c)
    expect(problems(g)).toEqual([])
    const view = fitView(project(g, 'player', g.heroes[0]!.id))
    expect(view.villains[0]!.defenses).toHaveLength(VIEW_LIMITS.defenses)
    expect(view.villains[0]!.defenses!.at(-1)!.value).toBe(25)
  })

  it('carries a game with more of everything, and longer text, than a view may hold', () => {
    const c = clock()
    let g = withPlayer(c)
    for (let i = 1; i < VIEW_LIMITS.heroes + 5; i++) g = addHero(g, hero(i, long(MAX_NAME + 50)), c)
    for (let i = 0; i < VIEW_LIMITS.villains + 5; i++) g = addVillain(g, { ...adaptiveBruiser(), id: `v${i}`, details: { ...adaptiveBruiser().details, name: long(MAX_NAME + 50) } }, c, false, undefined, 'health')
    for (let i = 0; i < VIEW_LIMITS.groups + 5; i++) g = addGroup(g, { kind: 'minions', name: long(MAX_NAME + 50), die: 'd6', count: 2, hidden: false }, c)
    for (let i = 0; i < VIEW_LIMITS.challenges + 5; i++) g = addChallenge(g, { name: long(MAX_NAME + 50), steps: 3, hidden: false }, c)
    g = setEnvironment(g, { name: long(MAX_NAME + 50), hidden: false, description: long(MAX_TEXT + 50) }, c)
    g = changeVillainPlay(g, g.villains[0]!.id, (p) => addTwist(p, { kind: 'major', text: long(MAX_TEXT + 50) }, c), c)
    g = changeHeroPlay(g, g.heroes[0]!.id, (p) => addTwist(p, { kind: 'minor', text: long(MAX_TEXT + 50) }, c), c)
    g = { ...g, name: long(MAX_NAME + 50), feed: [...g.feed, { id: 'x', at: c.now.toISOString(), by: long(MAX_NAME + 50), text: long(MAX_TEXT + 50), details: Array.from({ length: 60 }, () => long(MAX_TEXT + 5)) }] }
    expect(g.feed.length).toBeGreaterThan(VIEW_FEED)
    expect(problems(g)).toEqual([])
    const view = fitView(project(g, 'player', g.heroes[0]!.id))
    expect(view.heroes).toHaveLength(VIEW_LIMITS.heroes)
    expect(view.villains).toHaveLength(VIEW_LIMITS.villains)
    expect(view.groups).toHaveLength(VIEW_LIMITS.groups)
    expect(view.challenges).toHaveLength(VIEW_LIMITS.challenges)
  })

  it('leaves a view within the limits as it is', () => {
    const c = clock()
    const view = project(withPlayer(c), 'player')
    expect(fitView(view)).toEqual(view)
  })
})

describe('cut', () => {
  it('ends cut text in an ellipsis, within the limit', () => {
    expect(cut('abcdef', 4)).toBe('abc…')
    expect(cut('abcd', 4)).toBe('abcd')
  })
})
