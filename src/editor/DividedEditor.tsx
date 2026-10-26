/**
 * Divided's own choices (p. 94–95): the transition method and its ability, and Split Form's
 * division of powers and qualities between the forms. The Divided ability itself is a plain
 * Green ability choice, and the heroic form's personality is chosen in the personality step.
 * The checks in ../creation/divided.ts warn about anything that doesn't fit.
 */
import { useId } from 'react'
import { traitKey, type TraitRef } from '../rules/catalog'
import type { Archetype } from '../rules/types'
import type { DividedChoice, Hero } from '../hero/model'
import { placeTrait, splitCandidates, type Split, type SplitPlace as Place } from '../creation/divided'
import { traitLabel, type HeroTrait } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { DiceText } from '../components/icons'

const PLACES: readonly { place: Place; label: string }[] = [
  { place: 'always', label: 'Always (either form)' },
  { place: 'civilian', label: 'Civilian form only' },
  { place: 'heroic', label: 'Heroic form only' },
]

export function TransitionPicker({ hero, ar, traits, divided, onChange }: { hero: Hero; ar: Archetype; traits: readonly HeroTrait[]; divided: DividedChoice | undefined; onChange: (divided: DividedChoice) => void }) {
  const name = useId()
  const methods = ar.transitionMethods!
  const method = methods.find((m) => m.id === divided?.transitionMethod)
  return (
    <>
      <fieldset className="choice-list">
        <legend>Transition method</legend>
        {methods.map((m) => (
          <label key={m.id} className="choice">
            <input type="radio" name={name} checked={m.id === divided?.transitionMethod} onChange={() => onChange({ ...divided, transitionMethod: m.id })} />
            <span className="choice__body">
              <span className="choice__title">{m.name}</span>
              <span className="choice__detail">
                <DiceText text={m.summary} />
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {(method || divided?.transitionAbility) && (
        <AbilityPicker
          hero={hero}
          traits={traits}
          legend={`${method?.name ?? 'Transition'} ability: choose 1`}
          options={method?.greenAbilities.options ?? []}
          source="archetype.transition"
          step="archetype"
          picks={divided?.transitionAbility ? [divided.transitionAbility] : []}
          // Taking another ability replaces the one chosen before.
          onChange={(picks) => {
            const { transitionAbility: _, ...rest } = divided ?? {}
            const ability = picks.at(-1)
            onChange(ability ? { ...rest, transitionAbility: ability } : rest)
          }}
        />
      )}
    </>
  )
}

function PlaceSelect({ label, value, offList, onChange }: { label: string; value: Place | undefined; offList: boolean; onChange: (place: Place | undefined) => void }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as Place | undefined)}>
        <option value="">{offList ? 'Remove from the split' : 'Choose…'}</option>
        {PLACES.map((p) => (
          <option key={p.place} value={p.place}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SplitFormEditor({ hero, traits, split, onChange }: { hero: Hero; traits: readonly HeroTrait[]; split: Split | undefined; onChange: (split: Split) => void }) {
  const candidates = splitCandidates(hero, traits)
  const placeOf = (t: TraitRef): Place | undefined => PLACES.find((p) => (split?.[p.place] ?? []).some((x) => traitKey(x) === traitKey(t)))?.place
  const placed = [...(split?.always ?? []), ...(split?.civilian ?? []), ...(split?.heroic ?? [])]
  const stray = placed.filter((t, i) => !candidates.some((c) => traitKey(c.trait) === traitKey(t)) && placed.findIndex((x) => traitKey(x) === traitKey(t)) === i)
  const always = split?.always ?? []
  return (
    <fieldset className="split-form">
      <legend>Split Form</legend>
      <p className="hint">
        Choose two powers and two qualities you always have (you have {always.filter((t) => t.kind === 'power').length} and {always.filter((t) => t.kind === 'quality').length}), and put the rest in one form or the other. Your roleplaying quality works in both forms.
      </p>
      {candidates.map((t) => (
        <PlaceSelect key={traitKey(t.trait)} label={`${t.name} (${t.die})`} value={placeOf(t.trait)} offList={false} onChange={(place) => onChange(placeTrait(split, t.trait, place))} />
      ))}
      {stray.map((t) => (
        <PlaceSelect key={traitKey(t)} label={`${traitLabel(hero, t)} (doesn't fit)`} value={placeOf(t)} offList onChange={(place) => onChange(placeTrait(split, t, place))} />
      ))}
    </fieldset>
  )
}
