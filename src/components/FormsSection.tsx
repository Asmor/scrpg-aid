/**
 * The sheet's forms and modes (docs/design/hero-sheet/spec.md, "Forms and modes"), after the
 * abilities: a card per Modular mode or Form-Changer form showing only what it changes from
 * the base dice; Divided's powers and qualities by form; Minion-Maker's minion forms.
 */
import { diceChanges, noChanges } from '../creation/dice-changes'
import { takesDividedPsyche, traitsInForm } from '../creation/divided'
import { modeLimits } from '../creation/format'
import { archetypeName, outerLayer, secondaryLayer, type ArchetypeLayer } from '../creation/layers'
import type { HeroSheet, SheetFormAbility } from '../creation/sheet'
import { ROLEPLAYING_QUALITY, traitLabel, type HeroTrait } from '../creation/traits'
import { ABILITY_TYPE_LABEL, ZONE_LABEL } from '../hero/labels'
import type { Hero } from '../hero/model'
import { playForms, type PlayForm } from '../play/forms'
import { traitKey } from '../rules/catalog'
import type { Archetype, Die, Zone } from '../rules/types'
import type { ReactNode } from 'react'
import { AbilityIcons, AbilityText, DieIcon } from './icons'

/** The hero's archetype, or the second one a Divided hero builds on, that has `has`. */
function layerWith(hero: Hero, has: (archetype: Archetype) => boolean): ArchetypeLayer | undefined {
  return [outerLayer(hero), secondaryLayer(hero)].find((l) => l && has(l.archetype))
}

/** "A, B and C" */
const andList = (names: readonly string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? ''))

/** One part of the section: its own heading, a note on the right, and a line on what it shows. */
function Part({ id, title, note, lede, children }: { id: string; title: string; note?: string; lede: string; children: ReactNode }) {
  return (
    <section className="sheet-section" aria-labelledby={id}>
      <div className="sheet-section__head">
        <h3 id={id}>{title}</h3>
        {note && <span className="sheet-section__note">{note}</span>}
      </div>
      <p className="sheet-section__lede">{lede}</p>
      {children}
    </section>
  )
}

function ZoneChip({ zone }: { zone: Zone }) {
  return <span className={`zone-chip zone-${zone}`}>{ZONE_LABEL[zone]}</span>
}

/** A form's or mode's own ability: icons and name, its type, and its text. */
function FormAbility({ ability }: { ability: SheetFormAbility }) {
  return (
    <div className="sheet-form__ability">
      <p className="sheet-form__ability-name">
        <AbilityIcons actions={ability.effects} />
        <strong>{ability.name}</strong> <span className="sheet-form__type">{ABILITY_TYPE_LABEL[ability.type]}</span>
      </p>
      <p>
        <AbilityText text={ability.text} actions={ability.effects} />
      </p>
    </div>
  )
}

function FormCard({ form, base, noun }: { form: PlayForm; base: readonly HeroTrait[]; noun: 'form' | 'mode' }) {
  const changes = diceChanges(base, form.traits)
  const limit = form.powerless ? 'Only principle abilities can be used.' : modeLimits(form.cannot, form.immobile)
  return (
    <section className="card sheet-form" aria-label={form.name}>
      <div className="sheet-form__head">
        <h4>{form.name}</h4>
        {/* Powerless mode has no zone (ruling 54). */}
        {!form.powerless && <ZoneChip zone={form.zone} />}
      </div>
      {noChanges(changes) ? (
        <p className="sheet-form__muted">Uses your base dice.</p>
      ) : (
        <>
          <p className="label">Dice changes</p>
          {changes.changed.length + changes.added.length > 0 && (
            <ul className="dice-changes">
              {changes.changed.map((c) => (
                <li key={c.name}>
                  <span>{c.name}</span>
                  <DieIcon die={c.from} />
                  <span aria-label="becomes" role="img">
                    →
                  </span>
                  <DieIcon die={c.to} />
                </li>
              ))}
              {changes.added.map((t) => (
                <li key={traitKey(t.trait)}>
                  <span>{t.name}</span>
                  <DieIcon die={t.die} />
                  <span className="tag tag--added">Added</span>
                </li>
              ))}
            </ul>
          )}
          {changes.dropped.length > 0 && (
            <p className="sheet-form__muted">
              Not in this {noun}: {changes.dropped.map((t) => t.name).join(', ')}
            </p>
          )}
        </>
      )}
      {limit && (
        <p className="sheet-form__limit">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3.5 12.5l9-9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {limit}
        </p>
      )}
      {form.ability && <FormAbility ability={form.ability} />}
    </section>
  )
}

/** Modular modes or Form-Changer forms, base first, two per row. */
function ModesAndForms({ hero, sheet }: { hero: Hero; sheet: HeroSheet }) {
  const forms = playForms(sheet)
  const noun = sheet.forms.length ? 'form' : 'mode'
  const ar = layerWith(hero, (a) => Boolean(a.forms || a.modes))?.archetype
  // The archetype's own fixed abilities work in every mode or form (Switch, Change Forms, ...).
  const always = [...(ar?.fixedGreenAbilities ?? []), ...(ar?.fixedYellowAbilities ?? []), ...(ar?.fixedRedAbilities ?? [])].map((a) => a.name)
  const name = archetypeName(hero)
  const note = [name, always.length ? `${andList(always)} work in every ${noun}` : ''].filter(Boolean).join(' · ')
  const base = forms[0]!
  return (
    <Part
      id="sheet-modes-title"
      title={noun === 'form' ? 'Forms' : 'Modes'}
      note={note}
      lede={`Each ${noun} shows only what differs from your ${noun === 'form' ? 'base form' : 'default mode'}. Its zone tag is the lowest zone it needs: a Yellow ${noun} works in the Yellow or Red zone.`}
    >
      <div className="sheet-forms">
        {forms.map((f) => (
          <FormCard key={f.key ?? 'base'} form={f} base={base.traits} noun={noun} />
        ))}
      </div>
    </Part>
  )
}

const KIND_TAG = (t: HeroTrait) => (traitKey(t.trait) === traitKey(ROLEPLAYING_QUALITY) ? 'roleplaying' : t.trait.kind)

const byDie = (a: HeroTrait, b: HeroTrait) => Number(b.die.slice(1)) - Number(a.die.slice(1)) || a.name.localeCompare(b.name)

function StatusChips({ dice }: { dice: Record<Zone, Die> }) {
  return (
    <ul className="status-chips" aria-label="Status dice">
      {(['green', 'yellow', 'red'] as const).map((z) => (
        <li key={z} className={`zone-${z}`}>
          <span aria-hidden="true">{ZONE_LABEL[z][0]}</span>
          <span className="visually-hidden">{ZONE_LABEL[z]}</span>
          <DieIcon die={dice[z]} size="compact" />
        </li>
      ))}
    </ul>
  )
}

function DividedForms({ hero, sheet }: { hero: Hero; sheet: HeroSheet }) {
  const ar = outerLayer(hero)?.archetype
  const choice = hero.archetype?.divided
  const method = ar?.transitionMethods?.find((m) => m.id === choice?.transitionMethod)?.name
  const psyche = takesDividedPsyche(hero)
  const own = hero.archetype?.abilities.find((p) => p.source === 'archetype.green')?.name
  const note = ['Divided', own, method].filter(Boolean).join(' · ')
  if (psyche) {
    return (
      <Part id="sheet-divided-title" title="Divided forms" note={note} lede="Divided Psyche changes which dice each form rolls.">
        <p className="card">In your civilian form you roll two qualities with your status die; in your heroic form, two powers.</p>
      </Part>
    )
  }
  const base = [...sheet.powers, ...sheet.qualities]
  const civilian = traitsInForm(hero, base, 'civilian')
  const heroic = traitsInForm(hero, base, 'heroic')
  const same = (a: HeroTrait, list: readonly HeroTrait[]) => list.some((b) => traitKey(b.trait) === traitKey(a.trait) && b.die === a.die)
  const both = civilian.filter((t) => same(t, heroic))
  const onlyCivilian = civilian.filter((t) => !same(t, heroic))
  const onlyHeroic = heroic.filter((t) => !same(t, civilian))
  // An ability that needs a trait only one form has works only in that form. A trait both
  // forms have, even at different dice, isn't form-only.
  const keys = (list: readonly HeroTrait[]) => new Set(list.map((t) => traitKey(t.trait)))
  const needs = (mine: readonly HeroTrait[], other: readonly HeroTrait[]) => {
    const mineKeys = keys(mine)
    const otherKeys = keys(other)
    return sheet.abilities.filter((a) => a.use.traits.some((t) => mineKeys.has(traitKey(t)) && !otherKeys.has(traitKey(t))))
  }
  const twoPersonalities = Boolean(sheet.divided?.heroicPersonality)
  const columns = [
    {
      name: 'Both forms',
      traits: both,
      personality: undefined,
      status: undefined,
      abilities: [],
    },
    {
      name: 'Civilian form',
      traits: onlyCivilian,
      personality: sheet.characteristics.personality,
      status: sheet.statusDice,
      abilities: needs(civilian, heroic),
    },
    {
      name: 'Heroic form',
      traits: onlyHeroic,
      personality: sheet.divided?.heroicPersonality,
      status: sheet.heroicStatusDice,
      abilities: needs(heroic, civilian),
    },
  ]
  return (
    <Part id="sheet-divided-title" title="Divided forms" note={note} lede="Which powers and qualities each form can use. Abilities that need a form-only trait work only in that form.">
      <div className="sheet-forms sheet-forms--three">
        {columns.map((c) => (
          <section key={c.name} className="card sheet-form" aria-label={c.name}>
            <div className="sheet-form__head">
              <h4>{c.name}</h4>
            </div>
            {twoPersonalities && c.personality && (
              <>
                <p className="sheet-form__personality">{c.personality}</p>
                {c.status && <StatusChips dice={c.status} />}
              </>
            )}
            <p className="label">Powers and qualities</p>
            {c.traits.length ? (
              <ul className="trait-rows">
                {[...c.traits].sort(byDie).map((t) => (
                  <li key={traitKey(t.trait)}>
                    <span>
                      {t.name} <span className="sheet-form__type">{KIND_TAG(t)}</span>
                    </span>
                    <DieIcon die={t.die} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sheet-form__muted">None.</p>
            )}
            {c.abilities.length > 0 && (
              <>
                <p className="label">Abilities only in this form</p>
                <ul className="sheet-form__abilities">
                  {c.abilities.map((a, i) => (
                    <li key={`${a.source}:${a.baseName}:${i}`}>
                      <AbilityIcons actions={a.effects} />
                      {a.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ))}
      </div>
    </Part>
  )
}

function MinionForms({ hero, sheet }: { hero: Hero; sheet: HeroSheet }) {
  const quality = layerWith(hero, (a) => Boolean(a.minionForms))?.choice.minionForms?.quality
  const count = sheet.minionForms.length
  const note = [archetypeName(hero), `${count} ${count === 1 ? 'form' : 'forms'}${quality ? `, from ${traitLabel(hero, quality)}` : ''}`].filter(Boolean).join(' · ')
  return (
    <Part id="sheet-minions-title" title="Minion forms" note={note} lede="The forms your minions can take. Minions you've made during a scene are tracked in Play, not here.">
      <div className="sheet-forms sheet-forms--three">
        {sheet.minionForms.map((f) => (
          <section key={f.name} className="card sheet-form" aria-label={f.name}>
            <div className="sheet-form__head">
              <h4>{f.name}</h4>
            </div>
            <p className="sheet-form__muted">Needs a +{f.minBonus} bonus or more</p>
            <p>{f.effect}</p>
          </section>
        ))}
      </div>
    </Part>
  )
}

/**
 * Whichever the hero has: modes or forms, Divided's forms, minion forms. A Divided hero can
 * build on a Form-Changer or a Minion-Maker, so more than one can show.
 */
export function FormsSection({ hero, sheet }: { hero: Hero; sheet: HeroSheet }) {
  const modes = sheet.forms.length > 0 || sheet.modes.length > 0 || Boolean(sheet.powerlessMode)
  return (
    <>
      {sheet.divided && <DividedForms hero={hero} sheet={sheet} />}
      {modes && <ModesAndForms hero={hero} sheet={sheet} />}
      {sheet.minionForms.length > 0 && <MinionForms hero={hero} sheet={sheet} />}
    </>
  )
}
