/**
 * Villain wizard step 2, Approach (p. 208–219; the villain wizard spec, section 3): choose one of
 * the approaches as cards, put its power and quality dice on any powers and qualities (its own
 * suggestions first), name the d8 roleplaying quality, and choose its abilities, with the
 * approach's constraint shown above them.
 */
import { useId } from 'react'
import { dieRows, assignRow } from '../../creation/assign'
import { ROLEPLAYING_QUALITY, traitField } from '../../creation/traits'
import { AbilityChooser } from '../../editor/AbilityPicker'
import { IssueField, SectionIssues } from '../../editor/inline-issues'
import { DieIcon } from '../../components/icons'
import { DiceRow } from '../../editor/StepSection'
import { expandRefs, getCategory, parseTraitKey, traitKey, traitsOfKind, type CatalogTrait } from '../../rules/catalog'
import type { Die, OptionRef, TraitKind } from '../../rules/types'
import { villainApproaches, villainApproachesById, villainRoleplayingQuality } from '../../rules/villain-data'
import type { VillainApproach } from '../../rules/villain-types'
import type { TraitAssignment } from '../../hero/model'
import { villainDisplayName, type Villain, type VillainAbilityPick } from '../model'
import { villainTraitLabel } from '../sheet'
import { approachHasChoices, chosenCount, setApproach, villainFilling, withPicks, type StepProps } from './choices'
import { OptionCards, Section } from './shared'
import { SuggestBar, SuggestButton } from './SuggestBar'
import { suggestedView } from '../suggest'

const ROLEPLAYING_KEY = traitKey(ROLEPLAYING_QUALITY)

/** Groups traits by category, keeping the list's order. */
function byCategory(traits: readonly CatalogTrait[], kind: TraitKind) {
  const groups = new Map<string, CatalogTrait[]>()
  for (const t of traits) groups.set(t.categoryId, [...(groups.get(t.categoryId) ?? []), t])
  return [...groups].map(([id, list]) => ({ label: `${getCategory(kind, id)?.name ?? id} ${kind === 'power' ? 'powers' : 'qualities'}`, traits: list }))
}

/** One die's row: its icon and a select listing the approach's suggestions first, then every other power or quality. */
function DiceRows({ villain, approach, kind, dice, suggested, onChange }: { villain: Villain; approach: VillainApproach; kind: TraitKind; dice: readonly Die[]; suggested: readonly OptionRef[]; onChange: (a: TraitAssignment[]) => void }) {
  const baseId = useId()
  const assignments = (villain.approach?.traits ?? []).filter((a) => a.trait.kind === kind && traitKey(a.trait) !== ROLEPLAYING_KEY)
  const rows = dieRows(dice, assignments)
  const first = expandRefs(suggested).filter((t) => t.kind === kind && traitKey(t) !== ROLEPLAYING_KEY)
  const firstKeys = new Set(first.map(traitKey))
  const rest = byCategory(
    traitsOfKind(kind).filter((t) => !firstKeys.has(traitKey(t)) && traitKey(t) !== ROLEPLAYING_KEY),
    kind,
  )
  const label = (t: Parameters<typeof villainTraitLabel>[1]) => villainTraitLabel(villain, t)
  const word = kind === 'power' ? 'power' : 'quality'
  return (
    <div className="vw-assign__col">
      <p className="vw-assign__kind">{kind === 'power' ? 'Powers' : 'Qualities'}</p>
      {rows.map((row, i) => {
        const current = row.assignment
        const id = `${baseId}-${i}`
        const same = dice.filter((d) => d === row.die).length > 1 ? ` #${dice.slice(0, i + 1).filter((d) => d === row.die).length}` : ''
        return (
          <IssueField key={i} field={current && traitField(current.trait)}>
            {(f) => (
              <div className="vw-assign__row">
                <label htmlFor={id} className="die">
                  <DieIcon die={row.die} />
                  {/* The space sits outside the span so it's kept in the accessible name: "d8 power #2". */}{' '}
                  <span className="visually-hidden">
                    {word}
                    {same}
                  </span>
                </label>
                <select id={id} {...f.control} value={current ? traitKey(current.trait) : ''} onChange={(e) => onChange(assignRow(dice, assignments, i, e.target.value ? parseTraitKey(e.target.value) : undefined))}>
                  <option value="">Choose…</option>
                  {first.length > 0 && (
                    <optgroup label={`Suggested by ${approach.name}`}>
                      {first.map((t) => (
                        <option key={traitKey(t)} value={traitKey(t)}>
                          {label(t)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {rest.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.traits.map((t) => (
                        <option key={traitKey(t)} value={traitKey(t)}>
                          {label(t)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {f.list}
              </div>
            )}
          </IssueField>
        )
      })}
      <p className="count">
        {rows.filter((r) => r.assignment).length} of {rows.length} {rows.length === 1 ? 'die' : 'dice'} assigned
      </p>
    </div>
  )
}

export function ApproachStep({ villain, update, confirm, suggest }: StepProps) {
  const radioName = useId()
  const nameId = useId()
  const choice = villain.approach
  const approach = choice ? villainApproachesById.get(choice.id) : undefined
  const choose = (id: string) => {
    if (id === choice?.id) return
    const next = villainApproachesById.get(id)
    if (choice && approach && next && approachHasChoices(villain)) {
      confirm({
        title: `Change to ${next.name}?`,
        body: `${villainDisplayName(villain)}'s power and quality dice and ${approach.name} abilities will be cleared.`,
        confirm: `Change to ${next.name}`,
        onConfirm: () => update((v) => setApproach(v, id)),
      })
    } else {
      update((v) => setApproach(v, id))
    }
  }
  const setKind = (kind: TraitKind, assigned: TraitAssignment[]) =>
    update((v) => {
      v.approach!.traits = [...v.approach!.traits.filter((a) => a.trait.kind !== kind), ...assigned]
    })
  const picks = choice?.abilities.filter((p) => p.source === 'approach') ?? []
  return (
    <div className="step-form">
      <Section title="Choose an approach" section="choose" aside={<SuggestButton step="approach" suggest={suggest} all={villainApproaches} picked={choice ? [choice.id] : []} />}>
        <SuggestBar step="approach" suggest={suggest} all={villainApproaches} picked={choice ? [choice.id] : []} />
        <SectionIssues section="choose" />
        <OptionCards
          label="Approach"
          name={radioName}
          selected={choice?.id}
          onSelect={choose}
          options={(suggest.ids('approach') ? suggestedView(villainApproaches, suggest.ids('approach')!, choice ? [choice.id] : []) : villainApproaches.map((item) => ({ item, yours: false }))).map(({ item: a, yours }) => ({
            id: a.id,
            ...(yours ? { flag: 'Your pick' } : {}),
            name: a.name,
            page: a.page,
            body: (
              <dl className="vw-card__facts">
                <dt>Powers</dt>
                <dd>
                  <DiceRow dice={a.powerDice} />
                </dd>
                <dt>Qualities</dt>
                <dd>
                  <DiceRow dice={a.qualityDice} />
                </dd>
                <dt>Health</dt>
                <dd>{a.baseHealth} base</dd>
                <dt>Abilities</dt>
                <dd>
                  Choose {a.abilities.count} of {a.abilities.options.length}
                </dd>
              </dl>
            ),
            ...(a.abilities.constraint ? { tags: <span className="tag">{a.abilities.constraint}</span> } : {}),
          }))}
        />
      </Section>

      {choice && approach && (
        <>
          <Section title="Assign the dice" section="assign" aside={<span className="hint">Any power or quality from the main list (p. 47). {approach.name}'s suggestions come first.</span>}>
            <SectionIssues section="assign" />
            <div className="vw-assign">
              <DiceRows villain={villain} approach={approach} kind="power" dice={approach.powerDice} suggested={approach.suggestedPowers} onChange={(a) => setKind('power', a)} />
              <div>
                <DiceRows villain={villain} approach={approach} kind="quality" dice={approach.qualityDice} suggested={approach.suggestedQualities} onChange={(a) => setKind('quality', a)} />
                <div className="vw-assign__row">
                  <label htmlFor={nameId} className="die">
                    <DieIcon die={villainRoleplayingQuality.die} />{' '}
                    <span className="visually-hidden">roleplaying quality name</span>
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    value={villain.traitNames[ROLEPLAYING_KEY] ?? ''}
                    placeholder="e.g. Petty Tyrant"
                    onChange={(e) =>
                      update((v) => {
                        if (e.target.value) v.traitNames[ROLEPLAYING_KEY] = e.target.value
                        else delete v.traitNames[ROLEPLAYING_KEY]
                      })
                    }
                  />
                </div>
                <p className="hint vw-assign__note">Roleplaying quality, always {villainRoleplayingQuality.die}</p>
              </div>
            </div>
          </Section>

          <Section title="Abilities" aside={<span className="hint">{chosenCount(approach.abilities.count, picks.length)}</span>}>
            {approach.abilities.constraint && (
              <p className="vw-constraint">
                <strong>{approach.name}:</strong> {approach.abilities.constraint}
              </p>
            )}
            <AbilityChooser<VillainAbilityPick>
              filling={villainFilling(villain)}
              legend={`${approach.name} abilities`}
              hideLegend
              options={approach.abilities.options}
              source="approach"
              picks={picks}
              onChange={(next) =>
                update((v) => {
                  v.approach!.abilities = withPicks(v.approach!.abilities, 'approach', next)
                })
              }
            />
          </Section>
        </>
      )}
    </div>
  )
}
