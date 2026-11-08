import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import type { Clock } from '../play/state'
import { tableViewProblem } from '../session/protocol'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import type { Villain } from '../villain/model'
import { createGame, type Game } from './model'
import { project, VIEW_HISTORY, viewName } from './project'
import { addChallenge, addGroup, addHero, addMemberMod, addVillain, changeHeroPlay, changeVillainPlay, handOff, setEnvironment, setHidden, setPlayersSee, startRound } from './table'
import { logEnvironmentRoll, rollAspects } from './environment'
import { setHealth } from '../play/state'
import { villainHealth } from '../villain/play'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

const villain = (id: string, name: string): Villain => ({ ...adaptiveBruiser(), id, details: { ...adaptiveBruiser().details, name } })

/** Every hidden thing a game can hold: a hidden villain, group, challenge and environment, notes, a sync request, GM-only lines. */
function secretive(): Game {
  const c = clock()
  const maya: Hero = { ...completeHero(), id: 'maya-src', details: { ...completeHero().details, name: 'Maya Reyes' } }
  let g = createGame({ id: 'g' })
  g = addHero(g, maya, c, { clientId: 'secret-client', name: 'Alex', since: '2026-10-30T20:00:00Z' })
  g = addVillain(g, villain('v-shown', 'Gravelord'), c, false)
  g = addVillain(g, villain('v-hidden', 'Shadow'), c, true)
  g = addGroup(g, { kind: 'minions', name: 'Hidden drones', die: 'd6', count: 2, hidden: true }, c)
  g = addGroup(g, { kind: 'lieutenants', name: 'Guards', die: 'd8', count: 1, hidden: false }, c)
  g = addChallenge(g, { name: 'Secret vault', steps: 3, hidden: true }, c)
  g = setEnvironment(g, { name: 'The Foundry', hidden: true }, c)
  const hiddenVillain = g.villains.find((v) => v.hidden)!
  g = changeVillainPlay(g, hiddenVillain.id, (p, s) => setHealth(p, villainHealth(s, p), 10, c), c)
  g = { ...g, notes: 'Rust Hound arrives at Yellow', pendingSyncs: [{ heroId: g.heroes[0]!.id, sheet: maya, at: '2026-11-03T12:00:00Z' }] }
  return g
}

const hiddenIds = (g: Game) => [...g.villains.filter((v) => v.hidden), ...g.groups.filter((x) => x.hidden), ...g.challenges.filter((x) => x.hidden), ...(g.environment?.hidden ? [g.environment] : [])].map((x) => x.id)

describe('project', () => {
  it('leaves out every hidden item, notes, sync requests, GM-only lines and client ids for players and observers', () => {
    const game = secretive()
    // A scene's reference sheet arrangement is the GM's alone.
    game.scenes = game.scenes.map((s) => ({ ...s, sheetLayout: { pages: [], cards: [{ ref: { kind: 'group', id: 'layout-secret' } }], omitted: [] } }))
    expect(hiddenIds(game)).toHaveLength(4)
    for (const audience of ['player', 'observer'] as const) {
      const view = project(game, audience)
      const json = JSON.stringify(view)
      for (const id of hiddenIds(game)) expect(json).not.toContain(id)
      expect(json).not.toContain('Shadow')
      expect(json).not.toContain('Rust Hound')
      expect(json).not.toContain('secret-client')
      expect(json).not.toContain('layout-secret')
      expect(view).not.toHaveProperty('notes')
      expect(view).not.toHaveProperty('pendingSyncs')
      expect(view.feed.some((e) => e.gmOnly)).toBe(false)
      expect(view.heroes[0]!.player).toEqual({ name: 'Alex', since: '2026-10-30T20:00:00Z' })
      expect(tableViewProblem(view)).toBeUndefined()
    }
  })

  describe('who sees log lines', () => {
    const texts = (g: Game) => project(g, 'player').feed.map((e) => e.text)

    it("keeps a hidden group's lines from players, and shares its lines after it's revealed; earlier ones stay the GM's", () => {
      const c = clock()
      let g = addGroup(createGame({ id: 'g' }), { kind: 'minions', name: 'Drones', die: 'd6', count: 1, hidden: true }, c)
      const drones = g.groups[0]!
      g = addMemberMod(g, drones.id, drones.members[0]!.id, { label: 'Dazed', value: -1 }, c)
      expect(texts(g)).toEqual([])
      g = setHidden(g, { kind: 'group', id: drones.id }, false, c)
      g = addMemberMod(g, drones.id, drones.members[0]!.id, { label: 'Slowed', value: -2 }, c)
      expect(texts(g)).toEqual(['The GM revealed Drones.', "Drones 1 gained '-2 Slowed' penalty."])
      expect(project(g, 'gm').feed.filter((e) => e.gmOnly).map((e) => e.text)).toEqual(['The GM added Drones (1 d6 minion), hidden from players.', "Drones 1 gained '-1 Dazed' penalty."])
    })

    it("shares the environment's lines: it's always known", () => {
      const c = clock()
      let g = setEnvironment(createGame({ id: 'g' }), { name: 'Docks', hidden: true, aspects: [{ name: 'Fog', die: 'd6' }, { name: 'Cranes', die: 'd8' }, { name: 'Tide', die: 'd10' }] }, c)
      g = logEnvironmentRoll(g, rollAspects(g.environment!.aspects!, () => 0)!, c)
      expect(texts(g)).toEqual(['Rolled the environment dice: Min 1 (Fog), Mid 1 (Cranes), Max 1 (Tide).'])
    })
  })

  it("keeps a lieutenant's abilities for the GM", () => {
    const c = clock()
    const abilities = [{ name: 'Sturdy', type: 'I' as const, text: 'Add 2 to damage saves.', saveBonus: 2 }]
    const g = addGroup(createGame({ id: 'g' }), { kind: 'lieutenants', name: 'Siege Crawler', die: 'd10', count: 1, hidden: false, abilities }, c)
    expect(project(g, 'gm').groups[0]!.abilities).toEqual(abilities)
    expect(project(g, 'player').groups[0]).not.toHaveProperty('abilities')
    expect(tableViewProblem(project(g, 'player'))).toBeUndefined()
  })

  it('drops hidden actors from the turn order, and who is acting when they are', () => {
    const c = clock()
    let game = secretive()
    game = { ...game, turn: { ...game.turn, order: [...game.turn.order, { kind: 'villain', id: game.villains.find((v) => v.hidden)!.id }] } }
    game = startRound(game, { kind: 'hero', id: game.heroes[0]!.id }, c)
    const secret = { kind: 'villain' as const, id: game.villains.find((v) => v.hidden)!.id }
    game = handOff(game, secret, c)
    const view = project(game, 'player')
    expect(view.turn.order.some((o) => o.id === secret.id)).toBe(false)
    expect(view.turn.current).toBeUndefined()
    expect(view.turn.acted).toEqual([{ kind: 'hero', id: game.heroes[0]!.id }])
  })

  it("holds back a villain's Health, zone, mods and status die as What players see says", () => {
    const c = clock()
    let game = secretive()
    const shown = game.villains.find((v) => !v.hidden)!
    game = changeVillainPlay(game, shown.id, (p, s) => setHealth(p, villainHealth(s, p), 20, c), c)
    game = changeVillainPlay(game, shown.id, (p) => ({ ...p, mods: [{ id: 'm', label: 'Pinned', value: -2 }] }), c, false)
    const card = (g: Game) => project(g, 'player').villains.find((v) => v.id === shown.id)!

    // Status (the default): zone and mods, no Health, never the status die.
    expect(shown.playersSee).toBe('status')
    expect(card(game)).not.toHaveProperty('health')
    expect(card(game)).not.toHaveProperty('maxHealth')
    expect(card(game)).not.toHaveProperty('statusDie')
    expect(card(game).zone).toBeDefined()
    expect(card(game).mods).toEqual([{ id: 'm', label: 'Pinned', value: -2 }])

    const health = setPlayersSee(game, shown.id, 'health')
    expect(card(health)).toMatchObject({ health: 20 })
    expect(card(health).maxHealth).toBeDefined()
    expect(card(health)).not.toHaveProperty('statusDie')

    const name = setPlayersSee(game, shown.id, 'name')
    expect(card(name)).toEqual({ id: shown.id, name: 'Gravelord', major: expect.any(Boolean), hidden: false, playersSee: 'name' })
    expect(JSON.stringify(project(name, 'player'))).not.toContain('Pinned')

    // The GM sees everything.
    expect(project(name, 'gm').villains.find((v) => v.id === shown.id)).toMatchObject({ health: 20, mods: [{ label: 'Pinned' }] })
    expect(project(name, 'gm').villains.find((v) => v.id === shown.id)!.statusDie).toBeDefined()
  })

  it("never sends a villain's sheet, only what its card shows", () => {
    const view = project(secretive(), 'player')
    expect(view.villains[0]).not.toHaveProperty('sheet')
    expect(view.villains[0]).not.toHaveProperty('play')
  })

  it('keeps everything heroes show, sheet included, with the latest history only', () => {
    const c = clock()
    let game = secretive()
    const id = game.heroes[0]!.id
    for (let i = 0; i < VIEW_HISTORY + 5; i++) game = changeHeroPlay(game, id, (p) => ({ ...p, history: [...p.history, { id: `h${i}`, at: '2026-11-03T12:00:00Z', text: `Line ${i}` }] }), c, false)
    const hero = project(game, 'player').heroes[0]!
    expect(hero.sheet.details.name).toBe('Maya Reyes')
    expect(hero.play.history).toHaveLength(VIEW_HISTORY)
    expect(hero.play.history.at(-1)!.text).toBe(`Line ${VIEW_HISTORY + 4}`)
  })

  it('shows the GM hidden items, marked hidden', () => {
    const game = secretive()
    const view = project(game, 'gm')
    for (const id of hiddenIds(game)) expect(JSON.stringify(view)).toContain(id)
    expect(view.environment).toMatchObject({ hidden: true })
    expect(view.feed.some((e) => e.gmOnly)).toBe(true)
  })

  it('names actors from the view', () => {
    const game = secretive()
    const view = project(game, 'gm')
    const heroName = (h: (typeof view.heroes)[number]) => h.sheet.details.name
    expect(viewName(view, { kind: 'hero', id: game.heroes[0]!.id }, heroName)).toBe('Maya Reyes')
    expect(viewName(view, { kind: 'villain', id: 'nope' }, heroName)).toBe('A villain')
    expect(viewName(view, { kind: 'environment', id: game.environment!.id }, heroName)).toBe('The Foundry')
    expect(viewName(view, { kind: 'group', id: game.groups[1]!.id }, heroName)).toBe('Guards')
  })
})
