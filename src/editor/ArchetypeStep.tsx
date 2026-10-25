/**
 * Step 3, Archetype (p. 72–98): roll with the dice the power source gave, choose an
 * archetype, put those dice on its required trait, powers, and qualities, take its
 * abilities, bonus, and principle. Training's extra quality is taken here too.
 *
 * Divided and Modular build on a second archetype (see ../creation/layers.ts), chosen with
 * a roll of its own (rulings 45–47) and edited the same way, below their own choices.
 * Modular's modes aren't in the editor yet.
 */
import { useId } from 'react'
import { expandRefs, traitKey } from '../rules/catalog'
import { archetypes, archetypesById, powerSourcesById, principleCategories } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { AbilityChoice, Archetype, IfAlreadyHave } from '../rules/types'
import { describeOptions } from '../components/format'
import type { AbilityPick, AbilitySource, ArchetypeChoice, Hero } from '../hero/model'
import { setStepRoll, stepRoll, takePendingRoll } from '../creation/rolls'
import { canSwapRequired, deriveTraits, fillerLists, traitsBefore } from '../creation/traits'
import { takesSplitForm } from '../creation/divided'
import { AbilityPicker } from './AbilityPicker'
import { BonusPicker } from './BonusPicker'
import { DiceAssigner } from './DiceAssigner'
import { SplitFormEditor, TransitionPicker } from './DividedEditor'
import { FormChangerForms, MinionForms } from './FormsEditor'
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
 * Choices kept from before (from an archetype chosen earlier, or Split Form's division
 * after switching to the other Divided ability) that this archetype has no place for. Going back keeps choices so they can be reused, but these
 * need a way out, since no control below shows them.
 */
function leftovers(ar: Archetype, choice: ArchetypeChoice): string[] {
  const fillsPowers = ar.secondaryArchetype?.minimumPowers !== undefined
  return [
    ar.complex && !fillsPowers && choice.traits.length > 0 && 'powers and qualities',
    !ar.bonuses?.length && choice.bonus.length > 0 && 'a bonus',
    !ar.complex && choice.secondary && 'a second archetype',
    !ar.transitionMethods && choice.divided && "Divided's choices",
    ar.transitionMethods && choice.divided?.split && !takesSplitForm(choice) && "Split Form's division of your powers and qualities",
    !ar.modes && choice.modular && 'modes',
    choice.forms && !ar.forms && 'forms',
    choice.minionForms && !ar.minionForms && 'minion forms',
  ].filter((x): x is string => Boolean(x))
}

/**
 * Clears what leftovers() lists. Changes the draft in place. A second archetype's roll is
 * kept as pending, so removing it doesn't give a fresh roll and reroll (ruling 46).
 */
function clearLeftovers(ar: Archetype, choice: ArchetypeChoice, hero: Hero): void {
  if (ar.complex && ar.secondaryArchetype?.minimumPowers === undefined) choice.traits = []
  if (!ar.bonuses?.length) choice.bonus = []
  if (!ar.complex && choice.secondary) {
    const roll = choice.secondary.roll
    delete choice.secondary
    if (roll && choice === hero.archetype) setStepRoll(hero, 'secondaryArchetype', roll)
  }
  if (ar.transitionMethods && choice.divided?.split && !takesSplitForm(choice)) delete choice.divided.split
  if (!ar.transitionMethods) delete choice.divided
  if (!ar.modes) delete choice.modular
  if (!ar.forms) delete choice.forms
  if (!ar.minionForms) delete choice.minionForms
}

type Update = (change: (draft: Hero) => void) => void

interface DetailsProps {
  hero: Hero
  update: Update
  ar: Archetype
  choice: ArchetypeChoice
  /** Finds this choice in a draft hero: the archetype, or the second one it builds on. */
  at: (h: Hero) => ArchetypeChoice
  /** Modular skips its base archetype's abilities. */
  skipAbilities?: boolean
  /** Divided and Modular take the principle on their own choice. */
  skipPrinciple?: boolean
}

/**
 * One archetype's dice, Training's extra quality, abilities, forms, bonus, and principle: for
 * a plain archetype, or the second archetype Divided and Modular build on.
 */
function ArchetypeDetails({ hero, update, ar, choice, at, skipAbilities = false, skipPrinciple = false }: DetailsProps) {
  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  const dice = ps?.archetypeDice
  const traits = deriveTraits(hero).traits
  const psBonus = ps?.bonuses?.[0]
  const left = leftovers(ar, choice)

  const abilities = (source: AbilitySource) => choice.abilities.filter((p) => p.source === source)
  const picker = abilityPicker(hero, traits, choice, (change) => update((h) => change(at(h))))
  const blocks = skipAbilities ? [] : ABILITY_BLOCKS
  return (
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
              at(h).traits = assigned
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

      {!skipAbilities && (
        <>
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
        </>
      )}
      {skipAbilities && choice.abilities.length > 0 && picker(choice.abilities[0]!.source, `${ar.name} abilities`, [], `Modular skips ${ar.name}'s abilities. Untick them to remove them.`, false, choice.abilities)}
      {ar.forms && (
        <FormChangerForms
          hero={hero}
          ar={ar}
          traits={traits}
          forms={choice.forms ?? []}
          onChange={(forms) =>
            update((h) => {
              at(h).forms = forms
            })
          }
        />
      )}
      {ar.minionForms && (
        <MinionForms
          hero={hero}
          ar={ar}
          traits={traits}
          choice={choice.minionForms}
          onChange={(minionForms) =>
            update((h) => {
              at(h).minionForms = minionForms
            })
          }
        />
      )}

      {/* Picks for a block this archetype doesn't have, so they can be removed. */}
      {blocks
        .filter((b) => !b.has(ar) && abilities(b.source).length > 0)
        .map((b) => (
          <div key={b.source}>{picker(b.source, `${b.name} from another archetype`, [], `${ar.name} doesn't have these. Untick them to remove them.`)}</div>
        ))}
      <Leftovers ar={ar} left={left} onClear={() => update((h) => clearLeftovers(ar, at(h), h))} />

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
              at(h).bonus = assignments
            })
          }
        />
      )}

      {!skipPrinciple && ar.principleCategory !== 'fromSecondaryArchetype' && (
        <PrinciplePicker
          category={ar.principleCategory}
          choice={choice.principle}
          onChange={(principle) =>
            update((h) => {
              if (principle) at(h).principle = principle
              else delete at(h).principle
            })
          }
        />
      )}
    </>
  )
}

function Leftovers({ ar, left, onClear }: { ar: Archetype; left: readonly string[]; onClear: () => void }) {
  if (left.length === 0) return null
  return (
    <div className="leftovers">
      <p className="hint">
        {ar.name} doesn't use these earlier choices: {listAnd(left)}.
      </p>
      <button type="button" className="button" onClick={onClear}>
        Remove them
      </button>
    </div>
  )
}

/**
 * Makes an AbilityPicker for one source of a choice's abilities. `picks` overrides which
 * picks it shows (by default, those from `source`).
 */
function abilityPicker(hero: Hero, traits: ReturnType<typeof deriveTraits>['traits'], choice: ArchetypeChoice, edit: (change: (c: ArchetypeChoice) => void) => void) {
  return (source: AbilitySource, legend: string, options: AbilityChoice['options'], hint?: string, fixed = false, picks?: readonly AbilityPick[]) => {
    const shown = picks ?? choice.abilities.filter((p) => p.source === source)
    return (
      <AbilityPicker
        hero={hero}
        traits={traits}
        legend={legend}
        hint={hint}
        options={options ?? []}
        source={source}
        step="archetype"
        picks={shown}
        onChange={(next) =>
          edit((c) => {
            // The draft is a copy, so picks are matched by source and name, not identity.
            const wasShown = (p: AbilityPick) => shown.some((x) => x.source === p.source && x.name === p.name)
            c.abilities = [...c.abilities.filter((p) => !wasShown(p) && !(picks === undefined && p.source === source)), ...next]
          })
        }
        fixed={fixed}
      />
    )
  }
}

/** Divided and Modular's second archetype: its roll and choice, then its details. */
function SecondArchetype({ hero, update, outer }: { hero: Hero; update: Update; outer: Archetype }) {
  const spec = outer.secondaryArchetype!
  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  const dice = ps?.archetypeDice
  const choice = hero.archetype!.secondary
  const second = choice ? archetypesById.get(choice.id) : undefined
  const table = archetypes.filter((a) => !spec.exclude.includes(a.id))
  const outerRoll = hero.archetype!.roll
  const titleId = useId()
  return (
    <section className="second-archetype" aria-labelledby={titleId}>
      <h4 id={titleId}>{outer.transitionMethods ? 'Second archetype' : 'Base archetype'}</h4>
      {(dice || hero.method === 'constructed' || choice) && (
        <TablePicker
          what={outer.transitionMethods ? 'second archetype' : 'base archetype'}
          method={dice ? hero.method : 'constructed'}
          dice={dice ?? []}
          table={table}
          roll={stepRoll(hero, 'secondaryArchetype')}
          // Modular may take another option from the archetype roll (ruling 47); Divided rolls again (ruling 45).
          inherited={spec.reroll === 'optional' && outerRoll ? { roll: outerRoll, from: 'archetype' } : undefined}
          selectedId={choice?.id}
          onRoll={(r) => update((h) => setStepRoll(h, 'secondaryArchetype', r))}
          onSelect={(entry) =>
            update((h) => {
              const pending = takePendingRoll(h, 'secondaryArchetype')
              const old = h.archetype!.secondary
              const kept = old?.roll ?? pending
              h.archetype!.secondary = { traits: [], abilities: [], bonus: [], ...old, id: entry.id, ...(kept ? { roll: kept } : {}) }
            })
          }
          describe={(entry) => <ArchetypeSummary ar={entry} />}
        />
      )}
      {choice && second && (
        <ArchetypeDetails hero={hero} update={update} ar={second} choice={choice} at={(h) => h.archetype!.secondary!} skipAbilities={spec.skipAbilities} skipPrinciple />
      )}
    </section>
  )
}

/** Modular's d6 filler powers, if its base archetype leaves the hero with fewer than four powers (p. 96). */
function FillerPowers({ hero, update, outer }: { hero: Hero; update: Update; outer: Archetype }) {
  const spec = outer.secondaryArchetype!
  const base = hero.archetype!.secondary ? archetypesById.get(hero.archetype!.secondary.id) : undefined
  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  // Dice of another size were left from another archetype (switching to Modular keeps them).
  const fillers = hero.archetype!.traits.filter((a) => a.die === spec.fillerPowerDie)
  const others = hero.archetype!.traits.length - fillers.length
  const before = traitsBefore(hero, 'deferredBonus')
  const have = before.filter((t) => t.trait.kind === 'power').length
  // Fillers are powers the hero doesn't already have.
  const held = new Set(before.map((t) => traitKey(t.trait)))
  const wanted = Math.max(0, spec.minimumPowers! - have)
  // Extra rows keep fillers that are no longer needed visible, so they can be cleared.
  const rows = Math.max(wanted, fillers.length)
  if (rows === 0 && others === 0) return null
  return (
    <>
      {others > 0 && (
        <div className="leftovers">
          <p className="hint">You have {others === 1 ? 'a power or quality' : `${others} powers and qualities`} from another archetype on {outer.name} itself, which only adds {spec.fillerPowerDie} powers.</p>
          <button
            type="button"
            className="button"
            onClick={() =>
              update((h) => {
                h.archetype!.traits = h.archetype!.traits.filter((a) => a.die === spec.fillerPowerDie)
              })
            }
          >
            Remove them
          </button>
        </div>
      )}
      {rows > 0 && (
        <>
          <p className="hint">
            {wanted
              ? `You have ${have} powers; add ${wanted} ${spec.fillerPowerDie} power${wanted === 1 ? '' : 's'} so you have ${spec.minimumPowers}.`
              : `You have ${have} powers, so you don't need filler powers; clear these.`}
          </p>
          <DiceAssigner
            hero={hero}
            legend="Filler powers"
            dice={Array.from({ length: rows }, () => spec.fillerPowerDie!)}
            assignments={fillers}
            options={expandRefs(fillerLists(base, ps)).filter((t) => t.kind === 'power' && !held.has(traitKey(t)))}
            earlier={[]}
            onChange={(assigned) =>
              update((h) => {
                h.archetype!.traits = [...h.archetype!.traits.filter((a) => a.die !== spec.fillerPowerDie), ...assigned]
              })
            }
          />
        </>
      )}
    </>
  )
}

/** Divided's and Modular's own choices, around the second archetype they build on. */
function ComplexArchetype({ hero, update, ar }: { hero: Hero; update: Update; ar: Archetype }) {
  const choice = hero.archetype!
  const traits = deriveTraits(hero).traits
  const picker = abilityPicker(hero, traits, choice, (change) => update((h) => change(h.archetype!)))
  const second = choice.secondary ? archetypesById.get(choice.secondary.id) : undefined
  // Modular takes its base archetype's principle category; Divided has its own (Responsibility).
  const raw = ar.principleCategory === 'fromSecondaryArchetype' ? second?.principleCategory : ar.principleCategory
  const category = raw === 'fromSecondaryArchetype' ? undefined : raw
  const divided = choice.divided
  const splitForm = takesSplitForm(choice)
  const titleId = useId()
  return (
    <>
      <p className="hint">{ar.summary}</p>
      <SecondArchetype hero={hero} update={update} outer={ar} />
      {ar.secondaryArchetype?.minimumPowers !== undefined && <FillerPowers hero={hero} update={update} outer={ar} />}

      <section className="outer-archetype" aria-labelledby={titleId}>
        <h4 id={titleId}>{ar.name}</h4>
        {ar.transitionMethods && (
          <TransitionPicker
            hero={hero}
            ar={ar}
            traits={traits}
            divided={divided}
            onChange={(next) =>
              update((h) => {
                h.archetype!.divided = next
              })
            }
          />
        )}
        {ar.fixedGreenAbilities && picker('archetype.fixedGreen', 'Green abilities you always have', ar.fixedGreenAbilities, undefined, true)}
        {ar.greenAbilities && picker('archetype.green', `${ar.name} ability: choose ${ar.greenAbilities.count}`, ar.greenAbilities.options, ar.greenAbilities.constraint)}
        {ar.fixedYellowAbilities && picker('archetype.fixedYellow', 'Yellow abilities you always have', ar.fixedYellowAbilities, undefined, true)}
        {ar.fixedRedAbilities && picker('archetype.fixedRed', 'Red abilities you always have', ar.fixedRedAbilities, undefined, true)}
        {splitForm && (
          <SplitFormEditor
            hero={hero}
            traits={traits}
            split={divided?.split}
            onChange={(split) =>
              update((h) => {
                h.archetype!.divided = { ...h.archetype!.divided, split }
              })
            }
          />
        )}
        {ar.modes && <p className="hint">Modular's modes aren't in the editor yet. They're coming in a later update.</p>}
        {ar.personalityNote && <p className="hint">{ar.personalityNote} You choose that in the personality step.</p>}
        {ABILITY_BLOCKS.filter((b) => !b.has(ar) && choice.abilities.some((p) => p.source === b.source)).map((b) => (
          <div key={b.source}>{picker(b.source, `${b.name} from another archetype`, [], `${ar.name} doesn't have these. Untick them to remove them.`)}</div>
        ))}
        <Leftovers ar={ar} left={leftovers(ar, choice)} onClear={() => update((h) => clearLeftovers(ar, h.archetype!, h))} />
        {category ? (
          <PrinciplePicker
            category={category}
            choice={choice.principle}
            onChange={(principle) =>
              update((h) => {
                if (principle) h.archetype!.principle = principle
                else delete h.archetype!.principle
              })
            }
          />
        ) : (
          <p className="hint">Choose the base archetype to see which principle you take.</p>
        )}
      </section>
    </>
  )
}

export function ArchetypeStep({ hero, update }: { hero: Hero; update: Update }) {
  const choice = hero.archetype
  const ar = choice ? archetypesById.get(choice.id) : undefined
  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  const dice = ps?.archetypeDice
  const roll = stepRoll(hero, 'archetype')

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

      {choice && ar?.complex && <ComplexArchetype hero={hero} update={update} ar={ar} />}
      {choice && ar && !ar.complex && <ArchetypeDetails hero={hero} update={update} ar={ar} choice={choice} at={(h) => h.archetype!} />}
    </div>
  )
}
