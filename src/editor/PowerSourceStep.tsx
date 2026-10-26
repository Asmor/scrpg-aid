/**
 * Step 2, Power source (p. 56–67): roll with the dice the background gave, choose a power
 * source, put those same dice on its powers, take its abilities, and take its bonus.
 */
import { expandRefs } from '../rules/catalog'
import { backgroundsById, powerSources, powerSourcesById } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { AbilityChoice, PowerSource } from '../rules/types'
import { describeOptions } from '../creation/format'
import type { AbilityPick, AbilitySource, Hero } from '../hero/model'
import { setStepRoll, stepRoll, takePendingRoll } from '../creation/rolls'
import { deriveTraits, traitsBefore } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { BonusPicker } from './BonusPicker'
import { DiceAssigner } from './DiceAssigner'
import { TablePicker } from './TablePicker'

function PowerSourceSummary({ ps }: { ps: PowerSource }) {
  return (
    <>
      Powers: {describeOptions(ps.powers.options)}. Archetype dice {ps.archetypeDice.join(', ')}. <span className="page-ref">{formatEntryRef(ps)}</span>
    </>
  )
}

const blockLegend = (zone: string, block: AbilityChoice) => `${zone} abilities: choose ${block.count}`

export function PowerSourceStep({ hero, update }: { hero: Hero; update: (change: (draft: Hero) => void) => void }) {
  const choice = hero.powerSource
  const ps = choice ? powerSourcesById.get(choice.id) : undefined
  const bg = hero.background ? backgroundsById.get(hero.background.id) : undefined
  const dice = bg?.powerSourceDice
  const roll = stepRoll(hero, 'powerSource')
  const traits = deriveTraits(hero).traits
  const bonus = ps?.bonuses?.[0]

  const setAbilities = (source: AbilitySource, picks: AbilityPick[]) =>
    update((h) => {
      h.powerSource!.abilities = [...h.powerSource!.abilities.filter((p) => p.source !== source), ...picks]
    })

  return (
    <div className="step-form">
      {!dice && <p className="hint">Choose a background first: it sets the dice for this step.</p>}
      {/* Without a background a Guided hero has no dice to roll, so the list only shows once there's a choice to keep. */}
      {(dice || hero.method === 'constructed' || choice) && (
        <TablePicker
          what="power source"
          method={dice ? hero.method : 'constructed'}
          dice={dice ?? []}
          table={powerSources}
          roll={roll}
          selectedId={choice?.id}
          onRoll={(r) => update((h) => setStepRoll(h, 'powerSource', r))}
          onSelect={(entry) =>
            update((h) => {
              const pending = takePendingRoll(h, 'powerSource')
              const kept = h.powerSource?.roll ?? pending
              // Keep earlier choices that may still fit; the checks flag the ones that don't.
              h.powerSource = { powers: [], abilities: [], bonus: [], ...h.powerSource, id: entry.id, ...(kept ? { roll: kept } : {}) }
            })
          }
          describe={(entry) => <PowerSourceSummary ps={entry} />}
        />
      )}

      {choice && ps && (
        <>
          {dice ? (
            <DiceAssigner
              hero={hero}
              legend={`${ps.name} powers`}
              dice={dice}
              assignments={choice.powers}
              options={expandRefs([...(ps.powers.required ?? []), ...ps.powers.options])}
              earlier={traitsBefore(hero, 'powerSource')}
              onChange={(powers) =>
                update((h) => {
                  h.powerSource!.powers = powers
                })
              }
            />
          ) : (
            <p className="hint">Choose a background to see which dice go on {ps.name}'s powers.</p>
          )}
          {ps.powers.note && <p className="hint">{ps.powers.note}</p>}

          {ps.greenAbilities && (
            <AbilityPicker
              hero={hero}
              traits={traits}
              legend={blockLegend('Green', ps.greenAbilities)}
              hint={ps.greenAbilities.constraint}
              options={ps.greenAbilities.options ?? []}
              source="powerSource.green"
              step="powerSource"
              picks={choice.abilities.filter((p) => p.source === 'powerSource.green')}
              onChange={(picks) => setAbilities('powerSource.green', picks)}
            />
          )}
          <AbilityPicker
            hero={hero}
            traits={traits}
            legend={blockLegend('Yellow', ps.yellowAbilities)}
            hint={ps.yellowAbilities.constraint}
            options={ps.yellowAbilities.options ?? []}
            source="powerSource.yellow"
            step="powerSource"
            picks={choice.abilities.filter((p) => p.source === 'powerSource.yellow')}
            onChange={(picks) => setAbilities('powerSource.yellow', picks)}
          />

          {/* Every entry in the data has at most one bonus (the trait checks assume the same). */}
          {bonus && (
            <BonusPicker
              hero={hero}
              legend={`${ps.name}'s bonus`}
              bonus={bonus}
              listed={ps.powers.options}
              before={traitsBefore(hero, 'powerSourceBonus')}
              assignments={choice.bonus}
              onChange={(assignments) =>
                update((h) => {
                  h.powerSource!.bonus = assignments
                })
              }
            />
          )}
        </>
      )}
    </div>
  )
}
