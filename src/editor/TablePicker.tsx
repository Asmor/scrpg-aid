/**
 * Choosing a table entry (background, power source, archetype, personality). Guided: roll
 * the step's dice (in the app, or typed in from real dice), then pick an entry one die or
 * the sum of two reaches, with one reroll per step. Constructed: pick any entry.
 */
import { useId, useState, type ReactNode } from 'react'
import { canReroll, checkManualResults, newRoll, reroll, rollDice, rolledOn, tableOptions, type RollRecord, type RollSource } from '../rules/rolling'
import type { Die } from '../rules/types'
import type { CreationMethod } from '../hero/model'
import { DiceList, DieIcon } from '../components/icons'

interface Entry {
  id: string
  roll: number
  name: string
}

interface TablePickerProps<T extends Entry> {
  /** What's being chosen, e.g. "background". */
  what: string
  method: CreationMethod
  dice: readonly Die[]
  table: readonly T[]
  roll: RollRecord | undefined
  selectedId: string | undefined
  onRoll: (roll: RollRecord) => void
  onSelect: (entry: T) => void
  /** Extra detail shown under each entry. */
  describe?: (entry: T) => ReactNode
  /**
   * A roll made for another choice that this one may pick from until it's rolled for itself
   * (Modular's base archetype can be another option from the archetype roll). Rolling here
   * replaces it, with a reroll of its own (rulings 46 and 47).
   */
  inherited?: { roll: RollRecord; from: string }
  /** Injectable for tests. */
  random?: () => number
}

const listAnd = (xs: readonly (string | number)[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : String(xs[0] ?? ''))

function sourceText(roll: RollRecord, source: RollSource): string {
  return 'die' in source ? `${roll.results[source.die]}` : `${roll.results[source.sum[0]]} + ${roll.results[source.sum[1]]}`
}

/** Typed-in results for real dice. */
function ManualRoll({ dice, label, onDone, onCancel }: { dice: readonly Die[]; label: string; onDone: (results: number[]) => void; onCancel: () => void }) {
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
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  )
}

export function TablePicker<T extends Entry>({ what, method, dice, table, roll, selectedId, onRoll, onSelect, describe, inherited, random }: TablePickerProps<T>) {
  const name = useId()
  const [manual, setManual] = useState<'roll' | 'reroll' | null>(null)
  const diceText = `${listAnd(dice)}`

  // A roll made on other dice (an earlier step changed them) doesn't count: roll afresh,
  // keeping the step's reroll (the user's ruling 42 in data/rulings.md).
  const current = roll && rolledOn(roll, dice) ? roll : undefined
  const stale = roll && !current ? roll : undefined
  const borrowed = !roll && inherited && rolledOn(inherited.roll, dice) ? inherited : undefined
  const shown = current ?? borrowed?.roll
  const doRoll = (again: boolean) => {
    // A reroll uses the same dice as the roll it replaces.
    if (again && current) onRoll(reroll(current, rollDice(current.dice, random), false))
    else onRoll(newRoll(dice, rollDice(dice, random), false))
  }

  let options: { entry: T; note?: string }[] = []
  if (method === 'constructed') {
    options = [...table].sort((a, b) => a.roll - b.roll).map((entry) => ({ entry }))
  } else if (shown) {
    options = tableOptions(table, shown.results).map(({ entry, sources }) => ({ entry, note: `rolled ${sources.map((s) => sourceText(shown, s)).join(' or ')}` }))
  }
  const selected = table.find((t) => t.id === selectedId)
  if (selected && !options.some((o) => o.entry.id === selected.id)) {
    options.unshift({ entry: selected, note: method === 'guided' ? (shown ? 'your current choice; not reached by this roll' : 'your current choice') : undefined })
  }

  return (
    <div className="table-picker">
      {method === 'guided' && (
        <div className="table-picker__roll">
          {current ? (
            <p>
              You rolled <strong>{listAnd(current.results)}</strong> on <DiceList dice={current.dice} />
              {current.manual ? ' (typed in)' : ''}
              {current.rerolled ? ', after using your reroll' : ''}. Pick a {what} matching one die or the sum of two.
            </p>
          ) : borrowed ? (
            <p>
              Your {borrowed.from} roll was <strong>{listAnd(borrowed.roll.results)}</strong> on <DiceList dice={borrowed.roll.dice} />. Pick a {what} it reaches, or roll <DiceList dice={dice} /> for a fresh roll (which gets a reroll of its own).
            </p>
          ) : stale ? (
            <p role="alert">
              You rolled {listAnd(stale.results)} on <DiceList dice={stale.dice} />, but this step's dice are now <DiceList dice={dice} />, because an earlier choice changed. Roll again; this doesn't use your reroll.
            </p>
          ) : (
            <p>
              Roll <DiceList dice={dice} /> to see which {what}s you can choose from.
            </p>
          )}
          {manual ? (
            <ManualRoll
              dice={manual === 'reroll' && current ? current.dice : dice}
              label={manual === 'reroll' ? 'Your reroll' : 'Your roll'}
              onCancel={() => setManual(null)}
              onDone={(results) => {
                onRoll(manual === 'reroll' && current ? reroll(current, results, true) : newRoll(dice, results, true))
                setManual(null)
              }}
            />
          ) : !current ? (
            <div className="button-row">
              <button type="button" className="button button--primary" onClick={() => doRoll(false)}>
                Roll {diceText}
              </button>
              <button type="button" className="button" onClick={() => setManual('roll')}>
                Enter my own roll
              </button>
            </div>
          ) : canReroll(current) ? (
            <div className="button-row">
              <span>Don't like these? You can reroll once:</span>
              <button type="button" className="button" onClick={() => doRoll(true)}>
                Reroll
              </button>
              <button type="button" className="button" onClick={() => setManual('reroll')}>
                Enter my own reroll
              </button>
            </div>
          ) : null}
        </div>
      )}

      {options.length > 0 && (
        <fieldset className="choice-list">
          <legend className="visually-hidden">Choose a {what}</legend>
          {options.map(({ entry, note }) => (
            <label key={entry.id} className="choice">
              <input type="radio" name={name} checked={entry.id === selectedId} onChange={() => onSelect(entry)} />
              <span className="choice__body">
                <span className="choice__title">
                  <span className="choice__roll">{entry.roll}</span> {entry.name}
                  {note && <span className="choice__note"> ({note})</span>}
                </span>
                {describe && <span className="choice__detail">{describe(entry)}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {method === 'guided' && borrowed && options.length === 0 && (
        <p>
          That roll doesn't reach any {what}. Roll <DiceList dice={dice} /> for a fresh one.
        </p>
      )}
      {method === 'guided' && current && options.length === 0 && (
        <p>
          That roll doesn't reach any {what}.{' '}
          {canReroll(current) ? 'Use your reroll.' : 'Switch this hero to Constructed (at the top of the Background step) to pick any.'}
        </p>
      )}
    </div>
  )
}
