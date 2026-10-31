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
import { abilityField, abilityListField, limitedSlotIndex, slotCandidates, type SlotLimit } from '../creation/abilities'
import { canSetUse, replacePick, setBlank, setCustomName, setUse } from '../creation/picks'
import { fillTextWith } from '../creation/sheet'
import { traitLabel, type HeroTrait } from '../creation/traits'
import type { StepId } from '../creation/warnings'
import { AbilityText } from '../components/icons'
import { effectActions } from '../creation/effects'
import { IssueField, SectionIssues } from './inline-issues'

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
  /** Hides the legend visually (a group heading above already says it). */
  hideLegend?: boolean
  /** See AbilityChooser. */
  listField?: string | false
}

/** A trait that can fill a slot: what it is, its die, and its name. */
type Candidate = Pick<HeroTrait, 'trait' | 'die' | 'name'>

/** How a character's traits fill an ability's trait slots: hero or villain. */
export interface SlotFilling {
  /** The traits that fit a slot (with an extra limit, for the slot `limitedSlotIndex` names). */
  candidates: (slot: TraitSlot, limit?: SlotLimit) => readonly Candidate[]
  label: (trait: TraitRef) => string
}

interface TraitSlotFieldProps {
  filling: SlotFilling
  slot: TraitSlot
  limit?: SlotLimit
  value: TraitRef | undefined
  /** Until the slots before it are filled (see ../creation/picks.ts). */
  disabled: boolean
  onChange: (t: TraitRef | undefined) => void
}

function TraitSlotField({ filling, slot, limit, value, disabled, onChange }: TraitSlotFieldProps) {
  const id = useId()
  const candidates = filling.candidates(slot, limit)
  // Keep the current choice selectable even if it no longer fits (the checks warn about it).
  const offList = value && !candidates.some((c) => traitKey(c.trait) === traitKey(value))
  return (
    <label className="field" htmlFor={id}>
      <span>[{slot.label}]</span>
      <select id={id} disabled={disabled} value={value ? traitKey(value) : ''} onChange={(e) => onChange(e.target.value ? parseTraitKey(e.target.value) : undefined)}>
        <option value="">Choose…</option>
        {offList && <option value={traitKey(value)}>{filling.label(value)} (doesn't fit)</option>}
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
          <input type="checkbox" checked={chosen.includes(o)} onChange={(e) => onChange(e.target.checked ? [...chosen, o] : chosen.filter((c) => c !== o))} />
          {o}
        </label>
      ))}
    </fieldset>
  )
}

/** A pick being edited: a hero's or a villain's. */
type EditablePick = Pick<AbilityPick, 'name' | 'uses' | 'blanks' | 'customName'> & { source: string }

interface PickFieldsProps<P extends EditablePick> {
  filling: SlotFilling
  ability: Ability
  pick: P
  nameable: boolean
  slotLimit?: SlotLimit
  onChange: (p: P) => void
}

function PickFields<P extends EditablePick>({ filling, ability, pick, nameable, slotLimit, onChange }: PickFieldsProps<P>) {
  const id = useId()
  const slots = parseSlots(ability.text)
  const limited = slotLimit ? limitedSlotIndex(ability, slotLimit) : -1
  let traitIndex = 0
  return (
    <div className="ability-pick__fields">
      {slots.map((slot, i) => {
        if (slot.type === 'trait') {
          const index = traitIndex++
          return <TraitSlotField key={i} filling={filling} slot={slot} limit={index === limited ? slotLimit : undefined} value={pick.uses?.[index]} disabled={!canSetUse(pick, index)} onChange={(t) => onChange(setUse(pick, index, t))} />
        }
        return <ChoiceSlotField key={i} slot={slot} value={pick.blanks?.[slot.label]} onChange={(v) => onChange(setBlank(pick, slot.label, v))} />
      })}
      {nameable && (
        <label className="field" htmlFor={`${id}-name`}>
          <span>Your name for it (optional)</span>
          <input id={`${id}-name`} type="text" value={pick.customName ?? ''} onChange={(e) => onChange(setCustomName(pick, e.target.value))} />
        </label>
      )}
      {/* With no blanks, the text above already says it all. */}
      {slots.length > 0 && (
        <p className="ability-pick__preview">
          <AbilityText text={fillTextWith(filling.label, ability.text, pick.uses, pick.blanks)} actions={ability.effects && effectActions(ability.effects, pick.blanks)} />
        </p>
      )}
    </div>
  )
}

/** A hero's ability list: AbilityChooser with the hero's traits filling the slots. */
export function AbilityPicker({ hero, traits, step, slotLimit, ...rest }: AbilityPickerProps) {
  const filling: SlotFilling = { candidates: (slot, limit) => slotCandidates(hero, traits, slot, step, limit), label: (t) => traitLabel(hero, t) }
  return <AbilityChooser<AbilityPick> filling={filling} {...(slotLimit ? { slotLimit } : {})} {...rest} />
}

interface AbilityChooserProps<P extends EditablePick> {
  filling: SlotFilling
  /** e.g. "Yellow abilities: choose 2" */
  legend: string
  hint?: string
  options: readonly Ability[]
  source: P['source']
  picks: readonly P[]
  onChange: (picks: P[]) => void
  /** The character has every ability in `options`; only their blanks are chosen. */
  fixed?: boolean
  /** Whether the abilities can be given their own names. */
  nameable?: boolean
  slotLimit?: SlotLimit
  hideLegend?: boolean
  /** The field naming this list in its issues: by default its source's; false for one list among several sharing a source (Red categories). */
  listField?: string | false
}

/** Taking abilities from a list and filling in their blanks, for any kind of character. */
/**
 * Each ability is a card: checkbox, name, type and text (with action icons). Checking it opens
 * its slot pickers, its optional custom name, and the text as filled in.
 */
export function AbilityChooser<P extends EditablePick>({ filling, legend, hint, options, source, picks, onChange, fixed = false, nameable = true, slotLimit, hideLegend = false, listField }: AbilityChooserProps<P>) {
  // Keep picks that aren't on this list (e.g. after changing power source) so they can be removed; the checks flag them.
  const stray = picks.filter((p) => !options.some((o) => o.name === p.name))
  const replace = (name: string, next: P | undefined) => onChange(replacePick(picks, name, next))
  return (
    // The list is one field too: its count and other rules about the whole list show at its top, with its box outlined.
    <IssueField field={listField === false ? undefined : (listField ?? abilityListField(source))}>
      {(f) => (
        <fieldset className={f.invalid ? 'ability-picker field-group--invalid' : 'ability-picker'} data-section="abilities" {...f.control}>
          <legend className={hideLegend ? 'visually-hidden' : undefined}>{legend}</legend>
          {hint && <p className="hint">{hint}</p>}
          {f.list}
          <SectionIssues section="abilities" />
          {options.map((ability) => {
            const pick = picks.find((p) => p.name === ability.name)
            if (fixed) {
              // The hero has it either way; a pick is saved once a blank is filled or it's given a name.
              return (
                <IssueField key={ability.name} field={abilityField(ability.name)}>
                  {(f) => (
                    <div className={f.invalid ? 'ability-pick ability-card ability-card--invalid' : 'ability-pick ability-card'} {...f.control}>
                      {f.list}
                      <p className="ability-pick__fixed">
                        <span className="choice__title">
                          {ability.name} <span className="choice__note">({TYPE_NAME[ability.type]})</span>
                        </span>
                        <span className="choice__detail">
                          <AbilityText text={ability.text} actions={ability.effects && effectActions(ability.effects)} />
                        </span>
                      </p>
                      <PickFields filling={filling} ability={ability} pick={pick ?? ({ source, name: ability.name } as P)} nameable={nameable} slotLimit={slotLimit} onChange={(p) => replace(ability.name, p)} />
                    </div>
                  )}
                </IssueField>
              )
            }
            return (
              <IssueField key={ability.name} field={abilityField(ability.name)}>
                {(f) => (
                  <div className={f.invalid ? 'ability-pick ability-card ability-card--invalid' : 'ability-pick ability-card'}>
                    <label className="choice">
                      <input type="checkbox" {...f.control} checked={Boolean(pick)} onChange={(e) => replace(ability.name, e.target.checked ? ({ source, name: ability.name } as P) : undefined)} />
                      <span className="choice__body">
                        <span className="choice__title">
                          {ability.name} <span className="choice__note">({TYPE_NAME[ability.type]})</span>
                        </span>
                        <span className="choice__detail">
                          <AbilityText text={ability.text} actions={ability.effects && effectActions(ability.effects)} />
                        </span>
                      </span>
                    </label>
                    {f.list}
                    {pick && <PickFields filling={filling} ability={ability} pick={pick} nameable={nameable} slotLimit={slotLimit} onChange={(p) => replace(ability.name, p)} />}
                  </div>
                )}
              </IssueField>
            )
          })}
          {stray.map((p) => (
            <IssueField key={p.name} field={abilityField(p.name)}>
              {(f) => (
                <div className={f.invalid ? 'ability-pick ability-card ability-card--invalid' : 'ability-pick ability-card'}>
                  <label className="choice">
                    <input type="checkbox" {...f.control} checked onChange={() => replace(p.name, undefined)} />
                    <span className="choice__body">
                      <span className="choice__title">
                        {p.customName || p.name} <span className="choice__note">(not on this list)</span>
                      </span>
                    </span>
                  </label>
                  {f.list}
                </div>
              )}
            </IssueField>
          ))}
        </fieldset>
      )}
    </IssueField>
  )
}
