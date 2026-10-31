/**
 * Step 4, Personality (p. 100–105): roll with the archetype's personality dice, choose a
 * personality, name the roleplaying quality, fill in the Out ability, and take the
 * personality's bonus. A Divided hero may take a second personality for the heroic form
 * (p. 94), chosen freely (ruling 48), and picks whose Out ability they use.
 */
import { useId } from 'react'
import { traitKey } from '../rules/catalog'
import { personalities, personalitiesById, personalityStep } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { Personality } from '../rules/types'
import type { Hero, PersonalityChoice } from '../hero/model'
import { setStepRoll, stepRoll, takePendingRoll } from '../creation/rolls'
import { outTraits } from '../creation/divided'
import { dividedChoice, outerLayer } from '../creation/layers'
import { OUT_ABILITY_NAME } from '../creation/lookup'
import { deriveTraits, ROLEPLAYING_FIELD, ROLEPLAYING_QUALITY, traitsBefore } from '../creation/traits'
import { IssueField } from './inline-issues'
import { AbilityPicker } from './AbilityPicker'
import { BonusPicker } from './BonusPicker'
import { DiceIn } from './StepSection'
import { TablePicker } from './TablePicker'
import { StatusDiceRow } from '../components/SheetPreview'
import { buildSheet } from '../creation/sheet'
import { DiceText, DieIcon } from '../components/icons'

type Update = (change: (draft: Hero) => void) => void

function PersonalitySummary({ p }: { p: Personality }) {
  return (
    <>
      Status dice: Green <DieIcon die={p.statusDice.green} size="inline" />, Yellow <DieIcon die={p.statusDice.yellow} size="inline" />, Red <DieIcon die={p.statusDice.red} size="inline" />. Out: <DiceText text={p.outAbility} />{' '}
      <span className="page-ref">{formatEntryRef(p)}</span>
    </>
  )
}

/** A personality's bonus, if it has one, taken against the traits of the hero (or form) it applies to. */
function PersonalityBonus({ hero, choice, onChange }: { hero: Hero; choice: PersonalityChoice; onChange: (bonus: PersonalityChoice['bonus']) => void }) {
  const p = personalitiesById.get(choice.id)
  // Every entry in the data has at most one bonus (the trait checks assume the same).
  const bonus = p?.bonuses?.[0]
  if (!p || !bonus) return null
  return <BonusPicker hero={hero} legend={`${p.name}'s bonus`} bonus={bonus} listed={[]} before={traitsBefore({ ...hero, personality: choice }, 'personalityBonus')} assignments={choice.bonus} onChange={onChange} />
}

/** Divided's optional second personality, for the heroic form. */
function HeroicPersonality({ hero, update }: { hero: Hero; update: Update }) {
  const name = useId()
  // Divided's own choices may not be recorded yet if nothing was set in the archetype step.
  const divided = dividedChoice(hero) ?? {}
  const heroic = divided.heroicPersonality
  return (
    <section className="heroic-personality" aria-labelledby={`${name}-title`}>
      <h4 id={`${name}-title`}>Heroic form personality</h4>
      {outerLayer(hero)?.archetype.personalityNote && <p className="hint">{outerLayer(hero)!.archetype.personalityNote}</p>}
      <p className="hint">Your civilian form uses the personality above. To use it in both forms, leave this empty. The heroic form's personality isn't rolled for: choose any other one (ruling 48).</p>
      <TablePicker
        what="heroic form personality"
        method="constructed"
        dice={[]}
        table={personalities.filter((p) => p.id !== hero.personality?.id || p.id === heroic?.id)}
        roll={undefined}
        selectedId={heroic?.id}
        onRoll={() => {}}
        onSelect={(entry) =>
          update((h) => {
            const d = (h.archetype!.divided ??= {})
            d.heroicPersonality = { bonus: [], ...d.heroicPersonality, id: entry.id }
          })
        }
        describe={(entry) => <PersonalitySummary p={entry} />}
      />
      {heroic && (
        <>
          <button
            type="button"
            className="button"
            onClick={() =>
              update((h) => {
                const d = h.archetype!.divided!
                delete d.heroicPersonality
                delete d.outFrom
              })
            }
          >
            Use one personality for both forms
          </button>
          <PersonalityBonus
            hero={hero}
            choice={heroic}
            onChange={(bonus) =>
              update((h) => {
                h.archetype!.divided!.heroicPersonality!.bonus = bonus
              })
            }
          />
          <fieldset className="choice-list">
            <legend>Whose Out ability you use</legend>
            {(['civilian', 'heroic'] as const).map((form) => (
              <label key={form} className="choice">
                <input
                  type="radio"
                  name={`${name}-out`}
                  checked={divided.outFrom === form}
                  onChange={() =>
                    update((h) => {
                      h.archetype!.divided!.outFrom = form
                    })
                  }
                />
                <span className="choice__body">
                  <span className="choice__title">{form === 'civilian' ? `Civilian form (${personalitiesById.get(hero.personality!.id)?.name})` : `Heroic form (${personalitiesById.get(heroic.id)?.name})`}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </>
      )}
    </section>
  )
}

export function PersonalityStep({ hero, update }: { hero: Hero; update: Update }) {
  const id = useId()
  const choice = hero.personality
  const personality = choice ? personalitiesById.get(choice.id) : undefined
  const dice = outerLayer(hero)?.archetype.personalityDice
  const roll = stepRoll(hero, 'personality')
  const traits = deriveTraits(hero).traits
  const divided = dividedChoice(hero)
  const outIsHeroic = Boolean(divided?.heroicPersonality && divided.outFrom === 'heroic')
  const outChoice = outIsHeroic ? divided!.heroicPersonality! : choice
  const outEntry = outChoice && personalitiesById.get(outChoice.id)
  const rpKey = traitKey(ROLEPLAYING_QUALITY)
  const sheet = buildSheet(hero)

  return (
    <div className="step-form">
      {!dice && <p className="hint">Choose an archetype first: it sets the dice for this step.</p>}
      {dice && hero.method === 'constructed' && <DiceIn from="Archetype" dice={dice} />}
      {/* Without an archetype a Guided hero has no dice to roll, so the list only shows once there's a choice to keep. */}
      {(dice || hero.method === 'constructed' || choice) && (
        <TablePicker
          what="personality"
          method={dice ? hero.method : 'constructed'}
          rollMode={hero.rollMode}
          dice={dice ?? []}
          table={personalities}
          roll={roll}
          selectedId={choice?.id}
          onRoll={(r) => update((h) => setStepRoll(h, 'personality', r))}
          onSelect={(entry) =>
            update((h) => {
              const pending = takePendingRoll(h, 'personality')
              const kept = h.personality?.roll ?? pending
              // Keep earlier choices that may still fit; the checks flag the ones that don't.
              h.personality = { bonus: [], ...h.personality, id: entry.id, ...(kept ? { roll: kept } : {}) }
            })
          }
          describe={(entry) => <PersonalitySummary p={entry} />}
        />
      )}

      {choice && personality && (
        <>
          <IssueField field={ROLEPLAYING_FIELD}>
            {(f) => (
              <>
                <label className="field" htmlFor={`${id}-rp`}>
                  <span>
                    Roleplaying quality (<DieIcon die={personalityStep.roleplayingQuality.die} />)
                  </span>
                  <input
                    id={`${id}-rp`}
                    type="text"
                    {...f.control}
                    value={hero.traitNames[rpKey] ?? ''}
                    onChange={(e) =>
                      update((h) => {
                        if (e.target.value) h.traitNames[rpKey] = e.target.value
                        else delete h.traitNames[rpKey]
                      })
                    }
                  />
                </label>
                {/* Outside the label, so it isn't part of the field's name. */}
                {f.list}
              </>
            )}
          </IssueField>
          <p className="hint">
            <DiceText text={personalityStep.roleplayingQuality.summary} /> <span className="page-ref">{formatEntryRef(personalityStep.roleplayingQuality)}</span>
          </p>

          {sheet.statusDice && (
            <section className="step-section" aria-label="Status dice">
              <h4>Status dice</h4>
              <StatusDiceRow dice={sheet.statusDice} label={sheet.heroicStatusDice ? 'Civilian form status dice' : 'Status dice'} />
              {sheet.heroicStatusDice && <StatusDiceRow dice={sheet.heroicStatusDice} label="Heroic form status dice" />}
            </section>
          )}

          <PersonalityBonus
            hero={hero}
            choice={choice}
            onChange={(bonus) =>
              update((h) => {
                h.personality!.bonus = bonus
              })
            }
          />

          {outerLayer(hero)?.archetype.transitionMethods && <HeroicPersonality hero={hero} update={update} />}

          {outChoice && outEntry && (
            <AbilityPicker
              hero={hero}
              traits={outTraits(hero, traits)}
              legend={outIsHeroic ? 'Out ability (heroic form)' : 'Out ability'}
              options={[{ name: OUT_ABILITY_NAME, type: 'A', text: outEntry.outAbility }]}
              source="out"
              step="personality"
              picks={[{ source: 'out', name: OUT_ABILITY_NAME, ...(outChoice.outUses ? { uses: outChoice.outUses } : {}), ...(outChoice.outBlanks ? { blanks: outChoice.outBlanks } : {}) }]}
              onChange={(picks) =>
                update((h) => {
                  const target = outIsHeroic ? h.archetype!.divided!.heroicPersonality! : h.personality!
                  const pick = picks[0]
                  if (pick?.uses?.length) target.outUses = pick.uses
                  else delete target.outUses
                  if (pick?.blanks && Object.keys(pick.blanks).length) target.outBlanks = pick.blanks
                  else delete target.outBlanks
                })
              }
              fixed
              nameable={false}
            />
          )}
        </>
      )}
    </div>
  )
}
