/**
 * Villain wizard step 3, Archetype (p. 220–234; the villain wizard spec, section 3): choose an
 * archetype as cards, those often paired with the approach first; see how its status die works;
 * read its notes; and choose its abilities, with any it always has shown first.
 */
import { useId } from 'react'
import { AbilityChooser } from '../../editor/AbilityPicker'
import { SectionIssues } from '../../editor/inline-issues'
import { DieIcon } from '../../components/icons'
import { ZONE_LABEL } from '../../hero/labels'
import { villainApproachesById, villainArchetypes, villainArchetypesById } from '../../rules/villain-data'
import type { VillainArchetype, VillainStatusRule } from '../../rules/villain-types'
import { villainDisplayName, type VillainAbilityPick } from '../model'
import { villainMakesMinions } from '../sheet'
import { statusSummary } from '../status'
import { archetypeHasChoices, chosenCount, setArchetype, villainFilling, withPicks, type StepProps } from './choices'
import { OptionCards, Section, type CardOption } from './shared'
import { SuggestBar, SuggestButton } from './SuggestBar'
import { suggestedView } from '../suggest'

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

const range = (min: number, max?: number) => (max === undefined ? `${min}+` : min === max ? `${min}` : `${min}–${max}`)

/** The status die's rule in plain words, drawn by its basis (spec, step 3). */
export function StatusPanel({ rule }: { rule: VillainStatusRule }) {
  return (
    <div className="vw-status">
      {rule.basis === 'count' && (
        <>
          <p>Set by the number of {rule.counts}.</p>
          <ol className="vw-ladder" aria-label="Status die by count">
            {[...rule.tiers]
              .sort((a, b) => a.min - b.min)
              .map((t) => (
                <li key={t.min}>
                  <b>{range(t.min, t.max)}</b> <DieIcon die={t.die} />
                </li>
              ))}
          </ol>
        </>
      )}
      {rule.basis === 'healthZone' && (
        <>
          <p>{statusSummary(rule)}</p>
          {/* Game colors are right here: these are the villain's Health zones. */}
          <ul className="game-chips" aria-label="Status die by Health zone">
            {(['green', 'yellow', 'red'] as const).map((z) => (
              <li key={z} className={`game-chip game-chip--${z}`}>
                <span className="game-chip__label">{ZONE_LABEL[z].toUpperCase()}</span>
                <DieIcon die={rule.zones[z]} size="compact" />
              </li>
            ))}
          </ul>
        </>
      )}
      {rule.basis === 'fixed' && (
        <p>
          Always <DieIcon die={rule.die} size="inline" />. It never changes.
        </p>
      )}
      {rule.basis === 'weakness' && (
        <>
          <p>{statusSummary(rule)}</p>
          <ul className="vw-conditions" aria-label="Status die by weakness">
            {rule.tiers.map((t) => (
              <li key={t.condition}>
                <DieIcon die={t.die} /> <span>{t.condition}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {rule.basis === 'challenge' && (
        <>
          <p>
            Starts at <DieIcon die={rule.startingDie} size="inline" />, and each completed part of its challenge lowers it one size.
          </p>
          <ol className="vw-conditions" aria-label="Challenge parts">
            {rule.challenge.map((c) => (
              <li key={c.text}>
                {c.text} ({c.successes} {c.successes === 1 ? 'success' : 'successes'})
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="hint">On the table, the GM screen works this out from what's in the scene where it can, and the GM can always set it by hand.</p>
    </div>
  )
}

/** The status summary without its leading "Status", for a card's "Status:" line: "Follows its Health zone." */
function cardStatus(rule: VillainStatusRule): string {
  const text = statusSummary(rule).replace(/^Status:?\s+/, '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function card(a: VillainArchetype): CardOption {
  return {
    id: a.id,
    name: a.name,
    page: a.page,
    body: (
      <>
        <span className="vw-card__line">
          <span className="hint">Status:</span> {cardStatus(a.status)}
        </span>
        <span className="vw-card__line">
          <span className="hint">Health:</span> {signed(a.healthModifier)} · <span className="hint">Abilities:</span> choose {a.abilities.count}
        </span>
      </>
    ),
  }
}

export function ArchetypeStep({ villain, update, confirm, suggest }: StepProps) {
  const radioName = useId()
  const choice = villain.archetype
  const archetype = choice ? villainArchetypesById.get(choice.id) : undefined
  const approach = villain.approach ? villainApproachesById.get(villain.approach.id) : undefined
  const choose = (id: string) => {
    if (id === choice?.id) return
    const next = villainArchetypesById.get(id)
    if (archetype && next && archetypeHasChoices(villain)) {
      confirm({
        title: `Change to ${next.name}?`,
        body: `${villainDisplayName(villain)}'s ${archetype.name} abilities will be cleared.`,
        confirm: `Change to ${next.name}`,
        onConfirm: () => update((v) => setArchetype(v, id)),
      })
    } else {
      update((v) => setArchetype(v, id))
    }
  }
  const paired = approach ? villainArchetypes.filter((a) => a.suggestedApproaches.includes(approach.id)) : []
  const others = villainArchetypes.filter((a) => !paired.includes(a))
  const picks = choice?.abilities.filter((p) => p.source === 'archetype') ?? []
  const pairingNote = archetype?.pairingNote && approach && archetype.pairingNote.approaches.includes(approach.id) ? archetype.pairingNote.text : undefined
  const needsMinions = archetype?.needsMinionMaker
  const hasMinionMaker = villainMakesMinions(villain)
  return (
    <div className="step-form">
      <Section title="Choose an archetype" section="choose" aside={<SuggestButton step="archetype" suggest={suggest} all={villainArchetypes} picked={choice ? [choice.id] : []} />}>
        <SuggestBar step="archetype" suggest={suggest} all={villainArchetypes} picked={choice ? [choice.id] : []} />
        <SectionIssues section="choose" />
        {suggest.ids('archetype') ? (
          // Suggestions aren't weighted toward pairings; a pairing only shows as a tag.
          <OptionCards
            label="Archetype"
            name={radioName}
            selected={choice?.id}
            onSelect={choose}
            options={suggestedView(villainArchetypes, suggest.ids('archetype')!, choice ? [choice.id] : []).map(({ item, yours }) => ({
              ...card(item),
              ...(yours ? { flag: 'Your pick' } : {}),
              ...(approach && paired.includes(item) ? { tags: <span className="tag tag--strong">Often paired with {approach.name}</span> } : {}),
            }))}
          />
        ) : approach && paired.length > 0 ? (
          <>
            <p className="vw-group-label">Often paired with {approach.name}</p>
            <OptionCards label={`Archetypes often paired with ${approach.name}`} name={radioName} selected={choice?.id} onSelect={choose} options={paired.map(card)} />
            <p className="vw-group-label">Every other archetype</p>
            <OptionCards label="Other archetypes" name={radioName} selected={choice?.id} onSelect={choose} options={others.map(card)} />
          </>
        ) : (
          <OptionCards label="Archetype" name={radioName} selected={choice?.id} onSelect={choose} options={villainArchetypes.map(card)} />
        )}
      </Section>

      {choice && archetype && (
        <>
          <Section title={`${archetype.name}'s status die`}>
            <StatusPanel rule={archetype.status} />
            {pairingNote && <p className="vw-note">{pairingNote}</p>}
            {needsMinions && (
              <p className={hasMinionMaker ? 'vw-note vw-note--met' : 'vw-note'}>
                {hasMinionMaker ? `Done: ${villainDisplayName(villain)} has a way to make minions.` : needsMinions.note}
              </p>
            )}
          </Section>

          <Section title="Abilities" aside={<span className="hint">{chosenCount(archetype.abilities.count, picks.length)}</span>}>
            {archetype.fixedAbilities && (
              <AbilityChooser<VillainAbilityPick>
                filling={villainFilling(villain)}
                legend="Always included"
                options={archetype.fixedAbilities}
                source="archetype.fixed"
                picks={choice.abilities.filter((p) => p.source === 'archetype.fixed')}
                fixed
                onChange={(next) =>
                  update((v) => {
                    v.archetype!.abilities = withPicks(v.archetype!.abilities, 'archetype.fixed', next)
                  })
                }
              />
            )}
            <AbilityChooser<VillainAbilityPick>
              filling={villainFilling(villain)}
              legend={`${archetype.name} abilities`}
              hideLegend
              options={archetype.abilities.options}
              source="archetype"
              picks={picks}
              onChange={(next) =>
                update((v) => {
                  v.archetype!.abilities = withPicks(v.archetype!.abilities, 'archetype', next)
                })
              }
            />
          </Section>
        </>
      )}
    </div>
  )
}
