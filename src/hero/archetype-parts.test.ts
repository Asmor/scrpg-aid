import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { completeHero, dividedHero, formChangerHero, minionMakerHero, modularHero } from '../test/heroes'
import { archetypeParts } from './archetype-parts'
import type { Hero } from './model'

const parts = (hero: Hero) => archetypeParts(hero, buildSheet(hero).warnings)
const archetypeIssues = (hero: Hero) => buildSheet(hero).warnings.filter((w) => w.step === 'archetype').length
const total = (hero: Hero) => parts(hero).reduce((n, p) => n + p.issues.length, 0)

describe('archetype parts', () => {
  it('has none for an ordinary archetype', () => {
    expect(parts(completeHero())).toEqual([])
  })

  it('splits Divided into second archetype, transition, its ability, form split and principle', () => {
    const hero = dividedHero()
    expect(parts(hero).map((p) => p.label)).toEqual(['Second archetype', 'Transition', 'Divided ability', ...(hero.archetype!.abilities.some((a) => a.name === 'Split Form') ? ['Form split'] : []), 'Principle'])
    expect(total(hero)).toBe(archetypeIssues(hero))
  })

  it('splits Form-Changer into its base build, each form, and principle', () => {
    expect(parts(formChangerHero()).map((p) => p.id)).toEqual(['base', 'form:green:0', 'form:green:1', 'form:yellow:0', 'principle'])
    expect(parts(formChangerHero()).map((p) => p.label)).toEqual(['Base build', 'Green form 1', 'Green form 2', 'Yellow form', 'Principle'])
  })

  it('splits Modular into base, switch abilities, each mode, Powerless mode and principle', () => {
    expect(parts(modularHero()).map((p) => p.label)).toEqual(['Base archetype', 'Switch abilities', 'Green mode', 'Yellow mode 1', 'Yellow mode 2', 'Red mode', 'Powerless mode (optional)', 'Principle'])
  })

  it('splits Minion-Maker into base build, minion forms and principle', () => {
    expect(parts(minionMakerHero()).map((p) => p.label)).toEqual(['Base build', 'Minion forms', 'Principle'])
  })

  it('puts each issue in its part, so the counts match the step', () => {
    const hero = formChangerHero()
    hero.archetype!.forms![1]!.ability = undefined
    delete hero.archetype!.principle
    const byId = Object.fromEntries(parts(hero).map((p) => [p.id, p]))
    expect(byId['form:green:1']!.mark).toBe('issues')
    expect(byId['form:green:1']!.issues.map((w) => w.code)).toContain('form-ability-missing')
    expect(byId['principle']!.issues.map((w) => w.code)).toEqual(['principle-missing'])
    expect(byId['form:green:0']!.mark).toBe('done')
    expect(total(hero)).toBe(archetypeIssues(hero))

    const modular = modularHero()
    modular.archetype!.modular!.modes = modular.archetype!.modular!.modes.slice(0, 1)
    const m = parts(modular)
    expect(m.find((p) => p.id === 'mode:yellow:0')).toMatchObject({ mark: 'issues' })
    expect(m.find((p) => p.id === 'powerless')!.mark).toBe(modular.archetype!.modular!.powerless ? 'done' : 'todo')
    expect(total(modular)).toBe(archetypeIssues(modular))

    const divided = dividedHero()
    delete divided.archetype!.divided!.transitionMethod
    const d = parts(divided)
    expect(d.find((p) => p.id === 'transition')!.issues.map((w) => w.code)).toContain('transition-missing')
    expect(total(divided)).toBe(archetypeIssues(divided))

    const minions = minionMakerHero()
    delete minions.archetype!.minionForms!.quality
    expect(parts(minions).find((p) => p.id === 'minion-forms')!.issues.map((w) => w.code)).toEqual(['minion-forms-quality'])
  })
})
