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
import { ROLEPLAYING_QUALITY, traitField, traitLabel, type HeroTrait } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { DiceText, DieIcon } from '../components/icons'
import { IssueField, SectionIssues, type FieldIssueProps } from './inline-issues'

const PLACES: readonly { place: Place; short: string }[] = [
  { place: 'always', short: 'Both' },
  { place: 'civilian', short: 'Civilian' },
  { place: 'heroic', short: 'Heroic' },
]

export function TransitionPicker({ hero, ar, traits, divided, onChange }: { hero: Hero; ar: Archetype; traits: readonly HeroTrait[]; divided: DividedChoice | undefined; onChange: (divided: DividedChoice) => void }) {
  const name = useId()
  const methods = ar.transitionMethods!
  const method = methods.find((m) => m.id === divided?.transitionMethod)
  return (
    <>
      <fieldset className="choice-list" data-section="parts">
        <legend>Transition method</legend>
        <SectionIssues section="parts" />
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

/** Both, Civilian or Heroic for one power or quality, as a segmented control. */
function PlaceButtons({ name, value, onChange, control }: { name: string; value: Place | undefined; onChange: (place: Place | undefined) => void; control: FieldIssueProps['control'] }) {
  return (
    <div className="segmented" role="group" aria-label={`${name} form`} {...control}>
      {PLACES.map((p) => (
        <button key={p.place} type="button" aria-pressed={value === p.place} onClick={() => onChange(value === p.place ? undefined : p.place)}>
          {p.short}
        </button>
      ))}
    </div>
  )
}

export function SplitFormEditor({ hero, traits, split, onChange }: { hero: Hero; traits: readonly HeroTrait[]; split: Split | undefined; onChange: (split: Split) => void }) {
  const candidates = splitCandidates(hero, traits)
  const placeOf = (t: TraitRef): Place | undefined => PLACES.find((p) => (split?.[p.place] ?? []).some((x) => traitKey(x) === traitKey(t)))?.place
  const placed = [...(split?.always ?? []), ...(split?.civilian ?? []), ...(split?.heroic ?? [])]
  const stray = placed.filter((t, i) => !candidates.some((c) => traitKey(c.trait) === traitKey(t)) && placed.findIndex((x) => traitKey(x) === traitKey(t)) === i)
  const always = split?.always ?? []
  const roleplaying = traits.find((t) => traitKey(t.trait) === traitKey(ROLEPLAYING_QUALITY))
  // The live tallies against Split Form's two powers and two qualities in both forms.
  const tally = (kind: TraitRef['kind']) => always.filter((t) => t.kind === kind && candidates.some((c) => traitKey(c.trait) === traitKey(t))).length
  return (
    <fieldset className="split-form" data-section="parts">
      <legend>Split Form</legend>
      <SectionIssues section="parts" />
      <p className="hint">Choose which form each power and quality belongs to: two powers and two qualities work in both forms. Your roleplaying quality works in both forms automatically.</p>
      <table className="split-table">
        <thead>
          <tr>
            <th scope="col">Power or quality</th>
            <th scope="col">Die</th>
            <th scope="col">Available in</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((t) => (
            <IssueField key={traitKey(t.trait)} field={traitField(t.trait)}>
              {(f) => (
                <tr>
                  <th scope="row">
                    {t.name} <span className="split-table__kind">{t.trait.kind}</span>
                  </th>
                  <td>
                    <DieIcon die={t.die} />
                  </td>
                  <td>
                    <PlaceButtons name={t.name} value={placeOf(t.trait)} onChange={(place) => onChange(placeTrait(split, t.trait, place))} control={f.control} />
                    {f.list}
                  </td>
                </tr>
              )}
            </IssueField>
          ))}
          {/* The roleplaying quality is always in both forms (the hero wizard spec, "Special archetypes"). */}
          {roleplaying && (
            <IssueField field={traitField(ROLEPLAYING_QUALITY)}>
              {(f) => (
                <tr>
                  <th scope="row">
                    {roleplaying.name} <span className="split-table__kind">roleplaying</span>
                  </th>
                  <td>
                    <DieIcon die={roleplaying.die} />
                  </td>
                  <td>
                    {/* Put in the split by mistake (the checks flag it): let it be taken out. */}
                    {placed.some((t) => traitKey(t) === traitKey(ROLEPLAYING_QUALITY)) ? (
                      <button type="button" className="button button--small" {...f.control} onClick={() => onChange(placeTrait(split, ROLEPLAYING_QUALITY, undefined))}>
                        Remove from the split
                      </button>
                    ) : (
                      <span className="split-table__fixed">Both, always</span>
                    )}
                    {f.list}
                  </td>
                </tr>
              )}
            </IssueField>
          )}
          {stray
            .filter((t) => traitKey(t) !== traitKey(ROLEPLAYING_QUALITY))
            .map((t) => (
              <IssueField key={traitKey(t)} field={traitField(t)}>
                {(f) => (
                  <tr>
                    <th scope="row">
                      {traitLabel(hero, t)} <span className="split-table__kind">doesn't fit</span>
                    </th>
                    <td />
                    <td>
                      <button type="button" className="button button--small" {...f.control} onClick={() => onChange(placeTrait(split, t, undefined))}>
                        Remove from the split
                      </button>
                      {f.list}
                    </td>
                  </tr>
                )}
              </IssueField>
            ))}
        </tbody>
      </table>
      <p className="split-tallies">
        {(['power', 'quality'] as const).map((kind) => (
          <span key={kind} className={tally(kind) === 2 ? 'split-tally split-tally--done' : 'split-tally'}>
            Both forms, {kind === 'power' ? 'powers' : 'qualities'}: {tally(kind)} of 2
          </span>
        ))}
      </p>
    </fieldset>
  )
}
