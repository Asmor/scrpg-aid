/**
 * Damage to a hero or a villain at the table, after one of its defenses (ruling 65), and giving
 * one a defense. Pure. Members' saves are in ./npc.ts; ./attacks.ts puts them together.
 */
import { heroDisplayName } from '../hero/model'
import { addDefense, blockText, blockWith, defensesOf, pickDefense, removeDefense } from '../play/defense'
import { currentHealth, setHealth, type Clock } from '../play/state'
import { villainDisplayName } from '../villain/model'
import { villainHealth } from '../villain/play'
import type { Game } from './model'
import { changeHeroPlay, changeVillainPlay, damageHero, defenseChooser, findHero, findVillain, holdHit, withLog } from './table'

const logLine = (clock: Clock, by: string, text: string, gmOnly: boolean) => ({ id: clock.newId(), at: clock.now.toISOString(), by, text, ...(gmOnly ? { gmOnly: true as const } : {}) })

/**
 * `by` hits a hero or villain for `amount`: one of its defenses blocks what it can (the one
 * chosen, or the default), and the rest comes off its Health. The log says "Gravelord attacked
 * Maya Reyes: 8 damage (Defend 5 blocked 5, 3 taken)." A hero with two or more defenses and no
 * defense chosen waits for its owner to choose (./table.ts resolveHit).
 */
export function hitCharacter(game: Game, by: string, to: { kind: 'hero' | 'villain'; id: string }, amount: number, clock: Clock, gmOnly: boolean, defenseId?: string): Game {
  if (to.kind === 'hero') {
    const hero = findHero(game, to.id)
    if (!hero) return game
    const name = heroDisplayName(hero.sheet)
    // Two or more defenses: the hero's owner chooses which one, so the hit waits (ruling 65).
    if (defenseId === undefined && defensesOf(hero.play).length > 1) {
      const waiting = withLog(game, [logLine(clock, by, `${by} attacked ${name}: ${amount} damage. ${defenseChooser(hero)} chooses which defense to use.`, gmOnly)])
      return holdHit(waiting, { heroId: to.id, by, amount, ...(gmOnly ? { gmOnly: true as const } : {}) }, clock)
    }
    const defense = pickDefense(defensesOf(hero.play), amount, defenseId)
    return damageHero(withLog(game, [logLine(clock, by, `${by} attacked ${name}: ${amount} damage${blockText(amount, defense)}.`, gmOnly)]), to.id, amount, defense, clock)
  }
  const villain = findVillain(game, to.id)
  if (!villain) return game
  const defense = pickDefense(defensesOf(villain.play), amount, defenseId)
  const { taken } = blockWith(amount, defense)
  const logged = withLog(game, [logLine(clock, by, `${by} attacked ${villainDisplayName(villain.sheet)}: ${amount} damage${blockText(amount, defense)}.`, gmOnly || villain.hidden)])
  return changeVillainPlay(
    logged,
    to.id,
    (p, sheet) => {
      const after = defense ? removeDefense(p, defense.id) : p
      const health = villainHealth(sheet, after)
      const now = currentHealth(health, after)
      return now === undefined || taken === 0 ? after : setHealth(after, health, now - taken, clock)
    },
    clock,
  )
}

/** A Defend for a hero, villain or group member: a defense of `value` from `from` (none for 0). */
export function defend(game: Game, to: { kind: 'hero' | 'villain'; id: string } | { kind: 'member'; groupId: string; memberId: string }, value: number, from: string, clock: Clock): Game {
  switch (to.kind) {
    case 'hero':
      return changeHeroPlay(game, to.id, (p) => addDefense(p, value, from, clock), clock, false)
    case 'villain':
      return changeVillainPlay(game, to.id, (p) => addDefense(p, value, from, clock), clock, false)
    case 'member':
      return { ...game, groups: game.groups.map((g) => (g.id === to.groupId ? { ...g, members: g.members.map((m) => (m.id === to.memberId ? addDefense(m, value, from, clock) : m)) } : g)) }
  }
}
