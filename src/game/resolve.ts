/**
 * Carrying out a roll's results on whoever they target (docs/design/npcs/spec.md, sections 4 and
 * 5, and "Choosing targets": anyone can target anyone). Pure, given the dice.
 *
 * - An Attack on a hero or villain takes Health, after one of its defenses (ruling 65, ./hits.ts).
 *   On a group's member or a hero's minion, it rolls a save straight away, with no dialog; the
 *   log and the attacker's player get the same line.
 * - Boost and Hinder give a mod; Defend gives a defense.
 * - A group roll does those for each member's result, and marks the members acted.
 */
import { heroDisplayName, type PlayMod } from '../hero/model'
import { addMinionMod } from '../play/minions'
import { effectAmount, modSize, overcomeOutcome } from '../play/roll'
import { addMod, type Clock } from '../play/state'
import type { BasicAction } from '../rules/types'
import { villainDisplayName } from '../villain/model'
import type { TableTarget } from './actions'
import type { Game } from './model'
import { applySave, heroMinionSave, memberSaveText, rollSave, usedUp, ACTION_NAME, type GroupRollRow, type Random } from './npc'
import { defend, hitCharacter } from './hits'
import { addMemberMod, changeHeroPlay, changeVillainPlay, findHero, findVillain, memberName, withLog } from './table'

/** The target's name, or undefined when it isn't on the table any more. */
export function targetName(game: Game, to: TableTarget): string | undefined {
  switch (to.kind) {
    case 'hero': {
      const h = findHero(game, to.id)
      return h && heroDisplayName(h.sheet)
    }
    case 'heroMinion':
      return findHero(game, to.heroId)?.play.minions?.find((m) => m.id === to.minionId)?.name
    case 'villain': {
      const v = findVillain(game, to.id)
      return v && villainDisplayName(v.sheet)
    }
    case 'member': {
      const g = game.groups.find((x) => x.id === to.groupId)
      const m = g?.members.find((x) => x.id === to.memberId)
      return g && m ? memberName(g, m.n) : undefined
    }
  }
}

/** Whether players can't see the target: a hidden villain, or a member of a hidden group. */
export function targetHidden(game: Game, to: TableTarget): boolean {
  if (to.kind === 'villain') return Boolean(findVillain(game, to.id)?.hidden)
  if (to.kind === 'member') return Boolean(game.groups.find((g) => g.id === to.groupId)?.hidden)
  return false
}

const line = (clock: Clock, by: string, text: string, gmOnly: boolean) => ({ id: clock.newId(), at: clock.now.toISOString(), by, text, ...(gmOnly ? { gmOnly: true as const } : {}) })

/**
 * Gives `to` a bonus or penalty from `from`. A hero's or villain's history notes it (and, with
 * `share`, the log does too); a member's or minion's gets its own line.
 */
export function giveMod(game: Game, to: TableTarget, mod: Omit<PlayMod, 'id'>, from: string, clock: Clock, share = true): Game {
  switch (to.kind) {
    case 'hero':
      return changeHeroPlay(game, to.id, (p) => addMod(p, mod, clock, { from }), clock, share)
    case 'heroMinion':
      return changeHeroPlay(game, to.heroId, (p) => addMinionMod(p, to.minionId, mod, clock), clock, share)
    case 'villain':
      return changeVillainPlay(game, to.id, (p) => addMod(p, mod, clock, { from }), clock, share)
    case 'member':
      return addMemberMod(game, to.groupId, to.memberId, mod, clock)
  }
}

/**
 * `by` attacks `to` for `amount` damage: "Maya Reyes attacked Gravelord: 6 damage." in the log
 * (GM-only when `gmOnly`, or when the target is hidden). One of the target's defenses blocks what
 * it can first (ruling 65): `defenseId`, or the default. Returns the game and, for a member or a
 * hero's minion, its save's line (the player's toast).
 * Its lines are by `author` (a group member's are by its group), `by` by default.
 */
export function applyAttack(game: Game, by: string, to: TableTarget, amount: number, random: Random, clock: Clock, gmOnly = false, defenseId?: string, author = by): { game: Game; note?: string } {
  const name = targetName(game, to)
  if (!name) return { game }
  if (to.kind === 'hero' || to.kind === 'villain') return { game: hitCharacter(game, by, to, amount, clock, gmOnly, defenseId, author) }
  if (to.kind === 'heroMinion') {
    const logged = withLog(game, [line(clock, author, `${by} attacked ${name}: ${amount} damage.`, gmOnly)])
    const saved = heroMinionSave(logged, to.heroId, to.minionId, amount, random, clock)
    if (!saved) return { game }
    return { game: withLog(saved.game, [line(clock, author, saved.text, gmOnly)]), note: saved.text }
  }
  const group = game.groups.find((g) => g.id === to.groupId)!
  const member = group.members.find((m) => m.id === to.memberId)!
  const logged = withLog(game, [line(clock, author, `${by} attacked ${name}: ${amount} damage.`, gmOnly || group.hidden)])
  const s = rollSave(group.kind, member, amount, random, defenseId)
  return { game: applySave(logged, group.id, s, clock), note: memberSaveText(name, group.kind, member.die, s) }
}

/** `by` protects `to` with a Defend of `value`, and the log says so ("Gravelord protected Burglar 2: Defend 3."). */
export function protect(game: Game, by: string, to: TableTarget, value: number, clock: Clock, gmOnly = false): Game {
  const name = targetName(game, to)
  if (!name) return game
  return withLog(defend(game, to, value, by, clock), [line(clock, by, `${by} protected ${name}: Defend ${value}.`, gmOnly || targetHidden(game, to))])
}

/** "a −2 penalty", "a +1 bonus", or "no bonus" for a size of 0. */
const sized = (size: number, sign: 1 | -1) => (size === 0 ? (sign > 0 ? 'no bonus' : 'no penalty') : `a ${sign > 0 ? '+' : '−'}${size} ${sign > 0 ? 'bonus' : 'penalty'}`)

/**
 * Applies a group roll (section 4): each row's result goes to its target, every rolled member is
 * marked acted and uses up its one-time mods, and each line is logged. `random` rolls the saves
 * of members and minions that are attacked.
 */
export function applyGroupRoll(game: Game, groupId: string, action: BasicAction, rows: readonly GroupRollRow[], random: Random, clock: Clock): Game {
  const group = game.groups.find((g) => g.id === groupId)
  if (!group) return game
  const gmOnly = group.hidden
  // The members first: acted, one-time mods used up.
  let next: Game = {
    ...game,
    groups: game.groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            members: g.members.map((m) => {
              const row = rows.find((r) => r.memberId === m.id)
              return row ? { ...m, acted: true, mods: usedUp(m.mods, row.roll.mods) } : m
            }),
          }
        : g,
    ),
  }
  for (const row of rows) {
    const member = group.members.find((m) => m.id === row.memberId)
    if (!member) continue
    const name = memberName(group, member.n)
    const amount = effectAmount(row.roll.total)
    const say = (text: string) => {
      next = withLog(next, [line(clock, group.name, text, gmOnly)])
    }
    const target = row.target
    const toName = target && targetName(next, target)
    if (action === 'overcome') {
      say(`${name} took Overcome: ${row.roll.total} (${overcomeOutcome(row.roll.total)}).`)
      continue
    }
    if (!target || !toName) {
      say(`${name} took ${ACTION_NAME[action]}: ${row.roll.total}, with no target.`)
      continue
    }
    switch (action) {
      case 'attack':
        // Logged by the group, as its other lines are: "Burglar: Burglar 4 attacked…".
        next = applyAttack(next, name, target, amount, random, clock, gmOnly, undefined, group.name).game
        break
      case 'hinder':
      case 'boost': {
        const sign = action === 'boost' ? 1 : -1
        const size = modSize(row.roll.total)
        say(`${name} ${action === 'boost' ? 'boosted' : 'hindered'} ${toName}: ${sized(size, sign)}.`)
        if (size > 0) next = giveMod(next, target, { label: group.name, value: sign * size }, name, clock, false)
        break
      }
      case 'defend':
        say(`${name} defended ${toName}: Defend ${amount}.`)
        next = defend(next, target, amount, name, clock)
        break
    }
  }
  return next
}
