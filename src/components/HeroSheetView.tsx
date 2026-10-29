/**
 * The hero sheet (docs/design/hero-sheet/spec.md): Roleplaying (who they are, the principles,
 * and a record strip), Mechanics (powers, qualities, status dice and Health), abilities in
 * Green, Yellow, Red and Out bands, then the auxiliary sheet (forms, modes, minion forms,
 * Divided's split). Everything shown comes from buildSheet. Rule issues are shown by the page,
 * as a banner, not here.
 */
import { useId, useState, type MouseEventHandler, type ReactNode } from 'react'
import { DETAIL_FIELDS, heroDisplayName, type Hero } from '../hero/model'
import { ABILITY_TYPE_LABEL as TYPE_LABEL, DETAIL_LABEL, ZONE_LABEL } from '../hero/labels'
import { buildSheet, heroIdentity, type HeroSheet, type SheetPrinciple } from '../creation/sheet'
import type { HeroTrait } from '../creation/traits'
import type { AbilityType, Die, HealthRange, Zone } from '../rules/types'
import { BACK_ISSUES_PER_COLLECTION } from '../creation/advancement'
import type { Action } from '../creation/effects'
import { modeLimits } from '../creation/format'
import { AbilityIcons, AbilityText, ActionIcon, DieIcon } from './icons'

export function Panel({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`sheet-panel ${className}`} aria-label={title}>
      <h3 className="sheet-panel__title">{title}</h3>
      {children}
    </section>
  )
}

export function TraitTable({ caption, traits }: { caption: string; traits: readonly Pick<HeroTrait, 'trait' | 'die' | 'name'>[] }) {
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
            <td className="die">
              <DieIcon die={t.die} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function AbilityRow({ name, type, text, effects }: { name: string; type: AbilityType; text: string; effects: readonly Action[] }) {
  return (
    <li className="ability">
      <span className="ability__type">
        <span className="ability__type-letter" title={TYPE_LABEL[type]}>
          <span aria-hidden="true">{type}</span>
          <span className="visually-hidden">{TYPE_LABEL[type]}</span>
        </span>
        {effects.length > 0 && (
          <span className="ability__effects">
            {effects.map((e) => (
              <ActionIcon key={e} action={e} />
            ))}
          </span>
        )}
      </span>
      <span className="ability__name">{name}</span>
      <span className="ability__text">
        <AbilityText text={text} actions={effects} />
      </span>
    </li>
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
          {sheet.heroicStatusDice && <StatusTiles dice={sheet.heroicStatusDice} label="Heroic form status dice" />}
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

/** One ability: its action icons and name, its type, and its text with icons inline. */
export function SheetAbilityRow({ name, type, text, effects }: { name: string; type?: AbilityType; text: string; effects: readonly Action[] }) {
  return (
    <li className="ability-row">
      <span className="ability-row__name">
        <AbilityIcons actions={effects} />
        <strong>{name}</strong>
      </span>
      <span className="ability-row__type">{type ? TYPE_LABEL[type] : ''}</span>
      <span className="ability-row__text">
        <AbilityText text={text} actions={effects} />
      </span>
    </li>
  )
}

/** A band of abilities: a card whose header strip is the zone's game color (Out's is neutral). */
function Band({ zone, label, note, children }: { zone: Zone | 'out'; label: string; note?: string; children: ReactNode }) {
  return (
    <section className={`sheet-band sheet-band--${zone}`} aria-label={zone === 'out' ? 'Out ability' : `${label} abilities`}>
      <h4 className={`sheet-band__head${zone === 'out' ? '' : ` zone-${zone}`}`}>
        <span>{label.toUpperCase()}</span>
        {note && <span className="sheet-band__note">{note}</span>}
      </h4>
      {children}
    </section>
  )
}

function Abilities({ sheet }: { sheet: HeroSheet }) {
  return (
    <section className="sheet-section" aria-labelledby="sheet-abilities-title">
      <h3 id="sheet-abilities-title" className="visually-hidden">
        Abilities
      </h3>
      {(['green', 'yellow', 'red'] as const).map((zone) => {
        // Principle abilities end the Green band, as on the official sheet.
        const abilities = sheet.abilities.filter((a) => a.zone === zone).sort((a, b) => Number(a.source === 'principle') - Number(b.source === 'principle'))
        return (
          <Band key={zone} zone={zone} label={ZONE_LABEL[zone]}>
            {abilities.length ? (
              <ul className="ability-rows">
                {abilities.map((a, i) => (
                  <SheetAbilityRow key={`${a.source}:${a.baseName}:${i}`} {...a} />
                ))}
              </ul>
            ) : (
              <p className="sheet-band__empty">None yet.</p>
            )}
          </Band>
        )
      })}
      <Band zone="out" label="Out" note="When your Health reaches 0">
        {sheet.outAbility ? (
          <ul className="ability-rows">
            <SheetAbilityRow name="Out ability" text={sheet.outAbility} effects={sheet.outEffects} />
          </ul>
        ) : (
          <p className="sheet-band__empty">Choose a personality.</p>
        )}
      </Band>
    </section>
  )
}

/** A list of powers or qualities: name left, die right. */
function TraitCard({ title, traits, empty }: { title: string; traits: readonly Pick<HeroTrait, 'trait' | 'die' | 'name'>[]; empty: string }) {
  return (
    <section className="card sheet-card" aria-label={title}>
      <h4>{title}</h4>
      {traits.length ? (
        <ul className="trait-rows">
          {traits.map((t) => (
            <li key={`${t.trait.kind}:${t.trait.id}`}>
              <span>{t.name}</span>
              <DieIcon die={t.die} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="sheet-empty">{empty}</p>
      )}
    </section>
  )
}

/** The three status dice as game-colored tiles. */
export function StatusTiles({ dice, label = 'Status dice' }: { dice: Record<Zone, Die>; label?: string }) {
  return (
    <ul className="status-tiles" aria-label={label}>
      {(['green', 'yellow', 'red'] as const).map((zone) => (
        <li key={zone} className={`status-tile zone-${zone}`}>
          <span>{ZONE_LABEL[zone].toUpperCase()}</span>
          <DieIcon die={dice[zone]} />
        </li>
      ))}
    </ul>
  )
}

/** Max Health in large type, and its three ranges as game-colored chips. */
export function HealthBlock({ max, ranges }: { max: number | undefined; ranges: HealthRange | undefined }) {
  if (max === undefined) return <p className="sheet-empty">Not worked out yet.</p>
  return (
    <>
      <p className="max-health">
        <span className="max-health__value">{max}</span> max
      </p>
      {ranges && (
        <ul className="health-range-chips" aria-label="Health ranges">
          {(['green', 'yellow', 'red'] as const).map((zone) => (
            <li key={zone} className={`zone-${zone}`}>
              <span className="visually-hidden">{ZONE_LABEL[zone]} </span>
              {ranges[zone][0]}–{ranges[zone][1]}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Mechanics({ sheet }: { sheet: HeroSheet }) {
  return (
    <section className="sheet-section" aria-labelledby="sheet-mechanics-title">
      <div className="sheet-section__head">
        <h3 id="sheet-mechanics-title">Mechanics</h3>
      </div>
      <div className="sheet-cards sheet-cards--mechanics">
        <TraitCard title="Powers" traits={sheet.powers} empty="No powers yet." />
        <TraitCard title="Qualities" traits={sheet.qualities} empty="No qualities yet." />
        <section className="card sheet-card" aria-label="Status dice and Health">
          <h4>Status dice</h4>
          {sheet.statusDice ? <StatusTiles dice={sheet.statusDice} /> : <p className="sheet-empty">Choose a personality.</p>}
          <h4>Health</h4>
          <HealthBlock max={sheet.maxHealth} ranges={sheet.healthRanges} />
        </section>
      </div>
    </section>
  )
}

/**
 * A principle: its roleplaying text and twists. On a phone the twists wait behind "Show
 * twists", unless the sheet can't be interacted with (an export), when they're always shown.
 */
function PrincipleCard({ principle: p, foldable }: { principle: SheetPrinciple; foldable: boolean }) {
  const [twists, setTwists] = useState(false)
  const twistsId = useId()
  return (
    <section className="card sheet-card principle-card" aria-label={p.name}>
      <h4>{p.name}</h4>
      <p className="label">During roleplaying</p>
      <p>{p.roleplaying}</p>
      {foldable && (
        <button type="button" className="button button--small principle-card__toggle" aria-expanded={twists} aria-controls={twistsId} onClick={() => setTwists(!twists)}>
          {twists ? 'Hide twists' : 'Show twists'}
        </button>
      )}
      <div id={twistsId} className={twists || !foldable ? 'principle-card__twists' : 'principle-card__twists principle-card__twists--folded'}>
        <p className="label">Minor twist</p>
        <p>{p.minorTwist}</p>
        <p className="label">Major twist</p>
        <p>{p.majorTwist}</p>
      </div>
    </section>
  )
}

function Roleplaying({ hero, sheet, advancement, interactive }: { hero: Hero; sheet: HeroSheet; advancement?: AdvancementLink; interactive: boolean }) {
  const c = sheet.characteristics
  // Only the details that are filled in; the name and alias are in the header.
  const details = DETAIL_FIELDS.filter((f) => f !== 'name' && f !== 'alias' && hero.details[f].trim())
  const adv = sheet.advancement
  const collections = adv?.collections ?? []
  return (
    <section className="sheet-section" aria-labelledby="sheet-roleplaying-title">
      <div className="sheet-section__head">
        <h3 id="sheet-roleplaying-title">Roleplaying</h3>
      </div>
      <div className="sheet-cards">
        <section className="card sheet-card" aria-label="Who they are">
          <h4>Who they are</h4>
          <dl className="sheet-dl">
            {(
              [
                ['Background', c.background],
                ['Power source', c.powerSource],
                ['Archetype', c.archetype],
                ['Personality', c.personality],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {details.length > 0 && (
            <dl className="sheet-dl sheet-dl--details">
              {details.map((f) => (
                <div key={f}>
                  <dt>{DETAIL_LABEL[f]}</dt>
                  <dd>{hero.details[f]}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        {sheet.principles.map((p, i) => (
          <PrincipleCard key={`${p.name}:${i}`} principle={p} foldable={interactive} />
        ))}
      </div>
      <p className="record-strip">
        <span>
          Hero points <strong>{hero.play?.heroPoints ?? 0}</strong>
        </span>
        <span>
          Back issues{' '}
          <strong>
            {adv?.backIssues ?? 0} of {BACK_ISSUES_PER_COLLECTION}
          </strong>
        </span>
        <span>
          Collections <strong>{collections.length ? collections.map((col, i) => col.name || `Collection ${i + 1}`).join(', ') : 'none yet'}</strong>
        </span>
        {advancement && (
          <a className="record-strip__link" href={advancement.href} onClick={advancement.onClick}>
            Advancement
          </a>
        )}
      </p>
    </section>
  )
}

/** The hero's name, alias and identity line, for exports (the page's header adds its controls). */
export function HeroSheetTitle({ hero }: { hero: Hero }) {
  const sheet = buildSheet(hero)
  return (
    <header className="character-head">
      <div className="character-head__name">
        <div className="character-head__title">
          <h2>{heroDisplayName(hero)}</h2>
          {hero.details.alias.trim() && hero.details.name.trim() && <span className="character-head__alias">{hero.details.alias}</span>}
        </div>
        <p className="character-head__identity">{heroIdentity(sheet)}</p>
      </div>
    </header>
  )
}

/** The record strip's link to Advancement; the page waits for saves before following it. */
export interface AdvancementLink {
  href: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

interface HeroSheetViewProps {
  hero: Hero
  mode?: 'sheet' | 'play'
  /** Links the record strip to Advancement (left out of exports). */
  advancement?: AdvancementLink
  /** False for an export, which runs no script: nothing folds away behind a button. */
  interactive?: boolean
}

/** The hero's sheet: Roleplaying (left out in Play), Mechanics, Abilities, then forms or modes. */
export function HeroSheetView({ hero, mode = 'sheet', advancement, interactive = true }: HeroSheetViewProps) {
  const sheet = buildSheet(hero)
  return (
    <article className="hero-sheet" aria-label={`${heroDisplayName(hero)} hero sheet`}>
      {mode === 'sheet' && <Roleplaying hero={hero} sheet={sheet} advancement={advancement} interactive={interactive} />}
      <Mechanics sheet={sheet} />
      <Abilities sheet={sheet} />
      <Auxiliary sheet={sheet} />
    </article>
  )
}
