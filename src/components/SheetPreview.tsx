/**
 * The hero sheet in a compact size, for the wizard's preview: characteristics, powers and
 * qualities, and abilities in their Green, Yellow and Red bands. It updates as choices are
 * made; parts not filled in yet say, in muted italics, which step fills them. View hero's
 * redesign builds on these same pieces.
 */
import { archetypeName } from '../creation/layers'
import { buildSheet, type HeroSheet, type SheetAbility } from '../creation/sheet'
import type { HeroTrait } from '../creation/traits'
import { ABILITY_TYPE_LABEL, ZONE_LABEL } from '../hero/labels'
import { heroDisplayName, type Hero } from '../hero/model'
import type { Die, HealthRange, Zone } from '../rules/types'
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
      <section className="sheet-preview__abilities" aria-label="Abilities">
        <h4>Abilities</h4>
        {(['green', 'yellow', 'red'] as const).map((zone) => (
          <AbilityBandCompact key={zone} zone={zone} abilities={sheet.abilities.filter((a) => a.zone === zone)} empty={BAND_EMPTY[zone]} />
        ))}
      </section>
      {sheet.maxHealth !== undefined && (
        <p className="sheet-preview__health">
          Max Health <strong>{sheet.maxHealth}</strong>
        </p>
      )}
    </article>
  )
}
