/**
 * Step 6, Retcon (p. 112): take one of the listed changes. Each kind has its own choices;
 * one that isn't complete yet (two dice to swap, a trait to add, ...) is kept on screen until
 * it is, since a saved retcon is always a whole one.
 */
import { useId, useState } from 'react'
import { parseTraitKey, traitKey, traitsOfKind, type TraitRef } from '../rules/catalog'
import { retcons, retconStep } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { Retcon } from '../rules/types'
import type { AbilityPick, Hero, PrincipleChoice, RetconChoice } from '../hero/model'
import { dividedChoice } from '../creation/layers'
import { abilityRetconTargets, availableRetcons, retconUnavailableReason } from '../creation/retcons'
import { deriveTraits, traitLabel, type HeroTrait } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { PrinciplePicker } from './PrinciplePicker'
import { RedAbilityLists } from './RedAbilitiesStep'

type Update = (change: (draft: Hero) => void) => void

/** A select of traits, by "kind:id". */
function TraitField({ hero, label, options, value, onChange }: { hero: Hero; label: string; options: readonly { trait: TraitRef; text: string }[]; value: TraitRef | undefined; onChange: (t: TraitRef | undefined) => void }) {
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
            {o.text}
          </option>
        ))}
      </select>
    </label>
  )
}

const held = (traits: readonly HeroTrait[]) => traits.map((t) => ({ trait: t.trait, text: `${t.name} (${t.die})` }))

function SwapDice({ hero, retcon, before, saved, save }: { hero: Hero; retcon: Retcon & { kind: 'swapDice' }; before: readonly HeroTrait[]; saved: TraitRef[] | undefined; save: (traits: [TraitRef, TraitRef] | undefined) => void }) {
  const [draft, setDraft] = useState<(TraitRef | undefined)[]>(saved ?? [])
  const options = held(before.filter((t) => retcon.targets.includes(t.trait.kind)))
  const set = (i: 0 | 1, t: TraitRef | undefined) => {
    const next = [...draft]
    next[i] = t
    setDraft(next)
    save(next[0] && next[1] ? [next[0], next[1]] : undefined)
  }
  return (
    <>
      {([0, 1] as const).map((i) => (
        <TraitField
          key={i}
          hero={hero}
          label={i === 0 ? 'Swap this die' : 'With this one'}
          options={options.filter((o) => !draft.some((d, j) => j !== i && d && traitKey(d) === traitKey(o.trait)))}
          value={draft[i]}
          onChange={(t) => set(i, t)}
        />
      ))}
    </>
  )
}

function ChangeAbilityTrait({ hero, traits, choice, save }: { hero: Hero; traits: readonly HeroTrait[]; choice: (RetconChoice & { kind: 'changeAbilityTrait' }) | undefined; save: (ability: AbilityPick, uses: TraitRef[]) => void }) {
  const id = useId()
  const targets = abilityRetconTargets(hero, traits)
  const key = (p: { source: string; name: string }) => `${p.source}|${p.name}`
  const current = choice && targets.find((t) => key(t.pick) === key(choice.ability))
  return (
    <>
      <label className="field" htmlFor={id}>
        <span>Ability</span>
        <select
          id={id}
          value={choice ? key(choice.ability) : ''}
          onChange={(e) => {
            const target = targets.find((t) => key(t.pick) === e.target.value)
            // Start from what it uses now; the checks ask for a change.
            if (target) save(target.pick, target.pick.uses ?? [])
          }}
        >
          {/* Once one is chosen, the retcon stays complete; "Take no retcon yet" clears it. */}
          {!choice && <option value="">Choose…</option>}
          {choice && !current && <option value={key(choice.ability)}>{choice.ability.name} (you don't have it)</option>}
          {/* The saved retcon names an ability by source and name only, so a repeat picks the first. */}
          {targets.map((t, i) => (
            <option key={`${i}-${key(t.pick)}`} value={key(t.pick)}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {current && choice && (
        <AbilityPicker
          hero={hero}
          traits={current.traits}
          legend={`What ${current.label} uses now`}
          options={[current.ability]}
          source={current.pick.source}
          step="retcon"
          picks={[{ source: current.pick.source, name: current.pick.name, uses: choice.uses, ...(current.pick.blanks ? { blanks: current.pick.blanks } : {}) }]}
          onChange={(picks) => save(choice.ability, picks[0]?.uses ?? [])}
          fixed
          nameable={false}
        />
      )}
    </>
  )
}

function StatusForm({ hero, choice, update }: { hero: Hero; choice: RetconChoice & { kind: 'upgradeStatusDie' }; update: Update }) {
  const name = useId()
  if (!dividedChoice(hero)?.heroicPersonality) return null
  return (
    <fieldset className="choice-list">
      <legend>Which form's die</legend>
      {(['civilian', 'heroic'] as const).map((form) => (
        <label key={form} className="choice">
          <input
            type="radio"
            name={name}
            checked={choice.form === form}
            onChange={() =>
              update((h) => {
                h.retcon = { ...choice, form }
              })
            }
          />
          <span className="choice__body">
            <span className="choice__title">{form === 'civilian' ? 'Civilian form' : 'Heroic form'}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

function ChangePrinciple({ choice, save }: { choice: (RetconChoice & { kind: 'changePrinciple' }) | undefined; save: (replace: 'background' | 'archetype', principle: PrincipleChoice | undefined) => void }) {
  const name = useId()
  const [replace, setReplace] = useState<'background' | 'archetype' | undefined>(choice?.replace)
  return (
    <>
      <fieldset className="choice-list">
        <legend>Replace</legend>
        {(['background', 'archetype'] as const).map((which) => (
          <label key={which} className="choice">
            <input
              type="radio"
              name={name}
              checked={replace === which}
              onChange={() => {
                setReplace(which)
                if (choice) save(which, choice.with)
              }}
            />
            <span className="choice__body">
              <span className="choice__title">{which === 'background' ? 'Your background principle' : 'Your archetype principle'}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {replace && <PrinciplePicker category={undefined} label="New principle" choice={choice?.with} onChange={(p) => save(replace, p)} />}
    </>
  )
}

export function RetconStep({ hero, update }: { hero: Hero; update: Update }) {
  const name = useId()
  const choice = hero.retcon
  // A retcon chosen but not complete yet isn't saved; this remembers which one it is.
  const [pendingId, setPendingId] = useState<string | undefined>(undefined)
  const selectedId = choice?.id ?? pendingId
  const retcon = retcons.find((r) => r.id === selectedId)
  const available = availableRetcons(hero)
  const listed = retcons.filter((r) => available.includes(r) || r.id === selectedId)
  // The traits before the retcon changes them.
  const before = deriveTraits({ ...hero, retcon: null }).traits
  const save = (next: RetconChoice | null) =>
    update((h) => {
      h.retcon = next
    })
  const choose = (r: Retcon) => {
    setPendingId(r.id)
    if (choice?.id === r.id) return
    // The retcons with nothing more to choose are saved straight away.
    save(r.kind === 'upgradeStatusDie' ? { id: r.id, kind: 'upgradeStatusDie' } : null)
  }

  return (
    <div className="step-form">
      <p className="hint">
        Choose {retconStep.count} change to your hero. <span className="page-ref">{formatEntryRef(retconStep)}</span>
      </p>
      <fieldset className="choice-list">
        <legend className="visually-hidden">Choose a retcon</legend>
        {listed.map((r) => {
          const reason = retconUnavailableReason(hero, r)
          return (
            <label key={r.id} className="choice">
              <input type="radio" name={name} checked={r.id === selectedId} onChange={() => choose(r)} />
              <span className="choice__body">
                <span className="choice__title">{r.summary}</span>
                {reason && <span className="choice__detail">{reason}</span>}
              </span>
            </label>
          )
        })}
      </fieldset>
      {selectedId && (
        <button
          type="button"
          className="button"
          onClick={() => {
            setPendingId(undefined)
            save(null)
          }}
        >
          Take no retcon yet
        </button>
      )}

      {retcon?.kind === 'swapDice' && (
        <SwapDice
          key={retcon.id}
          hero={hero}
          retcon={retcon}
          before={before}
          saved={choice?.kind === 'swapDice' ? choice.traits : undefined}
          save={(traits) => save(traits ? { id: retcon.id, kind: 'swapDice', traits } : null)}
        />
      )}
      {retcon?.kind === 'changeAbilityTrait' && (
        <ChangeAbilityTrait
          hero={hero}
          traits={before}
          choice={choice?.kind === 'changeAbilityTrait' ? choice : undefined}
          save={(ability, uses) => save({ id: retcon.id, kind: 'changeAbilityTrait', ability: { source: ability.source, name: ability.name }, uses })}
        />
      )}
      {retcon?.kind === 'gainPowerOrQuality' && (
        <TraitField
          hero={hero}
          label={`Gain at ${retcon.die}`}
          options={[...traitsOfKind('power'), ...traitsOfKind('quality')]
            .filter((t) => !before.some((b) => traitKey(b.trait) === traitKey(t)))
            .map((t) => ({ trait: { kind: t.kind, id: t.id }, text: `${traitLabel(hero, t)} (${t.kind})` }))}
          value={choice?.kind === 'gainPowerOrQuality' ? choice.gained.trait : undefined}
          onChange={(t) => save(t ? { id: retcon.id, kind: 'gainPowerOrQuality', gained: { trait: t, die: retcon.die } } : null)}
        />
      )}
      {retcon?.kind === 'upgradeStatusDie' && choice?.kind === 'upgradeStatusDie' && <StatusForm hero={hero} choice={choice} update={update} />}
      {retcon?.kind === 'changePrinciple' && (
        <ChangePrinciple
          choice={choice?.kind === 'changePrinciple' ? choice : undefined}
          save={(replace, principle) => save(principle ? { id: retcon.id, kind: 'changePrinciple', replace, with: principle } : null)}
        />
      )}
      {retcon?.kind === 'gainRedAbility' && (
        <RedAbilityLists
          hero={hero}
          picks={choice?.kind === 'gainRedAbility' ? [choice.ability] : []}
          source="retcon"
          step="retcon"
          // The model holds one Red ability (the data's count is 1): taking another replaces it.
          onChange={(picks) => {
            const ability = picks.at(-1)
            save(ability ? { id: retcon.id, kind: 'gainRedAbility', ability } : null)
          }}
        />
      )}
    </div>
  )
}
