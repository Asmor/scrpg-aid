/**
 * A player's actions on their hero (docs/design/game-table/spec.md, section 10, "Player
 * actions"). Players never change the game themselves: each control sends one action, and the
 * GM's device checks it against the current game, applies it, and logs it. Pure.
 *
 * Every action is for the sender's own hero. One exception (the user's decision, 2026-11-03): a
 * roll may carry bonuses and penalties for others at the table (a Boost for another hero, a
 * Hinder on a villain or a minion), which the GM's device applies straight away.
 *
 * A change to a number is applied as a change by an amount, so two players' changes both count.
 * Setting a value outright is refused when the value changed after the state the player saw
 * (`basedOn`), so nobody overwrites a change they hadn't seen.
 */
import { buildSheet } from '../creation/sheet'
import { heroDisplayName, type Hero, type PlayMinion, type PlayMod, type PlayState, type PlayTwist } from '../hero/model'
import { addMinion, addMinionMod, recordMinionRoll, removeMinion, removeMinionMod, setMinionForm, shrinkMinion, type MinionRoll } from '../play/minions'
import { availabilityContext, basicActionBlocked, currentForm, playAbilities, playForms } from '../play/forms'
import { confirmRoll, effectAmount, type RollRecord } from '../play/roll'
import { addMod, addTwist, currentHealth, effectiveZone, MAX_HERO_POINTS, noteGivenMod, removeMod, removeTwist, setDividedForm, setForm, setHealth, setHeroPoints, setReactionUsed, type Clock } from '../play/state'
import type { BasicAction } from '../rules/types'
import { villainDisplayName } from '../villain/model'
import { applyAttack } from './attacks'
import { defend } from './hits'
import type { ActorRef, Game, HeroInGame } from './model'
import { addMemberMod, changeHeroPlay, changeVillainPlay, findHero, findVillain, handOff, heroPlayInScene, isHidden, itemName, memberName, resolveHit, roundOver, sameActor, startRound, waiting, withLog } from './table'

export type ModInput = Omit<PlayMod, 'id'>
/** A minion to make. */
export type NewMinion = Omit<PlayMinion, 'id' | 'mods'>

/** Someone at the table a roll's bonus or penalty can go to. */
export type TableTarget = { kind: 'hero'; id: string } | { kind: 'villain'; id: string } | { kind: 'member'; groupId: string; memberId: string }

/** A confirmed roll and what it does: the record, the form it changed to, and its bonuses and penalties. */
export interface RollAction {
  /** What was rolled: a basic action, or an ability by name (checked against what's available now). */
  subject: { kind: 'basic'; action?: BasicAction } | { kind: 'ability'; name: string }
  record: RollRecord
  /** The form or mode the ability changed to: a form key ("" for the base form), or "civilian"/"heroic". */
  formChoice?: string
  /** Bonuses and penalties for the hero, for their own minions, and for others at the table. */
  selfMods: ModInput[]
  minionMods: { minionId: string; mod: ModInput }[]
  others: { to: TableTarget; mod: ModInput }[]
  /** Minions the roll made. */
  made: NewMinion[]
  /** Attack results with a target: the result's index in the record, and who it hits (docs/design/npcs/spec.md, section 5). */
  attacks: { result: number; to: TableTarget }[]
  /** Defend results: the result's index, and who it protects (none: the hero; ruling 65). */
  defends: { result: number; to?: TableTarget }[]
}

export type HeroAction =
  | { kind: 'health'; by: number }
  | { kind: 'setHealth'; value: number }
  | { kind: 'addMod'; mod: ModInput }
  | { kind: 'removeMod'; modId: string }
  | { kind: 'addTwist'; twist: Omit<PlayTwist, 'id'> }
  | { kind: 'removeTwist'; twistId: string }
  | { kind: 'heroPoints'; by: 1 | -1 }
  | { kind: 'reaction'; used: boolean }
  | { kind: 'form'; key: string }
  | { kind: 'dividedForm'; form: 'civilian' | 'heroic' }
  | { kind: 'roll'; roll: RollAction }
  | { kind: 'makeMinion'; minion: NewMinion }
  | { kind: 'removeMinion'; minionId: string }
  | { kind: 'shrinkMinion'; minionId: string }
  | { kind: 'minionMod'; minionId: string; mod: ModInput }
  | { kind: 'removeMinionMod'; minionId: string; modId: string }
  | { kind: 'minionRoll'; minionId: string; roll: MinionRoll }
  | { kind: 'minionForm'; minionId: string; form: string }
  /** Chooses the defense for a hit waiting on the hero (ruling 65). */
  | { kind: 'chooseDefense'; hitId: string; defenseId: string }
  | { kind: 'handOff'; to: ActorRef }
  | { kind: 'startRound'; first: ActorRef }

/** `notes` are lines for the player as toasts: a minion's or lieutenant's save against their Attack. */
export type ActionResult = { ok: true; game: Game; notes?: string[] } | { ok: false; reason: string }

/**
 * When each value last changed, as the game's state version at the time (kept by the GM's
 * device while hosting): "hero:<id>:health" → version.
 */
export type FieldVersions = Readonly<Record<string, number>>

export const healthField = (heroId: string) => `hero:${heroId}:health`

export interface ActionContext {
  /** The state version the player's device last saw. */
  basedOn: number
  versions: FieldVersions
  /** The GM's dice, for saves against a player's Attack. */
  random?: () => number
}

const refuse = (reason: string): ActionResult => ({ ok: false, reason })

/** The hero's play state as the rules see it in this game (with the scene's zone). */
function inScene(game: Game, hero: HeroInGame) {
  const sheet = buildSheet(hero.sheet)
  const play = heroPlayInScene(game, hero.play)
  return { sheet, play, zone: effectiveZone(sheet, play) }
}

/**
 * Checks an action against the current game and applies it. `heroId` is the sender's hero (the
 * caller checks that it is theirs). Returns the next game, or why the action wasn't applied, in
 * words that follow "Not applied: ".
 */
export function applyHeroAction(game: Game, heroId: string, action: HeroAction, ctx: ActionContext, clock: Clock): ActionResult {
  const hero = findHero(game, heroId)
  if (!hero) return refuse("your hero isn't in this game any more")
  const name = heroDisplayName(hero.sheet)
  const change = (fn: (play: PlayState, sheet: Hero) => PlayState): ActionResult => ({ ok: true, game: changeHeroPlay(game, heroId, fn, clock) })

  switch (action.kind) {
    case 'health':
    case 'setHealth': {
      const sheet = buildSheet(hero.sheet)
      const now = currentHealth(sheet, hero.play)
      if (now === undefined) return refuse('your hero has no Health yet. Work it out in the editor first')
      if (action.kind === 'setHealth' && (ctx.versions[healthField(heroId)] ?? -1) > ctx.basedOn) return refuse(`your Health had already changed to ${now}. Check it and try again`)
      const value = action.kind === 'health' ? now + action.by : action.value
      return change((p) => setHealth(p, sheet, value, clock))
    }
    case 'addMod':
      return change((p) => addMod(p, action.mod, clock))
    case 'removeMod':
      if (!hero.play.mods.some((m) => m.id === action.modId)) return refuse('that bonus or penalty is already gone')
      return change((p) => removeMod(p, action.modId, clock))
    case 'addTwist':
      if (!action.twist.text.trim()) return refuse('the twist needs some text')
      return change((p) => addTwist(p, action.twist, clock))
    case 'removeTwist':
      if (!hero.play.twists.some((t) => t.id === action.twistId)) return refuse('that twist is already resolved')
      return change((p) => removeTwist(p, action.twistId, clock))
    case 'heroPoints': {
      const next = hero.play.heroPoints + action.by
      if (next < 0) return refuse('you have no hero points to spend')
      if (next > MAX_HERO_POINTS) return refuse(`you already have ${MAX_HERO_POINTS} hero points`)
      return change((p) => setHeroPoints(p, p.heroPoints + action.by, clock))
    }
    case 'reaction':
      return change((p) => setReactionUsed(p, action.used, clock))
    case 'form': {
      const forms = playForms(buildSheet(hero.sheet))
      const form = forms.find((f) => (f.key ?? '') === action.key)
      if (!form) return refuse("your hero doesn't have that form or mode")
      return change((p) => setForm(p, form.key, form.name, clock))
    }
    case 'dividedForm':
      if (!buildSheet(hero.sheet).divided) return refuse("your hero isn't Divided")
      return change((p) => setDividedForm(p, action.form, clock))
    case 'chooseDefense': {
      const hit = game.pendingHits?.find((h) => h.id === action.hitId && h.heroId === heroId)
      if (!hit) return refuse('that hit is already settled')
      if (!(hero.play.defenses ?? []).some((d) => d.id === action.defenseId)) return refuse('that defense is already gone')
      return { ok: true, game: resolveHit(game, hit.id, action.defenseId, clock) }
    }
    case 'roll':
      return applyRoll(game, hero, action.roll, clock, ctx.random ?? Math.random)
    case 'makeMinion':
      return change((p) => addMinion(p, action.minion, clock))
    case 'removeMinion':
    case 'shrinkMinion':
    case 'minionMod':
    case 'removeMinionMod':
    case 'minionRoll':
    case 'minionForm': {
      const minion = hero.play.minions?.find((m) => m.id === action.minionId)
      if (!minion) return refuse('that minion is already gone')
      switch (action.kind) {
        case 'removeMinion':
          return change((p) => removeMinion(p, action.minionId, clock))
        case 'shrinkMinion':
          return change((p) => shrinkMinion(p, action.minionId, clock))
        case 'minionMod':
          return change((p) => addMinionMod(p, action.minionId, action.mod, clock))
        case 'removeMinionMod':
          if (!minion.mods.some((m) => m.id === action.modId)) return refuse('that bonus or penalty is already gone')
          return change((p) => removeMinionMod(p, action.minionId, action.modId, clock))
        case 'minionRoll':
          if (minion.needsForm) return refuse(`${minion.name} needs a new form before it can act`)
          return change((p) => recordMinionRoll(p, action.minionId, action.roll, clock))
        case 'minionForm':
          if (!buildSheet(hero.sheet).minionForms?.some((f) => f.name === action.form)) return refuse("your hero doesn't have that minion form")
          return change((p) => setMinionForm(p, action.minionId, action.form, clock))
      }
      break
    }
    case 'handOff': {
      const me: ActorRef = { kind: 'hero', id: heroId }
      if (!sameActor(game.turn.current, me)) return refuse("it isn't your turn, so you can't hand off")
      if (isHidden(game, action.to) || !waiting(game).some((w) => sameActor(w, action.to))) return refuse(`${isHidden(game, action.to) ? 'they' : itemName(game, action.to)} can't take the next turn`)
      return { ok: true, game: handOff(game, action.to, clock) }
    }
    case 'startRound': {
      const me: ActorRef = { kind: 'hero', id: heroId }
      if (game.round === 0) return refuse('the GM starts the first round')
      if (!sameActor(game.turn.current, me)) return refuse("it isn't your turn, so you can't start the next round")
      if (!roundOver(game)) return refuse("the round isn't over: someone still has to act")
      if (isHidden(game, action.first) || !game.turn.order.some((o) => sameActor(o, action.first))) return refuse("they can't start the next round")
      return { ok: true, game: startRound(game, action.first, clock) }
    }
  }
  return refuse(`${name} can't do that`)
}

/** Who a roll's bonus or penalty goes to, by name; undefined when they aren't (visibly) at the table. */
function targetName(game: Game, to: TableTarget, heroId: string): string | undefined {
  switch (to.kind) {
    case 'hero': {
      const hero = to.id === heroId ? undefined : findHero(game, to.id)
      return hero && heroDisplayName(hero.sheet)
    }
    case 'villain': {
      const villain = findVillain(game, to.id)
      return villain && !villain.hidden ? villainDisplayName(villain.sheet) : undefined
    }
    case 'member': {
      const group = game.groups.find((g) => g.id === to.groupId)
      const member = group?.members.find((m) => m.id === to.memberId)
      return group && member && !group.hidden ? memberName(group, member.n) : undefined
    }
  }
}

function applyRoll(game: Game, hero: HeroInGame, roll: RollAction, clock: Clock, random: () => number): ActionResult {
  const { sheet, play, zone } = inScene(game, hero)
  const ctx = availabilityContext(hero.sheet, sheet, play, zone)
  let reaction = false
  if (roll.subject.kind === 'ability') {
    const subject = roll.subject
    const ability = playAbilities(hero.sheet, sheet, play, zone).find((a) => a.name === subject.name)
    if (!ability) return refuse(`your hero doesn't have ${subject.name}`)
    if (ability.always) return refuse(`${ability.name} is always on, so it isn't used`)
    if (ability.blocked) return refuse(`${ability.name} can't be used now (${ability.blocked})`)
    reaction = ability.type === 'R'
    if (reaction && hero.play.reactionUsed) return refuse('your reaction is already used this round')
  } else if (roll.subject.action) {
    const why = basicActionBlocked(roll.subject.action, ctx)
    if (why) return refuse(`you can't take that action now (${why})`)
  }
  if (roll.others.some((o) => o.to.kind === 'hero' && o.to.id === hero.id)) return refuse("a bonus or penalty for your own hero goes on your own list, not to someone else")
  const named = roll.others.map((o) => ({ ...o, name: targetName(game, o.to, hero.id) }))
  const gone = named.find((o) => !o.name)
  if (gone) return refuse("someone you gave a bonus or penalty to isn't at the table any more")
  const attacks = roll.attacks.map((a) => ({ ...a, name: targetName(game, a.to, hero.id), r: roll.record.results[a.result] }))
  if (attacks.some((a) => a.r?.action !== 'attack' || a.r.total === undefined)) return refuse("an Attack target is for a result that isn't an Attack")
  if (new Set(attacks.map((a) => a.result)).size < attacks.length) return refuse('each Attack result has one target')
  const defends = roll.defends.map((d) => ({ ...d, name: d.to ? targetName(game, d.to, hero.id) : undefined, r: roll.record.results[d.result] }))
  if (defends.some((d) => d.r?.action !== 'defend' || d.r.total === undefined)) return refuse("a Defend's target is for a result that isn't a Defend")
  if (defends.some((d) => d.to && !d.name)) return refuse("someone you protected isn't at the table any more")
  if (new Set([...attacks, ...defends].map((a) => a.result)).size < attacks.length + defends.length) return refuse('each result has one target')
  if (attacks.some((a) => !a.name)) return refuse("someone you attacked isn't at the table any more")
  const minions = hero.play.minions ?? []
  if (roll.minionMods.some((m) => !minions.some((x) => x.id === m.minionId))) return refuse('one of your minions is already gone')
  const forms = playForms(sheet)
  const formChoice = roll.formChoice
  const toForm = formChoice === undefined || formChoice === 'civilian' || formChoice === 'heroic' ? undefined : forms.find((f) => (f.key ?? '') === formChoice)
  if (formChoice !== undefined && formChoice !== 'civilian' && formChoice !== 'heroic' && !toForm) return refuse("your hero doesn't have that form or mode")
  if ((formChoice === 'civilian' || formChoice === 'heroic') && !sheet.divided) return refuse("your hero isn't Divided")

  // The roller: the roll in their history, then everything it did to them.
  let next = changeHeroPlay(
    game,
    hero.id,
    (p) => {
      let after = confirmRoll(p, roll.record, clock)
      if (formChoice === 'civilian' || formChoice === 'heroic') after = setDividedForm(after, formChoice, clock)
      else if (toForm && toForm.key !== currentForm(forms, after)?.key) after = setForm(after, toForm.key, toForm.name, clock)
      if (reaction) after = setReactionUsed(after, true, clock)
      for (const mod of roll.selfMods) after = addMod(after, mod, clock)
      for (const m of roll.minionMods) after = addMinionMod(after, m.minionId, m.mod, clock)
      for (const m of roll.made) after = addMinion(after, m, clock)
      for (const o of named) after = noteGivenMod(after, o.mod, o.name!, clock)
      return after
    },
    clock,
  )
  // Then everyone it gave a bonus or penalty to.
  const giver = heroDisplayName(hero.sheet)
  for (const o of named) {
    const to = o.to
    if (to.kind === 'hero') next = changeHeroPlay(next, to.id, (p) => addMod(p, o.mod, clock, { from: giver }), clock)
    else if (to.kind === 'villain') next = changeVillainPlay(next, to.id, (p) => addMod(p, o.mod, clock, { from: giver }), clock)
    else next = addMemberMod(next, to.groupId, to.memberId, o.mod, clock)
  }
  // Then whoever it protected (ruling 65).
  for (const d of defends) {
    const value = effectAmount(d.r!.total!)
    next = d.to ? defend(next, d.to, value, giver, clock) : defend(next, { kind: 'hero', id: hero.id }, value, giver, clock)
    if (d.to) next = withLog(next, [{ id: clock.newId(), at: clock.now.toISOString(), by: giver, text: `${giver} protected ${d.name}: Defend ${value}.` }])
  }
  // Then whoever it attacked: Health, or a minion's or lieutenant's save.
  const notes: string[] = []
  for (const a of attacks) {
    const hit = applyAttack(next, giver, a.to, effectAmount(a.r!.total!), random, clock)
    next = hit.game
    if (hit.note) notes.push(hit.note)
  }
  return { ok: true, game: next, ...(notes.length ? { notes } : {}) }
}

/**
 * Brings the record of when each value last changed up to date after a change: `version` is the
 * state version the change made. Only Health can be set outright, so only Health is tracked.
 */
export function trackChanges(before: Game, after: Game, version: number, versions: FieldVersions): FieldVersions {
  let next: Record<string, number> | undefined
  for (const hero of after.heroes) {
    const old = findHero(before, hero.id)
    if (old && old.play.health === hero.play.health) continue
    next ??= { ...versions }
    next[healthField(hero.id)] = version
  }
  return next ?? versions
}
