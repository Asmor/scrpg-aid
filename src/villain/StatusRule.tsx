/** How a villain archetype's status die works (p. 220–234), for the editor and the sheet. */
import { DiceText } from '../components/icons'
import type { VillainStatusRule } from '../rules/villain-types'
import { statusDetailLines, statusSummary } from './status'

export function StatusRuleText({ rule }: { rule: VillainStatusRule }) {
  return (
    <div className="villain-status">
      <p>
        <strong>Status die.</strong> <DiceText text={statusSummary(rule)} />
      </p>
      {rule.basis === 'healthZone' ? (
        <DiceText text={`${statusDetailLines(rule)[0]}.`} />
      ) : (
        statusDetailLines(rule).length > 0 && (
          <ul>
            {statusDetailLines(rule).map((line) => (
              <li key={line}>
                <DiceText text={line} />
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
