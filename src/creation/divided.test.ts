import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import { A, completeHero, dividedHero, formChangerHero, P, Q } from '../test/heroes'
import { ROLEPLAYING_QUALITY } from './traits'
import { checkAbilityRetcon } from './abilities'
import { checkDivided, heroicTraits, outTraits, placeTrait, splitCandidates, traitsInAnyForm } from './divided'
import { computeHealth, healthTraitOptions, statusDice } from './health'
import { archetypeName, checkSecondary } from './layers'
import { findRedAbility } from './lookup'
import { checkRetcon } from './retcons'
import { buildSheet } from './sheet'
import { deriveTraits } from './traits'

const check = (hero: Hero) => checkDivided(hero, deriveTraits(hero).traits)
const codes = (hero: Hero) => check(hero).map((w) => w.code)
const messages = (hero: Hero) => check(hero).map((w) => w.message)

describe('Divided', () => {
  it('a legal Divided Speedster has no warnings at all', () => {
    const sheet = buildSheet(dividedHero())
    expect(sheet.warnings).toEqual([])
    expect(sheet.characteristics.archetype).toBe('Divided Speedster')
    // The second archetype's abilities, Divided's ability, and the transition ability are all on the sheet.
    expect(sheet.abilities.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Always on the Move', 'Speedy Analysis', 'Divided Psyche', 'Transform', 'Principle of the Detective']),
    )
    expect(sheet.powers.map((t) => t.trait.id)).toContain('speed')
  })

  it('needs a second archetype that isn’t Divided or Modular', () => {
    const hero = dividedHero()
    delete hero.archetype!.secondary
    expect(checkSecondary(hero).map((w) => w.message)).toEqual(['Choose the archetype Divided builds on.'])
    hero.archetype!.secondary = { id: 'modular', traits: [], abilities: [], bonus: [] }
    expect(checkSecondary(hero).map((w) => w.code)).toEqual(['secondary-excluded'])
    // Nor can Modular build on Divided (the user's ruling).
    const modular = completeHero()
    modular.archetype = { id: 'modular', traits: [], abilities: [], bonus: [], secondary: { id: 'divided', traits: [], abilities: [], bonus: [] } }
    expect(checkSecondary(modular).map((w) => w.message)).toEqual(["Modular can't build on Divided."])
    hero.archetype!.secondary = { id: 'nope', traits: [], abilities: [], bonus: [] }
    expect(checkSecondary(hero).map((w) => w.code)).toEqual(['unknown-entry'])
    const nested = dividedHero()
    nested.archetype!.secondary!.secondary = { id: 'speedster', traits: [], abilities: [], bonus: [] }
    expect(checkSecondary(nested).map((w) => w.code)).toEqual(['unexpected-secondary'])
    const plain = completeHero()
    plain.archetype!.secondary = { id: 'blaster', traits: [], abilities: [], bonus: [] }
    expect(checkSecondary(plain).map((w) => w.code)).toEqual(['unexpected-secondary'])
    plain.archetype = null
    expect(checkSecondary(plain)).toEqual([])
  })

  it('needs a transition method and its ability', () => {
    const hero = dividedHero()
    delete hero.archetype!.divided!.transitionMethod
    expect(messages(hero)).toEqual(['Choose how you change between your civilian and heroic forms.'])
    hero.archetype!.divided!.transitionMethod = 'teleport'
    expect(codes(hero)).toEqual(['unknown-entry'])
    hero.archetype!.divided!.transitionMethod = 'device'
    expect(messages(hero)).toEqual(["Transform isn't a Device Transition ability."])
    delete hero.archetype!.divided!.transitionAbility
    expect(messages(hero)).toEqual(['Choose your Device Transition ability.'])
    hero.archetype!.divided!.transitionAbility = { source: 'archetype.green', name: 'Device Transform' }
    expect(codes(hero)).toEqual(['transition-ability-source'])
  })

  it('Possess Person uses a power from the second archetype (the user’s ruling)', () => {
    const hero = dividedHero()
    hero.archetype!.divided = { transitionMethod: 'merging-possession', transitionAbility: { source: 'archetype.transition', name: 'Possess Person', uses: [P('speed')] } }
    expect(check(hero)).toEqual([])
    hero.archetype!.divided.transitionAbility!.uses = [P('agility')]
    expect(codes(hero)).toEqual(['slot-wrong-trait'])
  })

  it('takes one Divided ability', () => {
    const hero = dividedHero()
    hero.archetype!.abilities = []
    expect(messages(hero)).toEqual(['Choose 1 of the Divided abilities; you have 0.'])
  })

  describe('Split Form', () => {
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

    it('accepts two powers and two qualities always available, and the rest split between forms', () => {
      expect(check(splitHero())).toEqual([])
      expect(buildSheet(splitHero()).divided?.split?.heroic).toEqual(['Fire', 'Flight'])
    })

    it('needs the split recorded, with exactly two and two always available', () => {
      const hero = splitHero()
      delete hero.archetype!.divided!.split
      expect(codes(hero)).toEqual(['split-missing'])
      const three = splitHero()
      three.archetype!.divided!.split!.always = [P('speed'), P('agility'), P('fire'), Q('fitness')]
      three.archetype!.divided!.split!.heroic = [P('flight'), Q('alertness')]
      expect(codes(three)).toEqual(['split-always'])
    })

    it('places every trait exactly once (the roleplaying quality is always available)', () => {
      const hero = splitHero()
      hero.archetype!.divided!.split!.heroic = [P('flight')]
      expect(messages(hero)).toEqual(['Split Form: put Fire in your civilian form, your heroic form, or the ones you always have.'])
      hero.archetype!.divided!.split!.heroic = [P('fire'), P('flight'), P('speed')]
      expect(codes(hero)).toEqual(['split-twice'])
      hero.archetype!.divided!.split!.heroic = [P('fire'), P('flight'), P('telepathy')]
      expect(codes(hero)).toEqual(['slot-not-held'])
    })

    it('leaves the roleplaying quality out of the split (p. 94–95)', () => {
      const hero = splitHero()
      hero.archetype!.divided!.split!.always = [P('speed'), P('agility'), Q('fitness'), ROLEPLAYING_QUALITY]
      hero.archetype!.divided!.split!.civilian = [P('awareness'), Q('alertness')]
      // It doesn't count as one of the two qualities, either.
      expect(codes(hero)).toEqual(['split-always', 'split-roleplaying'])
    })

    it('leaves out powers and qualities only one personality’s bonus gives (the user’s ruling)', () => {
      const hero = splitHero()
      hero.archetype!.divided!.heroicPersonality = { id: 'impulsive', bonus: [A(P('leaping'), 'd8')], outUses: [] }
      hero.archetype!.divided!.outFrom = 'civilian'
      expect(heroicTraits(hero)?.map((t) => t.trait.id)).toContain('leaping')
      // Leaping only exists in the heroic form, so the split doesn't need it…
      expect(check(hero).map((w) => w.code)).not.toContain('split-unplaced')
      // …and can't list it.
      hero.archetype!.divided!.split!.heroic = [P('fire'), P('flight'), P('leaping')]
      expect(codes(hero)).toContain('split-form-only')
    })

    it('lists what the split divides, and moves a trait between places', () => {
      const hero = splitHero()
      const ids = splitCandidates(hero, deriveTraits(hero).traits).map((t) => t.trait.id)
      expect(ids).toEqual(['fitness', 'alertness', 'agility', 'fire', 'awareness', 'speed', 'flight'])
      // A bonus only the heroic personality gives isn't divided.
      hero.archetype!.divided!.heroicPersonality = { id: 'impulsive', bonus: [A(P('leaping'), 'd8')], outUses: [] }
      expect(splitCandidates(hero, deriveTraits(hero).traits).map((t) => t.trait.id)).not.toContain('leaping')
      const split = hero.archetype!.divided!.split!
      expect(placeTrait(split, P('speed'), 'heroic')).toEqual({ always: [P('agility'), Q('fitness'), Q('alertness')], civilian: [P('awareness')], heroic: [P('fire'), P('flight'), P('speed')] })
      expect(placeTrait(split, P('fire'), undefined).heroic).toEqual([P('flight')])
      expect(placeTrait(undefined, Q('fitness'), 'always')).toEqual({ always: [Q('fitness')], civilian: [], heroic: [] })
    })

    it('a split without Split Form is flagged', () => {
      const hero = splitHero()
      hero.archetype!.abilities = [{ source: 'archetype.green', name: 'Divided Psyche' }]
      expect(codes(hero)).toEqual(['unexpected-split'])
    })
  })

  describe('two personalities', () => {
    const twoFaced = () => {
      const hero = dividedHero()
      hero.archetype!.divided!.heroicPersonality = { id: 'impulsive', bonus: [A(P('flight'), 'd8')], outUses: [] }
      hero.archetype!.divided!.outFrom = 'civilian'
      return hero
    }

    it('the heroic personality’s bonus applies only to the heroic form (the user’s ruling)', () => {
      const hero = twoFaced()
      expect(check(hero)).toEqual([])
      expect(deriveTraits(hero).traits.find((t) => t.trait.id === 'flight')?.die).toBe('d6')
      expect(heroicTraits(hero)?.find((t) => t.trait.id === 'flight')?.die).toBe('d8')
      expect(heroicTraits(dividedHero())).toBeUndefined()
      hero.archetype!.divided!.heroicPersonality!.bonus = [A(P('flight'), 'd12')]
      expect(messages(hero)).toEqual(["Heroic form: Impulsive's bonus gives Flight a d8, not a d12."])
    })

    it('each form has its own status dice, and Health uses the larger Red die (the user’s ruling)', () => {
      const hero = twoFaced()
      hero.archetype!.divided!.heroicPersonality!.id = 'nurturing'
      hero.archetype!.divided!.heroicPersonality!.bonus = []
      expect(statusDice(hero)?.red).toBe('d8')
      expect(statusDice(hero, 'heroic')?.red).toBe('d12')
      // 8 + d12 (12) + Agility d10 (10) + 4 = 34
      expect(computeHealth(hero, deriveTraits(hero).traits).max).toBe(34)
      expect(buildSheet(hero).heroicStatusDice?.red).toBe('d12')
    })

    it('the player chooses whose Out ability they use (the user’s ruling)', () => {
      const hero = twoFaced()
      hero.archetype!.divided!.heroicPersonality!.id = 'stoic'
      hero.archetype!.divided!.heroicPersonality!.bonus = []
      hero.archetype!.divided!.heroicPersonality!.outUses = [Q('alertness')]
      expect(buildSheet(hero).outAbility).toBe('Boost an ally by rolling your single Fitness die.')
      hero.archetype!.divided!.outFrom = 'heroic'
      expect(buildSheet(hero).outAbility).toBe('Defend an ally by rolling your single Alertness die.')
      delete hero.archetype!.divided!.outFrom
      expect(codes(hero)).toEqual(['out-from-missing'])
    })

    it('the heroic Out ability uses the heroic form’s powers and qualities (the user’s ruling)', () => {
      const hero = twoFaced()
      hero.archetype!.abilities = [{ source: 'archetype.green', name: 'Split Form' }]
      hero.archetype!.divided!.split = {
        always: [P('speed'), P('agility'), Q('fitness'), Q('alertness')],
        civilian: [P('awareness')],
        heroic: [P('fire'), P('flight')],
      }
      hero.archetype!.divided!.heroicPersonality = { id: 'decisive', bonus: [], outUses: [P('awareness')] }
      hero.archetype!.divided!.outFrom = 'heroic'
      const traits = deriveTraits(hero).traits
      expect(outTraits(hero, traits).map((t) => t.trait.id)).not.toContain('awareness')
      expect(buildSheet(hero).warnings.map((w) => w.code)).toContain('slot-not-held')
      hero.archetype!.divided!.heroicPersonality.outUses = [P('fire')]
      expect(buildSheet(hero).warnings).toEqual([])
      // The ability retcon on the Out ability is checked against the same form.
      hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'out', name: 'Out ability' }, uses: [P('awareness')] }
      expect(checkAbilityRetcon(hero, traits, outTraits(hero, traits)).map((w) => w.code)).toEqual(['slot-not-held'])
    })

    it('Health may use a power or quality from either form (the user’s ruling)', () => {
      const hero = twoFaced()
      hero.archetype!.divided!.heroicPersonality!.bonus = [A(P('agility'), 'd12')]
      expect(traitsInAnyForm(hero, deriveTraits(hero).traits).find((t) => t.trait.id === 'agility')?.die).toBe('d12')
      // 8 + Red d8 (8) + heroic Agility d12 (12) + 4 = 32
      expect(computeHealth(hero, deriveTraits(hero).traits)).toMatchObject({ max: 32, warnings: [] })
    })

    it('the status retcon raises the die of the form the player picks (the user’s ruling)', () => {
      const hero = twoFaced()
      hero.archetype!.divided!.heroicPersonality = { id: 'nurturing', bonus: [] }
      hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
      expect(checkRetcon(hero).map((w) => w.code)).toEqual(['retcon-form-missing'])
      expect(statusDice(hero)?.red).toBe('d8')
      hero.retcon.form = 'civilian'
      expect(checkRetcon(hero)).toEqual([])
      expect(statusDice(hero)?.red).toBe('d10')
      expect(statusDice(hero, 'heroic')?.red).toBe('d12')
      // Nurturing's Red die is already d12.
      hero.retcon.form = 'heroic'
      expect(checkRetcon(hero).map((w) => w.code)).toEqual(['retcon-not-allowed'])
      // With both at d12, the retcon isn't available at all.
      hero.personality = { id: 'naive', bonus: [], outUses: [] }
      expect(checkRetcon(hero).map((w) => w.message)).toEqual(['Your Red status die is already d12 in both forms. Choose a different retcon.'])
      // With one personality, there's only the civilian form's die to raise.
      const single = dividedHero()
      single.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie', form: 'heroic' }
      expect(checkRetcon(single).map((w) => w.code)).toEqual(['retcon-form'])
      expect(statusDice(single)?.red).toBe('d10')
    })

    it('needs a different personality for the heroic form', () => {
      const hero = twoFaced()
      hero.archetype!.divided!.heroicPersonality!.id = hero.personality!.id
      expect(codes(hero)).toEqual(['same-personality'])
    })

    it('flags a heroic Out choice without a second personality, and unknown personalities', () => {
      const hero = dividedHero()
      hero.archetype!.divided!.outFrom = 'heroic'
      expect(codes(hero)).toEqual(['out-from-missing'])
      hero.archetype!.divided!.heroicPersonality = { id: 'nope', bonus: [] }
      expect(codes(hero)).toEqual(['unknown-entry'])
    })
  })

  it('takes a Responsibility principle on Divided, not the second archetype', () => {
    const hero = dividedHero()
    hero.archetype!.principle = { id: 'gearhead' }
    hero.archetype!.secondary!.principle = { id: 'business' }
    const principleCodes = buildSheet(hero).warnings.filter((w) => w.code.startsWith('principle') || w.code.startsWith('secondary')).map((w) => w.code)
    expect(principleCodes).toEqual(['principle-category', 'secondary-principle'])
  })

  it('Form-Changer as the second archetype gets its forms (the user’s ruling)', () => {
    const fc = formChangerHero().archetype!
    delete fc.principle
    const hero = dividedHero()
    hero.archetype!.secondary = fc
    const sheet = buildSheet(hero)
    expect(sheet.characteristics.archetype).toBe('Divided Form-Changer')
    expect(sheet.forms).toHaveLength(3)
    expect(sheet.warnings).toEqual([])
    // Forms recorded on Divided itself are in the wrong place.
    hero.archetype!.forms = fc.forms
    expect(buildSheet(hero).warnings.map((w) => w.code)).toContain('unexpected-forms')
  })

  it('puts the second archetype’s fixed abilities on the sheet, and its Health options apply', () => {
    const hero = dividedHero()
    hero.archetype!.secondary = {
      id: 'armored',
      traits: [A(P('power-suit'), 'd12'), A(Q('banter'), 'd6')],
      abilities: [],
      bonus: [],
    }
    const sheet = buildSheet(hero)
    expect(sheet.characteristics.archetype).toBe('Divided Armored')
    expect(sheet.abilities.map((a) => a.name)).toContain('Armored')
    expect(healthTraitOptions(hero, deriveTraits(hero).traits).map((t) => t.trait.id)).toContain('power-suit')
  })

  it('a Divided Minion-Maker gets the extra Red options', () => {
    const hero = dividedHero()
    hero.archetype!.secondary = { id: 'minion-maker', traits: [A(P('robotics'), 'd12'), A(Q('creativity'), 'd6')], abilities: [], bonus: [] }
    expect(findRedAbility(hero, { source: 'red', name: 'Swarm Combat' })).toMatchObject({ found: true, category: undefined })
    expect(findRedAbility(dividedHero(), { source: 'red', name: 'Swarm Combat' })).toMatchObject({ found: false })
  })

  it('the ability retcon can target the transition ability or the second archetype’s abilities', () => {
    const hero = dividedHero()
    const traits = deriveTraits(hero).traits
    hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'archetype.green', name: 'Always on the Move' }, uses: [P('agility')] }
    expect(checkAbilityRetcon(hero, traits)).toEqual([])
    expect(buildSheet(hero).abilities.find((a) => a.name === 'Always on the Move')?.text).toContain('Agility')
    hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'archetype.transition', name: 'Transform' }, uses: [] }
    expect(checkAbilityRetcon(hero, traits).map((w) => w.code)).toEqual(['retcon-no-change'])
  })

  it('flags abilities and Divided choices recorded in the wrong place', () => {
    const hero = dividedHero()
    hero.archetype!.abilities.push({ source: 'archetype.yellow', name: 'Speedy Analysis', uses: [P('flight')] })
    expect(codes(hero)).toEqual(['unknown-ability'])
    // A wrong fixed-ability pick is flagged once, by the fixed-ability check.
    const fixed = dividedHero()
    fixed.archetype!.abilities.push({ source: 'archetype.fixedGreen', name: 'Divided Psyche' })
    expect(buildSheet(fixed).warnings.filter((w) => w.code === 'unknown-ability')).toHaveLength(1)
    const nested = dividedHero()
    nested.archetype!.secondary!.divided = { transitionMethod: 'device' }
    expect(codes(nested)).toEqual(['unexpected-divided'])
  })

  it('names the archetype, and ignores Divided choices on other archetypes', () => {
    expect(archetypeName(completeHero())).toBe('Speedster')
    const hero = completeHero()
    hero.archetype = null
    expect(archetypeName(hero)).toBeUndefined()
    expect(check(hero)).toEqual([])
    const plain = completeHero()
    plain.archetype!.divided = { transitionMethod: 'device' }
    expect(codes(plain)).toEqual(['unexpected-divided'])
    // A second personality left on another archetype doesn't change the hero.
    plain.archetype!.divided = { heroicPersonality: { id: 'nurturing', bonus: [], outUses: [Q('alertness')] }, outFrom: 'heroic' }
    expect(statusDice(plain, 'heroic')).toBeUndefined()
    expect(buildSheet(plain).outAbility).toBe(buildSheet(completeHero()).outAbility)
    expect(computeHealth(plain, deriveTraits(plain).traits).max).toBe(30)
  })
})
