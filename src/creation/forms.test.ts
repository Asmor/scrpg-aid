import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import { A, completeHero, formChangerHero, minionMakerHero, P, Q } from '../test/heroes'
import { buildSheet } from './sheet'
import { checkForms, formAbilityOptions, formDice, formPowerOptions, formSlots, formTraits, formUpgradeOptions, setFormSlot } from './forms'
import { archetypesById } from '../rules/data'
import { deriveTraits } from './traits'

const check = (hero: Hero) => checkForms(hero, deriveTraits(hero).traits)
const messages = (hero: Hero) => check(hero).map((w) => w.message)
const codes = (hero: Hero) => check(hero).map((w) => w.code)

describe('Form-Changer forms', () => {
  it('accepts two Green forms and a Yellow form', () => {
    expect(check(formChangerHero())).toEqual([])
    // The whole hero is legal, too.
    expect(buildSheet(formChangerHero()).warnings).toEqual([])
  })

  it('needs the right number of forms', () => {
    const hero = formChangerHero()
    hero.archetype!.forms!.splice(1, 2)
    expect(messages(hero)).toEqual(['Create 2 Green forms; you have 1.', 'Create 1 Yellow form; you have 0.'])
    hero.archetype!.forms = []
    expect(messages(hero)).toEqual(['Create 2 Green forms; you have 0.', 'Create 1 Yellow form; you have 0.'])
  })

  it('rearranges the hero’s power dice, on their powers or powers from the archetype lists', () => {
    const hero = formChangerHero()
    const form = hero.archetype!.forms![0]!
    form.powers[0] = A(P('strength'), 'd10')
    expect(messages(hero)).toEqual(['Brute must use your power dice (d12, d10, d8, d8, d6), rearranged.'])
    form.powers[0] = A(P('telepathy'), 'd12')
    // (Strong Form now also warns, since this form no longer has Strength.)
    expect(messages(hero)).toContain("Brute can only use your powers or powers from the Form-Changer lists; Telepathy isn't one.")
    form.powers[0] = A(Q('banter'), 'd12')
    expect(codes(hero)).toContain('form-not-power')
    form.powers[0] = A(P('agility'), 'd12')
    expect(codes(hero)).toContain('assigned-twice')
  })

  it('Yellow form raises two different dice, powers or qualities (the user’s ruling)', () => {
    const hero = formChangerHero()
    const yellow = hero.archetype!.forms![2]!
    yellow.upgrades = [P('speed'), P('speed')]
    expect(messages(hero)).toEqual(['Yellow form 1 raises 2 different dice one size each.'])
    yellow.upgrades = [P('speed'), Q('banter')]
    expect(codes(hero)).toEqual(['form-upgrades'])
    yellow.upgrades = [P('agility'), Q('fitness')]
    expect(messages(hero)).toEqual(['Agility is already d12 in Yellow form 1; raise a different die.'])
    hero.archetype!.forms![0]!.upgrades = [P('agility')]
    expect(codes(hero)).toContain('form-upgrades')
  })

  it('applies the Yellow form’s upgrades to its traits', () => {
    const hero = formChangerHero()
    const yellow = hero.archetype!.forms![2]!
    const dice = Object.fromEntries(formTraits(hero, deriveTraits(hero).traits, yellow).map((t) => [t.trait.id, t.die]))
    expect(dice).toMatchObject({ speed: 'd12', fitness: 'd12', agility: 'd12', alertness: 'd8' })
  })

  it('each form takes a form ability that uses that form’s dice', () => {
    const hero = formChangerHero()
    const forms = hero.archetype!.forms!
    forms[1]!.ability = { source: 'archetype.form', name: 'Strong Form', uses: [P('fire')] }
    expect(messages(hero)).toEqual(['Each Green form needs a different form ability; Strong Form is used twice.', 'Each Green form needs a different form ability; Strong Form is used twice.'])
    forms[1]!.ability = { source: 'archetype.form', name: 'Clever Form', uses: [P('speed')] }
    expect(codes(hero)).toEqual(['slot-not-held'])
    delete forms[1]!.ability
    expect(messages(hero)).toEqual(["Choose Green form 2's form ability."])
  })

  it('form abilities are recorded as form abilities', () => {
    const hero = formChangerHero()
    hero.archetype!.forms![0]!.ability!.source = 'archetype.green'
    expect(check(hero)).toEqual([
      { step: 'archetype', code: 'form-ability-source', message: "Brute's ability should be recorded as a form ability.", part: 'form:green:0' },
    ])
  })

  it('the ability retcon can change a form ability, checked against that form’s dice (the user’s ruling)', () => {
    const hero = formChangerHero()
    hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'archetype.form', name: 'Strong Form' }, uses: [P('agility')] }
    expect(check(hero)).toEqual([])
    expect(buildSheet(hero).forms[0]?.ability?.text).toBe('Attack using Agility. Use your Max die.')
    // Speed isn't one of Brute's powers.
    hero.retcon.uses = [P('speed')]
    expect(codes(hero)).toEqual(['slot-not-held'])
    hero.retcon.uses = [P('strength')]
    expect(codes(hero)).toEqual(['retcon-no-change'])
    hero.retcon.ability.name = 'Tricky Form'
    expect(messages(hero)).toEqual(['This retcon changes Tricky Form, which none of your forms has.'])
    // The general ability retcon check leaves form abilities to this module.
    expect(buildSheet(hero).warnings.filter((w) => w.code === 'retcon-ability-missing')).toHaveLength(1)
  })

  it('a form-ability retcon on a hero without forms is flagged', () => {
    const hero = completeHero()
    hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'archetype.form', name: 'Strong Form' }, uses: [P('agility')] }
    expect(codes(hero)).toEqual(['retcon-ability-missing'])
    // Recorded forms on a non-Form-Changer are flagged too, independently.
    hero.archetype!.forms = formChangerHero().archetype!.forms
    expect(codes(hero)).toEqual(['retcon-ability-missing', 'unexpected-forms'])
  })

  it('Yellow form may take an unused Green form ability, but not a Green form’s', () => {
    const hero = formChangerHero()
    const yellow = hero.archetype!.forms![2]!
    yellow.ability = { source: 'archetype.form', name: 'Tricky Form', uses: [P('agility')] }
    expect(check(hero)).toEqual([])
    yellow.ability = { source: 'archetype.form', name: 'Strong Form', uses: [P('agility')] }
    expect(messages(hero)).toEqual(["Strong Form isn't a form ability Yellow form 1 can take."])
  })

  it('shows forms on the sheet', () => {
    const sheet = buildSheet(formChangerHero())
    expect(sheet.forms.map((f) => `${f.zone} ${f.name}: ${f.ability?.name}`)).toEqual([
      'green Brute: Strong Form',
      'green Green form 2: Clever Form',
      'yellow Yellow form 1: Agile Form',
    ])
    expect(sheet.forms[0]?.ability?.text).toBe('Attack using Strength. Use your Max die.')
  })

  it('warns about forms on other archetypes', () => {
    const hero = completeHero()
    hero.archetype!.forms = formChangerHero().archetype!.forms
    hero.archetype!.minionForms = { forms: [] }
    expect(codes(hero)).toEqual(['unexpected-forms', 'unexpected-forms'])
  })
})

describe('Minion-Maker minion forms', () => {
  const minionMaker = minionMakerHero

  it('chooses as many forms as the chosen quality’s max value', () => {
    expect(check(minionMaker())).toEqual([])
    const hero = minionMaker()
    hero.archetype!.minionForms!.forms.pop()
    expect(messages(hero)).toEqual(['Choose 6 minion forms (your Creativity is d6); you have 5.'])
  })

  it('any quality the hero has will do (the user’s ruling)', () => {
    const hero = minionMaker()
    hero.archetype!.minionForms!.quality = Q('alertness')
    expect(messages(hero)).toEqual(['Choose 8 minion forms (your Alertness is d8); you have 6.'])
    hero.archetype!.minionForms!.quality = Q('history')
    expect(codes(hero)).toEqual(['minion-forms-quality'])
    hero.archetype!.minionForms!.quality = P('robotics')
    expect(codes(hero)).toEqual(['minion-forms-quality'])
    delete hero.archetype!.minionForms!.quality
    expect(messages(hero)).toEqual(['Choose the quality that sets how many minion forms you have.'])
  })

  it('warns about unknown and repeated forms', () => {
    const hero = minionMaker()
    hero.archetype!.minionForms!.forms[5] = 'Autonomous'
    expect(codes(hero)).toEqual(['minion-form-twice'])
    hero.archetype!.minionForms!.forms[5] = 'Laser Shark'
    expect(codes(hero)).toEqual(['unknown-minion-form'])
  })

  it('shows chosen minion forms on the sheet', () => {
    expect(buildSheet(minionMaker()).minionForms.map((f) => f.name)).toEqual(['Autonomous', 'Burrowing', 'Floating', 'Pack', 'Explosive', 'Reinforced'])
  })
})

describe('editing forms', () => {
  const formChanger = archetypesById.get('form-changer')!
  const spec = formChanger.forms!

  it('offers the hero’s power dice, and their powers plus the archetype’s list', () => {
    const hero = formChangerHero()
    const traits = deriveTraits(hero).traits
    expect(formDice(traits)).toEqual(['d12', 'd10', 'd8', 'd8', 'd6'])
    const ids = formPowerOptions(formChanger, traits).map((t) => t.id)
    expect(ids).toContain('fire') // the hero's, though not on the archetype's lists
    expect(ids).toContain('strength') // Athletic, on the list
    expect(formPowerOptions(formChanger, traits).every((t) => t.kind === 'power')).toBe(true)
  })

  it('gives the Yellow form its own abilities and the Green ones neither Green form took', () => {
    const forms = formChangerHero().archetype!.forms!
    expect(formAbilityOptions(spec, forms, forms[0]!)).toEqual(spec.greenFormAbilities)
    const yellow = formAbilityOptions(spec, forms, forms[2]!).map((a) => a.name)
    expect(yellow).toContain('Agile Form')
    expect(yellow).toContain('Tough Form')
    expect(yellow).not.toContain('Strong Form')
    expect(yellow).not.toContain('Clever Form')
  })

  it('lets the Yellow form raise its powers and the hero’s qualities, but not a d12', () => {
    const hero = formChangerHero()
    const form = hero.archetype!.forms![2]!
    const options = formUpgradeOptions(hero, deriveTraits(hero).traits, form).map((t) => t.trait.id)
    expect(options).toContain('speed')
    expect(options).toContain('fitness')
    expect(options).not.toContain('agility') // d12 in this form
  })

  it('shows one slot per form asked for, plus extras, and edits them in place', () => {
    const forms = formChangerHero().archetype!.forms!
    expect(formSlots(forms, 'green', 2)).toEqual([{ form: forms[0], index: 0 }, { form: forms[1], index: 1 }])
    expect(formSlots([], 'yellow', 1)).toEqual([{}])
    expect(formSlots(forms, 'yellow', 0)).toHaveLength(1)
    const added = setFormSlot(forms, {}, { zone: 'yellow', powers: [] })
    expect(added).toHaveLength(4)
    const renamed = setFormSlot(forms, { index: 1 }, { ...forms[1]!, name: 'Blaze' })
    expect(renamed[1]!.name).toBe('Blaze')
    expect(setFormSlot(forms, { index: 0 }, undefined)).toEqual([forms[1], forms[2]])
    expect(setFormSlot(forms, {}, undefined)).toEqual(forms)
  })
})
