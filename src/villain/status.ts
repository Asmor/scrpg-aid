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
