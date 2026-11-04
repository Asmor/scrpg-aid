/**
 * The villain wizard's steps 4 to 7 (Upgrades, Mastery, Health, Finishing touches), carried over
 * from the old villain editor for now; stage C of ~/.claude/plans/villain-wizard.md gives them the
 * spec's design. Step 1, Concept, is here too.
 */
import { useId, useState, type ReactNode } from 'react'
import { DiceText } from '../../components/icons'
import { AbilityChooser } from '../../editor/AbilityPicker'
import { villainMasteries, villainUpgrades } from '../../rules/villain-data'
import type { VillainAbilityPick } from '../model'
import { buildVillainSheet, HEALTH_PER_HERO } from '../sheet'
import { villainFilling as filling, withPicks, type StepProps } from './choices'
import { Section } from './shared'

function RadioChoices<T extends { id: string }>({ legend, items, selected, title, detail, onSelect, none }: { legend: string; items: readonly T[]; selected?: string | null; title: (item: T) => ReactNode; detail: (item: T) => ReactNode; onSelect: (id: string | null) => void; none?: string }) {
  const name = useId()
  return (
    <fieldset className="choice-list" data-section="choose">
      <legend>{legend}</legend>
      {none && (
        <label className="choice">
          <input type="radio" name={name} checked={!selected} onChange={() => onSelect(null)} />
          <span className="choice__body">
            <span className="choice__title">{none}</span>
          </span>
        </label>
      )}
      {items.map((item) => (
        <label key={item.id} className="choice">
          <input type="radio" name={name} checked={selected === item.id} onChange={() => onSelect(item.id)} />
          <span className="choice__body">
            <span className="choice__title">{title(item)}</span>
            <span className="choice__detail">{detail(item)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** Step 1: who the villain is and what they want (p. 208). All optional. */
export function ConceptStep({ villain, update }: StepProps) {
  const field = (key: 'name' | 'alias' | 'concept', label: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={villain.details[key]} onChange={(e) => update((v) => void (v.details[key] = e.target.value))} />
    </label>
  )
  return (
    <div className="step-form">
      <Section title="Who they are">
        <div className="field-grid">
          {field('name', 'Name')}
          {field('alias', 'Alias')}
        </div>
        {field('concept', 'What they want')}
        <p className="hint">All optional. You can come back to these at any time.</p>
      </Section>
    </div>
  )
}

export function MasteryStep({ villain, update }: StepProps) {
  return (
    <div className="step-form">
      <RadioChoices
        legend="Villainous mastery"
        items={villainMasteries.options.map((m) => ({ ...m, id: m.name }))}
        selected={villain.mastery?.name}
        none="None"
        title={(m) => m.name}
        detail={(m) => m.text}
        onSelect={(name) =>
          update((v) => {
            v.mastery = name ? { source: 'mastery', name } : null
          })
        }
      />
    </div>
  )
}

export function UpgradesStep({ villain, update }: StepProps) {
  const vehicleDie = useId()
  return (
    <div className="step-form">
      <p className="hint">Optional. Each upgrade makes the villain a match for about one more hero and adds its Health. A villain with any upgrades is a major villain and takes one villainous mastery.</p>
      <fieldset className="choice-list">
        <legend>Upgrades</legend>
        {villainUpgrades.map((u) => {
          const index = villain.upgrades.findIndex((c) => c.id === u.id)
          const choice = index >= 0 ? villain.upgrades[index] : undefined
          return (
            <div key={u.id} className="ability-pick">
              <label className="choice">
                <input
                  type="checkbox"
                  checked={Boolean(choice)}
                  onChange={(e) =>
                    update((v) => {
                      v.upgrades = e.target.checked ? [...v.upgrades, { id: u.id, abilities: [] }] : v.upgrades.filter((c) => c.id !== u.id)
                    })
                  }
                />
                <span className="choice__body">
                  <span className="choice__title">
                    {u.name} <span className="choice__note">({u.health ? `+${u.health} Health` : 'no Health'})</span>
                  </span>
                  <span className="choice__detail">
                    {u.requirement} {u.summary}
                  </span>
                </span>
              </label>
              {choice && u.abilities && u.abilities.length > 0 && (
                <AbilityChooser<VillainAbilityPick>
                  filling={filling(villain)}
                  legend={`${u.name} gives`}
                  options={u.abilities}
                  source="upgrade"
                  picks={choice.abilities.filter((p) => p.source === 'upgrade')}
                  fixed
                  onChange={(picks) =>
                    update((v) => {
                      const c = v.upgrades.find((x) => x.id === u.id)!
                      c.abilities = withPicks(c.abilities, 'upgrade', picks)
                    })
                  }
                />
              )}
              {choice && u.lieutenantOptions && u.vehicleAbilities && (
                <>
                  <fieldset className="choice-list">
                    <legend>Vehicle die (built as a lieutenant)</legend>
                    {u.lieutenantOptions.map((o) => (
                      <label key={o.die} className="checkbox">
                        <input
                          type="radio"
                          name={vehicleDie}
                          checked={choice.vehicle?.die === o.die}
                          onChange={() =>
                            update((v) => {
                              const c = v.upgrades.find((x) => x.id === u.id)!
                              c.vehicle = { ...(c.vehicle ?? { abilities: [] }), die: o.die }
                            })
                          }
                        />
                        <DiceText text={`${o.die}: ${o.abilityCount} vehicle abilities`} />
                      </label>
                    ))}
                  </fieldset>
                  {choice.vehicle?.die && (
                    <AbilityChooser<VillainAbilityPick>
                      filling={filling(villain)}
                      legend={`Vehicle abilities: choose ${u.lieutenantOptions.find((o) => o.die === choice.vehicle?.die)?.abilityCount ?? 0}`}
                      options={u.vehicleAbilities}
                      source="vehicle"
                      picks={choice.vehicle.abilities}
                      nameable={false}
                      onChange={(picks) =>
                        update((v) => {
                          const c = v.upgrades.find((x) => x.id === u.id)!
                          c.vehicle = { ...c.vehicle!, abilities: picks }
                        })
                      }
                    />
                  )}
                </>
              )}
            </div>
          )
        })}
      </fieldset>
    </div>
  )
}

export function HealthStep({ villain, update }: StepProps) {
  const id = useId()
  const health = buildVillainSheet(villain).health
  // What's typed, so the field can be cleared and retyped; only whole numbers of 1 or more are saved.
  const [count, setCount] = useState(String(villain.heroCount))
  const countValid = count.trim() !== '' && Number.isInteger(Number(count)) && Number(count) >= 1
  return (
    <div className="step-form">
      <label className="field" htmlFor={id}>
        <span>Number of heroes it's built to face</span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          value={count}
          aria-invalid={!countValid}
          {...(!countValid ? { 'aria-describedby': `${id}-invalid` } : {})}
          onChange={(e) => {
            setCount(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value.trim() && Number.isInteger(n) && n >= 1) update((v) => void (v.heroCount = n))
          }}
        />
      </label>
      {!countValid && (
        <p id={`${id}-invalid`} className="hint">
          Enter a whole number of heroes, 1 or more.
        </p>
      )}
      <p className="hint">Each hero adds {HEALTH_PER_HERO} Health. You can change the number for a scene in the game aid.</p>
      {health ? (
        <>
          <ul className="villain-health">
            {health.parts.map((p) => (
              <li key={p.label}>
                {p.label}: {p.value >= 0 ? '+' : ''}
                {p.value}
              </li>
            ))}
          </ul>
          <p>
            <strong>Max Health {health.max}</strong>
            {health.ranges && ` (Green ${health.ranges.green.join('–')}, Yellow ${health.ranges.yellow.join('–')}, Red ${health.ranges.red.join('–')})`}
          </p>
        </>
      ) : (
        <p className="sheet-empty">Choose an approach and archetype first.</p>
      )}
    </div>
  )
}

const DETAIL_FIELDS = ['appearance', 'costume', 'mannerisms', 'motivation', 'ties'] as const
const DETAIL_LABEL: Record<(typeof DETAIL_FIELDS)[number], string> = {
  appearance: 'Appearance',
  costume: 'Costume',
  mannerisms: 'Mannerisms',
  motivation: 'Motivation',
  ties: 'Ties to the heroes',
}

export function DetailsStep({ villain, update }: StepProps) {
  return (
    <div className="step-form">
      <div className="field-grid">
        {DETAIL_FIELDS.map((field) => (
          <label key={field} className="field field--wide">
            <span>{DETAIL_LABEL[field]}</span>
            <textarea rows={2} value={villain.details[field]} onChange={(e) => update((v) => void (v.details[field] = e.target.value))} />
          </label>
        ))}
        <label className="field field--wide">
          <span>Notes</span>
          <textarea
            rows={3}
            value={villain.notes ?? ''}
            onChange={(e) =>
              update((v) => {
                if (e.target.value) v.notes = e.target.value
                else delete v.notes
              })
            }
          />
        </label>
      </div>
    </div>
  )
}
