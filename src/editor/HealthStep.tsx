/**
 * Step 7, Health (p. 113): choose the power or quality that adds to Health, decide between
 * rolling and the flat value (before rolling, as the formula says), and see the result. The
 * principle checks are shown with this step, as it's the last one.
 */
import { useId, useState } from 'react'
import { parseTraitKey, traitKey } from '../rules/catalog'
import { healthFormula, healthStep } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import { checkManualResults, rollDice } from '../rules/rolling'
import type { Hero, HealthChoice } from '../hero/model'
import { traitsInAnyForm } from '../creation/divided'
import { healthTraitOptions, healthTraitTerm } from '../creation/health'
import { buildSheet } from '../creation/sheet'
import { deriveTraits, traitLabel } from '../creation/traits'
import { DiceText, DieIcon } from '../components/icons'

type Update = (change: (draft: Hero) => void) => void

/** Typing in a d8 roll made with real dice. */
function ManualHealthRoll({ onDone, onCancel }: { onDone: (result: number) => void; onCancel: () => void }) {
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const die = healthFormula.addRoll.die
  return (
    <form
      className="manual-roll"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const checked = checkManualResults([die], [value.trim() === '' ? Number.NaN : Number(value)])
        if (checked.ok) onDone(checked.results[0]!)
        else setError(checked.error)
      }}
    >
      <label className="field" htmlFor={id}>
        <span>
          Your <DieIcon die={die} /> roll
        </span>
        <input id={id} type="number" inputMode="numeric" min={1} max={Number(die.slice(1))} value={value} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={(e) => setValue(e.target.value)} />
      </label>
      {error && (
        <p id={`${id}-error`} className="error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button button--primary">
          Use this result
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export function HealthStep({ hero, update, random }: { hero: Hero; update: Update; random?: () => number }) {
  const id = useId()
  const [manual, setManual] = useState(false)
  const traits = deriveTraits(hero).traits
  const options = healthTraitOptions(hero, traitsInAnyForm(hero, traits))
  const term = healthTraitTerm()
  const roll = healthFormula.addRoll
  const choice = hero.health
  const sheet = buildSheet(hero)
  // When the choice comes before rolling, an in-app roll is final; a typed-in one can be corrected.
  const rolledInApp = roll.chooseBeforeRolling && choice?.mode === 'roll' && choice.rollResult !== undefined && !choice.manual
  const set = (change: Partial<HealthChoice>) =>
    update((h) => {
      h.health = { mode: 'roll', ...h.health, ...change }
    })
  const offList = choice?.trait && !options.some((o) => traitKey(o.trait) === traitKey(choice.trait!))

  return (
    <div className="step-form">
      <p className="hint">
        <DiceText text={healthFormula.summary} /> <span className="page-ref">{formatEntryRef(healthStep)}</span>
      </p>

      {options.length === 0 && <p className="hint">You have no power or quality that can add to Health, so you use {term?.fallbackDie ?? 'the fallback die'}.</p>}
      {/* Shown with no options too while a trait is recorded, so it can be cleared. */}
      {(options.length > 0 || choice?.trait) && (
        <label className="field" htmlFor={`${id}-trait`}>
          <span>Power or quality for Health</span>
          <select
            id={`${id}-trait`}
            value={choice?.trait ? traitKey(choice.trait) : ''}
            onChange={(e) =>
              update((h) => {
                const { trait: _, ...rest } = h.health ?? { mode: 'roll' as const }
                h.health = e.target.value ? { ...rest, trait: parseTraitKey(e.target.value) } : rest
              })
            }
          >
            <option value="">Choose…</option>
            {offList && <option value={traitKey(choice.trait!)}>{traitLabel(hero, choice.trait!)} (can't be used)</option>}
            {options.map((t) => (
              <option key={traitKey(t.trait)} value={traitKey(t.trait)}>
                {t.name} ({t.die})
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="choice-list">
        <legend>Roll or take the flat value{roll.chooseBeforeRolling ? ' (decide before rolling)' : ''}</legend>
        <label className="choice">
          <input type="radio" name={`${id}-mode`} checked={choice?.mode === 'roll'} onChange={() => set({ mode: 'roll' })} />
          <span className="choice__body">
            <span className="choice__title">
              Roll <DieIcon die={roll.die} />
            </span>
          </span>
        </label>
        <label className="choice">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={choice?.mode === 'fixed'}
            disabled={rolledInApp}
            onChange={() =>
              update((h) => {
                const { rollResult: _r, manual: _m, ...rest } = h.health ?? { mode: 'fixed' as const }
                h.health = { ...rest, mode: 'fixed' }
              })
            }
          />
          <span className="choice__body">
            <span className="choice__title">Take {roll.orFixed}</span>
            {rolledInApp && <span className="choice__detail">You've already rolled.</span>}
          </span>
        </label>
      </fieldset>

      {choice?.mode === 'roll' &&
        (choice.rollResult !== undefined && !manual ? (
          <div className="button-row">
            <span>
              You rolled <strong>{choice.rollResult}</strong>
              {choice.manual ? ' (typed in)' : ''}.
            </span>
            {choice.manual && (
              <button type="button" className="button" onClick={() => setManual(true)}>
                Correct it
              </button>
            )}
          </div>
        ) : manual ? (
          <ManualHealthRoll
            onCancel={() => setManual(false)}
            onDone={(result) => {
              setManual(false)
              set({ rollResult: result, manual: true })
            }}
          />
        ) : (
          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={() =>
                update((h) => {
                  const { manual: _, ...rest } = h.health ?? { mode: 'roll' as const }
                  h.health = { ...rest, mode: 'roll', rollResult: rollDice([roll.die], random)[0]! }
                })
              }
            >
              Roll <DieIcon die={roll.die} />
            </button>
            <button type="button" className="button" onClick={() => setManual(true)}>
              Enter my own roll
            </button>
          </div>
        ))}

      {sheet.maxHealth !== undefined && (
        <p className="health-result">
          Max Health <strong>{sheet.maxHealth}</strong>
          {sheet.healthRanges &&
            `: Green ${sheet.healthRanges.green[0]}–${sheet.healthRanges.green[1]}, Yellow ${sheet.healthRanges.yellow[0]}–${sheet.healthRanges.yellow[1]}, Red ${sheet.healthRanges.red[0]}–${sheet.healthRanges.red[1]}`}
          .
        </p>
      )}
    </div>
  )
}
