/**
 * A villain's sheet (docs/design/hero-sheet/spec.md, "Villain sheet"), built from ./sheet.ts
 * with the hero sheet's components: About (left out in Play), Mechanics (powers and qualities,
 * the status rule as a table, Health and how it was built), then abilities grouped by where
 * they came from: the approach, the archetype, each upgrade that grants one, and the mastery.
 * Villain abilities aren't zoned, so no game colors appear on them. Rule issues are shown by
 * the page, as a banner.
 */
import type { ReactNode } from 'react'
import { DieIcon } from '../components/icons'
import { SheetAbilityRow } from '../components/HeroSheetView'
import { CurrentHealthLine, HealthBlock } from '../components/SheetPreview'
import type { Villain } from './model'
import { buildVillainSheet, healthBreakdown, villainIdentity, type VillainSheet, type VillainSheetAbility, type VillainTrait } from './sheet'
import { statusRows, statusSummary } from './status'

function TraitRows({ traits, empty }: { traits: readonly VillainTrait[]; empty: string }) {
  if (!traits.length) return <p className="sheet-empty">{empty}</p>
  return (
    <ul className="trait-rows">
      {traits.map((t) => (
        <li key={`${t.trait.kind}:${t.trait.id}`}>
          <span>{t.name}</span>
          <DieIcon die={t.die} />
        </li>
      ))}
    </ul>
  )
}

function About({ villain, sheet }: { villain: Villain; sheet: VillainSheet }) {
  const d = villain.details
  // Only what's filled in.
  const more = (
    [
      ['Appearance', d.appearance],
      ['Costume', d.costume],
      ['Mannerisms', d.mannerisms],
      ['Motivation', d.motivation],
      ['Ties to the heroes', d.ties],
      ['Notes', villain.notes ?? ''],
    ] as const
  ).filter(([, v]) => v.trim())
  return (
    <section className="sheet-section" aria-labelledby="sheet-about-title">
      <div className="sheet-section__head">
        <h3 id="sheet-about-title">About</h3>
      </div>
      <div className="sheet-cards sheet-cards--about">
        <section className="card sheet-card" aria-label="Concept">
          <h4>Concept</h4>
          <p className="villain-concept">{d.concept.trim() || <span className="sheet-empty">No concept yet.</span>}</p>
          {more.length > 0 && (
            <dl className="sheet-dl sheet-dl--details">
              {more.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <section className="card sheet-card" aria-label="Build">
          <dl className="sheet-dl">
            {(
              [
                ['Kind', sheet.major ? 'Major villain' : 'Minor villain'],
                ['Approach', sheet.approach],
                ['Archetype', sheet.archetype],
                ['Upgrades', sheet.upgrades.map((u) => u.name).join(', ') || undefined],
                ['Mastery', sheet.mastery?.name],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  )
}

function Mechanics({ sheet }: { sheet: VillainSheet }) {
  const breakdown = healthBreakdown(sheet)
  return (
    <section className="sheet-section" aria-labelledby="sheet-mechanics-title">
      <div className="sheet-section__head">
        <h3 id="sheet-mechanics-title">Mechanics</h3>
      </div>
      <div className="sheet-cards">
        <section className="card sheet-card" aria-label="Powers and qualities">
          <h4>Powers</h4>
          <TraitRows traits={sheet.powers} empty="No powers yet." />
          <h4>Qualities</h4>
          <TraitRows traits={sheet.qualities} empty="No qualities yet." />
        </section>
        <section className="card sheet-card" aria-label="Status die">
          <h4>Status die</h4>
          {sheet.status ? (
            <>
              <p className="sheet-card__note">{statusSummary(sheet.status)}</p>
              <ul className="trait-rows">
                {statusRows(sheet.status).map((r, i) => (
                  <li key={`${i}:${r.when}`}>
                    <span>{r.when}</span>
                    {r.die && <DieIcon die={r.die} />}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="sheet-empty">Choose an archetype.</p>
          )}
        </section>
        <section className="card sheet-card" aria-label="Health">
          <h4>Health</h4>
          <HealthBlock max={sheet.health?.max} ranges={sheet.health?.ranges} note={breakdown} />
          <CurrentHealthLine />
        </section>
      </div>
    </section>
  )
}

/** A group of abilities: a neutral header with where they came from (and what an upgrade does), then the rows. */
function Group({ title, note, summary, children }: { title: string; note: string; summary?: string; children: ReactNode }) {
  return (
    <section className="sheet-band sheet-band--group" aria-label={`${title} abilities`}>
      <h4 className="sheet-band__head">
        <span>{title}</span>
        <span className="sheet-band__note">{note}</span>
      </h4>
      {summary && <p className="sheet-band__summary">{summary}</p>}
      {children}
    </section>
  )
}

const rows = (abilities: readonly VillainSheetAbility[]) => (
  <ul className="ability-rows">
    {abilities.map((a, i) => (
      <SheetAbilityRow key={`${a.source}:${a.baseName}:${i}`} name={a.name} type={a.type} text={a.text} effects={a.effects} />
    ))}
  </ul>
)

function Abilities({ sheet }: { sheet: VillainSheet }) {
  const from = (...sources: VillainSheetAbility['source'][]) => sheet.abilities.filter((a) => sources.includes(a.source))
  const approach = from('approach')
  const archetype = from('archetype', 'archetype.fixed')
  // Each upgrade that grants abilities, in the order taken; a vehicle's abilities go with its upgrade.
  const upgrades = sheet.upgrades
    .map((u) => ({ ...u, abilities: [...sheet.abilities, ...(sheet.vehicle?.abilities ?? [])].filter((a) => (a.source === 'upgrade' || a.source === 'vehicle') && a.upgrade === u.name) }))
    .filter((u) => u.abilities.length)
  return (
    <section className="sheet-section sheet-section--abilities" aria-labelledby="sheet-abilities-title">
      <h3 id="sheet-abilities-title" className="visually-hidden">
        Abilities
      </h3>
      {!approach.length && !archetype.length && !upgrades.length && !sheet.mastery && <p className="sheet-empty">No abilities yet.</p>}
      {approach.length > 0 && (
        <Group title={sheet.approach ?? 'Approach'} note="Approach">
          {rows(approach)}
        </Group>
      )}
      {archetype.length > 0 && (
        <Group title={sheet.archetype ?? 'Archetype'} note="Archetype">
          {rows(archetype)}
        </Group>
      )}
      {upgrades.map((u) => (
        <Group key={u.name} title={u.name} summary={u.summary} note={sheet.vehicle && u.abilities.some((a) => a.source === 'vehicle') ? `Upgrade · vehicle${sheet.vehicle.die ? ` ${sheet.vehicle.die}` : ''}` : 'Upgrade'}>
          {rows(u.abilities)}
        </Group>
      ))}
      {sheet.mastery && (
        <Group title={sheet.mastery.name} note="Villainous mastery">
          {rows([sheet.mastery])}
        </Group>
      )}
    </section>
  )
}

/** The villain's name, alias and identity line, for exports (the page's header adds its controls). */
export function VillainSheetTitle({ villain }: { villain: Villain }) {
  const sheet = buildVillainSheet(villain)
  return (
    <header className="character-head">
      <div className="character-head__name">
        <div className="character-head__title">
          <h2>{sheet.name}</h2>
          {sheet.alias && sheet.alias !== sheet.name && <span className="character-head__alias">{sheet.alias}</span>}
        </div>
        <p className="character-head__identity">{villainIdentity(sheet)}</p>
      </div>
    </header>
  )
}

export function VillainSheetView({ villain, mode = 'sheet' }: { villain: Villain; mode?: 'sheet' | 'play' }) {
  const sheet = buildVillainSheet(villain)
  return (
    <article className="hero-sheet" aria-label={`${sheet.name} villain sheet`}>
      {mode === 'sheet' && <About villain={villain} sheet={sheet} />}
      <Mechanics sheet={sheet} />
      <Abilities sheet={sheet} />
    </article>
  )
}
