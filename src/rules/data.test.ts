import { describe, expect, it } from 'vitest'
import { describeRef, expandRef, getCategory, getTrait } from './catalog'
import {
  archetypes,
  archetypesById,
  backgrounds,
  healthFormula,
  personalities,
  powerSources,
  principleCategories,
  principles,
  principlesById,
  redAbilityCategories,
  redAbilityStep,
  retcons,
} from './data'
import { isDie, ZONES } from './dice'
import type { Ability, OptionRef } from './types'

const REF_KEYS = ['power', 'quality', 'powerCategory', 'qualityCategory']

/** Every object in a tree of data that matches `pick`. */
function collect<T>(node: unknown, pick: (o: Record<string, unknown>) => boolean, out: T[] = []): T[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, pick, out))
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (pick(o)) out.push(o as T)
    Object.values(o).forEach((v) => collect(v, pick, out))
  }
  return out
}

/** Option references: exactly one reference key (a RequiredRef may also have dieCount). */
const collectRefs = (node: unknown) =>
  collect<OptionRef>(node, (o) => Object.keys(o).filter((k) => REF_KEYS.includes(k)).length === 1 && !('name' in o))

/** Abilities: anything with a name and game text. */
const collectAbilities = (node: unknown) => collect<Ability>(node, (o) => 'name' in o && 'text' in o)

function isAbility(a: Ability): boolean {
  return typeof a.name === 'string' && ['A', 'R', 'I', 'A/I'].includes(a.type) && a.text.length > 0
}

describe('hero rules data', () => {
  it('resolves every option reference to the catalog', () => {
    const refs = collectRefs([backgrounds, powerSources, archetypes, redAbilityCategories, healthFormula])
    expect(refs.length).toBeGreaterThan(100)
    expect(refs).toContainEqual({ quality: 'medicine', dieCount: 1 })
    expect(refs).toContainEqual({ power: 'power-suit', dieCount: 1 })
    for (const ref of refs) {
      const { kind, scope, id } = describeRef(ref)
      if (scope === 'trait') expect(getTrait({ kind, id }), JSON.stringify(ref)).toBeDefined()
      else expect(getCategory(kind, id), JSON.stringify(ref)).toBeDefined()
      expect(expandRef(ref).length, JSON.stringify(ref)).toBeGreaterThan(0)
    }
  })

  it('has well-formed abilities', () => {
    const abilities = collectAbilities([powerSources, archetypes, redAbilityCategories, principles])
    expect(abilities.length).toBeGreaterThan(200)
    expect(abilities.filter((a) => !isAbility(a))).toEqual([])
    // The complex archetypes' abilities are included.
    const names = new Set(abilities.map((a) => a.name))
    for (const name of ['Quick Switch', 'Construction Focus', 'Transform', 'Clever Form', 'Agile Form', 'Destroyer']) {
      expect(names, name).toContain(name)
    }
  })

  it('has red ability categories keyed by one power or quality category', () => {
    for (const c of redAbilityCategories) {
      expect(Number(Boolean(c.powerCategory)) + Number(Boolean(c.qualityCategory))).toBe(1)
    }
    expect(redAbilityStep.count).toBe(2)
  })

  it('has principles in known categories', () => {
    expect(principles).toHaveLength(64)
    const categories = new Set(principleCategories.map((c) => c.id))
    expect(principles.every((p) => categories.has(p.category))).toBe(true)
    expect(principlesById.get('destiny')?.category).toBe('esoteric')
  })

  it('gives each entry at most one bonus (the trait logic relies on this)', () => {
    for (const entry of [...powerSources, ...archetypes, ...personalities]) {
      expect((entry.bonuses ?? []).length, entry.id).toBeLessThanOrEqual(1)
    }
  })

  it('has bonuses with known kinds and valid dice', () => {
    const bonuses = [
      ...powerSources.flatMap((p) => p.bonuses ?? []),
      ...archetypes.flatMap((a) => a.bonuses ?? []),
      ...personalities.flatMap((p) => p.bonuses ?? []),
    ]
    expect(new Set(bonuses.map((b) => b.kind))).toEqual(
      new Set(['extraArchetypeQuality', 'gainQuality', 'gainPower', 'upgradeDie', 'shiftDice']),
    )
    for (const b of bonuses) {
      if ('die' in b) expect(isDie(b.die), b.summary).toBe(true)
      if (b.kind === 'upgradeDie') expect([...(b.from ?? []), b.to ?? 'd12', b.max ?? 'd12'].every(isDie)).toBe(true)
      if (b.kind === 'shiftDice') expect([...b.downgrade.from, ...b.upgrade.from].every(isDie)).toBe(true)
      expect(b.summary.length).toBeGreaterThan(0)
    }
  })

  it('has retcons with known kinds and their fields', () => {
    const kinds = new Set(retcons.map((r) => r.kind))
    expect(kinds).toEqual(
      new Set(['swapDice', 'changeAbilityTrait', 'gainPowerOrQuality', 'upgradeStatusDie', 'changePrinciple', 'gainRedAbility']),
    )
    for (const r of retcons) {
      if (r.kind === 'swapDice') expect(r.targets.length).toBeGreaterThan(0)
      if (r.kind === 'gainPowerOrQuality') expect(isDie(r.die)).toBe(true)
      if (r.kind === 'upgradeStatusDie') expect(isDie(r.max) && ZONES.includes(r.zone)).toBe(true)
      if (r.kind === 'gainRedAbility') expect(r.count).toBeGreaterThan(0)
    }
  })

  it('indexes archetypes by id, including the complex ones', () => {
    expect(archetypesById.get('divided')?.complex).toBe(true)
    expect(archetypesById.get('modular')?.modes?.green.count).toBe(1)
    expect(archetypesById.get('minion-maker')?.minionForms?.forms.length).toBeGreaterThan(0)
  })
})
