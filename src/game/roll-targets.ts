/**
 * Who a player's Boost or Hinder can go to at the table, and turning a confirmed roll in the roll
 * dialog into the one action a player's device sends (./actions.ts). Pure.
 *
 * The roll dialog names targets by a string id; here those ids say what they point at:
 * "hero:<id>", "villain:<id>", "member:<group id>:<member id>", or "minion:<id>" for the
 * player's own minion.
 */
import type { RollRecord } from '../play/roll'
import type { BasicAction } from '../rules/types'
import type { ModInput, NewMinion, RollAction, TableTarget } from './actions'
import type { TableView } from './project'
import { memberName } from './table'

export const OWN_MINION = 'minion:'

export function targetId(t: TableTarget): string {
  return t.kind === 'member' ? `member:${t.groupId}:${t.memberId}` : `${t.kind}:${t.id}`
}

export function parseTarget(id: string): TableTarget | undefined {
  const [kind, a, b] = id.split(':')
  if ((kind === 'hero' || kind === 'villain') && a) return { kind, id: a }
  if (kind === 'member' && a && b) return { kind: 'member', groupId: a, memberId: b }
  return undefined
}

/** Everyone at the table a player's roll can give a bonus or penalty to, or Attack: the other heroes, villains, and group members. */
export function tableTargets(view: Pick<TableView, 'heroes' | 'villains' | 'groups'>, heroId: string): { id: string; name: string }[] {
  return [
    ...view.heroes.filter((h) => h.id !== heroId).map((h) => ({ id: targetId({ kind: 'hero', id: h.id }), name: h.sheet.details.name.trim() || 'A hero' })),
    ...view.villains.filter((v) => !v.hidden).map((v) => ({ id: targetId({ kind: 'villain', id: v.id }), name: v.name })),
    ...view.groups.filter((g) => !g.hidden).flatMap((g) => g.members.map((m) => ({ id: targetId({ kind: 'member', groupId: g.id, memberId: m.id }), name: memberName(g, m.n) }))),
  ]
}

/** What the roll dialog rolled: a basic action, or an ability by name. */
export type RolledSubject = { kind: 'basic'; action?: BasicAction } | { kind: 'ability'; name: string }

/** A confirmed roll as the action to send: follow-up mods sorted into the hero's own, their minions', and others'. */
export function rollAction(subject: RolledSubject, record: RollRecord, followUps: readonly { mod: ModInput; to?: string }[], formChoice?: string, made: readonly NewMinion[] = [], attackChoices: readonly { result: number; to: string }[] = []): RollAction {
  const selfMods: ModInput[] = []
  const minionMods: RollAction['minionMods'] = []
  const others: RollAction['others'] = []
  for (const f of followUps) {
    if (!f.to) selfMods.push(f.mod)
    else if (f.to.startsWith(OWN_MINION)) minionMods.push({ minionId: f.to.slice(OWN_MINION.length), mod: f.mod })
    else {
      const to = parseTarget(f.to)
      if (to) others.push({ to, mod: f.mod })
    }
  }
  return {
    subject: subject.kind === 'ability' ? { kind: 'ability', name: subject.name } : { kind: 'basic', ...(subject.action ? { action: subject.action } : {}) },
    record,
    ...(formChoice !== undefined ? { formChoice } : {}),
    selfMods,
    minionMods,
    others,
    made: [...made],
    attacks: attackChoices.flatMap((a) => {
      const to = parseTarget(a.to)
      return to ? [{ result: a.result, to }] : []
    }),
  }
}
