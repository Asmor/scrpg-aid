/** How a villain archetype's status die works (p. 220–234), for the editor and the sheet. */
import { DiceText } from '../components/icons'
import type { VillainStatusRule } from '../rules/villain-types'
import { statusSummary } from './status'

const range = (min: number, max?: number) => (max === undefined ? `${min} or more` : min === max ? `${min}` : `${min}–${max}`)

export function StatusRuleText({ rule }: { rule: VillainStatusRule }) {
  return (
    <div className="villain-status">
      <p>
        <strong>Status die.</strong> <DiceText text={statusSummary(rule)} />
      </p>
      {rule.basis === 'healthZone' && <DiceText text={`Green ${rule.zones.green}, Yellow ${rule.zones.yellow}, Red ${rule.zones.red}.`} />}
      {rule.basis === 'count' && (
        <ul>
          {rule.tiers.map((t) => (
            <li key={t.min}>
              <DiceText text={`${range(t.min, t.max)}: ${t.die}`} />
            </li>
          ))}
        </ul>
      )}
      {rule.basis === 'weakness' && (
        <ul>
          {rule.tiers.map((t) => (
            <li key={t.condition}>
              <DiceText text={`${t.condition}: ${t.die}`} />
            </li>
          ))}
        </ul>
      )}
      {rule.basis === 'challenge' && (
        <ul>
          {rule.challenge.map((c) => (
            <li key={c.text}>
              {c.text} ({c.successes} {c.successes === 1 ? 'success' : 'successes'})
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
