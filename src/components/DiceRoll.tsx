/**
 * Rolling dice, in the app or with real ones: each rolled die shows its number large with
 * its icon under it, a Re-roll button says what's left, and "Enter my own roll" takes the
 * player's own results, checked against each die's size. Shared by creation now and play
 * later. The tiles keep their size, leaving room for a dice animation; with
 * prefers-reduced-motion the animation is skipped (see the CSS).
 */
import { useId, useState, type ReactNode } from 'react'
import { checkManualResults } from '../rules/rolling'
import type { Die } from '../rules/types'
import { DiceList, DieIcon } from './icons'

const listAnd = (xs: readonly (string | number)[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : String(xs[0] ?? ''))

/** Rolled dice: each number large, its die's icon under it. */
export function RolledDice({ dice, results }: { dice: readonly Die[]; results: readonly number[] }) {
  return (
    <span className="rolled-dice" aria-hidden="true">
      {results.map((n, i) => (
        <span key={i} className="rolled-die">
          <b>{n}</b>
          <DieIcon die={dice[i]!} size="inline" />
        </span>
      ))}
    </span>
  )
}

/** Typed-in results for real dice, one field per die. */
export function ManualRoll({ dice, label, onDone, onCancel, cancelLabel = 'Cancel' }: { dice: readonly Die[]; label: string; onDone: (results: number[]) => void; onCancel?: () => void; cancelLabel?: string }) {
  const [values, setValues] = useState<string[]>(() => dice.map(() => ''))
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  const submit = () => {
    const checked = checkManualResults(
      dice,
      values.map((v) => (v.trim() === '' ? Number.NaN : Number(v))),
    )
    if (checked.ok) onDone(checked.results)
    else setError(checked.error)
  }
  return (
    <form
      className="manual-roll"
      // The results are checked here, with messages that explain the dice (a d10's 0 is a 10).
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <fieldset>
        <legend>{label}</legend>
        <div className="manual-roll__dice">
          {dice.map((die, i) => (
            <label key={i}>
              <DieIcon die={die} /> #{i + 1}
              <input
                type="number"
                inputMode="numeric"
                min={die === 'd10' ? 0 : 1}
                max={Number(die.slice(1))}
                value={values[i]}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </label>
          ))}
        </div>
        {error && (
          <p id={errorId} className="error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button button--primary">
            Use these results
          </button>
          {onCancel && (
            <button type="button" className="button" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
        </div>
      </fieldset>
    </form>
  )
}

/** A roll as the roll component shows it. */
export interface ShownRoll {
  dice: readonly Die[]
  results: readonly number[]
  manual?: boolean
  rerolled?: boolean
}

interface DiceRollProps {
  /** The dice to roll when there's no roll yet. */
  dice: readonly Die[]
  roll: ShownRoll | undefined
  /** Whether the one re-roll is still there to use. */
  canReroll: boolean
  /** Rolls in the app: the caller rolls `dice` (a fresh roll) or the roll's own dice (a re-roll). */
  onRoll: (again: boolean) => void
  /** The player's own results, for a fresh roll or a re-roll. */
  onManual: (results: number[], again: boolean) => void
  /** Show "Enter my own roll" first (the player chose My own dice on Start). */
  manualFirst?: boolean
  /** Said after the dice, e.g. "Pick 7, 3, or their sum, 10." */
  children?: ReactNode
}

export function DiceRoll({ dice, roll, canReroll, onRoll, onManual, manualFirst = false, children }: DiceRollProps) {
  const [manual, setManual] = useState<'roll' | 'reroll' | null>(null)
  // My own dice opens the fields straight away for a fresh roll.
  const typing = manual ?? (!roll && manualFirst ? 'roll' : null)
  return (
    <div className="dice-roll">
      {roll && (
        <div className="dice-roll__result">
          <RolledDice dice={roll.dice} results={roll.results} />
          <p className="dice-roll__summary">
            You rolled <strong>{listAnd(roll.results)}</strong> on <DiceList dice={roll.dice} />
            {roll.manual ? ' (typed in)' : ''}
            {roll.rerolled ? ', after using your re-roll' : ''}. {children}
          </p>
        </div>
      )}
      {typing ? (
        <ManualRoll
          // New dice (an earlier step changed them) start the fields afresh.
          key={(typing === 'reroll' && roll ? roll.dice : dice).join()}
          dice={typing === 'reroll' && roll ? roll.dice : dice}
          label={typing === 'reroll' ? 'Your re-roll' : 'Your roll'}
          onCancel={() => (manual ? setManual(null) : onRoll(false))}
          cancelLabel={manual ? 'Cancel' : 'Roll in the app instead'}
          onDone={(results) => {
            onManual(results, typing === 'reroll')
            setManual(null)
          }}
        />
      ) : !roll ? (
        <div className="button-row">
          <button type="button" className="button button--primary" onClick={() => onRoll(false)}>
            Roll {listAnd(dice)}
          </button>
          <button type="button" className="button" onClick={() => setManual('roll')}>
            Enter my own roll
          </button>
        </div>
      ) : (
        <div className="button-row">
          <button type="button" className="button button--small" disabled={!canReroll} onClick={() => onRoll(true)}>
            {canReroll ? 'Re-roll (1 left)' : 'Re-roll used'}
          </button>
          {canReroll && (
            <button type="button" className="button button--small" onClick={() => setManual('reroll')}>
              Enter my own re-roll
            </button>
          )}
        </div>
      )}
    </div>
  )
}
