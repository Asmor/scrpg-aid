/**
 * Ids for targets at the table, and turning a confirmed roll in the roll dialog into the one
 * action a player's device sends (./actions.ts). Pure. Who can be picked is ./target-options.ts.
 *
 * The roll dialog names targets by a string id; here those ids say what they point at:
 * "hero:<id>", "heroMinion:<hero id>:<minion id>", "villain:<id>" or "member:<group id>:<member id>".
 */
import type { RollRecord } from '../play/roll'
import type { BasicAction } from '../rules/types'
import type { ModInput, NewMinion, RollAction, TableTarget } from './actions'

export function targetId(t: TableTarget): string {
  switch (t.kind) {
    case 'member':
      return `member:${t.groupId}:${t.memberId}`
    case 'heroMinion':
      return `heroMinion:${t.heroId}:${t.minionId}`
    default:
      return `${t.kind}:${t.id}`
  }
}

export function parseTarget(id: string): TableTarget | undefined {
  const [kind, a, b, ...rest] = id.split(':')
  if (rest.length) return undefined
  if ((kind === 'hero' || kind === 'villain') && a && b === undefined) return { kind, id: a }
  if (kind === 'heroMinion' && a && b) return { kind, heroId: a, minionId: b }
  if (kind === 'member' && a && b) return { kind: 'member', groupId: a, memberId: b }
  return undefined
}

/** What the roll dialog rolled: a basic action, or an ability by name. */
export type RolledSubject = { kind: 'basic'; action?: BasicAction } | { kind: 'ability'; name: string }

/**
 * A confirmed roll as the action to send, for the hero `heroId`: follow-up mods sorted into the
 * hero's own, their minions', and others'. Defending the hero itself has no `to`.
 */
export function rollAction(heroId: string, subject: RolledSubject, record: RollRecord, followUps: readonly { mod: ModInput; to?: string }[], formChoice?: string, made: readonly NewMinion[] = [], attackChoices: readonly { result: number; to: string }[] = []): RollAction {
  const selfMods: ModInput[] = []
  const minionMods: RollAction['minionMods'] = []
  const others: RollAction['others'] = []
  const isSelf = (t: TableTarget | undefined) => t?.kind === 'hero' && t.id === heroId
  for (const f of followUps) {
    const to = f.to ? parseTarget(f.to) : undefined
    if (f.to && !to) continue
    if (!to || isSelf(to)) selfMods.push(f.mod)
    else if (to.kind === 'heroMinion' && to.heroId === heroId) minionMods.push({ minionId: to.minionId, mod: f.mod })
    else others.push({ to, mod: f.mod })
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
      const to = record.results[a.result]?.action === 'attack' ? parseTarget(a.to) : undefined
      return to ? [{ result: a.result, to }] : []
    }),
    defends: attackChoices.flatMap((a) => {
      if (record.results[a.result]?.action !== 'defend') return []
      const to = a.to ? parseTarget(a.to) : undefined
      return [{ result: a.result, ...(to && !isSelf(to) ? { to } : {}) }]
    }),
  }
}
