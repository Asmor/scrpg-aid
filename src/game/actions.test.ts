import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import type { Hero } from '../hero/model'
import { playAbilities, playForms } from '../play/forms'
import type { RollRecord } from '../play/roll'
import { currentHealth, effectiveZone, type Clock } from '../play/state'
import { completeHero, formChangerHero, minionMakerHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { applyHeroAction, healthField, trackChanges, type ActionContext, type HeroAction, type RollAction } from './actions'
import { createGame, type Game } from './model'
import { addGroup, addHero, addVillain, setHidden, startRound, handOff } from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

const named = (h: Hero, id: string, name: string): Hero => ({ ...h, id, details: { ...h.details, name } })
const fresh: ActionContext = { basedOn: 0, versions: {} }

/** A game with Maya (a player's) and Alex's hero, a revealed villain, a hidden villain and a revealed group. */
function table(base: Hero = completeHero()) {
  const c = clock()
  let g = createGame({ id: 'g' })
  g = addHero(g, named(base, 'maya-src', 'Maya Reyes'), c, { clientId: 'p1', name: 'Alex' })
  g = addHero(g, named(completeHero(), 'jo-src', 'Jo'), c, { clientId: 'p2', name: 'Sam' })
  g = addVillain(g, adaptiveBruiser(), c, false)
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v2', details: { ...adaptiveBruiser().details, name: 'Secret' } }, c, true)
  g = addGroup(g, { kind: 'minions', name: 'Drones', die: 'd6', count: 2, hidden: false }, c)
  const [maya, jo] = g.heroes.map((h) => h.id) as [string, string]
  return { g, c, maya, jo }
}

function apply(game: Game, heroId: string, action: HeroAction, ctx: ActionContext = fresh) {
  return applyHeroAction(game, heroId, action, ctx, clock())
}

const hero = (g: Game, id: string) => g.heroes.find((h) => h.id === id)!
const health = (g: Game, id: string) => currentHealth(buildSheet(hero(g, id).sheet), hero(g, id).play)

const record = (title = 'Attack'): RollRecord => ({ title, rolled: [{ label: 'Speed', die: 'd8', value: 5 }], results: [], manual: false })
const roll = (subject: RollAction['subject'], extra: Partial<RollAction> = {}): HeroAction => ({ kind: 'roll', roll: { subject, record: record(), selfMods: [], minionMods: [], others: [], made: [], attacks: [], ...extra } })

describe('applying a player action', () => {
  it('changes Health by an amount and logs it under the hero', () => {
    const { g, maya } = table()
    const max = health(g, maya)!
    const r = apply(g, maya, { kind: 'health', by: -4 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(health(r.game, maya)).toBe(max - 4)
    expect(r.game.feed.at(-1)).toMatchObject({ by: 'Maya Reyes' })
  })

  it('refuses setting Health when it changed after the state the player saw, and allows a change by an amount', () => {
    const { g, maya } = table()
    const changed = apply(g, maya, { kind: 'health', by: -2 })
    if (!changed.ok) throw new Error(changed.reason)
    const ctx: ActionContext = { basedOn: 3, versions: { [healthField(maya)]: 4 } }
    const now = health(changed.game, maya)!
    expect(apply(changed.game, maya, { kind: 'setHealth', value: 10 }, ctx)).toEqual({ ok: false, reason: `your Health had already changed to ${now}. Check it and try again` })
    expect(apply(changed.game, maya, { kind: 'setHealth', value: 10 }, { basedOn: 4, versions: ctx.versions }).ok).toBe(true)
    expect(apply(changed.game, maya, { kind: 'health', by: -1 }, ctx).ok).toBe(true)
  })

  it('tracks when Health changes, for refusing stale sets', () => {
    const { g, maya, jo } = table()
    const r = apply(g, maya, { kind: 'health', by: -1 })
    if (!r.ok) throw new Error(r.reason)
    expect(trackChanges(g, r.game, 7, {})).toEqual({ [healthField(maya)]: 7 })
    expect(trackChanges(r.game, r.game, 8, { x: 1 })).toEqual({ x: 1 })
    expect(healthField(jo)).toBe(`hero:${jo}:health`)
  })

  it('adds and removes mods and twists, refusing ones already gone', () => {
    const { g, maya } = table()
    const added = apply(g, maya, { kind: 'addMod', mod: { label: 'Tailwind', value: 2 } })
    if (!added.ok) throw new Error(added.reason)
    const mod = hero(added.game, maya).play.mods[0]!
    expect(mod).toMatchObject({ label: 'Tailwind', value: 2 })
    const removed = apply(added.game, maya, { kind: 'removeMod', modId: mod.id })
    expect(removed.ok && hero(removed.game, maya).play.mods).toEqual([])
    expect(apply(g, maya, { kind: 'removeMod', modId: 'nope' })).toEqual({ ok: false, reason: 'that bonus or penalty is already gone' })
    const twisted = apply(g, maya, { kind: 'addTwist', twist: { kind: 'minor', text: 'Lost a shoe' } })
    if (!twisted.ok) throw new Error(twisted.reason)
    const twist = hero(twisted.game, maya).play.twists[0]!
    expect(apply(twisted.game, maya, { kind: 'removeTwist', twistId: twist.id }).ok).toBe(true)
    expect(apply(g, maya, { kind: 'removeTwist', twistId: 'nope' }).ok).toBe(false)
    expect(apply(g, maya, { kind: 'addTwist', twist: { kind: 'minor', text: '  ' } }).ok).toBe(false)
  })

  it('spends and gains hero points within 0 to 5', () => {
    const { g, maya } = table()
    expect(apply(g, maya, { kind: 'heroPoints', by: -1 })).toEqual({ ok: false, reason: 'you have no hero points to spend' })
    let game = g
    for (let i = 0; i < 5; i++) {
      const r = apply(game, maya, { kind: 'heroPoints', by: 1 })
      if (!r.ok) throw new Error(r.reason)
      game = r.game
    }
    expect(hero(game, maya).play.heroPoints).toBe(5)
    expect(apply(game, maya, { kind: 'heroPoints', by: 1 })).toEqual({ ok: false, reason: 'you already have 5 hero points' })
  })

  it('marks the reaction used', () => {
    const { g, maya } = table()
    const r = apply(g, maya, { kind: 'reaction', used: true })
    expect(r.ok && hero(r.game, maya).play.reactionUsed).toBe(true)
  })

  it("refuses an action for a hero who isn't in the game", () => {
    const { g } = table()
    expect(apply(g, 'gone', { kind: 'reaction', used: true })).toEqual({ ok: false, reason: "your hero isn't in this game any more" })
  })

  it('changes form, refusing one the hero lacks', () => {
    const { g, maya } = table(formChangerHero())
    const forms = playForms(buildSheet(hero(g, maya).sheet))
    const other = forms.find((f) => f.key)!
    const r = apply(g, maya, { kind: 'form', key: other.key! })
    expect(r.ok && hero(r.game, maya).play.form).toBe(other.key)
    expect(apply(g, maya, { kind: 'form', key: 'form:99' })).toEqual({ ok: false, reason: "your hero doesn't have that form or mode" })
    expect(apply(g, maya, { kind: 'dividedForm', form: 'heroic' })).toEqual({ ok: false, reason: "your hero isn't Divided" })
  })

  it('makes, changes and removes minions, refusing ones already gone', () => {
    const { g, maya } = table(minionMakerHero())
    const made = apply(g, maya, { kind: 'makeMinion', minion: { name: 'Drone', die: 'd8', action: 'attack' } })
    if (!made.ok) throw new Error(made.reason)
    const minion = hero(made.game, maya).play.minions![0]!
    const shrunk = apply(made.game, maya, { kind: 'shrinkMinion', minionId: minion.id })
    expect(shrunk.ok && hero(shrunk.game, maya).play.minions![0]!.die).toBe('d6')
    const modded = apply(made.game, maya, { kind: 'minionMod', minionId: minion.id, mod: { label: 'Aim', value: 1 } })
    if (!modded.ok) throw new Error(modded.reason)
    const modId = hero(modded.game, maya).play.minions![0]!.mods[0]!.id
    expect(apply(modded.game, maya, { kind: 'removeMinionMod', minionId: minion.id, modId }).ok).toBe(true)
    expect(apply(modded.game, maya, { kind: 'removeMinionMod', minionId: minion.id, modId: 'nope' }).ok).toBe(false)
    expect(apply(made.game, maya, { kind: 'minionRoll', minionId: minion.id, roll: { action: 'attack', value: 4, mods: [] } }).ok).toBe(true)
    expect(apply(made.game, maya, { kind: 'minionForm', minionId: minion.id, form: 'Not a form' })).toEqual({ ok: false, reason: "your hero doesn't have that minion form" })
    const gone = apply(made.game, maya, { kind: 'removeMinion', minionId: minion.id })
    expect(gone.ok && hero(gone.game, maya).play.minions).toEqual([])
    expect(apply(g, maya, { kind: 'shrinkMinion', minionId: 'nope' })).toEqual({ ok: false, reason: 'that minion is already gone' })
  })

  it("refuses a minion's roll while it needs a new form", () => {
    const { g, maya } = table(minionMakerHero())
    const made = apply(g, maya, { kind: 'makeMinion', minion: { name: 'Drone', die: 'd8', action: 'attack', needsForm: true } })
    if (!made.ok) throw new Error(made.reason)
    const minion = hero(made.game, maya).play.minions![0]!
    expect(apply(made.game, maya, { kind: 'minionRoll', minionId: minion.id, roll: { action: 'attack', value: 4, mods: [] } })).toEqual({ ok: false, reason: 'Drone needs a new form before it can act' })
  })
})

describe('turns', () => {
  it("hands off only on the hero's own turn, to someone who hasn't acted and isn't hidden", () => {
    const { g, c, maya, jo } = table()
    const started = startRound(g, { kind: 'hero', id: jo }, c)
    expect(apply(started, maya, { kind: 'handOff', to: { kind: 'hero', id: jo } })).toEqual({ ok: false, reason: "it isn't your turn, so you can't hand off" })
    const mine = handOff(started, { kind: 'hero', id: maya }, c)
    const villain = mine.villains.find((v) => !v.hidden)!
    const secret = mine.villains.find((v) => v.hidden)!
    expect(apply(mine, maya, { kind: 'handOff', to: { kind: 'villain', id: secret.id } })).toEqual({ ok: false, reason: "they can't take the next turn" })
    expect(apply(mine, maya, { kind: 'handOff', to: { kind: 'hero', id: jo } })).toEqual({ ok: false, reason: "Jo can't take the next turn" })
    const r = apply(mine, maya, { kind: 'handOff', to: { kind: 'villain', id: villain.id } })
    expect(r.ok && r.game.turn.current).toEqual({ kind: 'villain', id: villain.id })
  })

  it('starts the next round only when the round is over and it is the last hero acting', () => {
    const { g, c, maya, jo } = table()
    expect(apply(g, maya, { kind: 'startRound', first: { kind: 'hero', id: maya } })).toEqual({ ok: false, reason: 'the GM starts the first round' })
    let game = startRound(g, { kind: 'hero', id: jo }, c)
    expect(apply(game, jo, { kind: 'startRound', first: { kind: 'hero', id: maya } })).toEqual({ ok: false, reason: "the round isn't over: someone still has to act" })
    for (const ref of [...game.turn.order].filter((o) => !(o.kind === 'hero' && o.id === jo) && !(o.kind === 'hero' && o.id === maya))) game = handOff(game, ref, c)
    game = handOff(game, { kind: 'hero', id: maya }, c)
    expect(apply(game, jo, { kind: 'startRound', first: { kind: 'hero', id: jo } })).toEqual({ ok: false, reason: "it isn't your turn, so you can't start the next round" })
    const r = apply(game, maya, { kind: 'startRound', first: { kind: 'hero', id: jo } })
    expect(r.ok && r.game.round).toBe(2)
  })
})

describe('a roll', () => {
  it('records the roll, and checks an ability is available now', () => {
    const { g, maya } = table()
    const h = hero(g, maya)
    const sheet = buildSheet(h.sheet)
    const abilities = playAbilities(h.sheet, sheet, h.play, effectiveZone(sheet, h.play))
    const usable = abilities.find((a) => !a.blocked && !a.always)!
    const r = apply(g, maya, roll({ kind: 'ability', name: usable.name }))
    expect(r.ok && hero(r.game, maya).play.history.at(-1)).toMatchObject({ text: 'Attack', roll: true })
    const blocked = abilities.find((a) => a.blocked)!
    expect(apply(g, maya, roll({ kind: 'ability', name: blocked.name }))).toEqual({ ok: false, reason: `${blocked.name} can't be used now (${blocked.blocked})` })
    expect(apply(g, maya, roll({ kind: 'ability', name: 'Nonexistent' }))).toEqual({ ok: false, reason: "your hero doesn't have Nonexistent" })
  })

  it('marks the reaction used for a reaction ability, and refuses one when it already is', () => {
    // Form Changer's Emergency Change is a reaction, available low on Health.
    const { g: start, maya } = table(formChangerHero())
    const low = apply(start, maya, { kind: 'setHealth', value: 1 })
    if (!low.ok) throw new Error(low.reason)
    const g = low.game
    const h = hero(g, maya)
    const sheet = buildSheet(h.sheet)
    const reaction = playAbilities(h.sheet, sheet, h.play, effectiveZone(sheet, h.play)).find((a) => a.type === 'R' && !a.blocked)
    expect(reaction).toBeDefined()
    if (!reaction) return
    const r = apply(g, maya, roll({ kind: 'ability', name: reaction.name }))
    if (!r.ok) throw new Error(r.reason)
    expect(hero(r.game, maya).play.reactionUsed).toBe(true)
    expect(apply(r.game, maya, roll({ kind: 'ability', name: reaction.name }))).toEqual({ ok: false, reason: 'your reaction is already used this round' })
  })

  it('gives bonuses and penalties to others at the table, and notes them in the roller’s history', () => {
    const { g, maya, jo } = table()
    const villain = g.villains.find((v) => !v.hidden)!
    const group = g.groups[0]!
    const r = apply(
      g,
      maya,
      roll(
        { kind: 'basic', action: 'boost' },
        {
          selfMods: [{ label: 'Focus', value: 1 }],
          others: [
            { to: { kind: 'hero', id: jo }, mod: { label: 'Tailwind', value: 2 } },
            { to: { kind: 'villain', id: villain.id }, mod: { label: 'Pinned', value: -2 } },
            { to: { kind: 'member', groupId: group.id, memberId: group.members[0]!.id }, mod: { label: 'Dazed', value: -1 } },
          ],
        },
      ),
    )
    if (!r.ok) throw new Error(r.reason)
    expect(hero(r.game, maya).play.mods).toMatchObject([{ label: 'Focus', value: 1 }])
    expect(hero(r.game, jo).play.mods).toMatchObject([{ label: 'Tailwind', value: 2 }])
    expect(hero(r.game, jo).play.history.at(-1)!.text).toMatch(/^Gained .*Tailwind.* from Maya Reyes\.$/)
    expect(r.game.villains.find((v) => v.id === villain.id)!.play.mods).toMatchObject([{ label: 'Pinned', value: -2 }])
    expect(r.game.groups[0]!.members[0]!.mods).toMatchObject([{ label: 'Dazed', value: -1 }])
    expect(hero(r.game, maya).play.history.some((e) => /^Gave .*Tailwind.* to Jo\.$/.test(e.text))).toBe(true)
  })

  it("refuses a roll that gives a mod to someone hidden or gone, or to the roller's own minion that's gone", () => {
    const { g, maya } = table()
    const secret = g.villains.find((v) => v.hidden)!
    expect(apply(g, maya, roll({ kind: 'basic', action: 'hinder' }, { others: [{ to: { kind: 'villain', id: secret.id }, mod: { label: 'x', value: -1 } }] }))).toEqual({
      ok: false,
      reason: "someone you gave a bonus or penalty to isn't at the table any more",
    })
    const hiddenGroup = setHidden(g, { kind: 'group', id: g.groups[0]!.id }, true, clock())
    const member = { kind: 'member' as const, groupId: g.groups[0]!.id, memberId: g.groups[0]!.members[0]!.id }
    expect(apply(hiddenGroup, maya, roll({ kind: 'basic', action: 'hinder' }, { others: [{ to: member, mod: { label: 'x', value: -1 } }] })).ok).toBe(false)
    expect(apply(g, maya, roll({ kind: 'basic', action: 'boost' }, { others: [{ to: { kind: 'hero', id: maya }, mod: { label: 'x', value: 1 } }] }))).toEqual({
      ok: false,
      reason: 'a bonus or penalty for your own hero goes on your own list, not to someone else',
    })
    expect(apply(g, maya, roll({ kind: 'basic', action: 'boost' }, { minionMods: [{ minionId: 'nope', mod: { label: 'x', value: 1 } }] }))).toEqual({ ok: false, reason: 'one of your minions is already gone' })
  })

  it('changes form when the roll chose one, and makes minions', () => {
    const { g, maya } = table(formChangerHero())
    const other = playForms(buildSheet(hero(g, maya).sheet)).find((f) => f.key)!
    const r = apply(g, maya, roll({ kind: 'basic' }, { formChoice: other.key!, made: [{ name: 'Spark', die: 'd6', action: 'attack' }] }))
    if (!r.ok) throw new Error(r.reason)
    expect(hero(r.game, maya).play.form).toBe(other.key)
    expect(hero(r.game, maya).play.minions).toMatchObject([{ name: 'Spark', die: 'd6' }])
    expect(apply(g, maya, roll({ kind: 'basic' }, { formChoice: 'form:99' })).ok).toBe(false)
    expect(apply(g, maya, roll({ kind: 'basic' }, { formChoice: 'heroic' })).ok).toBe(false)
  })

  it('refuses a basic action the hero cannot take now', () => {
    const { g, maya } = table()
    const out = apply(g, maya, { kind: 'setHealth', value: 0 })
    if (!out.ok) throw new Error(out.reason)
    expect(apply(out.game, maya, roll({ kind: 'basic', action: 'attack' }))).toEqual({ ok: false, reason: "you can't take that action now (You're Out)" })
  })
})
