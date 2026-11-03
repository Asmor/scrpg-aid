/**
 * Running groups of minions and lieutenants (docs/design/npcs/spec.md, sections 4 and 5). Pure,
 * given the dice (`random`).
 *
 * - A group roll: each chosen member rolls its own die with its own mods, then the GM picks a
 *   target for each result. Apply carries out each result (Attack deals damage, Boost and
 *   Hinder give sized mods, Defend and Overcome are logged), uses up the one-time mods, and
 *   marks every rolled member as acted.
 * - Saves: a minion or lieutenant that takes damage rolls its own die with its mods
 *   (../rules/saves.ts). A Minion-Maker hero's minions save as minions.
 */
import { buildSheet } from '../creation/sheet'
import { heroDisplayName, type PlayMinion, type PlayMod } from '../hero/model'
import { removeMinion, shrinkMinion } from '../play/minions'
import { effectAmount, modSize, overcomeOutcome } from '../play/roll'
import { addMod, currentHealth, setHealth, type Clock } from '../play/state'
import { rollDie } from '../rules/rolling'
import { save, type SaveResult } from '../rules/saves'
import type { BasicAction, Die } from '../rules/types'
import { villainDisplayName } from '../villain/model'
import type { Game, NpcGroup, NpcMember } from './model'
import { addMemberMod, changeHeroPlay, changeVillainPlay, findHero, findVillain, memberName, removeMember, withLog } from './table'

export type Random = () => number

export const ACTION_NAME: Record<BasicAction, string> = { attack: 'Attack', defend: 'Defend', boost: 'Boost', hinder: 'Hinder', overcome: 'Overcome' }
const ALL_ACTIONS: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']

/** The actions a group can take, in the usual order. */
export const groupActionList = (group: Pick<NpcGroup, 'actions'>): BasicAction[] => (group.actions === 'any' ? [...ALL_ACTIONS] : ALL_ACTIONS.filter((a) => group.actions.includes(a)))

/** "Attack or Hinder", "Any basic action". */
export function actionsText(group: Pick<NpcGroup, 'actions'>): string {
  if (group.actions === 'any') return 'Any basic action'
  const names = groupActionList(group).map((a) => ACTION_NAME[a])
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
}

// ---- Mods on a roll or a save ----

/**
 * The mods an NPC's roll uses: every one that isn't exclusive, plus the largest exclusive bonus
 * and the largest exclusive penalty (only one of each applies, p. 26). The GM runs them, so
 * bonuses count without being picked.
 */
export function npcRollMods(mods: readonly PlayMod[]): PlayMod[] {
  const best = mods.filter((m) => m.exclusive && m.value > 0).reduce<PlayMod | undefined>((a, m) => (!a || m.value > a.value ? m : a), undefined)
  const worst = mods.filter((m) => m.exclusive && m.value < 0).reduce<PlayMod | undefined>((a, m) => (!a || m.value < a.value ? m : a), undefined)
  return mods.filter((m) => !m.exclusive || m === best || m === worst)
}

/** A die rolled with mods: the die's value, the mods used, and the total. */
export interface NpcRoll {
  value: number
  mods: PlayMod[]
  total: number
}

export function rollWithMods(die: Die, mods: readonly PlayMod[], random: Random): NpcRoll {
  const used = npcRollMods(mods)
  const value = rollDie(die, random)
  return { value, mods: used, total: value + used.reduce((s, m) => s + m.value, 0) }
}

/** "5 − 1 Dazed": how a total was made (just the value without mods). */
export function rollMath(roll: Pick<NpcRoll, 'value' | 'mods'>): string {
  return [String(roll.value), ...roll.mods.map((m) => `${m.value > 0 ? '+' : '−'} ${Math.abs(m.value)}${m.label.trim() ? ` ${m.label.trim()}` : ''}`)].join(' ')
}

// ---- Targets ----

/** Who a group's result can go to: a hero, a hero's minion, a villain, or a member of a GM group. */
export type NpcTarget = { kind: 'hero'; id: string } | { kind: 'heroMinion'; heroId: string; minionId: string } | { kind: 'villain'; id: string } | { kind: 'member'; groupId: string; memberId: string }

export function npcTargetId(t: NpcTarget): string {
  switch (t.kind) {
    case 'hero':
    case 'villain':
      return `${t.kind}:${t.id}`
    case 'heroMinion':
      return `heroMinion:${t.heroId}:${t.minionId}`
    case 'member':
      return `member:${t.groupId}:${t.memberId}`
  }
}

export function parseNpcTarget(id: string): NpcTarget | undefined {
  const [kind, a, b] = id.split(':')
  if ((kind === 'hero' || kind === 'villain') && a) return { kind, id: a }
  if (kind === 'heroMinion' && a && b) return { kind, heroId: a, minionId: b }
  if (kind === 'member' && a && b) return { kind, groupId: a, memberId: b }
  return undefined
}

const heroName = (game: Game, id: string) => {
  const h = findHero(game, id)
  return h ? heroDisplayName(h.sheet) : undefined
}

/**
 * The targets a group's action can have (section 4): Attack goes to heroes and their minions,
 * Hinder to heroes, Boost and Defend to villains and the GM's groups' members. Overcome has none.
 */
export function npcTargets(game: Game, action: BasicAction): { id: string; name: string }[] {
  const heroes = game.heroes.map((h) => ({ id: npcTargetId({ kind: 'hero', id: h.id }), name: heroDisplayName(h.sheet) }))
  switch (action) {
    case 'attack':
      return [
        ...heroes,
        ...game.heroes.flatMap((h) => (h.play.minions ?? []).map((m) => ({ id: npcTargetId({ kind: 'heroMinion', heroId: h.id, minionId: m.id }), name: `${m.name} (${heroDisplayName(h.sheet)}'s minion)` }))),
      ]
    case 'hinder':
      return heroes
    case 'boost':
    case 'defend':
      return [
        ...game.villains.map((v) => ({ id: npcTargetId({ kind: 'villain', id: v.id }), name: villainDisplayName(v.sheet) })),
        ...game.groups.filter((g) => g.owner.kind === 'gm').flatMap((g) => g.members.map((m) => ({ id: npcTargetId({ kind: 'member', groupId: g.id, memberId: m.id }), name: memberName(g, m.n) }))),
      ]
    case 'overcome':
      return []
  }
}

/** A target's name, or undefined when it isn't on the table any more. */
export function npcTargetName(game: Game, t: NpcTarget): string | undefined {
  switch (t.kind) {
    case 'hero':
      return heroName(game, t.id)
    case 'heroMinion': {
      const hero = findHero(game, t.heroId)
      return hero?.play.minions?.find((m) => m.id === t.minionId)?.name
    }
    case 'villain': {
      const v = findVillain(game, t.id)
      return v && villainDisplayName(v.sheet)
    }
    case 'member': {
      const g = game.groups.find((x) => x.id === t.groupId)
      const m = g?.members.find((x) => x.id === t.memberId)
      return g && m ? memberName(g, m.n) : undefined
    }
  }
}

// ---- Saves ----

/** "Burglars 2 saved against 5 (rolled 6): drops to d6." and the like (section 5). */
export function saveText(name: string, kind: NpcGroup['kind'], die: Die, damage: number, roll: number | undefined, result: SaveResult): string {
  if (result.noSave) return `${name} is KO'd outright: ${damage} damage is at least double its ${die}.`
  const saved = roll !== undefined && roll >= damage
  const head = `${name} ${saved ? 'saved' : 'failed its save'} against ${damage} (rolled ${roll})`
  if (result.outcome === 'ko') return `${head}: KO'd.`
  if (result.outcome === 'shrink') return `${head}: drops to ${result.newDie}.`
  return kind === 'minions' ? `${head}: already d4, nothing happens.` : `${head}: stays ${die}.`
}

/** A member's save against damage: its roll (none when KO'd outright) and the result. */
export interface MemberSave {
  memberId: string
  damage: number
  roll?: NpcRoll
  result: SaveResult
}

/** Rolls a member's save against damage. */
export function rollSave(kind: NpcGroup['kind'], member: Pick<NpcMember, 'id' | 'die' | 'mods'>, damage: number, random: Random): MemberSave {
  const outright = save(kind, member, damage, Number.POSITIVE_INFINITY)
  if (outright.noSave) return { memberId: member.id, damage, result: outright }
  const roll = rollWithMods(member.die, member.mods, random)
  return { memberId: member.id, damage, roll, result: save(kind, member, damage, roll.total) }
}

const usedUp = (mods: readonly PlayMod[], used: readonly PlayMod[]) => mods.filter((m) => m.persistent || !used.some((u) => u.id === m.id))

/** Carries out a member's save: its die changes or it's KO'd, its one-time mods used are used up, and the log says so. */
export function applySave(game: Game, groupId: string, s: MemberSave, clock: Clock): Game {
  const group = game.groups.find((g) => g.id === groupId)
  const member = group?.members.find((m) => m.id === s.memberId)
  if (!group || !member) return game
  const name = memberName(group, member.n)
  const text = saveText(name, group.kind, member.die, s.damage, s.roll?.total, s.result)
  const line = { id: clock.newId(), at: clock.now.toISOString(), by: group.name, text, ...(group.hidden ? { gmOnly: true as const } : {}) }
  if (s.result.outcome === 'ko') return removeMember(withLog(game, [line]), groupId, member.id, clock, 'ko')
  const mods = s.roll ? usedUp(member.mods, s.roll.mods) : member.mods
  const die = s.result.newDie ?? member.die
  const next = { ...game, groups: game.groups.map((g) => (g.id === groupId ? { ...g, members: g.members.map((m) => (m.id === member.id ? { ...m, die, mods } : m)) } : g)) }
  return withLog(next, [line])
}

/** A hero's minion saves against damage, as a minion (it has no "lieutenant" kind). */
function heroMinionSave(game: Game, heroId: string, minion: PlayMinion, damage: number, random: Random, clock: Clock): { game: Game; text: string } {
  const roll = rollWithMods(minion.die, minion.mods, random)
  const result = save('minions', minion, damage, roll.total)
  const text = saveText(minion.name, 'minions', minion.die, damage, roll.total, result)
  const next = changeHeroPlay(
    game,
    heroId,
    (p) => {
      const kept = { ...p, minions: (p.minions ?? []).map((m) => (m.id === minion.id ? { ...m, mods: usedUp(m.mods, roll.mods) } : m)) }
      if (result.outcome === 'ko') return removeMinion(kept, minion.id, clock, "KO'd:")
      return result.outcome === 'shrink' ? shrinkMinion(kept, minion.id, clock) : kept
    },
    clock,
    false,
  )
  return { game: next, text }
}

// ---- A group roll ----

/** One rolled member, and the target the GM picked (none for Overcome, or "No target"). */
export interface GroupRollRow {
  memberId: string
  roll: NpcRoll
  target?: NpcTarget
}

/** Rolls the chosen members, each with its own die and mods. */
export function rollMembers(group: NpcGroup, memberIds: readonly string[], random: Random): GroupRollRow[] {
  return memberIds.flatMap((id) => {
    const m = group.members.find((x) => x.id === id)
    return m ? [{ memberId: id, roll: rollWithMods(m.die, m.mods, random) }] : []
  })
}

/** "a −2 penalty", "a +1 bonus", or "no bonus" for a size of 0. */
const sized = (size: number, sign: 1 | -1) => (size === 0 ? (sign > 0 ? 'no bonus' : 'no penalty') : `a ${sign > 0 ? '+' : '−'}${size} ${sign > 0 ? 'bonus' : 'penalty'}`)

/**
 * Applies a group roll (section 4): each row's result goes to its target, every rolled member is
 * marked acted and uses up its one-time mods, and each line is logged. `random` rolls the saves
 * of hero minions that are attacked.
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
      next = withLog(next, [{ id: clock.newId(), at: clock.now.toISOString(), by: group.name, text, ...(gmOnly ? { gmOnly: true as const } : {}) }])
    }
    const target = row.target
    const targetName = target && npcTargetName(next, target)
    if (action === 'overcome') {
      say(`${name} took Overcome: ${row.roll.total} (${overcomeOutcome(row.roll.total)}).`)
      continue
    }
    if (!target || !targetName) {
      say(`${name} took ${ACTION_NAME[action]}: ${row.roll.total}, with no target.`)
      continue
    }
    switch (action) {
      case 'attack':
        if (target.kind === 'hero') {
          say(`${name} attacked ${targetName}: ${amount} damage.`)
          next = changeHeroPlay(
            next,
            target.id,
            (p, sheet) => {
              const built = buildSheet(sheet)
              const now = currentHealth(built, p)
              return now === undefined ? p : setHealth(p, built, now - amount, clock)
            },
            clock,
          )
        } else if (target.kind === 'heroMinion') {
          const minion = findHero(next, target.heroId)?.play.minions?.find((m) => m.id === target.minionId)
          if (!minion) continue
          say(`${name} attacked ${targetName}: ${amount} damage.`)
          const saved = heroMinionSave(next, target.heroId, minion, amount, random, clock)
          next = saved.game
          say(saved.text)
        }
        break
      case 'hinder':
      case 'boost': {
        const sign = action === 'boost' ? 1 : -1
        const size = modSize(row.roll.total)
        say(`${name} ${action === 'boost' ? 'boosted' : 'hindered'} ${targetName}: ${sized(size, sign)}.`)
        if (size === 0) break
        const mod = { label: group.name, value: sign * size }
        if (target.kind === 'hero') next = changeHeroPlay(next, target.id, (p) => addMod(p, mod, clock, { from: name }), clock, false)
        else if (target.kind === 'villain') next = changeVillainPlay(next, target.id, (p) => addMod(p, mod, clock, { from: name }), clock, false)
        else if (target.kind === 'member') next = addMemberMod(next, target.groupId, target.memberId, mod, clock)
        break
      }
      case 'defend':
        say(`${name} defended ${targetName}: Defend ${amount}.`)
        break
    }
  }
  return next
}
