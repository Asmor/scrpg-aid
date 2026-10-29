/** How a villain's status die works (p. 220–234). */
import type { Die } from '../rules/types'
import type { VillainStatusRule } from '../rules/villain-types'

/** One line: "Status follows its Health zone", "Status: d8, always". */
export function statusSummary(rule: VillainStatusRule): string {
  switch (rule.basis) {
    case 'healthZone':
      return 'Status follows its Health zone.'
    case 'count':
      return `Status depends on the number of ${rule.counts}.`
    case 'fixed':
      return `Status: ${rule.die}, always.`
    case 'weakness':
      return 'Status depends on penalties related to its weakness.'
    case 'challenge':
      return `Status starts at ${rule.startingDie} and drops as its challenge is completed.`
  }
}

const range = (min: number, max?: number) => (max === undefined ? `${min} or more` : min === max ? `${min}` : `${min}–${max}`)

/** The rule's details as lines: the zone dice, the count or weakness tiers, or the Titan's challenge. */
export function statusDetailLines(rule: VillainStatusRule): string[] {
  switch (rule.basis) {
    case 'healthZone':
      return [`Green ${rule.zones.green}, Yellow ${rule.zones.yellow}, Red ${rule.zones.red}`]
    case 'count':
      return rule.tiers.map((t) => `${range(t.min, t.max)}: ${t.die}`)
    case 'weakness':
      return rule.tiers.map((t) => `${t.condition}: ${t.die}`)
    case 'challenge':
      return rule.challenge.map((c) => `${c.text} (${c.successes} ${c.successes === 1 ? 'success' : 'successes'})`)
    case 'fixed':
      return []
  }
}

/** One row of the sheet's status table: when it applies, and its die (none for a challenge step). */
export interface StatusRow {
  when: string
  die?: Die
}

const countLabel = (min: number, max?: number) => (max === undefined ? `${min} or more` : min === 0 && max === 0 ? 'None' : min === max ? `${min}` : max === min + 1 ? `${min} or ${max}` : `${min} to ${max}`)

/** The rule as rows of condition and die, for the sheet: the zones, the tiers, the one die, or the challenge. */
export function statusRows(rule: VillainStatusRule): StatusRow[] {
  switch (rule.basis) {
    case 'healthZone':
      return (['green', 'yellow', 'red'] as const).map((z) => ({ when: `${z[0]!.toUpperCase()}${z.slice(1)} zone`, die: rule.zones[z] }))
    case 'count':
      return rule.tiers.map((t) => ({ when: countLabel(t.min, t.max), die: t.die }))
    case 'weakness':
      return rule.tiers.map((t) => ({ when: t.condition, die: t.die }))
    case 'fixed':
      return [{ when: 'Always', die: rule.die }]
    case 'challenge':
      return [{ when: 'To start', die: rule.startingDie }, ...rule.challenge.map((c) => ({ when: `${c.text} (${c.successes} ${c.successes === 1 ? 'success' : 'successes'})` }))]
  }
}
