/**
 * Villain wizard steps 1, 5, 6 and 7 (the villain wizard spec, section 3): Concept, Mastery (a
 * plain list of the masteries, only for a major villain), Health (a hero count for the preview,
 * the formula term by term, and the zones), and Finishing touches.
 */
import { useId } from 'react'
import { villainEditPath } from '../../app/route'
import { AbilityText } from '../../components/icons'
import { effectActions } from '../../creation/effects'
import { IssueField, SectionIssues } from '../../editor/inline-issues'
import { ZONE_LABEL } from '../../hero/labels'
import { villainArchetypesById, villainMasteries } from '../../rules/villain-data'
import { DEFAULT_HERO_COUNT, MAX_HEROES, MIN_HEROES, villainDisplayName } from '../model'
import { HERO_COUNT_FIELD, isMajorVillain, MASTERY_FIELD, villainHealth, villainZones, type HealthTerm } from '../sheet'
import type { StepProps } from './choices'
import { Section } from './shared'

/** Step 1: who the villain is and what they want (p. 208). All optional. */
export function ConceptStep({ villain, update }: StepProps) {
  const field = (key: 'name' | 'alias' | 'concept', label: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={villain.details[key]} onChange={(e) => update((v) => void (v.details[key] = e.target.value))} />
    </label>
  )
  return (
    <div className="step-form">
      <Section title="Who they are">
        <div className="field-grid">
          {field('name', 'Name')}
          {field('alias', 'Alias')}
        </div>
        {field('concept', 'What they want')}
        <p className="hint">All optional. You can come back to these at any time.</p>
      </Section>
    </div>
  )
}

/** Step 5: one villainous mastery, for a major villain (p. 238). */
export function MasteryStep({ villain, update }: StepProps) {
  const name = useId()
  const major = isMajorVillain(villain)
  return (
    <div className="step-form">
      {!major && (
        <p className="vw-note">
          A minor villain doesn't take a mastery. <a href={villainEditPath(villain.id, 'upgrades')}>Add an upgrade in step 4</a> to make {villainDisplayName(villain)} a major villain.
        </p>
      )}
      <Section title="Choose a mastery" section="choose">
        <SectionIssues section="choose" />
        <IssueField field={MASTERY_FIELD}>
          {(f) => (
            <div className={f.invalid ? 'vw-masteries field-group--invalid' : 'vw-masteries'} role="radiogroup" aria-label="Villainous mastery" {...f.control}>
              {f.list}
              {villainMasteries.options.map((m) => (
                <label key={m.name} className={villain.mastery?.name === m.name ? 'choice vw-mastery vw-mastery--on' : 'choice vw-mastery'}>
                  <input type="radio" name={name} checked={villain.mastery?.name === m.name} onChange={() => update((v) => void (v.mastery = { source: 'mastery', name: m.name }))} />
                  <span className="choice__body">
                    <span className="choice__title">{m.name}</span>
                    <span className="choice__detail">
                      <AbilityText text={m.text} actions={m.effects && effectActions(m.effects)} />
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </IssueField>
        {villain.mastery && (
          <button type="button" className="button button--small" onClick={() => update((v) => void (v.mastery = null))}>
            Clear the mastery
          </button>
        )}
      </Section>
    </div>
  )
}


const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)
const SOURCE: Record<HealthTerm['kind'], string | undefined> = { base: 'approach base', modifier: 'archetype', heroes: undefined, upgrade: 'upgrade' }

/** One zone range per game color, each labelled. */
function Ranges({ ranges }: { ranges: NonNullable<ReturnType<typeof villainZones>> }) {
  return (
    <ul className="vw-ranges" aria-label="Health zones">
      {(['green', 'yellow', 'red'] as const).map((z) => (
        <li key={z} className={`zone-${z}`}>
          <small>{ZONE_LABEL[z].toUpperCase()}</small>
          {ranges[z][0]}–{ranges[z][1]}
        </li>
      ))}
    </ul>
  )
}

/** Step 6: nothing to choose; a hero count for the preview, the formula, and the zones (p. 239). */
export function HealthStep({ villain, update }: StepProps) {
  const count = villain.heroCount
  const valid = Number.isInteger(count) && count >= MIN_HEROES
  const shown = valid ? count : DEFAULT_HERO_COUNT
  const { total, terms } = villainHealth(villain, shown)
  const zones = total !== undefined ? villainZones(total) : undefined
  const archetype = villain.archetype ? villainArchetypesById.get(villain.archetype.id) : undefined
  const zoneBased = archetype?.status.basis === 'healthZone'
  const set = (n: number) => update((v) => void (v.heroCount = Math.min(MAX_HEROES, Math.max(MIN_HEROES, n))))
  return (
    <div className="step-form">
      <Section title="Heroes it's built for" section="choose">
        <SectionIssues section="choose" />
        <IssueField field={HERO_COUNT_FIELD}>
          {(f) => (
            <div className="vw-well__row">
              <div className="stepper" role="group" aria-label="Heroes it's built for" {...f.control}>
                <button type="button" aria-label="Fewer heroes" disabled={valid && count <= MIN_HEROES} onClick={() => set(shown - 1)}>
                  −
                </button>
                <output aria-live="polite">
                  {valid ? count : '?'}
                </output>
                <button type="button" aria-label="More heroes" disabled={valid && count >= MAX_HEROES} onClick={() => set(valid ? count + 1 : shown)}>
                  +
                </button>
              </div>
              <span className="hint">A starting point for prep. When {villainDisplayName(villain)} is brought into a game, the GM screen uses the number of heroes at that table, and the GM confirms it.</span>
              {f.list}
            </div>
          )}
        </IssueField>
      </Section>

      <Section title="Max Health">
        <table className="vw-sum">
          <tbody>
            {terms.map((t, i) => (
              <tr key={`${t.kind}:${i}`}>
                <td>
                  {t.value === null ? (
                    <span className="placeholder">{t.kind === 'base' ? 'Choose an approach in step 2' : 'Choose an archetype in step 3'}</span>
                  ) : (
                    <>
                      {t.kind === 'base' || t.kind === 'modifier' ? t.label.replace(/ (base|modifier)$/, '') : t.label}
                      {SOURCE[t.kind] && <span className="hint"> {SOURCE[t.kind]}</span>}
                    </>
                  )}
                </td>
                <td>{t.value === null ? '' : t.kind === 'base' ? t.value : signed(t.value)}</td>
              </tr>
            ))}
            <tr className="vw-sum__total">
              <td>Total</td>
              <td>{total ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Health zones">
        {!zones ? (
          <p className="hint">The zones come once the approach and archetype are chosen.</p>
        ) : zoneBased ? (
          <>
            <p className="hint">{archetype!.name}'s status follows its Health zone, so these ranges matter on the table.</p>
            <Ranges ranges={zones} />
          </>
        ) : (
          <>
            <p className="vw-note">{archetype ? `${archetype.name}'s status doesn't follow Health, so the zones are only for reference.` : 'The zones are only for reference.'}</p>
            <details>
              <summary>Show the ranges for {total}</summary>
              <Ranges ranges={zones} />
            </details>
          </>
        )}
      </Section>
    </div>
  )
}

const DETAIL_FIELDS = ['appearance', 'costume', 'mannerisms', 'motivation', 'ties'] as const
const DETAIL_LABEL: Record<(typeof DETAIL_FIELDS)[number], string> = {
  appearance: 'Appearance',
  costume: 'Costume',
  mannerisms: 'Mannerisms',
  motivation: 'Motivation',
  ties: 'Ties to the heroes',
}

/** Step 7: the finishing touches (p. 208), and the GM's notes. */
export function DetailsStep({ villain, update }: StepProps) {
  return (
    <div className="step-form">
      <div className="field-grid">
        {DETAIL_FIELDS.map((field) => (
          <label key={field} className="field field--wide">
            <span>{DETAIL_LABEL[field]}</span>
            <textarea rows={2} value={villain.details[field]} onChange={(e) => update((v) => void (v.details[field] = e.target.value))} />
          </label>
        ))}
        <label className="field field--wide">
          <span>Notes</span>
          <textarea
            rows={3}
            value={villain.notes ?? ''}
            onChange={(e) =>
              update((v) => {
                if (e.target.value) v.notes = e.target.value
                else delete v.notes
              })
            }
          />
        </label>
      </div>
    </div>
  )
}
