import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import type { Hero } from '../hero/model'
import { A, completeHero, dividedHero, formChangerHero, modularHero, P, Q } from '../test/heroes'
import { currentForm, defaultSlots, formAvailable, formDice, formNoun, playAbilities, playForms, traitChoices } from './forms'
import { emptyPlay } from './state'

const dice = (hero: Hero, play = {}) => formDice(hero, buildSheet(hero), { ...emptyPlay(), ...play })
const names = (list: readonly ({ name: string; die: string } | undefined)[]) => list.map((t) => t && `${t.name} ${t.die}`)
const abilities = (hero: Hero, play = {}, zone: 'green' | 'yellow' | 'red' | 'out' = 'green') =>
  Object.fromEntries(playAbilities(hero, buildSheet(hero), { ...emptyPlay(), ...play }, zone).map((a) => [a.name, a.blocked ?? 'ok']))

describe('forms and modes', () => {
  it('has none for a hero without any', () => {
    const sheet = buildSheet(completeHero())
    expect(playForms(sheet)).toEqual([])
    expect(currentForm(playForms(sheet), {})).toBeUndefined()
    expect(formDice(completeHero(), sheet, emptyPlay())).toMatchObject({ slots: ['power', 'quality'], cannot: [] })
  })

  it('lists the base form and each Form-Changer form, and rolls the current one’s dice', () => {
    const forms = playForms(buildSheet(formChangerHero()))
    expect(forms.map((f) => [f.key, f.name, f.zone])).toEqual([
      [undefined, 'Base form', 'green'],
      ['form:0', 'Brute', 'green'],
      ['form:1', 'Green form 2', 'green'],
      ['form:2', 'Yellow form 1', 'yellow'],
    ])
    expect(formNoun(forms)).toBe('form')
    expect(currentForm(forms, { form: 'form:0' })?.name).toBe('Brute')
    // A form that's gone (the hero was edited) falls back to the base form.
    expect(currentForm(forms, { form: 'form:9' })?.name).toBe('Base form')
    expect(names(dice(formChangerHero(), { form: 'form:0' }).powers)).toEqual(['Strength d12', 'Agility d10', 'Awareness d8', 'Fire d8', 'Shapeshifting d6'])
    expect(names(dice(formChangerHero()).powers)[0]).toBe('Shapeshifting d12')
  })

  it('lists Modular’s default mode, its modes, and Powerless mode', () => {
    const forms = playForms(buildSheet(modularHero()))
    expect(forms.map((f) => [f.key, f.name])).toEqual([
      [undefined, 'Default mode'],
      ['mode:0', 'Improvement Mode'],
      ['mode:1', 'Analysis Mode'],
      ['mode:2', 'Patch Job'],
      ['mode:3', 'Hunter/Killer Mode'],
      ['powerless', 'Powerless mode'],
    ])
    expect(formNoun(forms)).toBe('mode')
    expect(dice(modularHero(), { form: 'mode:0' }).cannot).toEqual(['attack', 'hinder'])
    expect(names(dice(modularHero(), { form: 'powerless' }).powers)).toEqual(['Awareness d10', 'Fire d6'])
  })

  it('makes a form’s ability usable only in that form, and Yellow forms only in Yellow or Red', () => {
    expect(abilities(formChangerHero(), {}, 'yellow')).toMatchObject({ 'Strong Form': 'Only in Brute', 'Agile Form': 'Only in Yellow form 1', 'Change Forms': 'ok' })
    expect(abilities(formChangerHero(), { form: 'form:0' })).toMatchObject({ 'Strong Form': 'ok', 'Clever Form': 'Only in Green form 2', 'Agile Form': 'Yellow or Red zone' })
  })

  it('blocks a mode’s “can’t” actions, and allows only principle abilities in Powerless mode', () => {
    // Improvement Mode can't Attack or Hinder: Inflict does only that.
    expect(abilities(modularHero(), { form: 'mode:0' }, 'yellow')).toMatchObject({ Inflict: "Can't Attack or Hinder in Improvement Mode", 'Area Alteration': 'ok', Improvement: 'ok' })
    expect(abilities(modularHero(), { form: 'powerless' })).toMatchObject({ Switch: 'Only principle abilities in Powerless mode', 'Principle of Business': 'ok' })
    expect(abilities(modularHero(), { form: 'powerless' }, 'out')).toMatchObject({ 'Out ability': 'ok' })
  })

  it('blocks an ability only when every effect is a “can’t” action (ruling 53)', () => {
    const sheet = buildSheet(modularHero())
    const withEffects = (effects: { actions: ('attack' | 'hinder' | 'boost' | 'recover')[]; use: 'max' }[]) => ({ ...sheet.abilities[0]!, name: 'Test', zone: 'green' as const, use: { effects, traits: [] } })
    const blocked = (effects: Parameters<typeof withEffects>[0]) =>
      playAbilities(modularHero(), { ...sheet, abilities: [withEffects(effects)] }, { ...emptyPlay(), form: 'mode:0' }, 'green').find((a) => a.name === 'Test')?.blocked
    // Improvement Mode can't Attack or Hinder.
    expect(blocked([{ actions: ['attack'], use: 'max' }, { actions: ['hinder'], use: 'max' }])).toBe("Can't Attack or Hinder in Improvement Mode")
    expect(blocked([{ actions: ['attack'], use: 'max' }, { actions: ['boost'], use: 'max' }])).toBeUndefined()
    expect(blocked([{ actions: ['attack', 'recover'], use: 'max' }])).toBeUndefined()
  })

  it('changes to a Yellow or Red form only in that zone, but to any when Out', () => {
    expect(formAvailable({ zone: 'green' }, 'red')).toBe(true)
    expect(formAvailable({ zone: 'yellow' }, 'green')).toBe(false)
    expect(formAvailable({ zone: 'red' }, 'red')).toBe(true)
    expect(formAvailable({ zone: 'red' }, 'out')).toBe(true)
  })

  it('doesn’t pick one trait for two slots', () => {
    const one = { trait: Q('fitness'), die: 'd10' as const, step: 'background' as const, name: 'Fitness' }
    expect(defaultSlots({ power: [], quality: [one] }, ['quality', 'quality'], undefined)).toEqual([{ trait: one, fixed: false }, { fixed: false }])
  })

  it('rolls a d4 for a power the form doesn’t have (ruling 17)', () => {
    // Green form 2 has no Strength.
    const d = dice(formChangerHero(), { form: 'form:1' })
    const choices = traitChoices(d, { effects: [], traits: [P('strength')] })
    expect(names(choices.power).at(-1)).toBe('Strength (not in this form) d4')
    const slots = defaultSlots(choices, d.slots, { effects: [], traits: [P('strength')] })
    expect(names(slots.map((x) => x.trait))).toEqual(['Strength (not in this form) d4', 'Fitness d10'])
    // The ability's own power is fixed; the other slot is the player's choice.
    expect(slots.map((x) => x.fixed)).toEqual([true, false])
  })
})

describe('Divided forms', () => {
  it('rolls two qualities in civilian form and two powers in heroic form with Divided Psyche', () => {
    expect(dice(dividedHero()).slots).toEqual(['quality', 'quality'])
    expect(dice(dividedHero(), { dividedForm: 'heroic' }).slots).toEqual(['power', 'power'])
    const d = dice(dividedHero(), { dividedForm: 'heroic' })
    expect(names(defaultSlots(traitChoices(d, undefined), d.slots, undefined).map((x) => x.trait))).toEqual(['Speed d12', 'Agility d10'])
    expect(formNoun(playForms(buildSheet(dividedHero())))).toBe('form')
  })

  const splitHero = () => {
    const hero = dividedHero()
    hero.archetype!.abilities = [{ source: 'archetype.green', name: 'Split Form' }]
    hero.archetype!.divided!.split = {
      always: [P('speed'), P('agility'), Q('fitness'), Q('alertness')],
      civilian: [P('awareness')],
      heroic: [P('fire'), P('flight')],
    }
    return hero
  }

  it('with Split Form, has each form’s own traits and blocks abilities that need the other form’s', () => {
    expect(dice(splitHero()).slots).toEqual(['power', 'quality'])
    expect(names(dice(splitHero()).powers)).toEqual(['Speed d12', 'Agility d10', 'Awareness d8'])
    expect(names(dice(splitHero(), { dividedForm: 'heroic' }).powers)).toEqual(['Speed d12', 'Agility d10', 'Fire d8', 'Flight d6'])
    expect(abilities(splitHero(), {}, 'yellow')).toMatchObject({ Inflict: 'Needs Fire, not in your civilian form', 'Speedy Analysis': 'Needs Flight, not in your civilian form', 'Always on the Move': 'ok' })
    expect(abilities(splitHero(), { dividedForm: 'heroic' }, 'yellow')).toMatchObject({ Inflict: 'ok' })
  })

  it('uses the heroic personality’s traits and status dice in heroic form', () => {
    const hero = dividedHero()
    hero.archetype!.divided!.heroicPersonality = { id: 'impulsive', bonus: [A(P('leaping'), 'd8')], outUses: [] }
    const sheet = buildSheet(hero)
    const heroic = formDice(hero, sheet, { ...emptyPlay(), dividedForm: 'heroic' })
    expect(names(heroic.powers)).toContain('Leaping d8')
    expect(names(formDice(hero, sheet, emptyPlay()).powers)).not.toContain('Leaping d8')
    expect(heroic.statusDice).toEqual(sheet.heroicStatusDice)
  })
})
