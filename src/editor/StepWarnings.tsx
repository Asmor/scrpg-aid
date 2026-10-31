/** A step's rule problems, shown next to the choices they're about (warn only, never blocking). */
import { DiceText } from '../components/icons'

export function StepWarnings({ warnings }: { warnings: readonly { code: string; message: string }[] }) {
  if (warnings.length === 0) return <p className="step-ok">No rule issues so far.</p>
  return (
    <section className="step-warnings" aria-label="Rule issues in this step">
      <h4>To look at</h4>
      <ul>
        {warnings.map((w, i) => (
          <li key={`${w.code}:${i}`}>
            <DiceText text={w.message} />
          </li>
        ))}
      </ul>
    </section>
  )
}
