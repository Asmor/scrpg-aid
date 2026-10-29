/**
 * Choosing a table entry (background, power source, archetype, personality): the step's
 * Dice in and Choose sections. Guided: roll the step's dice (in the app, or typed in from
 * real dice), then pick an entry one die or the sum of two reaches, with one re-roll per
 * step; each option says how the roll reached it. Constructed: pick any entry. A choice the
 * roll no longer reaches stays chosen (the rule checks flag it).
 */
import { useId, type ReactNode } from 'react'
import { canReroll, newRoll, reroll, rollDice, rolledOn, tableOptions, type RollRecord, type RollSource } from '../rules/rolling'
import type { Die } from '../rules/types'
import type { CreationMethod, RollMode } from '../hero/model'
import { DiceRoll } from '../components/DiceRoll'
import { DiceList } from '../components/icons'

interface Entry {
  id: string
  roll: number
  name: string
}

interface TablePickerProps<T extends Entry> {
  /** What's being chosen, e.g. "background". */
  what: string
  method: CreationMethod
  /** Who rolls in Guided creation; with 'manual', entering a roll comes first. */
  rollMode?: RollMode
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
const plural = (what: string) => (what.endsWith('y') ? `${what.slice(0, -1)}ies` : `${what}s`)

/** How a roll reaches an entry: "Rolled 7", "Sum, 7 + 3" (the larger die first, so equal sums read the same). */
function sourceText(roll: RollRecord, source: RollSource): string {
  if ('die' in source) return `Rolled ${roll.results[source.die]}`
  const [a, b] = [roll.results[source.sum[0]]!, roll.results[source.sum[1]]!]
  return `Sum, ${Math.max(a, b)} + ${Math.min(a, b)}`
}

/** "Pick 7, 3, or their sum, 10." */
function pickText(results: readonly number[]): string {
  if (results.length === 2) return `Pick ${results[0]}, ${results[1]}, or their sum, ${results[0]! + results[1]!}.`
  return `Pick one die, or the sum of two.`
}

export function TablePicker<T extends Entry>({ what, method, rollMode, dice, table, roll, selectedId, onRoll, onSelect, describe, inherited, random }: TablePickerProps<T>) {
  const name = useId()
  const article = /^[aeiou]/.test(what) ? 'an' : 'a'

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

  let options: { entry: T; notes: string[]; reached?: boolean }[] = []
  if (method === 'constructed') {
    options = [...table].sort((a, b) => a.roll - b.roll).map((entry) => ({ entry, notes: [] }))
  } else if (shown) {
    // One tag per way the roll reaches the entry; two dice of the same number reach it the same way.
    options = tableOptions(table, shown.results).map(({ entry, sources }) => ({ entry, notes: [...new Set(sources.map((s) => sourceText(shown, s)))], reached: true }))
  }
  const reachedCount = options.length
  const selected = table.find((t) => t.id === selectedId)
  if (selected && !options.some((o) => o.entry.id === selected.id)) {
    options.unshift({ entry: selected, notes: method === 'guided' ? [shown ? 'Not reached by this roll' : 'Your current choice'] : [] })
  }

  return (
    <div className="table-picker">
      {method === 'guided' && (
        <section className="step-section" aria-label="Dice in">
          <h4>Dice in</h4>
          {borrowed && (
            <p>
              Your {borrowed.from} roll was <strong>{listAnd(borrowed.roll.results)}</strong> on <DiceList dice={borrowed.roll.dice} />. Pick a {what} it reaches, or roll <DiceList dice={dice} /> for a fresh roll (which gets a re-roll of its own).
            </p>
          )}
          {stale && (
            <p role="alert">
              You rolled {listAnd(stale.results)} on <DiceList dice={stale.dice} />, but this step's dice are now <DiceList dice={dice} />, because an earlier choice changed. Roll again; this doesn't use your re-roll.
            </p>
          )}
          <DiceRoll
            dice={dice}
            roll={current}
            canReroll={canReroll(current)}
            manualFirst={rollMode === 'manual'}
            onRoll={doRoll}
            onManual={(results, again) => onRoll(again && current ? reroll(current, results, true) : newRoll(dice, results, true))}
          >
            {current && pickText(current.results)}
          </DiceRoll>
        </section>
      )}

      {options.length > 0 && (
        <section className="step-section" data-section="choose" aria-labelledby={`${name}-title`}>
          <h4 id={`${name}-title`}>
            Choose {article} {what}
          </h4>
          {method === 'guided' && shown && (
            <p className="lede">
              Showing the {reachedCount} {reachedCount === 1 ? what : plural(what)} your roll allows.
            </p>
          )}
          <fieldset className="option-list">
            <legend className="visually-hidden">Choose {article} {what}</legend>
            {options.map(({ entry, notes, reached }) => (
              <label key={entry.id} className="option">
                <span className="option__n">{entry.roll}</span>
                <span className="option__body">
                  <span className="option__name">{entry.name}</span>
                  {describe && <span className="option__sub">{describe(entry)}</span>}
                </span>
                {notes.length > 0 && (
                  <span className="option__tags">
                    {notes.map((note) => (
                      <span key={note} className={reached ? 'tag tag--strong' : 'tag'}>
                        {note}
                      </span>
                    ))}
                  </span>
                )}
                <span className="option__end">
                  <input type="radio" name={name} checked={entry.id === selectedId} onChange={() => onSelect(entry)} />
                </span>
              </label>
            ))}
          </fieldset>
        </section>
      )}
      {method === 'guided' && borrowed && options.length === 0 && (
        <p>
          That roll doesn't reach any {what}. Roll <DiceList dice={dice} /> for a fresh one.
        </p>
      )}
      {method === 'guided' && current && options.length === 0 && (
        <p>
          That roll doesn't reach any {what}.{' '}
          {canReroll(current) ? 'Use your re-roll.' : 'Switch this hero to Constructed (in the Start step) to pick any.'}
        </p>
      )}
    </div>
  )
}
