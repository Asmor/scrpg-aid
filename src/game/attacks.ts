/**
 * An Attack with a target at the table (docs/design/npcs/spec.md, section 5, and the user's
 * ruling of 2026-11-03: a hero's or villain's Attack can target anyone). Pure, given the dice.
 *
 * - A hero or a villain target loses that much Health.
 * - A minion or lieutenant target rolls its save straight away (../rules/saves.ts), with no
 *   dialog; the log and the attacker's player get the same line.
 */
import { buildSheet } from '../creation/sheet'
import { heroDisplayName } from '../hero/model'
import { currentHealth, setHealth, type Clock } from '../play/state'
import { villainDisplayName } from '../villain/model'
import { villainHealth } from '../villain/play'
import type { TableTarget } from './actions'
import type { Game } from './model'
import { applySave, rollSave, saveText, type Random } from './npc'
import { targetId } from './roll-targets'
import { changeHeroPlay, changeVillainPlay, findHero, findVillain, memberName, withLog } from './table'

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
 * (GM-only when `gmOnly`, or when the target is hidden), then the damage. Returns the game and,
 * for a member, its save's line (the player's toast).
 */
export function applyAttack(game: Game, by: string, to: TableTarget, amount: number, random: Random, clock: Clock, gmOnly = false): { game: Game; note?: string } {
  const name = attackTargetName(game, to)
  if (!name) return { game }
  const hidden =
    gmOnly ||
    (to.kind === 'villain' && Boolean(findVillain(game, to.id)?.hidden)) ||
    (to.kind === 'member' && Boolean(game.groups.find((g) => g.id === to.groupId)?.hidden))
  let next = withLog(game, [{ id: clock.newId(), at: clock.now.toISOString(), by, text: `${by} attacked ${name}: ${amount} damage.`, ...(hidden ? { gmOnly: true as const } : {}) }])
  switch (to.kind) {
    case 'hero':
      next = changeHeroPlay(
        next,
        to.id,
        (p, sheet) => {
          const built = buildSheet(sheet)
          const now = currentHealth(built, p)
          return now === undefined ? p : setHealth(p, built, now - amount, clock)
        },
        clock,
      )
      return { game: next }
    case 'villain': {
      next = changeVillainPlay(
        next,
        to.id,
        (p, sheet) => {
          const health = villainHealth(sheet, p)
          const now = currentHealth(health, p)
          return now === undefined ? p : setHealth(p, health, now - amount, clock)
        },
        clock,
      )
      return { game: next }
    }
    case 'member': {
      const group = next.groups.find((g) => g.id === to.groupId)!
      const member = group.members.find((m) => m.id === to.memberId)!
      const s = rollSave(group.kind, member, amount, random)
      const note = saveText(memberName(group, member.n), group.kind, member.die, amount, s.roll?.total, s.result)
      return { game: applySave(next, group.id, s, clock), note }
    }
  }
}

/** Who a villain's Attack can target: every hero, the other villains, and every member of a group (the GM sees them all). */
export function villainAttackTargets(game: Game, villainId: string): { id: string; name: string }[] {
  return [
    ...game.heroes.map((h) => ({ id: targetId({ kind: 'hero', id: h.id }), name: heroDisplayName(h.sheet) })),
    ...game.villains.filter((v) => v.id !== villainId).map((v) => ({ id: targetId({ kind: 'villain', id: v.id }), name: villainDisplayName(v.sheet) })),
    ...game.groups.flatMap((g) => g.members.map((m) => ({ id: targetId({ kind: 'member', groupId: g.id, memberId: m.id }), name: memberName(g, m.n) }))),
  ]
}
