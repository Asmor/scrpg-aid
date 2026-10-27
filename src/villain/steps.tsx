/**
 * The villain editor's steps (Phase 5): approach, archetype, upgrades and mastery, Health,
 * and details. Each change saves straight away; rule problems show under each step (warn
 * only), as for heroes.
 */
import { useId, useState, type ReactNode } from 'react'
import { DiceText } from '../components/icons'
import { candidatesFor } from '../creation/abilities'
import { ROLEPLAYING_QUALITY } from '../creation/traits'
import { AbilityChooser, type SlotFilling } from '../editor/AbilityPicker'
import { DiceAssigner } from '../editor/DiceAssigner'
import { describeRef, getCategory, getTrait, traitKey, traitsOfKind, type TraitRef } from '../rules/catalog'
import type { TraitSlot } from '../rules/slots'
import type { Die, OptionRef, TraitKind } from '../rules/types'
import { villainApproaches, villainApproachesById, villainArchetypes, villainArchetypesById, villainMasteries, villainUpgrades } from '../rules/villain-data'
import type { TraitAssignment } from '../hero/model'
import { VILLAIN_DETAIL_FIELDS, type Villain, type VillainAbilityPick, type VillainAbilitySource } from './model'
import { buildVillainSheet, HEALTH_PER_HERO, villainTraitLabel, villainTraits } from './sheet'
import { statusSummary } from './status'
import { StatusRuleText } from './StatusRule'

export type VillainUpdate = (change: (draft: Villain) => void) => void

interface StepProps {
  villain: Villain
  update: VillainUpdate
}

const ROLEPLAYING_KEY = traitKey(ROLEPLAYING_QUALITY)

/** The villain's traits filling ability slots. */
function filling(villain: Villain): SlotFilling {
  const traits = villainTraits(villain).traits
  return {
    // Villains never limit a slot (that's for heroes' Red abilities).
    candidates: (slot: TraitSlot) => candidatesFor(traits, slot),
    label: (t: TraitRef) => villainTraitLabel(villain, t),
  }
}

/** Replaces the picks from one source, keeping the rest. */
const withPicks = (all: readonly VillainAbilityPick[], source: VillainAbilitySource, picks: readonly VillainAbilityPick[]) => [...all.filter((p) => p.source !== source), ...picks]

/** "Power Suit, Robotics, or any Mental quality" */
function describeRefs(refs: readonly OptionRef[]): string {
  return refs
    .map((ref) => {
      const { kind, scope, id } = describeRef(ref)
      return scope === 'trait' ? (getTrait({ kind, id })?.name ?? id) : `any ${getCategory(kind, id)?.name ?? id} ${kind}`
    })
    .join(', ')
}

const diceText = (dice: readonly Die[]) => dice.join(' ')

function RadioChoices<T extends { id: string }>({ legend, items, selected, title, detail, onSelect, none }: { legend: string; items: readonly T[]; selected?: string | null; title: (item: T) => ReactNode; detail: (item: T) => ReactNode; onSelect: (id: string | null) => void; none?: string }) {
  const name = useId()
  return (
    <fieldset className="choice-list">
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

export function ApproachStep({ villain, update }: StepProps) {
  const choice = villain.approach
  const approach = choice && villainApproachesById.get(choice.id)
  const extra = villainTraits(villain).extra.approach
  const ofKind = (kind: TraitKind) => (choice?.traits ?? []).filter((a) => a.trait.kind === kind)
  const label = (t: TraitRef) => villainTraitLabel(villain, t)
  const setTraits = (kind: TraitKind, assigned: TraitAssignment[]) =>
    update((v) => {
      v.approach!.traits = [...v.approach!.traits.filter((a) => a.trait.kind !== kind), ...assigned]
    })
  return (
    <div className="step-form">
      <RadioChoices
        legend="Approach: how the villain pursues its goals"
        items={villainApproaches}
        selected={choice?.id}
        title={(a) => a.name}
        detail={(a) => (
          <DiceText text={`Powers ${diceText(a.powerDice)} · Qualities ${diceText(a.qualityDice)} · Base Health ${a.baseHealth} (p. ${a.page})`} />
        )}
        onSelect={(id) =>
          update((v) => {
            if (id) v.approach = v.approach ? { ...v.approach, id } : { id, traits: [], abilities: [] }
          })
        }
      />
      {choice && approach && (
        <>
          <DiceAssigner
            label={label}
            legend={`${approach.name} power dice`}
            dice={approach.powerDice}
            assignments={ofKind('power')}
            options={traitsOfKind('power')}
            earlier={[]}
            onChange={(a) => setTraits('power', a)}
          />
          <p className="hint">Any powers from the list. Suggested: {describeRefs(approach.suggestedPowers)}.</p>
          <DiceAssigner
            label={label}
            legend={`${approach.name} quality dice`}
            dice={approach.qualityDice}
            assignments={ofKind('quality').filter((a) => traitKey(a.trait) !== ROLEPLAYING_KEY)}
            options={traitsOfKind('quality').filter((t) => traitKey(t) !== ROLEPLAYING_KEY)}
            earlier={[]}
            onChange={(a) => setTraits('quality', a)}
          />
          <p className="hint">Any qualities from the list. Suggested: {describeRefs(approach.suggestedQualities)}.</p>
          <label className="field">
            <span>Roleplaying quality (d8)</span>
            <input
              type="text"
              value={villain.traitNames[ROLEPLAYING_KEY] ?? ''}
              placeholder="e.g. Vengeful Genius"
              onChange={(e) =>
                update((v) => {
                  if (e.target.value) v.traitNames[ROLEPLAYING_KEY] = e.target.value
                  else delete v.traitNames[ROLEPLAYING_KEY]
                })
              }
            />
          </label>
          <AbilityChooser<VillainAbilityPick>
            filling={filling(villain)}
            legend={`${approach.name} abilities: choose ${approach.abilities.count + extra}`}
            {...(approach.abilities.constraint || extra ? { hint: [approach.abilities.constraint, extra ? `Quality Upgrade adds ${extra}.` : ''].filter(Boolean).join(' ') } : {})}
            options={approach.abilities.options}
            source="approach"
            picks={choice.abilities.filter((p) => p.source === 'approach')}
            onChange={(picks) =>
              update((v) => {
                v.approach!.abilities = withPicks(v.approach!.abilities, 'approach', picks)
              })
            }
          />
        </>
      )}
    </div>
  )
}

export function ArchetypeStep({ villain, update }: StepProps) {
  const choice = villain.archetype
  const archetype = choice && villainArchetypesById.get(choice.id)
  const extra = villainTraits(villain).extra.archetype
  return (
    <div className="step-form">
      <RadioChoices
        legend="Archetype: how the villain fights"
        items={villainArchetypes}
        selected={choice?.id}
        title={(a) => a.name}
        detail={(a) => `Health ${a.healthModifier >= 0 ? '+' : ''}${a.healthModifier}. ${statusSummary(a.status)} (p. ${a.page})`}
        onSelect={(id) =>
          update((v) => {
            if (id) v.archetype = v.archetype ? { ...v.archetype, id } : { id, abilities: [] }
          })
        }
      />
      {choice && archetype && (
        <>
          <p className="hint">
            Pairs well with: {archetype.suggestedApproaches.map((id) => villainApproachesById.get(id)?.name ?? id).join(', ')}.{archetype.pairingNote ? ` ${archetype.pairingNote}` : ''}
          </p>
          <StatusRuleText rule={archetype.status} />
          {archetype.fixedAbilities && (
            <AbilityChooser<VillainAbilityPick>
              filling={filling(villain)}
              legend={`${archetype.name} always has`}
              options={archetype.fixedAbilities}
              source="archetype.fixed"
              picks={choice.abilities.filter((p) => p.source === 'archetype.fixed')}
              fixed
              onChange={(picks) =>
                update((v) => {
                  v.archetype!.abilities = withPicks(v.archetype!.abilities, 'archetype.fixed', picks)
                })
              }
            />
          )}
          <AbilityChooser<VillainAbilityPick>
            filling={filling(villain)}
            legend={`${archetype.name} abilities: choose ${archetype.abilities.count + extra}`}
            {...(extra ? { hint: `Power Upgrade adds ${extra}.` } : {})}
            options={archetype.abilities.options}
            source="archetype"
            picks={choice.abilities.filter((p) => p.source === 'archetype')}
            onChange={(picks) =>
              update((v) => {
                v.archetype!.abilities = withPicks(v.archetype!.abilities, 'archetype', picks)
              })
            }
          />
        </>
      )}
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
      <RadioChoices
        legend="Villainous mastery (major villains)"
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

const DETAIL_LABEL: Record<(typeof VILLAIN_DETAIL_FIELDS)[number], string> = {
  name: 'Name',
  alias: 'Alias',
  concept: 'Concept: who they are and what they want',
  appearance: 'Appearance',
  costume: 'Costume',
  mannerisms: 'Mannerisms',
  motivation: 'Motivation',
  ties: 'Ties to the heroes',
}
const LONG = new Set(['concept', 'appearance', 'costume', 'mannerisms', 'motivation', 'ties'])

export function DetailsStep({ villain, update }: StepProps) {
  return (
    <div className="step-form">
      <div className="field-grid">
        {VILLAIN_DETAIL_FIELDS.map((field) => (
          <label key={field} className={`field ${LONG.has(field) ? 'field--wide' : ''}`}>
            <span>{DETAIL_LABEL[field]}</span>
            {LONG.has(field) ? (
              <textarea rows={2} value={villain.details[field]} onChange={(e) => update((v) => void (v.details[field] = e.target.value))} />
            ) : (
              <input type="text" value={villain.details[field]} onChange={(e) => update((v) => void (v.details[field] = e.target.value))} />
            )}
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
