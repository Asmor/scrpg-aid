/**
 * An Attack with a target at the table (docs/design/npcs/spec.md, section 5, and the user's
 * ruling of 2026-11-03: a hero's or villain's Attack can target anyone). Pure, given the dice.
 *
 * - A hero or a villain target loses that much Health.
 * - A minion or lieutenant target rolls its save straight away (../rules/saves.ts), with no
 *   dialog; the log and the attacker's player get the same line.
 */
import { heroDisplayName } from '../hero/model'
import type { Clock } from '../play/state'
import { villainDisplayName } from '../villain/model'
import type { TableTarget } from './actions'
import type { Game } from './model'
import { applySave, memberSaveText, rollSave, type Random } from './npc'
import { hitCharacter } from './hits'
import { targetId } from './roll-targets'
import { findHero, findVillain, memberName, withLog } from './table'

/** The target's name, or undefined when it isn't on the table any more. */
export function attackTargetName(game: Game, to: TableTarget): string | undefined {
  switch (to.kind) {
    case 'hero': {
      const h = findHero(game, to.id)
      return h && heroDisplayName(h.sheet)
    }
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

/**
 * `by` attacks `to` for `amount` damage: "Maya Reyes attacked Gravelord: 6 damage." in the log
 * (GM-only when `gmOnly`, or when the target is hidden). One of the target's defenses blocks what
 * it can first (ruling 65): `defenseId`, or the default. Returns the game and, for a member, its
 * save's line (the player's toast).
 */
export function applyAttack(game: Game, by: string, to: TableTarget, amount: number, random: Random, clock: Clock, gmOnly = false, defenseId?: string): { game: Game; note?: string } {
  const name = attackTargetName(game, to)
  if (!name) return { game }
  if (to.kind !== 'member') return { game: hitCharacter(game, by, to, amount, clock, gmOnly, defenseId) }
  const group = game.groups.find((g) => g.id === to.groupId)!
  const member = group.members.find((m) => m.id === to.memberId)!
  const logged = withLog(game, [{ id: clock.newId(), at: clock.now.toISOString(), by, text: `${by} attacked ${name}: ${amount} damage.`, ...(gmOnly || group.hidden ? { gmOnly: true as const } : {}) }])
  const s = rollSave(group.kind, member, amount, random, defenseId)
  return { game: applySave(logged, group.id, s, clock), note: memberSaveText(name, group.kind, member.die, s) }
}

/** Who a villain's Attack can target: every hero, the other villains, and every member of a group (the GM sees them all). */
export function villainAttackTargets(game: Game, villainId: string): { id: string; name: string }[] {
  return [
    ...game.heroes.map((h) => ({ id: targetId({ kind: 'hero', id: h.id }), name: heroDisplayName(h.sheet) })),
    ...game.villains.filter((v) => v.id !== villainId).map((v) => ({ id: targetId({ kind: 'villain', id: v.id }), name: villainDisplayName(v.sheet) })),
    ...game.groups.flatMap((g) => g.members.map((m) => ({ id: targetId({ kind: 'member', groupId: g.id, memberId: m.id }), name: memberName(g, m.n) }))),
  ]
}
