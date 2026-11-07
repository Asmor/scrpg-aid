/**
 * Running groups of minions and lieutenants (scrpg-aid-designs/npcs/spec.md, sections 4 and 5). Pure,
 * given the dice (`random`).
 *
 * - A group roll: each chosen member rolls its own die with its own mods, then the GM picks a
 *   target for each result (./target-options.ts). Applying it is in ./resolve.ts.
 * - Saves: a minion or lieutenant that takes damage rolls its own die with its mods
 *   (../rules/saves.ts). A Minion-Maker hero's minions save as minions.
 */
import type { PlayMinion, PlayMod } from '../hero/model'
import { removeMinion, shrinkMinion } from '../play/minions'
import { blockWith, defensesOf, pickDefense, removeDefense, type Defense } from '../play/defense'
import type { Clock } from '../play/state'
import { rollDie } from '../rules/rolling'
import { save, type SaveResult } from '../rules/saves'
import type { BasicAction, Die } from '../rules/types'
import type { TableTarget } from './actions'
import type { Game, NpcGroup, NpcMember } from './model'
import { changeHeroPlay, findHero, memberName, removeMember, withLog } from './table'

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
  /** The number came from physical dice. */
  entered?: boolean
}

export function rollWithMods(die: Die, mods: readonly PlayMod[], random: Random, entered?: number): NpcRoll {
  const used = npcRollMods(mods)
  const value = entered ?? rollDie(die, random)
  return { value, mods: used, total: value + used.reduce((s, m) => s + m.value, 0), ...(entered !== undefined ? { entered: true } : {}) }
}

/** "5 − 1 Dazed": how a total was made (just the value without mods). */
export function rollMath(roll: Pick<NpcRoll, 'value' | 'mods'>): string {
  return [String(roll.value), ...roll.mods.map((m) => `${m.value > 0 ? '+' : '−'} ${Math.abs(m.value)}${m.label.trim() ? ` ${m.label.trim()}` : ''}`)].join(' ')
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

/** The results table's verdict (section 5): "Failed · KO'd", "Saved · Drops to d6", … */
export function verdictText(kind: NpcGroup['kind'], die: Die, result: SaveResult, saved: boolean, noDamage = false): string {
  if (noDamage) return 'Blocked · No damage, so no save'
  if (result.noSave) return `KO'd outright · Damage was at least double its ${die}, so no save`
  const head = saved ? 'Saved' : 'Failed'
  if (result.outcome === 'ko') return `${head} · KO'd`
  if (result.outcome === 'shrink') return `${head} · Drops to ${result.newDie}`
  return kind === 'minions' ? `${head} · Already d4, nothing happens` : `${head} · Stays ${die}`
}

/**
 * What a group's abilities add to each damage save (a vehicle's Sturdy, +2), as mods: always on,
 * never used up, and labeled with the ability's name.
 */
export function groupSaveMods(group: Pick<NpcGroup, 'abilities'>): PlayMod[] {
  return (group.abilities ?? []).flatMap((a, i) => (a.saveBonus ? [{ id: `ability:${i}`, label: a.name.trim() || 'Ability', value: a.saveBonus, persistent: true as const }] : []))
}

/** Rolls saves for these members against the same damage. */
export function rollSaves(group: NpcGroup, memberIds: readonly string[], damage: number, random: Random, defenseIds: Readonly<Record<string, string>> = {}, entered: Readonly<Record<string, number>> = {}): MemberSave[] {
  const extra = groupSaveMods(group)
  return memberIds.flatMap((id) => {
    const m = group.members.find((x) => x.id === id)
    return m ? [rollSave(group.kind, m, damage, random, defenseIds[id], extra, entered[id])] : []
  })
}

/** The members who'd actually roll a save against this damage: a defense can block it all, and some saves need no roll. */
export function membersWhoSave(group: NpcGroup, memberIds: readonly string[], damage: number, defenseIds: Readonly<Record<string, string>> = {}): string[] {
  return rollSaves(group, memberIds, damage, () => 0, defenseIds).flatMap((s) => (s.roll ? [s.memberId] : []))
}

/** Applies saves in turn (the Damage dialog's Apply). */
export function applySaves(game: Game, groupId: string, saves: readonly MemberSave[], clock: Clock): Game {
  return saves.reduce((g, s) => applySave(g, groupId, s, clock), game)
}

/**
 * A member's save against a hit: the damage that got through its defense (`damage`), the hit
 * before it (`incoming`) and the defense used, its roll (none when KO'd outright, or when no
 * damage got through: then there's no save at all), and the result.
 */
export interface MemberSave {
  memberId: string
  damage: number
  incoming: number
  defense?: Defense
  roll?: NpcRoll
  result: SaveResult
  /** The defense blocked all of it: no damage, so no save. */
  noDamage?: true
}

/** Rolls a member's save against a hit, after one of its defenses (ruling 65): the one chosen, or the default. `extra`: mods from its group's abilities ({@link groupSaveMods}). */
export function rollSave(kind: NpcGroup['kind'], member: Pick<NpcMember, 'id' | 'die' | 'mods' | 'defenses'>, incoming: number, random: Random, defenseId?: string, extra: readonly PlayMod[] = [], entered?: number): MemberSave {
  const defense = pickDefense(defensesOf(member), incoming, defenseId)
  const damage = blockWith(incoming, defense).taken
  const base = { memberId: member.id, damage, incoming, ...(defense ? { defense } : {}) }
  if (damage === 0) return { ...base, result: { outcome: 'stay' }, noDamage: true }
  const outright = save(kind, member, damage, Number.POSITIVE_INFINITY)
  if (outright.noSave) return { ...base, result: outright }
  const roll = rollWithMods(member.die, [...member.mods, ...extra], random, entered)
  return { ...base, roll, result: save(kind, member, damage, roll.total) }
}

/** The log line for a member's save, with its defense first: "Defend 2 blocked 2 of 7. Burglars 2 saved against 5 …". */
export function memberSaveText(name: string, kind: NpcGroup['kind'], die: Die, s: MemberSave): string {
  if (s.noDamage) return `${name} took no damage: ${s.defense ? `Defend ${s.defense.value}` : 'its defense'} blocked all ${s.incoming}.`
  const block = s.defense ? `${name}'s Defend ${s.defense.value} blocked ${s.incoming - s.damage} of ${s.incoming}. ` : ''
  return block + saveText(name, kind, die, s.damage, s.roll?.total, s.result)
}

export const usedUp = (mods: readonly PlayMod[], used: readonly PlayMod[]) => mods.filter((m) => m.persistent || !used.some((u) => u.id === m.id))

/** Carries out a member's save: its die changes or it's KO'd, its one-time mods used are used up, and the log says so. */
export function applySave(game: Game, groupId: string, s: MemberSave, clock: Clock): Game {
  const group = game.groups.find((g) => g.id === groupId)
  const member = group?.members.find((m) => m.id === s.memberId)
  if (!group || !member) return game
  const name = memberName(group, member.n)
  const text = memberSaveText(name, group.kind, member.die, s)
  const line = { id: clock.newId(), at: clock.now.toISOString(), by: group.name, text, ...(group.hidden ? { gmOnly: true as const } : {}) }
  if (s.result.outcome === 'ko') return removeMember(withLog(game, [line]), groupId, member.id, clock, 'ko')
  const mods = s.roll ? usedUp(member.mods, s.roll.mods) : member.mods
  const die = s.result.newDie ?? member.die
  const after = (m: NpcMember) => {
    const changed = { ...m, die, mods }
    return s.defense ? removeDefense(changed, s.defense.id) : changed
  }
  const next = { ...game, groups: game.groups.map((g) => (g.id === groupId ? { ...g, members: g.members.map((m) => (m.id === member.id ? after(m) : m)) } : g)) }
  return withLog(next, [line])
}

/**
 * A hero's minion saves against `incoming` damage, as a minion, after one of its defenses
 * (ruling 65): its die shrinks or it's KO'd, and its one-time mods used are used up. Returns the
 * game and the save's line.
 */
export function heroMinionSave(game: Game, heroId: string, minionId: string, incoming: number, random: Random, clock: Clock): { game: Game; text: string } | undefined {
  const minion = findHero(game, heroId)?.play.minions?.find((m) => m.id === minionId)
  if (!minion) return undefined
  const s = rollSave('minions', minion, incoming, random)
  const text = memberSaveText(minion.name, 'minions', minion.die, s)
  const next = changeHeroPlay(
    game,
    heroId,
    (p) => {
      const after = (m: PlayMinion) => {
        const used = { ...m, mods: s.roll ? usedUp(m.mods, s.roll.mods) : m.mods }
        return s.defense ? removeDefense(used, s.defense.id) : used
      }
      const kept = { ...p, minions: (p.minions ?? []).map((m) => (m.id === minion.id ? after(m) : m)) }
      if (s.noDamage) return kept
      if (s.result.outcome === 'ko') return removeMinion(kept, minion.id, clock, "KO'd:")
      return s.result.outcome === 'shrink' ? shrinkMinion(kept, minion.id, clock) : kept
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
  target?: TableTarget
}

/** Rolls the chosen members, each with its own die and mods, or takes the numbers entered from physical dice. */
export function rollMembers(group: NpcGroup, memberIds: readonly string[], random: Random, entered: Readonly<Record<string, number>> = {}): GroupRollRow[] {
  return memberIds.flatMap((id) => {
    const m = group.members.find((x) => x.id === id)
    return m ? [{ memberId: id, roll: rollWithMods(m.die, m.mods, random, entered[id]) }] : []
  })
}
