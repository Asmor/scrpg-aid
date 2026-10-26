/**
 * The on-screen hero sheet, laid out after the official blank hero sheet: details and
 * characteristics, powers and qualities, status dice and Health, principles, abilities in
 * Green/Yellow/Red bands with the Out ability last, then the auxiliary sheet (forms, modes,
 * minion forms, Divided's split). Everything shown comes from buildSheet; rule problems are
 * listed, never blocking (the user's "warn only" decision).
 */
import type { ReactNode } from 'react'
import { DETAIL_FIELDS, heroDisplayName, type Hero } from '../hero/model'
import { ABILITY_TYPE_LABEL as TYPE_LABEL, DETAIL_LABEL, ZONE_LABEL } from '../hero/labels'
import { buildSheet, type HeroSheet, type SheetAbility } from '../creation/sheet'
import type { HeroTrait } from '../creation/traits'
import type { StepId } from '../creation/warnings'
import type { AbilityType, Die, Zone } from '../rules/types'
import { modeLimits } from '../creation/format'

const STEP_LABEL: Record<StepId, string> = {
  background: 'Background',
  powerSource: 'Power source',
  archetype: 'Archetype',
  personality: 'Personality',
  redAbilities: 'Red abilities',
  retcon: 'Retcon',
  health: 'Health',
  principles: 'Principles',
  advancement: 'Advancement',
}

function Panel({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`sheet-panel ${className}`} aria-label={title}>
      <h3 className="sheet-panel__title">{title}</h3>
      {children}
    </section>
  )
}

function TraitTable({ caption, traits }: { caption: string; traits: readonly HeroTrait[] }) {
  if (traits.length === 0) return <p className="sheet-empty">No {caption.toLowerCase()} yet.</p>
  return (
    <table className="trait-table">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Die</th>
        </tr>
      </thead>
      <tbody>
        {traits.map((t) => (
          <tr key={`${t.trait.kind}:${t.trait.id}`}>
            <td>{t.name}</td>
            <td className="die">{t.die}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatusDice({ dice, label }: { dice: Record<Zone, Die>; label?: string }) {
  return (
    <div className="status-dice">
      {label && <p className="status-dice__label">{label}</p>}
      <ul className="status-dice__list">
        {(['green', 'yellow', 'red'] as const).map((zone) => (
          <li key={zone} className={`status-die zone-${zone}`}>
            <span className="status-die__zone">{ZONE_LABEL[zone]}</span>
            <span className="die">{dice[zone]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AbilityRow({ name, type, text }: { name: string; type: AbilityType; text: string }) {
  return (
    <li className="ability">
      <span className="ability__type" title={TYPE_LABEL[type]}>
        <span aria-hidden="true">{type}</span>
        <span className="visually-hidden">{TYPE_LABEL[type]}</span>
      </span>
      <span className="ability__name">{name}</span>
      <span className="ability__text">{text}</span>
    </li>
  )
}

function AbilityBand({ zone, abilities }: { zone: Zone; abilities: readonly SheetAbility[] }) {
  // Principle abilities end the Green band, as on the printed sheet.
  const sorted = [...abilities].sort((a, b) => Number(a.source === 'principle') - Number(b.source === 'principle'))
  return (
    <section className={`ability-band zone-${zone}`} aria-label={`${ZONE_LABEL[zone]} abilities`}>
      <h4 className="ability-band__title">{ZONE_LABEL[zone]}</h4>
      {sorted.length ? (
        <ul className="ability-list">
          {sorted.map((a, i) => (
            <AbilityRow key={`${a.source}:${a.baseName}:${i}`} name={a.name} type={a.type} text={a.text} />
          ))}
        </ul>
      ) : (
        <p className="sheet-empty">None yet.</p>
      )}
    </section>
  )
}

function Warnings({ warnings }: { warnings: HeroSheet['warnings'] }) {
  if (warnings.length === 0) return null
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
                <li key={`${w.code}:${i}`}>{w.message}</li>
              ))}
          </ul>
        </section>
      ))}
    </details>
  )
}

function Auxiliary({ sheet }: { sheet: HeroSheet }) {
  const { forms, modes, powerlessMode, minionForms, divided } = sheet
  if (!forms.length && !modes.length && !powerlessMode && !minionForms.length && !divided) return null
  return (
    <Panel title="Auxiliary sheet" className="sheet-auxiliary">
      {divided && (
        <div className="aux-group">
          <h4>Divided</h4>
          {divided.heroicPersonality && <p>Heroic form personality: {divided.heroicPersonality}</p>}
          {sheet.heroicStatusDice && <StatusDice dice={sheet.heroicStatusDice} label="Heroic form status dice" />}
          {divided.heroicTraits && (
            <>
              <p>Heroic form powers and qualities:</p>
              <TraitTable caption="Heroic form traits" traits={divided.heroicTraits} />
            </>
          )}
          {divided.split && (
            <dl className="split">
              <dt>Always</dt>
              <dd>{divided.split.always.join(', ') || '—'}</dd>
              <dt>Civilian form</dt>
              <dd>{divided.split.civilian.join(', ') || '—'}</dd>
              <dt>Heroic form</dt>
              <dd>{divided.split.heroic.join(', ') || '—'}</dd>
            </dl>
          )}
        </div>
      )}
      {forms.map((form, i) => (
        <div key={`form-${i}`} className={`aux-group zone-${form.zone}`}>
          <h4>
            {form.name} <span className="aux-zone">({ZONE_LABEL[form.zone]} form)</span>
          </h4>
          <TraitTable caption={`${form.name} traits`} traits={form.traits} />
          {form.ability && (
            <ul className="ability-list">
              <AbilityRow {...form.ability} />
            </ul>
          )}
        </div>
      ))}
      {modes.map((mode, i) => (
        <div key={`mode-${i}`} className={`aux-group zone-${mode.zone}`}>
          <h4>
            {mode.name} <span className="aux-zone">({ZONE_LABEL[mode.zone]} mode)</span>
          </h4>
          <TraitTable caption={`${mode.name} traits`} traits={mode.traits} />
          {(mode.cannot.length > 0 || mode.immobile) && <p className="mode-limits">{modeLimits(mode.cannot, mode.immobile)}</p>}
          {mode.ability && (
            <ul className="ability-list">
              <AbilityRow {...mode.ability} />
            </ul>
          )}
        </div>
      ))}
      {powerlessMode && (
        <div className="aux-group">
          <h4>Powerless mode</h4>
          <TraitTable caption="Powerless mode traits" traits={powerlessMode} />
        </div>
      )}
      {minionForms.length > 0 && (
        <div className="aux-group">
          <h4>Minion forms</h4>
          <ul className="minion-forms">
            {minionForms.map((f) => (
              <li key={f.name}>
                <strong>
                  {f.name} (+{f.minBonus})
                </strong>{' '}
                {f.effect}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

export function HeroSheetView({ hero }: { hero: Hero }) {
  const sheet = buildSheet(hero)
  const { characteristics: c } = sheet
  const details = DETAIL_FIELDS.filter((f) => f !== 'name' && f !== 'alias' && hero.details[f].trim())
  return (
    <article className="hero-sheet" aria-label={`${heroDisplayName(hero)} hero sheet`}>
      <header className="hero-sheet__header">
        <h2>{heroDisplayName(hero)}</h2>
        {hero.details.alias.trim() && hero.details.name.trim() && <p className="hero-sheet__alias">{hero.details.alias}</p>}
      </header>

      <Warnings warnings={sheet.warnings} />

      <div className="sheet-grid">
        <Panel title="Characteristics">
          <dl className="fields">
            <dt>Background</dt>
            <dd>{c.background ?? '—'}</dd>
            <dt>Power source</dt>
            <dd>{c.powerSource ?? '—'}</dd>
            <dt>Archetype</dt>
            <dd>{c.archetype ?? '—'}</dd>
            <dt>Personality</dt>
            <dd>{c.personality ?? '—'}</dd>
          </dl>
        </Panel>

        {details.length > 0 && (
          <Panel title="Details">
            <dl className="fields">
              {details.map((f) => (
                <div key={f} className="fields__row">
                  <dt>{DETAIL_LABEL[f]}</dt>
                  <dd>{hero.details[f]}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}

        <Panel title="Powers">
          <TraitTable caption="Powers" traits={sheet.powers} />
        </Panel>
        <Panel title="Qualities">
          <TraitTable caption="Qualities" traits={sheet.qualities} />
        </Panel>

        <Panel title="Status dice">
          {sheet.statusDice ? <StatusDice dice={sheet.statusDice} /> : <p className="sheet-empty">Choose a personality.</p>}
        </Panel>
        <Panel title="Health">
          {sheet.maxHealth !== undefined ? (
            <>
              <p className="max-health">
                Max Health <strong>{sheet.maxHealth}</strong>
              </p>
              {sheet.healthRanges && (
                <ul className="health-ranges">
                  {(['green', 'yellow', 'red'] as const).map((zone) => (
                    <li key={zone} className={`zone-${zone}`}>
                      <span>{ZONE_LABEL[zone]}</span> {sheet.healthRanges![zone][0]}–{sheet.healthRanges![zone][1]}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="sheet-empty">Not worked out yet.</p>
          )}
        </Panel>
      </div>

      <Panel title="Principles" className="sheet-principles">
        {sheet.principles.length ? (
          <div className="principles">
            {sheet.principles.map((p, i) => (
              <div key={`${p.name}:${i}`} className="principle">
                <h4>{p.name}</h4>
                <dl className="fields">
                  <dt>During roleplaying</dt>
                  <dd>{p.roleplaying}</dd>
                  <dt>Minor twist</dt>
                  <dd>{p.minorTwist}</dd>
                  <dt>Major twist</dt>
                  <dd>{p.majorTwist}</dd>
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="sheet-empty">No principles yet.</p>
        )}
      </Panel>

      <Panel title="Abilities" className="sheet-abilities">
        {(['green', 'yellow', 'red'] as const).map((zone) => (
          <AbilityBand key={zone} zone={zone} abilities={sheet.abilities.filter((a) => a.zone === zone)} />
        ))}
        <section className="ability-band zone-out" aria-label="Out ability">
          <h4 className="ability-band__title">Out</h4>
          <p className="ability__text">{sheet.outAbility ?? 'Choose a personality.'}</p>
        </section>
      </Panel>

      <Auxiliary sheet={sheet} />

      {sheet.advancement && (sheet.advancement.collections.length > 0 || sheet.advancement.changes.length > 0 || sheet.advancement.backIssues > 0) && (
        <Panel title="Advancement" className="sheet-advancement">
          <p>Back issues: {sheet.advancement.backIssues}</p>
          {sheet.advancement.collections.length > 0 && (
            <ol className="sheet-collections">
              {sheet.advancement.collections.map((c, i) => (
                <li key={i}>
                  <strong>{c.name || `Collection ${i + 1}`}</strong>
                  {c.notes && <p>{c.notes}</p>}
                </li>
              ))}
            </ol>
          )}
          {sheet.advancement.changes.length > 0 && (
            <ul className="sheet-changes">
              {sheet.advancement.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </article>
  )
}
