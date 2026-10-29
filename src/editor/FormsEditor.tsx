/**
 * Form-Changer's forms (p. 90–91) and Minion-Maker's minion forms (p. 86–88), recorded on
 * the auxiliary sheet. The rules checks in ../creation/forms.ts warn about anything that
 * doesn't fit.
 */
import { useId } from 'react'
import { parseTraitKey, traitKey, type TraitRef } from '../rules/catalog'
import { dieSize, stepDie } from '../rules/dice'
import { formatEntryRef } from '../rules/books'
import type { Archetype } from '../rules/types'
import type { FormChoice, Hero, MinionFormsChoice } from '../hero/model'
import { formAbilityOptions, formDice, formLabel, formPowerOptions, formSlots, formTraits, formUpgradeOptions, setFormSlot } from '../creation/forms'
import { traitLabel, type HeroTrait } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { DiceAssigner } from './DiceAssigner'
import { DiceText } from '../components/icons'

interface FormCardProps {
  hero: Hero
  ar: Archetype
  traits: readonly HeroTrait[]
  forms: readonly FormChoice[]
  form: FormChoice
  /** Shown until the player names the form, e.g. "Green form 1". */
  label: string
  onChange: (form: FormChoice) => void
  /** Only for forms beyond the number the archetype asks for. */
  onRemove?: () => void
}

/** A select of traits a Yellow form can raise one size. */
function UpgradeSelect({ hero, label, options, value, onChange }: { hero: Hero; label: string; options: readonly HeroTrait[]; value: TraitRef | undefined; onChange: (t: TraitRef | undefined) => void }) {
  const id = useId()
  const offList = value && !options.some((o) => traitKey(o.trait) === traitKey(value))
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value ? traitKey(value) : ''} onChange={(e) => onChange(e.target.value ? parseTraitKey(e.target.value) : undefined)}>
        <option value="">Choose…</option>
        {offList && <option value={traitKey(value)}>{traitLabel(hero, value)} (doesn't fit)</option>}
        {options.map((o) => (
          <option key={traitKey(o.trait)} value={traitKey(o.trait)}>
            {o.name}: {o.die} → {stepDie(o.die, 1)}
          </option>
        ))}
      </select>
    </label>
  )
}

function FormCard({ hero, ar, traits, forms, form, label, onChange, onRemove }: FormCardProps) {
  const id = useId()
  const spec = ar.forms!
  const name = form.name?.trim() || label
  const upgrades = form.upgrades ?? []
  const upgradeOptions = formUpgradeOptions(hero, traits, form)
  const setUpgrade = (which: 0 | 1, t: TraitRef | undefined) => {
    const next = which === 0 ? [t, upgrades[1]] : [upgrades[0], t]
    onChange({ ...form, upgrades: next.filter((x): x is TraitRef => Boolean(x)) })
  }
  return (
    <fieldset className="form-card">
      <legend>{name}</legend>
      <label className="field" htmlFor={`${id}-name`}>
        <span>Form name (optional)</span>
        <input
          id={`${id}-name`}
          type="text"
          value={form.name ?? ''}
          onChange={(e) => {
            const { name: _, ...rest } = form
            onChange(e.target.value ? { ...rest, name: e.target.value } : rest)
          }}
        />
      </label>
      <DiceAssigner
        label={(t) => traitLabel(hero, t)}
        legend={`${name} powers`}
        dice={formDice(traits)}
        assignments={form.powers}
        options={formPowerOptions(ar, traits)}
        earlier={[]}
        onChange={(powers) => onChange({ ...form, powers })}
      />
      {form.zone === 'yellow' && (
        <div className="form-card__upgrades">
          {[0, 1].slice(0, spec.yellowFormUpgrades).map((i) => (
            <UpgradeSelect
              key={i}
              hero={hero}
              label={`Raise die ${i + 1}`}
              options={upgradeOptions.filter((o) => !upgrades.some((u, j) => j !== i && traitKey(u) === traitKey(o.trait)))}
              value={upgrades[i]}
              onChange={(t) => setUpgrade(i as 0 | 1, t)}
            />
          ))}
        </div>
      )}
      <AbilityPicker
        hero={hero}
        traits={formTraits(hero, traits, form)}
        legend={`${name} ability: choose 1`}
        options={formAbilityOptions(spec, forms, form)}
        source="archetype.form"
        step="archetype"
        picks={form.ability ? [form.ability] : []}
        // Taking another ability replaces the one the form had.
        onChange={(picks) => {
          const { ability: _, ...rest } = form
          const ability = picks.at(-1)
          onChange(ability ? { ...rest, ability } : rest)
        }}
      />
      {onRemove && (
        <button type="button" className="button" onClick={onRemove}>
          Remove this extra form
        </button>
      )}
    </fieldset>
  )
}

/**
 * The forms, or with `part` ("form:green:1", from ../hero/archetype-parts.ts) just that one.
 * A color's last part also shows any extra forms of that color, so they can be removed.
 */
export function FormChangerForms({ hero, ar, traits, forms, onChange, part }: { hero: Hero; ar: Archetype; traits: readonly HeroTrait[]; forms: readonly FormChoice[]; onChange: (forms: FormChoice[]) => void; part?: string }) {
  const spec = ar.forms!
  const zones = [
    { zone: 'green', count: spec.greenFormCount },
    { zone: 'yellow', count: spec.yellowFormCount },
  ] as const
  const [, partZone, partIndex] = part?.split(':') ?? []
  const shows = (zone: string, i: number, count: number) => !part || (zone === partZone && (i === Number(partIndex) || (i >= count && Number(partIndex) === count - 1)))
  const first = !part || part === 'form:green:0'
  return (
    <div className="forms-editor" data-section="parts">
      {!part && <h4>Forms</h4>}
      {first && (
        <p className="hint">
          <DiceText text={spec.summary} />
        </p>
      )}
      {zones.map(({ zone, count }) =>
        formSlots(forms, zone, count).map((slot, i) => {
          if (!shows(zone, i, count)) return null
          const form = slot.form ?? { zone, powers: [] }
          return (
            <FormCard
              key={`${zone}-${i}`}
              hero={hero}
              ar={ar}
              traits={traits}
              forms={forms}
              form={form}
              label={slot.form ? formLabel(forms, slot.form) : `${zone === 'green' ? 'Green' : 'Yellow'} form ${i + 1}`}
              onChange={(next) => onChange(setFormSlot(forms, slot, next))}
              onRemove={i >= count ? () => onChange(setFormSlot(forms, slot, undefined)) : undefined}
            />
          )
        }),
      )}
    </div>
  )
}

export function MinionForms({ hero, ar, traits, choice, onChange }: { hero: Hero; ar: Archetype; traits: readonly HeroTrait[]; choice: MinionFormsChoice | undefined; onChange: (choice: MinionFormsChoice) => void }) {
  const id = useId()
  const spec = ar.minionForms!
  const chosen = choice?.forms ?? []
  const qualities = traits.filter((t) => t.trait.kind === 'quality')
  const quality = choice?.quality && qualities.find((t) => traitKey(t.trait) === traitKey(choice.quality!))
  const offList = choice?.quality && !quality
  const set = (next: Partial<MinionFormsChoice>) => onChange({ forms: chosen, ...(choice?.quality ? { quality: choice.quality } : {}), ...next })
  return (
    <fieldset className="minion-forms" data-section="parts">
      <legend>Minion forms</legend>
      <p className="hint">
        {spec.selection} <span className="page-ref">{formatEntryRef(spec)}</span>
      </p>
      <label className="field" htmlFor={id}>
        <span>Quality that sets how many</span>
        <select
          id={id}
          value={choice?.quality ? traitKey(choice.quality) : ''}
          onChange={(e) => {
            if (e.target.value) set({ quality: parseTraitKey(e.target.value) })
            else onChange({ forms: chosen })
          }}
        >
          <option value="">Choose…</option>
          {offList && <option value={traitKey(choice.quality!)}>{traitLabel(hero, choice.quality!)} (doesn't fit)</option>}
          {qualities.map((t) => (
            <option key={traitKey(t.trait)} value={traitKey(t.trait)}>
              {t.name} ({t.die})
            </option>
          ))}
        </select>
      </label>
      <p>
        <DiceText text={quality ? `Choose ${dieSize(quality.die)} (your ${quality.name} is ${quality.die}); you have ${chosen.length}.` : `You have ${chosen.length}.`} />
      </p>
      {chosen
        .filter((n) => !spec.forms.some((f) => f.name === n))
        .map((n) => (
          <label key={n} className="choice">
            <input type="checkbox" checked onChange={() => set({ forms: chosen.filter((x) => x !== n) })} />
            <span className="choice__body">
              <span className="choice__title">
                {n} <span className="choice__note">(not on this list)</span>
              </span>
            </span>
          </label>
        ))}
      {spec.forms.map((f) => (
        <label key={f.name} className="choice">
          <input type="checkbox" checked={chosen.includes(f.name)} onChange={(e) => set({ forms: e.target.checked ? [...chosen, f.name] : chosen.filter((n) => n !== f.name) })} />
          <span className="choice__body">
            <span className="choice__title">
              {f.name} <span className="choice__note">(bonus of +{f.minBonus} or more)</span>
            </span>
            <span className="choice__detail">{f.effect}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
