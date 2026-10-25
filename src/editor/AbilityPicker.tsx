/**
 * Taking abilities from a list (e.g. a power source's Yellow abilities) and filling in their
 * blanks: trait slots with the hero's powers and qualities, other blanks with words. The
 * rules checks warn about the count, restrictions, and anything left unfilled. Fixed
 * abilities (an archetype's "always taken" ones) are shown the same way, without a choice.
 */
import { useId } from 'react'
import { parseTraitKey, traitKey, type TraitRef } from '../rules/catalog'
import { parseSlots, type ChoiceSlot, type TraitSlot } from '../rules/slots'
import type { Ability } from '../rules/types'
import type { AbilityPick, AbilitySource, Hero } from '../hero/model'
import { limitedSlotIndex, slotCandidates, type SlotLimit } from '../creation/abilities'
import { canSetUse, replacePick, setBlank, setCustomName, setUse } from '../creation/picks'
import { fillText } from '../creation/sheet'
import { traitLabel, type HeroTrait } from '../creation/traits'
import type { StepId } from '../creation/warnings'

const TYPE_NAME: Record<Ability['type'], string> = { A: 'Action', R: 'Reaction', I: 'Inherent', 'A/I': 'Action/Inherent' }

interface AbilityPickerProps {
  hero: Hero
  /** The hero's powers and qualities, for filling trait slots. */
  traits: readonly HeroTrait[]
  /** e.g. "Yellow abilities: choose 2" */
  legend: string
  hint?: string
  options: readonly Ability[]
  source: AbilitySource
  /** The step the abilities belong to. */
  step: StepId
  /** The picks from this list. */
  picks: readonly AbilityPick[]
  onChange: (picks: AbilityPick[]) => void
  /** The hero has every ability in `options`; only their blanks are chosen. */
  fixed?: boolean
  /** Whether the player can give the abilities their own names (the Out ability can't be renamed). */
  nameable?: boolean
  /** A limit on one slot, e.g. a Red ability's category; only traits within it are offered there. */
  slotLimit?: SlotLimit
}

interface TraitSlotFieldProps {
  hero: Hero
  traits: readonly HeroTrait[]
  slot: TraitSlot
  step: StepId
  limit?: SlotLimit
  value: TraitRef | undefined
  /** Until the slots before it are filled (see ../creation/picks.ts). */
  disabled: boolean
  onChange: (t: TraitRef | undefined) => void
}

function TraitSlotField({ hero, traits, slot, step, limit, value, disabled, onChange }: TraitSlotFieldProps) {
  const id = useId()
  const candidates = slotCandidates(hero, traits, slot, step, limit)
  // Keep the current choice selectable even if it no longer fits (the checks warn about it).
  const offList = value && !candidates.some((c) => traitKey(c.trait) === traitKey(value))
  return (
    <label className="field" htmlFor={id}>
      <span>[{slot.label}]</span>
      <select id={id} disabled={disabled} value={value ? traitKey(value) : ''} onChange={(e) => onChange(e.target.value ? parseTraitKey(e.target.value) : undefined)}>
        <option value="">Choose…</option>
        {offList && <option value={traitKey(value)}>{traitLabel(hero, value)} (doesn't fit)</option>}
        {candidates.map((c) => (
          <option key={traitKey(c.trait)} value={traitKey(c.trait)}>
            {c.name} ({c.die})
          </option>
        ))}
      </select>
      {candidates.length === 0 && <span className="hint">You don't have a power or quality that fits yet.</span>}
    </label>
  )
}

function ChoiceSlotField({ slot, value, onChange }: { slot: ChoiceSlot; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const id = useId()
  const count = slot.count ?? 1
  if (!slot.options) {
    return (
      <label className="field" htmlFor={id}>
        <span>[{slot.label}]</span>
        <input id={id} type="text" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  if (count === 1) {
    return (
      <label className="field" htmlFor={id}>
        <span>[{slot.label}]</span>
        <select id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {slot.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
    )
  }
  const chosen = Array.isArray(value) ? value : value ? [value] : []
  return (
    <fieldset className="ability-pick__multi">
      <legend>[{slot.label}]</legend>
      {slot.options.map((o) => (
        <label key={o} className="checkbox">
          <input
            type="checkbox"
            checked={chosen.includes(o)}
            onChange={(e) => onChange(e.target.checked ? [...chosen, o] : chosen.filter((c) => c !== o))}
          />
          {o}
        </label>
      ))}
    </fieldset>
  )
}

interface PickFieldsProps {
  hero: Hero
  traits: readonly HeroTrait[]
  step: StepId
  ability: Ability
  pick: AbilityPick
  nameable: boolean
  slotLimit?: SlotLimit
  onChange: (p: AbilityPick) => void
}

function PickFields({ hero, traits, step, ability, pick, nameable, slotLimit, onChange }: PickFieldsProps) {
  const id = useId()
  const slots = parseSlots(ability.text)
  const limited = slotLimit ? limitedSlotIndex(ability, slotLimit) : -1
  let traitIndex = 0
  return (
    <div className="ability-pick__fields">
      {slots.map((slot, i) => {
        if (slot.type === 'trait') {
          const index = traitIndex++
          return (
            <TraitSlotField
              key={i}
              hero={hero}
              traits={traits}
              slot={slot}
              step={step}
              limit={index === limited ? slotLimit : undefined}
              value={pick.uses?.[index]}
              disabled={!canSetUse(pick, index)}
              onChange={(t) => onChange(setUse(pick, index, t))}
            />
          )
        }
        return (
          <ChoiceSlotField
            key={i}
            slot={slot}
            value={pick.blanks?.[slot.label]}
            onChange={(v) => onChange(setBlank(pick, slot.label, v))}
          />
        )
      })}
      {nameable && (
        <label className="field" htmlFor={`${id}-name`}>
          <span>Your name for it (optional)</span>
          <input
            id={`${id}-name`}
            type="text"
            value={pick.customName ?? ''}
            onChange={(e) => onChange(setCustomName(pick, e.target.value))}
          />
        </label>
      )}
      {/* With no blanks, the text above already says it all. */}
      {slots.length > 0 && <p className="ability-pick__preview">{fillText(hero, ability.text, pick.uses, pick.blanks)}</p>}
    </div>
  )
}

export function AbilityPicker({ hero, traits, legend, hint, options, source, step, picks, onChange, fixed = false, nameable = true, slotLimit }: AbilityPickerProps) {
  // Keep picks that aren't on this list (e.g. after changing power source) so they can be removed; the checks flag them.
  const stray = picks.filter((p) => !options.some((o) => o.name === p.name))
  const replace = (name: string, next: AbilityPick | undefined) => onChange(replacePick(picks, name, next))
  return (
    <fieldset className="ability-picker">
      <legend>{legend}</legend>
      {hint && <p className="hint">{hint}</p>}
      {options.map((ability) => {
        const pick = picks.find((p) => p.name === ability.name)
        if (fixed) {
          // The hero has it either way; a pick is saved once a blank is filled or it's given a name.
          return (
            <div key={ability.name} className="ability-pick">
              <p className="ability-pick__fixed">
                <span className="choice__title">
                  {ability.name} <span className="choice__note">({TYPE_NAME[ability.type]})</span>
                </span>
                <span className="choice__detail">{ability.text}</span>
              </p>
              <PickFields hero={hero} traits={traits} step={step} ability={ability} pick={pick ?? { source, name: ability.name }} nameable={nameable} slotLimit={slotLimit} onChange={(p) => replace(ability.name, p)} />
            </div>
          )
        }
        return (
          <div key={ability.name} className="ability-pick">
            <label className="choice">
              <input type="checkbox" checked={Boolean(pick)} onChange={(e) => replace(ability.name, e.target.checked ? { source, name: ability.name } : undefined)} />
              <span className="choice__body">
                <span className="choice__title">
                  {ability.name} <span className="choice__note">({TYPE_NAME[ability.type]})</span>
                </span>
                <span className="choice__detail">{ability.text}</span>
              </span>
            </label>
            {pick && <PickFields hero={hero} traits={traits} step={step} ability={ability} pick={pick} nameable={nameable} slotLimit={slotLimit} onChange={(p) => replace(ability.name, p)} />}
          </div>
        )
      })}
      {stray.map((p) => (
        <div key={p.name} className="ability-pick">
          <label className="choice">
            <input type="checkbox" checked onChange={() => replace(p.name, undefined)} />
            <span className="choice__body">
              <span className="choice__title">
                {p.customName || p.name} <span className="choice__note">(not on this list)</span>
              </span>
            </span>
          </label>
        </div>
      ))}
    </fieldset>
  )
}
