/**
 * Saves that wait for the GM (scrpg-aid-designs/settings/spec.md, "Minion and lieutenant saves"):
 * with Ask each time or Use my physical dice, a minion's or lieutenant's save from an Attack waits
 * in Saves to roll until the GM rolls or enters it. The rule itself stays in ../rules/saves.ts,
 * through ./npc.ts. Pure.
 */
import type { PlayMod } from '../hero/model'
import { blockWith, defensesOf, pickDefense, removeDefense } from '../play/defense'
import type { Clock } from '../play/state'
import type { Game, NpcGroup, NpcMember, PendingSave } from './model'
import { applySave, groupSaveMods, membersWhoSave, rollSave, type Random } from './npc'
import { feedLine, memberName, withLog } from './table'

/** Whether a member's save against this hit needs a roll at all: a lieutenant KO'd outright, or a hit its defense blocks, doesn't. */
export function saveNeedsRoll(group: NpcGroup, memberId: string, damage: number, defenseId?: string): boolean {
  return membersWhoSave(group, [memberId], damage, defenseId ? { [memberId]: defenseId } : {}).length > 0
}

/** Puts a save aside for the GM. */
export function holdSave(game: Game, save: Omit<PendingSave, 'id' | 'at'>, clock: Clock): Game {
  return { ...game, pendingSaves: [...(game.pendingSaves ?? []), { ...save, id: clock.newId(), at: clock.now.toISOString() }] }
}

/**
 * A member is hit for `incoming` and its save waits for the GM: its defense (`defenseId`, or the
 * default) is used now, as it would be if the save were rolled at once, and the save waits
 * against the damage that got through.
 */
export function holdMemberSave(game: Game, groupId: string, memberId: string, incoming: number, defenseId: string | undefined, save: Pick<PendingSave, 'from' | 'forHero'>, clock: Clock): Game {
  const member = game.groups.find((g) => g.id === groupId)?.members.find((m) => m.id === memberId)
  if (!member) return game
  const defense = pickDefense(defensesOf(member), incoming, defenseId)
  const damage = blockWith(incoming, defense).taken
  const used = defense ? { ...game, groups: game.groups.map((g) => (g.id === groupId ? { ...g, members: g.members.map((m) => (m.id === memberId ? removeDefense(m, defense.id) : m)) } : g)) } : game
  return holdSave(used, { groupId, memberId, damage, ...(defense ? { incoming, defense } : {}), ...save }, clock)
}

/** A waiting save's group and member, if they're still at the table. */
function saverOf(game: Game, save: PendingSave): { group: NpcGroup; member: NpcMember } | undefined {
  const group = game.groups.find((g) => g.id === save.groupId)
  const member = group?.members.find((m) => m.id === save.memberId)
  return group && member ? { group, member } : undefined
}

const without = (game: Game, id: string): Game => {
  const rest = (game.pendingSaves ?? []).filter((s) => s.id !== id)
  const { pendingSaves: _, ...others } = game
  return rest.length ? { ...game, pendingSaves: rest } : others
}

/**
 * Settles one waiting save: rolled with `roll.random`, or with the number the GM entered
 * (`roll.entered`, before the member's mods, which apply as to a rolled one). The usual save line
 * is logged, and it's a toast for the attacking hero's player. A member that's gone since just
 * drops the save.
 */
export function resolvePendingSave(game: Game, id: string, roll: { random: Random } | { entered: number }, clock: Clock): Game {
  const save = game.pendingSaves?.find((s) => s.id === id)
  if (!save) return game
  const rest = without(game, id)
  const saver = saverOf(rest, save)
  if (!saver) return rest
  const random = 'random' in roll ? roll.random : () => 0
  // Its defense was used when the hit landed: a defense it got since doesn't block this hit.
  const rolled = rollSave(saver.group.kind, { ...saver.member, defenses: [] }, save.damage, random, undefined, groupSaveMods(saver.group), 'entered' in roll ? roll.entered : undefined)
  const s = save.defense ? { ...rolled, incoming: save.incoming ?? rolled.damage, defense: save.defense } : rolled
  return applySave(rest, saver.group.id, s, clock, save.forHero)
}

/** Rolls every save still waiting, for starting the next scene or finishing the issue, and says so in the log. */
export function rollWaitingSaves(game: Game, random: Random, clock: Clock): Game {
  const waiting = game.pendingSaves ?? []
  if (!waiting.length) return game
  // Saves for members that are gone are just dropped: only the others count.
  const live = waiting.filter((s) => saverOf(game, s))
  const said = live.length ? withLog(game, [feedLine(clock, `Rolled ${live.length === 1 ? 'the waiting save' : `${live.length} waiting saves`} automatically.`, { gmOnly: live.every((s) => saverOf(game, s)!.group.hidden) })]) : game
  return waiting.reduce((g, s) => resolvePendingSave(g, s.id, { random }, clock), said)
}

const signed = (m: Pick<PlayMod, 'value'>) => (m.value > 0 ? `+${m.value}` : `−${-m.value}`)

/** A Saves to roll row: "Burglar 2 (d6, −1 Dazed) saves against 5". Undefined once the member is gone. */
export function pendingSaveText(game: Game, save: PendingSave): string | undefined {
  const saver = saverOf(game, save)
  if (!saver) return undefined
  const { group, member } = saver
  const mods = [...member.mods, ...groupSaveMods(group)].map((m) => `${signed(m)} ${m.label.trim() || (m.value > 0 ? 'Bonus' : 'Penalty')}`)
  return `${memberName(group, member.n)} (${[member.die, ...mods].join(', ')}) saves against ${save.damage}`
}

/** What the attacking hero's player sees while it waits: "Waiting for the GM to roll Burglar 2's save" (no name once the GM has hidden its group). */
export function waitingSaveText(game: Game, save: PendingSave): string | undefined {
  const saver = saverOf(game, save)
  if (!saver) return undefined
  return saver.group.hidden ? 'Waiting for the GM to roll a save' : `Waiting for the GM to roll ${memberName(saver.group, saver.member.n)}'s save`
}
