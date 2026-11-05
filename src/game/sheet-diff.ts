/**
 * What changed between two copies of a character's sheet (docs/design/game-table/spec.md,
 * section 8): the game's copy and the library's. Pure. It compares the build itself, through the
 * built sheets, so timestamps, tags, notes and anything else that isn't the build don't count.
 *
 * The changes are readable lines in sheet terms, grouped by section ("Speed d10 → d12", "New:
 * Blinding Strike (Yellow)"). No sections means the sheets match.
 */
import { buildSheet, type HeroSheet } from '../creation/sheet'
import { heroDisplayName, type Hero } from '../hero/model'
import { DETAIL_LABEL, ZONE_LABEL } from '../hero/labels'
import { traitKey, type TraitRef } from '../rules/catalog'
import type { Die } from '../rules/types'
import { villainDisplayName, type Villain } from '../villain/model'
import { buildVillainSheet, villainIdentity, type VillainSheet } from '../villain/sheet'

export interface DiffSection {
  section: string
  changes: string[]
}

type Trait = { trait: TraitRef; die: Die; name: string }
type Ability = { key: string; label: string; text: string }

const isHero = (doc: Hero | Villain): doc is Hero => 'method' in doc

/** Counts repeats, so two abilities with the same key are told apart ("Strike#2"). */
function keyed<T>(list: readonly T[], key: (x: T) => string): Map<string, T> {
  const seen = new Map<string, number>()
  const out = new Map<string, T>()
  for (const x of list) {
    const k = key(x)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    out.set(n === 1 ? k : `${k}#${n}`, x)
  }
  return out
}

function traitChanges(before: readonly Trait[], after: readonly Trait[]): { dice: string[]; added: string[] } {
  const old = keyed(before, (t) => traitKey(t.trait))
  const now = keyed(after, (t) => traitKey(t.trait))
  const kind = (t: Trait) => (t.trait.kind === 'power' ? 'power' : 'quality')
  const dice: string[] = []
  const added: string[] = []
  for (const [k, t] of now) {
    const was = old.get(k)
    if (!was) added.push(`New ${kind(t)}: ${t.name} ${t.die}`)
    else if (was.die !== t.die) dice.push(`${t.name} ${was.die} → ${t.die}`)
    else if (was.name !== t.name) dice.push(`${was.name} is now called ${t.name}`)
  }
  for (const [k, t] of old) if (!now.has(k)) added.push(`Removed ${kind(t)}: ${t.name}`)
  return { dice, added }
}

function abilityChanges(before: readonly Ability[], after: readonly Ability[]): string[] {
  const old = keyed(before, (a) => a.key)
  const now = keyed(after, (a) => a.key)
  const lines: string[] = []
  for (const [k, a] of now) {
    const was = old.get(k)
    if (!was) lines.push(`New: ${a.label}`)
    else if (was.label !== a.label || was.text !== a.text) lines.push(was.label === a.label ? `Changed: ${a.label}` : `Changed: ${was.label} is now ${a.label}`)
  }
  for (const [k, a] of old) if (!now.has(k)) lines.push(`Removed: ${a.label}`)
  return lines
}

/** Names added and removed, as "New form: Storm" and "Removed form: Stone". */
function nameChanges(before: readonly string[], after: readonly string[], noun: string): string[] {
  const old = keyed(before, (x) => x)
  const now = keyed(after, (x) => x)
  return [...[...now.keys()].filter((k) => !old.has(k)).map((k) => `New ${noun}: ${now.get(k)}`), ...[...old.keys()].filter((k) => !now.has(k)).map((k) => `Removed ${noun}: ${old.get(k)}`)]
}

const none = (x: string | number | undefined) => (x === undefined || x === '' ? 'none' : String(x))
/** "Max Health 30 → 32" when the value changed. */
const changed = (label: string, a: string | number | undefined, b: string | number | undefined) => (none(a) === none(b) ? [] : [`${label}${none(a)} → ${none(b)}`])

function sections(list: readonly (readonly [string, readonly string[]])[]): DiffSection[] {
  return list.filter(([, changes]) => changes.length > 0).map(([section, changes]) => ({ section, changes: [...changes] }))
}

function heroAbilities(sheet: HeroSheet): Ability[] {
  return [
    ...sheet.abilities.map((a) => ({ key: `${a.zone}|${a.source}|${a.baseName}`, label: `${a.name} (${ZONE_LABEL[a.zone]})`, text: a.text })),
    ...(sheet.outAbility ? [{ key: 'out', label: 'Out ability', text: sheet.outAbility }] : []),
  ]
}

function heroFormNames(sheet: HeroSheet): string[][] {
  return [sheet.forms.map((f) => f.name), [...sheet.modes.map((m) => m.name), ...(sheet.powerlessMode ? ['Powerless mode'] : [])]]
}

const LOOK_FIELDS = ['gender', 'age', 'height', 'eyes', 'hair', 'skin', 'build', 'costume'] as const

function heroDiff(a: Hero, b: Hero): DiffSection[] {
  const before = buildSheet(a)
  const after = buildSheet(b)
  const traits = traitChanges([...before.powers, ...before.qualities], [...after.powers, ...after.qualities])
  const [formsA, modesA] = heroFormNames(before)
  const [formsB, modesB] = heroFormNames(after)
  const status = (['green', 'yellow', 'red'] as const).flatMap((z) => (before.statusDice?.[z] === after.statusDice?.[z] ? [] : [`${ZONE_LABEL[z]} status die ${none(before.statusDice?.[z])} → ${none(after.statusDice?.[z])}`]))
  return sections([
    ['Name', changed('', heroDisplayName(a), heroDisplayName(b))],
    // The look of the hero: a cosmetic change is a sheet change (docs/design/advancement/spec.md, section 4).
    ['Appearance', LOOK_FIELDS.flatMap((f) => changed(`${DETAIL_LABEL[f]}: `, a.details[f].trim(), b.details[f].trim()))],
    ['Dice', traits.dice],
    ['Powers and qualities', traits.added],
    ['Abilities', abilityChanges(heroAbilities(before), heroAbilities(after))],
    ['Principles', nameChanges(before.principles.map((p) => p.name), after.principles.map((p) => p.name), 'principle')],
    ['Forms and modes', [...nameChanges(formsA!, formsB!, 'form'), ...nameChanges(modesA!, modesB!, 'mode'), ...nameChanges(before.minionForms.map((m) => m.name), after.minionForms.map((m) => m.name), 'minion form')]],
    ['Health', changed('Max Health ', before.maxHealth, after.maxHealth)],
    ['Personality and status dice', [...changed('Personality: ', before.characteristics.personality, after.characteristics.personality), ...status]],
  ])
}

function villainAbilities(sheet: VillainSheet): Ability[] {
  const all = [...sheet.abilities, ...(sheet.vehicle?.abilities ?? []), ...(sheet.mastery ? [sheet.mastery] : [])]
  return all.map((a) => ({ key: `${a.source}|${a.baseName}`, label: a.name, text: a.text }))
}

function villainDiff(a: Villain, b: Villain): DiffSection[] {
  const before = buildVillainSheet(a)
  const after = buildVillainSheet(b)
  const traits = traitChanges([...before.powers, ...before.qualities], [...after.powers, ...after.qualities])
  return sections([
    ['Name', changed('', villainDisplayName(a), villainDisplayName(b))],
    ['Approach and archetype', changed('', villainIdentity(before), villainIdentity(after))],
    ['Dice', traits.dice],
    ['Powers and qualities', traits.added],
    ['Abilities', abilityChanges(villainAbilities(before), villainAbilities(after))],
    ['Upgrades', nameChanges(before.upgrades.map((u) => u.name), after.upgrades.map((u) => u.name), 'upgrade')],
    ['Health', changed('Max Health ', before.health?.max, after.health?.max)],
  ])
}

/** What changed from sheet `a` (the game's copy) to sheet `b` (the library's), by section; empty when they match. */
export function sheetDiff(a: Hero, b: Hero): DiffSection[]
export function sheetDiff(a: Villain, b: Villain): DiffSection[]
export function sheetDiff(a: Hero | Villain, b: Hero | Villain): DiffSection[]
export function sheetDiff(a: Hero | Villain, b: Hero | Villain): DiffSection[] {
  if (isHero(a) !== isHero(b)) throw new Error('sheetDiff compares two heroes or two villains')
  return isHero(a) ? heroDiff(a, b as Hero) : villainDiff(a, b as Villain)
}

/** Whether two sheets differ anywhere at all, build or not (timestamps aside): a solo game re-copies even a new costume. */
export function sheetsDiffer(a: Hero | Villain, b: Hero | Villain): boolean {
  const plain = (doc: Hero | Villain) => JSON.stringify({ ...doc, updatedAt: '' })
  return plain(a) !== plain(b)
}
