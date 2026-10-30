/**
 * The hero sheet in a compact size, for the wizard's preview: characteristics, powers and
 * qualities, status dice, Health and its ranges, and abilities in their Green, Yellow, Red and
 * Out bands, as the Sheet's Mechanics shows them. It updates as choices are
 * made; parts not filled in yet say, in muted italics, which step fills them. View hero's
 * redesign builds on these same pieces.
 */
import { archetypeName } from '../creation/layers'
import { buildSheet, type HeroSheet, type SheetAbility } from '../creation/sheet'
import type { HeroTrait } from '../creation/traits'
import { ABILITY_TYPE_LABEL, ZONE_LABEL } from '../hero/labels'
import { heroDisplayName, type Hero } from '../hero/model'
import type { Die, HealthRange, Zone } from '../rules/types'
import type { Action } from '../creation/effects'
import { AbilityIcons, DieIcon } from './icons'

/** A part not filled in yet, and the step that fills it. */
export function Placeholder({ step }: { step: string }) {
  return <span className="placeholder">{step}</span>
}

/** Background, power source, archetype and personality, each with the step that sets it until it's chosen. */
export function CharacteristicsList({ sheet }: { sheet: HeroSheet }) {
  const c = sheet.characteristics
  const rows: [string, string | undefined, string][] = [
    ['Background', c.background, 'Step 1'],
    ['Power source', c.powerSource, 'Step 2'],
    ['Archetype', c.archetype, 'Step 3'],
    ['Personality', c.personality, 'Step 4'],
  ]
  return (
    <dl className="sheet-kv">
      {rows.map(([label, value, step]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? <Placeholder step={step} />}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A list of powers or qualities, each with its die. */
export function TraitList({ title, traits, empty }: { title: string; traits: readonly Pick<HeroTrait, 'trait' | 'die' | 'name'>[]; empty: string }) {
  return (
    <section className="sheet-traits" aria-label={title}>
      <h4>{title}</h4>
      {traits.length ? (
        <ul>
          {traits.map((t) => (
            <li key={`${t.trait.kind}:${t.trait.id}`}>
              <span>{t.name}</span>
              <DieIcon die={t.die} size="compact" />
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <Placeholder step={empty} />
        </p>
      )}
    </section>
  )
}

/** One zone's abilities, listed by name with their action icons first, under a band in the zone's color. */
export function AbilityBandCompact({ zone, abilities, empty }: { zone: Zone; abilities: readonly SheetAbility[]; empty: string }) {
  return (
    <section className={`band band--${zone}`} aria-label={`${ZONE_LABEL[zone]} abilities`}>
      <h4 className="band__head">{ZONE_LABEL[zone]}</h4>
      {abilities.length ? (
        <ul>
          {abilities.map((a, i) => (
            <li key={`${a.source}:${a.baseName}:${i}`} className="band__row">
              <span>
                <AbilityIcons actions={a.effects} />
                {a.name}
              </span>
              <span className="band__type">{ABILITY_TYPE_LABEL[a.type]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="band__row">
          <Placeholder step={empty} />
        </p>
      )}
    </section>
  )
}

/** The Out ability (it has no name, so its text), under a neutral band. */
export function OutBandCompact({ text, effects }: { text: string | undefined; effects: readonly Action[] }) {
  return (
    <section className="band band--out" aria-label="Out ability">
      <h4 className="band__head">Out</h4>
      <p className="band__row">
        {text ? (
          <span className="band__out">
            <AbilityIcons actions={effects} />
            <span>{text}</span>
          </span>
        ) : (
          <Placeholder step="Step 4" />
        )}
      </p>
    </section>
  )
}

/** Status dice in their zones' game colors, each labelled, with its die. */
export function StatusDiceRow({ dice, label = 'Status dice' }: { dice: Record<Zone, Die>; label?: string }) {
  return (
    <ul className="game-chips" aria-label={label}>
      {(['green', 'yellow', 'red'] as const).map((zone) => (
        <li key={zone} className={`game-chip game-chip--${zone}`}>
          <span className="game-chip__label">{ZONE_LABEL[zone]}</span>
          <DieIcon die={dice[zone]} size="compact" />
        </li>
      ))}
    </ul>
  )
}

/** Max Health and its three ranges, as chips in the zones' game colors. */
export function HealthChips({ max, ranges }: { max: number; ranges: HealthRange | undefined }) {
  return (
    <p className="health-chips">
      <span>
        Max <strong>{max}</strong>
      </span>
      {ranges && (
        <span className="game-chips" role="list" aria-label="Health ranges">
          {(['green', 'yellow', 'red'] as const).map((zone) => (
            <span key={zone} role="listitem" className={`game-chip game-chip--${zone}`}>
              <span className="visually-hidden">{ZONE_LABEL[zone]} </span>
              {ranges[zone][0]}–{ranges[zone][1]}
            </span>
          ))}
        </span>
      )}
    </p>
  )
}

/** The three status dice as game-colored tiles. */
export function StatusTiles({ dice, label = 'Status dice', size = 'normal' }: { dice: Record<Zone, Die>; label?: string; size?: 'normal' | 'compact' }) {
  return (
    <ul className="status-tiles" aria-label={label}>
      {(['green', 'yellow', 'red'] as const).map((zone) => (
        <li key={zone} className={`status-tile zone-${zone}`}>
          <span>{ZONE_LABEL[zone].toUpperCase()}</span>
          <DieIcon die={dice[zone]} size={size} />
        </li>
      ))}
    </ul>
  )
}

/** On paper, a line to write current Health on. */
export function CurrentHealthLine() {
  return (
    <p className="print-only current-health" aria-hidden="true">
      Current Health <span className="write-in" />
    </p>
  )
}

/** Max Health in large type (with a line on how it was built, for a villain), and its three ranges as game-colored chips. */
export function HealthBlock({ max, ranges, note }: { max: number | undefined; ranges: HealthRange | undefined; note?: string }) {
  if (max === undefined) return <p className="sheet-empty">Not worked out yet.</p>
  return (
    <>
      <p className="max-health">
        <span className="max-health__value">{max}</span> max
      </p>
      {note && <p className="sheet-card__note">{note}</p>}
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

/** Where each zone's abilities come from, for an empty band. */
const BAND_EMPTY: Record<Zone, string> = { green: 'From steps 2 and 3', yellow: 'From steps 2 and 3', red: 'Chosen in step 5' }

export function SheetPreview({ hero }: { hero: Hero }) {
  const sheet = buildSheet(hero)
  const named = hero.details.name.trim() || hero.details.alias.trim()
  const archetype = archetypeName(hero)
  return (
    <article className="sheet-preview" aria-label={`${heroDisplayName(hero)} sheet`}>
      <header>
        <h4 className={named ? 'sheet-preview__name' : 'sheet-preview__name placeholder'}>{heroDisplayName(hero)}</h4>
        {archetype && <p className="sheet-preview__sub">{archetype}</p>}
      </header>
      <CharacteristicsList sheet={sheet} />
      <div className="sheet-preview__traits">
        <TraitList title="Powers" traits={sheet.powers} empty="Steps 2 and 3" />
        <TraitList title="Qualities" traits={sheet.qualities} empty="Steps 1, 3 and 4" />
      </div>
      <div className="sheet-preview__part" data-part="status">
        <h4>Status dice</h4>
        {sheet.statusDice ? (
          <>
            {/* A Divided hero with a second personality has a set for each form. */}
            {sheet.heroicStatusDice && <p className="sheet-preview__form">Civilian form</p>}
            <StatusTiles dice={sheet.statusDice} label={sheet.heroicStatusDice ? 'Civilian form status dice' : 'Status dice'} size="compact" />
            {sheet.heroicStatusDice && (
              <>
                <p className="sheet-preview__form">Heroic form</p>
                <StatusTiles dice={sheet.heroicStatusDice} label="Heroic form status dice" size="compact" />
              </>
            )}
          </>
        ) : (
          <p>
            <Placeholder step="Step 4" />
          </p>
        )}
      </div>
      <div className="sheet-preview__part" data-part="health">
        <h4>Health</h4>
        {sheet.maxHealth !== undefined ? (
          <HealthBlock max={sheet.maxHealth} ranges={sheet.healthRanges} />
        ) : (
          <p>
            <Placeholder step="Step 7" />
          </p>
        )}
      </div>
      <section className="sheet-preview__abilities" aria-label="Abilities">
        <h4>Abilities</h4>
        {(['green', 'yellow', 'red'] as const).map((zone) => (
          <AbilityBandCompact key={zone} zone={zone} abilities={sheet.abilities.filter((a) => a.zone === zone)} empty={BAND_EMPTY[zone]} />
        ))}
        <OutBandCompact text={sheet.outAbility} effects={sheet.outEffects} />
      </section>
    </article>
  )
}
