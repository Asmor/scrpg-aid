/** A villain's sheet (Phase 5): details, dice, Health, status, and abilities, from ./sheet.ts. */
import { DiceText } from '../components/icons'
import { AbilityRow, Panel, TraitTable } from '../components/HeroSheetView'
import type { Villain } from './model'
import { buildVillainSheet, type VillainSheet, type VillainSheetAbility, type VillainStepId } from './sheet'
import { StatusRuleText } from './StatusRule'

const STEP_LABEL: Record<VillainStepId, string> = { approach: 'Approach', archetype: 'Archetype', upgrades: 'Upgrades', health: 'Health', details: 'Details' }

function Abilities({ abilities }: { abilities: readonly VillainSheetAbility[] }) {
  if (!abilities.length) return <p className="sheet-empty">None yet.</p>
  return (
    <ul className="ability-list">
      {abilities.map((a, i) => (
        <AbilityRow key={`${a.source}:${a.baseName}:${i}`} name={a.upgrade ? `${a.name} (${a.upgrade})` : a.name} type={a.type} text={a.text} effects={[]} />
      ))}
    </ul>
  )
}

function Warnings({ warnings }: { warnings: VillainSheet['warnings'] }) {
  if (!warnings.length) return null
  const steps = [...new Set(warnings.map((w) => w.step))]
  return (
    <details className="sheet-warnings">
      <summary>
        {warnings.length} rule {warnings.length === 1 ? 'issue' : 'issues'} to look at
      </summary>
      {steps.map((step) => (
        <section key={step} aria-label={STEP_LABEL[step]}>
          <h3>{STEP_LABEL[step]}</h3>
          <ul>
            {warnings
              .filter((w) => w.step === step)
              .map((w, i) => (
                <li key={`${w.code}:${i}`}>
                  <DiceText text={w.message} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </details>
  )
}

export function VillainSheetView({ villain }: { villain: Villain }) {
  const sheet = buildVillainSheet(villain)
  const { details } = villain
  return (
    <article className="hero-sheet" aria-label={`${sheet.name} villain sheet`}>
      <header className="hero-sheet__header">
        <h2>{sheet.name}</h2>
        {sheet.alias && sheet.alias !== sheet.name && <p className="hero-sheet__alias">{sheet.alias}</p>}
      </header>
      <Warnings warnings={sheet.warnings} />
      <div className="sheet-grid">
        <Panel title="Characteristics">
          <dl className="fields">
            <dt>Approach</dt>
            <dd>{sheet.approach ?? '—'}</dd>
            <dt>Archetype</dt>
            <dd>{sheet.archetype ?? '—'}</dd>
            <dt>Kind</dt>
            <dd>{sheet.major ? 'Major villain' : 'Minor villain'}</dd>
            {details.concept && (
              <>
                <dt>Concept</dt>
                <dd>{details.concept}</dd>
              </>
            )}
            {details.motivation && (
              <>
                <dt>Motivation</dt>
                <dd>{details.motivation}</dd>
              </>
            )}
          </dl>
        </Panel>
        <Panel title="Health">
          {sheet.health ? (
            <>
              <p className="play-health">
                <strong>{sheet.health.max}</strong> max Health
              </p>
              <p className="hint">
                Built for {sheet.health.heroCount} {sheet.health.heroCount === 1 ? 'hero' : 'heroes'} ({sheet.health.perHero} Health each).
              </p>
              {sheet.health.ranges && (
                <ul className="status-dice">
                  {(['green', 'yellow', 'red'] as const).map((zone) => (
                    <li key={zone} className={`status-die zone-${zone}`}>
                      <span className="status-die__zone">{zone[0]!.toUpperCase() + zone.slice(1)}</span>
                      <span>{sheet.health!.ranges![zone].join('–')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="sheet-empty">Not worked out yet.</p>
          )}
          {sheet.status && <StatusRuleText rule={sheet.status} />}
        </Panel>
        <Panel title="Powers" className="sheet-dice">
          <TraitTable caption="Powers" traits={sheet.powers} />
        </Panel>
        <Panel title="Qualities" className="sheet-dice">
          <TraitTable caption="Qualities" traits={sheet.qualities} />
        </Panel>
      </div>
      <Panel title="Abilities" className="sheet-abilities">
        <Abilities abilities={sheet.abilities} />
      </Panel>
      {(sheet.upgrades.length > 0 || sheet.mastery) && (
        <Panel title="Upgrades and mastery">
          {sheet.upgrades.length > 0 && (
            <ul>
              {sheet.upgrades.map((u) => (
                <li key={u.name}>
                  <strong>{u.name}.</strong> {u.summary}
                </li>
              ))}
            </ul>
          )}
          {sheet.vehicle && (
            <>
              <h4>
                Vehicle <DiceText text={sheet.vehicle.die ?? ''} />
              </h4>
              <Abilities abilities={sheet.vehicle.abilities} />
            </>
          )}
          {sheet.mastery && <Abilities abilities={[sheet.mastery]} />}
        </Panel>
      )}
      {(details.appearance || details.costume || details.mannerisms || details.ties || villain.notes) && (
        <Panel title="Details">
          <dl className="fields">
            {(
              [
                ['Appearance', details.appearance],
                ['Costume', details.costume],
                ['Mannerisms', details.mannerisms],
                ['Ties to the heroes', details.ties],
                ['Notes', villain.notes ?? ''],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="fields__row">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
        </Panel>
      )}
    </article>
  )
}
