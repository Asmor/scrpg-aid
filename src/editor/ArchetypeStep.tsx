/**
 * Step 3, Archetype (p. 72–98): roll with the dice the power source gave, choose an
 * archetype, put those dice on its required trait, powers, and qualities, take its
 * abilities, bonus, and principle. Training's extra quality is taken here too.
 *
 * Divided and Modular (which build on a second archetype) and Form-Changer and
 * Minion-Maker's forms aren't in the editor yet.
 */
import { expandRefs } from '../rules/catalog'
import { archetypes, archetypesById, powerSourcesById, principleCategories } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { AbilityChoice, Archetype, IfAlreadyHave } from '../rules/types'
import { describeOptions } from '../components/format'
import type { AbilityPick, AbilitySource, ArchetypeChoice, Hero } from '../hero/model'
import { setStepRoll, stepRoll, takePendingRoll } from '../creation/rolls'
import { canSwapRequired, deriveTraits, traitsBefore } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'
import { BonusPicker } from './BonusPicker'
import { DiceAssigner } from './DiceAssigner'
import { PrinciplePicker } from './PrinciplePicker'
import { TablePicker } from './TablePicker'

function ArchetypeSummary({ ar }: { ar: Archetype }) {
  const category = principleCategories.find((c) => c.id === ar.principleCategory)?.name
  const parts = ar.complex
    ? [ar.summary]
    : [
        ar.required && `Needs ${describeOptions(ar.required.options)}`,
        ar.powers && `Powers: ${describeOptions(ar.powers.options)}`,
        ar.qualities && `Qualities: ${describeOptions([...(ar.qualities.powerOptions ?? []), ...ar.qualities.options])}`,
        category && `Principle of ${category}`,
      ]
  return (
    <>
      {parts.filter(Boolean).join('. ')}. <span className="page-ref">{formatEntryRef(ar)}</span>
    </>
  )
}

/** What the data allows when the hero already has the required trait (see the step notes, p. 73). */
const IF_ALREADY_HAVE: Record<IfAlreadyHave, string> = {
  skip: 'skip it',
  // Any die, whatever its size (ruling 43).
  swap: 'swap one of this step’s dice onto it and assign the old die elsewhere',
  addDifferentFromCategory: 'add a different power from the same category instead',
}

function RequiredHint({ ar }: { ar: Archetype }) {
  const required = ar.required!
  const ways = required.ifAlreadyHave.map((w) => IF_ALREADY_HAVE[w])
  const list = ways.length > 1 ? `${ways.slice(0, -1).join(', ')}, or ${ways.at(-1)}` : ways[0]
  return (
    <p className="hint">
      {ar.name} needs a die on {describeOptions(required.options)}.{list && ` If you already have it, you may ${list}.`}
    </p>
  )
}

const listAnd = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''))

const blockLegend = (zone: string, block: AbilityChoice) => `${zone} abilities: choose ${block.count}`

const ABILITY_BLOCKS: readonly { source: AbilitySource; name: string; has: (ar: Archetype) => boolean }[] = [
  { source: 'archetype.fixedGreen', name: 'Green abilities you always have', has: (ar) => Boolean(ar.fixedGreenAbilities) },
  { source: 'archetype.green', name: 'Green abilities', has: (ar) => Boolean(ar.greenAbilities) },
  { source: 'archetype.fixedYellow', name: 'Yellow abilities you always have', has: (ar) => Boolean(ar.fixedYellowAbilities) },
  { source: 'archetype.yellow', name: 'Yellow abilities', has: (ar) => Boolean(ar.yellowAbilities) },
  { source: 'archetype.fixedRed', name: 'Red abilities you always have', has: (ar) => Boolean(ar.fixedRedAbilities) },
]

/**
 * Choices kept from an archetype chosen before, which this one has no place for (a bonus,
 * forms, a second archetype). Going back keeps choices so they can be reused, but these
 * need a way out, since no control below shows them.
 */
function leftovers(ar: Archetype, choice: ArchetypeChoice): string[] {
  return [
    !ar.bonuses?.length && choice.bonus.length > 0 && 'a bonus',
    (choice.secondary || choice.divided || choice.modular) && 'a second archetype',
    choice.forms && !ar.forms && 'forms',
    choice.minionForms && !ar.minionForms && 'minion forms',
  ].filter((x): x is string => Boolean(x))
}

export function ArchetypeStep({ hero, update }: { hero: Hero; update: (change: (draft: Hero) => void) => void }) {
  const choice = hero.archetype
  const ar = choice ? archetypesById.get(choice.id) : undefined
  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  const dice = ps?.archetypeDice
  const roll = stepRoll(hero, 'archetype')
  const traits = deriveTraits(hero).traits
  const psBonus = ps?.bonuses?.[0]

  const abilities = (source: AbilitySource) => choice?.abilities.filter((p) => p.source === source) ?? []
  const setAbilities = (source: AbilitySource, picks: AbilityPick[]) =>
    update((h) => {
      h.archetype!.abilities = [...h.archetype!.abilities.filter((p) => p.source !== source), ...picks]
    })
  const picker = (source: AbilitySource, legend: string, options: AbilityChoice['options'], hint?: string, fixed = false) => (
    <AbilityPicker
      hero={hero}
      traits={traits}
      legend={legend}
      hint={hint}
      options={options ?? []}
      source={source}
      step="archetype"
      picks={abilities(source)}
      onChange={(picks) => setAbilities(source, picks)}
      fixed={fixed}
    />
  )

  return (
    <div className="step-form">
      {!dice && <p className="hint">Choose a power source first: it sets the dice for this step.</p>}
      {/* Without a power source a Guided hero has no dice to roll, so the list only shows once there's a choice to keep. */}
      {(dice || hero.method === 'constructed' || choice) && (
        <TablePicker
          what="archetype"
          method={dice ? hero.method : 'constructed'}
          dice={dice ?? []}
          table={archetypes}
          roll={roll}
          selectedId={choice?.id}
          onRoll={(r) => update((h) => setStepRoll(h, 'archetype', r))}
          onSelect={(entry) =>
            update((h) => {
              const pending = takePendingRoll(h, 'archetype')
              const kept = h.archetype?.roll ?? pending
              // Keep earlier choices that may still fit; the checks flag the ones that don't.
              h.archetype = { traits: [], abilities: [], bonus: [], ...h.archetype, id: entry.id, ...(kept ? { roll: kept } : {}) }
            })
          }
          describe={(entry) => <ArchetypeSummary ar={entry} />}
        />
      )}

      {choice && ar?.complex && <p className="hint">Building on a second archetype isn't in the editor yet. It's coming in a later update.</p>}

      {choice && ar && !ar.complex && (
        <>
          {ar.required && <RequiredHint ar={ar} />}
          {dice ? (
            <DiceAssigner
              hero={hero}
              legend={`${ar.name} powers and qualities`}
              dice={dice}
              assignments={choice.traits}
              options={expandRefs([...(ar.required?.options ?? []), ...(ar.powers?.options ?? []), ...(ar.qualities?.powerOptions ?? []), ...(ar.qualities?.options ?? [])])}
              earlier={traitsBefore(hero, 'archetype')}
              canSwap={(t) => canSwapRequired(ar, t)}
              onChange={(assigned) =>
                update((h) => {
                  h.archetype!.traits = assigned
                })
              }
            />
          ) : (
            <p className="hint">Choose a power source to see which dice go on {ar.name}'s powers and qualities.</p>
          )}
          {ar.powers?.note && <p className="hint">{ar.powers.note}</p>}
          {ar.qualities?.note && <p className="hint">{ar.qualities.note}</p>}

          {ps && psBonus?.kind === 'extraArchetypeQuality' && (
            <BonusPicker
              hero={hero}
              legend={`${ps.name}'s extra quality`}
              bonus={psBonus}
              listed={ps.powers.options}
              before={traitsBefore(hero, 'deferredBonus')}
              archetypeQualities={ar.qualities?.options ?? []}
              assignments={hero.powerSource!.bonus}
              onChange={(assignments) =>
                update((h) => {
                  h.powerSource!.bonus = assignments
                })
              }
            />
          )}

          {ar.fixedGreenAbilities && picker('archetype.fixedGreen', 'Green abilities you always have', ar.fixedGreenAbilities, ar.fixedGreenConstraint, true)}
          {ar.greenAbilities && picker('archetype.green', blockLegend('Green', ar.greenAbilities), ar.greenAbilities.options, ar.greenAbilities.constraint)}
          {ar.fixedYellowAbilities && picker('archetype.fixedYellow', 'Yellow abilities you always have', ar.fixedYellowAbilities, undefined, true)}
          {ar.yellowAbilities &&
            picker(
              'archetype.yellow',
              blockLegend('Yellow', ar.yellowAbilities),
              ar.yellowAbilities.fromGreenList ? ar.greenAbilities?.options : ar.yellowAbilities.options,
              ar.yellowAbilities.constraint,
            )}
          {ar.fixedRedAbilities && picker('archetype.fixedRed', 'Red abilities you always have', ar.fixedRedAbilities, undefined, true)}
          {(ar.forms || ar.minionForms) && <p className="hint">{ar.name}'s forms aren't in the editor yet. They're coming in a later update.</p>}

          {/* Picks for a block this archetype doesn't have, so they can be removed. */}
          {ABILITY_BLOCKS.filter((b) => !b.has(ar) && abilities(b.source).length > 0).map((b) => (
            <div key={b.source}>{picker(b.source, `${b.name} from another archetype`, [], `${ar.name} doesn't have these. Untick them to remove them.`)}</div>
          ))}
          {leftovers(ar, choice).length > 0 && (
            <div className="leftovers">
              <p className="hint">
                You have {listAnd(leftovers(ar, choice))} from another archetype, which {ar.name} doesn't use.
              </p>
              <button
                type="button"
                className="button"
                onClick={() =>
                  update((h) => {
                    const a = h.archetype!
                    if (!ar.bonuses?.length) a.bonus = []
                    delete a.secondary
                    delete a.divided
                    delete a.modular
                    if (!ar.forms) delete a.forms
                    if (!ar.minionForms) delete a.minionForms
                  })
                }
              >
                Remove them
              </button>
            </div>
          )}

          {/* Every entry in the data has at most one bonus (the trait checks assume the same). */}
          {ar.bonuses?.[0] && (
            <BonusPicker
              hero={hero}
              legend={`${ar.name}'s bonus`}
              bonus={ar.bonuses[0]}
              listed={[]}
              before={traitsBefore(hero, 'archetypeBonus')}
              assignments={choice.bonus}
              onChange={(assignments) =>
                update((h) => {
                  h.archetype!.bonus = assignments
                })
              }
            />
          )}

          {ar.principleCategory !== 'fromSecondaryArchetype' && (
            <PrinciplePicker
              category={ar.principleCategory}
              choice={choice.principle}
              onChange={(principle) =>
                update((h) => {
                  if (principle) h.archetype!.principle = principle
                  else delete h.archetype!.principle
                })
              }
            />
          )}
        </>
      )}
    </div>
  )
}
