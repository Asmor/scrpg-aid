/**
 * The parts every wizard step is made of, in order (the hero wizard spec, "Step anatomy"):
 * Dice in, Choose, Assign, Abilities, Dice out, then the step's issues. A step leaves out
 * the parts it doesn't need.
 */
import { useId, type ReactNode } from 'react'
import type { Die } from '../rules/types'
import { DiceText, DieIcon } from '../components/icons'
import { focusIssue, type IssueRef, type IssueSection } from './issue-targets'

/** One titled part of a step. `section` lets issue links find it. */
export function StepSection({ title, section, children }: { title: string; section?: IssueSection; children: ReactNode }) {
  const id = useId()
  return (
    <section className="step-section" data-section={section} aria-labelledby={id}>
      <h4 id={id}>{title}</h4>
      {children}
    </section>
  )
}

/** A row of dice icons. */
export function DiceRow({ dice }: { dice: readonly Die[] }) {
  return (
    <span className="dice-row">
      {dice.map((d, i) => (
        <DieIcon key={i} die={d} />
      ))}
    </span>
  )
}

/** Constructed: the dice this step received from the step before. */
export function DiceIn({ from, dice }: { from: string; dice: readonly Die[] }) {
  return (
    <StepSection title="Dice in">
      <p className="dice-line">
        <span className="dice-line__label">From {from}</span> <DiceRow dice={dice} />
      </p>
    </StepSection>
  )
}

/** The dice this step hands on: "Power source rolls [d10] [d8]". */
export function DiceOut({ to, dice, note }: { to: string; dice: readonly Die[]; note?: ReactNode }) {
  return (
    <StepSection title="Dice out">
      <p className="handoff">
        <span>{to} rolls</span> <DiceRow dice={dice} />
        {note && <span className="handoff__note">{note}</span>}
      </p>
    </StepSection>
  )
}

/**
 * The step's rule issues, pinned at its end: each a link that takes the player to the part
 * it's about (and focuses its first control). Without any, a quiet line says so.
 */
export function StepIssues<W extends IssueRef>({ issues, onGo }: { issues: readonly W[]; onGo?: (issue: W) => void }) {
  const titleId = useId()
  if (issues.length === 0) return <p className="step-ok">No rule issues in this step.</p>
  return (
    <section className="issues" aria-labelledby={titleId}>
      <h4 id={titleId}>{issues.length === 1 ? '1 thing to look at' : `${issues.length} things to look at`}</h4>
      <ul>
        {issues.map((w, i) => (
          <li key={`${w.code}:${i}`}>
            {/* Styled as a link; a button, since it moves focus rather than going to a page. */}
            <button
              type="button"
              className="link-button"
              onClick={(e) => {
                if (onGo) return onGo(w)
                const step = e.currentTarget.closest<HTMLElement>('.wizard__step')
                if (step) focusIssue(step, w)
              }}
            >
              <DiceText text={w.message} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
