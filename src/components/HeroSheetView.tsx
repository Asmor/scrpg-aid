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
import type { AbilityType, Zone } from '../rules/types'
import { BACK_ISSUES_PER_COLLECTION } from '../creation/advancement'
import type { Action } from '../creation/effects'
import { FormsSection } from './FormsSection'
import { AbilityIcons, AbilityText, DieIcon } from './icons'
import { CurrentHealthLine, HealthBlock, StatusTiles } from './SheetPreview'

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
    <section className="sheet-section sheet-section--abilities" aria-labelledby="sheet-abilities-title">
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
          <CurrentHealthLine />
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
          {/* Play state lives in games, not on the sheet: on screen, say where to find it. */}
          Hero points <span className="screen-only muted">tracked in Play</span>
          {/* On paper, a line to keep count on. */}
          <span className="print-only write-in" aria-hidden="true" />
        </span>
        <span>
          Back issues{' '}
          <strong>
            {adv?.backIssues ?? 0} of {BACK_ISSUES_PER_COLLECTION}
          </strong>
        </span>
        <span>
          Collections <strong>{collections.length}</strong>
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
      <FormsSection hero={hero} sheet={sheet} />
    </article>
  )
}
