/**
 * A villain's status die at the table (docs/design/villains-and-challenges/spec.md, section 1):
 * worked out from its archetype's rule and what's on the table. Pure.
 *
 * Only revealed things count: a hidden item is staged, not in the scene.
 */
import { stepDie } from '../rules/dice'
import type { Die, Zone } from '../rules/types'
import type { CountTier, VillainStatusRule } from '../rules/villain-types'
import { setStatusCount, setWeaknessTier, villainHealth, villainZone } from '../villain/play'
import { buildVillainSheet } from '../villain/sheet'
import { heroDisplayName } from '../hero/model'
import { villainDisplayName } from '../villain/model'
import type { Clock } from '../play/state'
import { challengeDone, type Challenge, type Game, type GameFeedEntry, type VillainInGame } from './model'
import { changeVillainPlay, findVillain, withLog } from './table'

/** What the table holds, as far as a status die cares. */
export type StatusTable = Pick<Game, 'heroes' | 'villains' | 'groups' | 'challenges'>

export interface VillainStatus {
  /** None for a defeated villain whose die follows its Health zone. */
  die?: Die
  /** Worked out by the app; following a count the GM gave; or set by hand. */
  source: 'auto' | 'count' | 'manual'
  /** One short line: "5 GM minions and lieutenants", "Health in the Yellow zone", "Set by hand". */
  reason: string
  /** A count rule's count, as used. */
  count?: number
}

/** Who a count-from-the-table rule counts: the number, and what was counted. */
export interface TableCount {
  count: number
  parts: string[]
}

const revealed = <T extends { hidden: boolean }>(items: readonly T[]) => items.filter((i) => !i.hidden)
const groupPart = (g: { name: string; members: readonly unknown[] }) => `${g.name} ×${g.members.length}`

/**
 * What the archetypes that count from the table count (section 1, "What the app counts"). The
 * others with a count rule (Guerrilla, Predator, Inventor) depend on things the app doesn't track,
 * so the GM counts them.
 */
const TABLE_COUNTS: Readonly<Record<string, (villain: VillainInGame, table: StatusTable) => TableCount>> = {
  // A villain's minions are just GM minions, so this is all of them.
  overlord: (_, t) => {
    const groups = revealed(t.groups).filter((g) => g.owner.kind === 'gm')
    return { count: groups.reduce((n, g) => n + g.members.length, 0), parts: groups.map(groupPart) }
  },
  legion: (_, t) => {
    const groups = revealed(t.groups).filter((g) => g.owner.kind === 'gm' && g.kind === 'minions')
    return { count: groups.reduce((n, g) => n + g.members.length, 0), parts: groups.map(groupPart) }
  },
  domain: (_, t) => {
    const groups = revealed(t.groups).filter((g) => g.owner.kind === 'environment')
    const challenges = revealed(t.challenges).filter((c) => c.owner.kind === 'environment' && !challengeDone(c))
    return { count: groups.reduce((n, g) => n + g.members.length, 0) + challenges.length, parts: [...groups.map(groupPart), ...challenges.map((c) => c.name)] }
  },
  squad: (v, t) => otherVillains(v, t),
  loner: (v, t) => otherVillains(v, t),
  inhibitor: (_, t) => {
    const heroes = t.heroes.filter((h) => h.play.mods.some((m) => m.value < 0))
    return { count: heroes.length, parts: heroes.map((h) => heroDisplayName(h.sheet)) }
  },
}

function otherVillains(villain: VillainInGame, table: StatusTable): TableCount {
  const others = revealed(table.villains).filter((v) => v.id !== villain.id)
  return { count: others.length, parts: others.map((v) => villainDisplayName(v.sheet)) }
}

/** The words for a count rule: its stepper's label, its rule line, and its count on the card. */
interface CountWords {
  label: (name: string) => string
  rule: string
  /** What's counted: one, for the stepper's buttons and a count of 1, and many. */
  one: string
  many: string
}

const counted = (words: CountWords, n: number) => `${n} ${n === 1 ? words.one : words.many}`

const COUNT_WORDS: Readonly<Record<string, CountWords>> = {
  overlord: { label: () => 'GM minions and lieutenants in the scene', rule: 'GM minions and lieutenants in the scene', one: 'GM minion or lieutenant', many: 'GM minions and lieutenants' },
  legion: { label: () => 'GM minions in the scene', rule: 'GM minions in the scene', one: 'GM minion', many: 'GM minions' },
  domain: { label: () => "The environment's minions and lieutenants, and challenges not yet done", rule: "the environment's minions, lieutenants and challenges in the scene", one: 'environment minion, lieutenant or challenge', many: 'environment minions, lieutenants and challenges' },
  squad: { label: () => 'Other villains in the scene', rule: 'other villains in the scene', one: 'other villain', many: 'other villains' },
  loner: { label: () => 'Other villains in the scene', rule: 'other villains in the scene', one: 'other villain', many: 'other villains' },
  inhibitor: { label: () => 'Heroes with at least one penalty', rule: 'heroes with at least one penalty', one: 'hero with a penalty', many: 'heroes with a penalty' },
  guerrilla: { label: (name) => `Opponents engaged with ${name}`, rule: 'opponents engaged with it', one: 'opponent engaged', many: 'opponents engaged' },
  predator: { label: (name) => `Heroes engaged with ${name}`, rule: 'heroes engaged with it', one: 'hero engaged', many: 'heroes engaged' },
  inventor: { label: () => 'Bonuses and penalties made with Inventions or Science, and inventions in the scene', rule: 'its inventions in play', one: 'invention in play', many: 'inventions in play' },
}

const FALLBACK_WORDS: CountWords = { label: () => 'The count', rule: 'its count', one: 'counted', many: 'counted' }

const wordsFor = (archetypeId: string | undefined) => COUNT_WORDS[archetypeId ?? ''] ?? FALLBACK_WORDS

/** Whether a villain's count comes from the table (the GM can override it), or is the GM's to keep. */
export const countsFromTable = (villain: Pick<VillainInGame, 'sheet'>) => Boolean(villain.sheet.archetype && Object.hasOwn(TABLE_COUNTS, villain.sheet.archetype.id))

/** What the table says for a villain whose count comes from it. */
export function tableCount(villain: VillainInGame, table: StatusTable): TableCount | undefined {
  const count = villain.sheet.archetype && Object.hasOwn(TABLE_COUNTS, villain.sheet.archetype.id) ? TABLE_COUNTS[villain.sheet.archetype.id] : undefined
  return count?.(villain, table)
}

/** The stepper's label: "GM minions and lieutenants in the scene". */
export const countLabel = (villain: VillainInGame) => wordsFor(villain.sheet.archetype?.id).label(villainDisplayName(villain.sheet))

const ZONE_NAME: Record<Zone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

/** What the stepper counts, for its buttons: "GM minion or lieutenant". */
export const countUnit = (villain: VillainInGame) => wordsFor(villain.sheet.archetype?.id).one

/** The rule in one line, for the Running panel: "Overlord · by GM minions and lieutenants in the scene". */
export function statusRuleLine(villain: VillainInGame): string {
  const sheet = buildVillainSheet(villain.sheet)
  const rule = sheet.status
  const name = sheet.archetype ?? ''
  switch (rule?.basis) {
    case 'count':
      return `${name} · by ${wordsFor(villain.sheet.archetype?.id).rule}`
    case 'healthZone':
      return `${name} · follows its Health zone`
    case 'fixed':
      return `${name} · always ${rule.die}`
    case 'weakness':
      return `${name} · by penalties tied to its weakness`
    case 'challenge':
      return `${name} · ${rule.startingDie}, one size lower per completed part of its challenge`
    default:
      return name
  }
}

/** The tier a count falls in. */
export const tierFor = (tiers: readonly CountTier[], count: number) => tiers.find((t) => count >= t.min && (t.max === undefined || count <= t.max))

/** One rung of the ladder: its range of counts, its die, and whether the count is on it. */
export interface LadderRung {
  range: string
  die: Die
  current: boolean
}

/** The ladder of ranges, lowest count first. */
export function statusLadder(tiers: readonly CountTier[], count: number): LadderRung[] {
  const on = tierFor(tiers, count)
  return [...tiers].sort((a, b) => a.min - b.min).map((t) => ({ range: t.max === undefined ? `${t.min}+` : t.min === t.max ? String(t.min) : `${t.min}–${t.max}`, die: t.die, current: t === on }))
}

/** How many parts of a Titan's challenge are complete: each part is that many steps, in order. */
export function titanParts(rule: Extract<VillainStatusRule, { basis: 'challenge' }>, challenge: Pick<Challenge, 'steps'> | undefined): number {
  if (!challenge) return 0
  let at = 0
  let done = 0
  for (const part of rule.challenge) {
    const steps = challenge.steps.slice(at, at + part.successes)
    at += part.successes
    if (steps.length === part.successes && steps.every((s) => s.done)) done += 1
  }
  return done
}

/** A Titan's challenge on the table. */
export const linkedChallenge = (villainId: string, table: Pick<Game, 'challenges'>) => table.challenges.find((c) => c.linkedVillainId === villainId)

/** The villain's zone, by Health on its chart. */
function zoneOf(villain: VillainInGame) {
  return villainZone(villainHealth(villain.sheet, villain.play), villain.play)
}

/** The die and its reason by the rule alone, with no die set by hand. */
function byRule(villain: VillainInGame, rule: VillainStatusRule, table: StatusTable): Omit<VillainStatus, 'source'> & { source: 'auto' | 'count' } {
  switch (rule.basis) {
    case 'fixed':
      return { die: rule.die, source: 'auto', reason: 'Never changes' }
    case 'healthZone': {
      const zone = zoneOf(villain)
      if (!zone || zone === 'out') return { source: 'auto', reason: zone === 'out' ? 'Defeated' : 'No Health yet' }
      return { die: rule.zones[zone], source: 'auto', reason: `Health in the ${ZONE_NAME[zone]} zone` }
    }
    case 'count': {
      const words = wordsFor(villain.sheet.archetype?.id)
      const fromTable = tableCount(villain, table)
      const override = villain.statusOverride?.count
      // Counted by hand, either by choice or because the app can't see what's counted.
      const count = fromTable ? (override ?? fromTable.count) : Math.max(0, villain.play.statusCount ?? 0)
      const tier = tierFor(rule.tiers, count)
      return { ...(tier ? { die: tier.die } : {}), source: fromTable && override === undefined ? 'auto' : 'count', reason: counted(words, count), count }
    }
    case 'weakness': {
      const tier = rule.tiers[villain.play.weaknessTier ?? rule.tiers.length - 1] ?? rule.tiers.at(-1)
      return { ...(tier ? { die: tier.die } : {}), source: 'auto', reason: tier?.condition ?? '' }
    }
    case 'challenge': {
      const parts = titanParts(rule, linkedChallenge(villain.id, table))
      return { die: stepDie(rule.startingDie, -parts, { min: 'd4' }), source: 'auto', reason: `${parts} of ${rule.challenge.length} parts done` }
    }
  }
}

/** The villain's status die now, and why. */
export function villainStatus(villain: VillainInGame, table: StatusTable): VillainStatus | undefined {
  const rule = buildVillainSheet(villain.sheet).status
  if (!rule) return undefined
  const auto = byRule(villain, rule, table)
  const die = villain.statusOverride?.die
  if (die) return { die, source: 'manual', reason: 'Set by hand', ...(auto.count !== undefined ? { count: auto.count } : {}) }
  return auto
}

// ---- Changes ----

/** The GM sets or clears a villain's overrides; the status die follows, and a change is logged. */
export function setStatusOverride(game: Game, villainId: string, override: { die?: Die; count?: number } | undefined): Game {
  if (!findVillain(game, villainId)) return game
  return {
    ...game,
    villains: game.villains.map((v) => {
      if (v.id !== villainId) return v
      const { statusOverride: _, ...rest } = v
      const die = override?.die
      const count = override?.count
      return die !== undefined || count !== undefined ? { ...rest, statusOverride: { ...(die !== undefined ? { die } : {}), ...(count !== undefined ? { count } : {}) } } : rest
    }),
  }
}

/** The GM's count for a villain the app can't count for. Status is the GM's, so it stays out of the shared log. */
export function setHandCount(game: Game, villainId: string, count: number, clock: Clock): Game {
  return changeVillainPlay(game, villainId, (p) => setStatusCount(p, count, clock), clock, false)
}

/** The GM's choice of a weakness condition. Status is the GM's, so it stays out of the shared log. */
export function setWeakness(game: Game, villainId: string, tier: number, condition: string, clock: Clock): Game {
  return changeVillainPlay(game, villainId, (p) => setWeaknessTier(p, tier, condition, clock), clock, false)
}

/** How long a villain's next status change replaces its last line instead of adding one. */
export const STATUS_COALESCE_MS = 1000

/** "Gravelord's status die is now d10 (5 GM minions and lieutenants)." */
const statusLine = (name: string, status: VillainStatus) => `${name}'s status die is now ${status.die} (${status.reason}).`

/**
 * Logs each villain whose status die a change moved, or whose die the GM set or cleared by hand,
 * GM only. A villain's changes within a second share one line, so removing several minions at once
 * logs once; a change by hand is a choice of its own, so it always gets its own line. A line that
 * would only repeat the one before it isn't kept. A villain just arriving, or leaving, has no
 * change to log.
 */
export function logStatusChanges(before: Game, after: Game, clock: Clock): Game {
  if (before === after || after.solo || !after.villains.length) return after
  let next = after
  for (const villain of after.villains) {
    const old = before.villains.find((v) => v.id === villain.id)
    if (!old) continue
    const was = villainStatus(old, before)?.die
    const status = villainStatus(villain, after)
    const byHand = old.statusOverride?.die !== villain.statusOverride?.die
    if (!status?.die || (status.die === was && !byHand)) continue
    const text = statusLine(villainDisplayName(villain.sheet), status)
    const at = clock.now.toISOString()
    const lines = next.feed.filter((e) => e.statusOf === villain.id)
    const recent = lines.at(-1)
    if (!byHand && recent && clock.now.getTime() - new Date(recent.at).getTime() < STATUS_COALESCE_MS) {
      // Back where it was before this burst of changes: no line at all.
      next = lines.at(-2)?.text === text ? { ...next, feed: next.feed.filter((e) => e !== recent) } : { ...next, feed: next.feed.map((e) => (e === recent ? { ...e, at, text } : e)) }
    } else if (recent?.text !== text) {
      const entry: GameFeedEntry = { id: clock.newId(), at, by: 'GM', text, gmOnly: true, statusOf: villain.id }
      next = withLog(next, [entry])
    }
  }
  return next
}

/** The newest status lines not in `before`, or changed since: what to announce to the GM. */
export function newStatusLines(before: readonly GameFeedEntry[], after: readonly GameFeedEntry[]): string[] {
  const known = new Map(before.map((e) => [e.id, e.text]))
  return after.filter((e) => e.statusOf && known.get(e.id) !== e.text).map((e) => e.text)
}
