/** How a villain's status die works (p. 220–234). */
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
