import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import { A, completeHero, minionMakerHero, P, Q } from '../test/heroes'
import { checkRedAbilities, hasRedCategory, redPickSection } from './red'
import { redAbilityCategories } from '../rules/data'
import { deriveTraits } from './traits'

const check = (hero: Hero) => checkRedAbilities(hero, deriveTraits(hero).traits)
const messages = (hero: Hero) => check(hero).map((w) => w.message)

describe('checkRedAbilities', () => {
  it('accepts two legal Red abilities', () => {
    expect(check(completeHero())).toEqual([])
  })

  it('asks for two once the hero reaches the step, and not before', () => {
    const hero = completeHero()
    hero.redAbilities.pop()
    expect(messages(hero)).toEqual(['Choose 2 Red abilities; you have 1.'])
    hero.personality = null
    expect(check(hero)).toEqual([])
    // Too many is flagged even before the step.
    hero.redAbilities.push(
      { source: 'red', name: 'Push Your Limits', category: 'power:athletic' },
      { source: 'red', name: 'Reactive Strike', category: 'power:athletic', uses: [P('speed')] },
    )
    expect(messages(hero)).toEqual(['Choose 2 Red abilities; you have 3.'])
  })

  it('needs the ability’s category: names that repeat must say which list', () => {
    const hero = completeHero()
    hero.redAbilities[1] = { source: 'red', name: 'Powerful Strike', uses: [P('fire')] }
    expect(messages(hero)).toEqual([
      'Powerful Strike appears in more than one Red ability list; choose which one you took it from.',
    ])
    hero.redAbilities[1] = { source: 'red', name: 'Powerful Strike', category: 'power:elemental-energy', uses: [P('fire')] }
    expect(check(hero)).toEqual([])
    // A unique name doesn't need the category recorded.
    hero.redAbilities[1] = { source: 'red', name: 'Push Your Limits' }
    expect(check(hero)).toEqual([])
  })

  it('warns about unknown abilities and wrong categories', () => {
    const hero = completeHero()
    hero.redAbilities[1] = { source: 'red', name: 'Made Up' }
    expect(messages(hero)).toEqual(["Made Up isn't a Red ability you can choose."])
    hero.redAbilities[1] = { source: 'red', name: 'Push Your Limits', category: 'power:mobility' }
    expect(messages(hero)).toEqual(["Push Your Limits isn't a Red ability you can choose."])
  })

  it('slots must use a trait from the ability’s category', () => {
    const hero = completeHero()
    hero.redAbilities[0]!.uses = [P('fire')]
    expect(messages(hero)).toEqual(['Paragon Feat must use an Athletic power, not Fire.'])
  })

  it('an ability that uses nothing needs a trait in its category at d6 or higher', () => {
    const hero = completeHero()
    hero.redAbilities[1] = { source: 'red', name: 'Heroic Sacrifice', category: 'quality:social' }
    expect(messages(hero)).toEqual(['To take Heroic Sacrifice, you need a Social quality at d6 or higher.'])
    hero.background!.qualities = [A(Q('fitness'), 'd10'), A(Q('persuasion'), 'd8')]
    expect(check(hero)).toEqual([])
  })

  it('checks requirements for abilities that name their trait', () => {
    const hero = completeHero()
    hero.redAbilities[1] = { source: 'red', name: 'Major Regeneration', category: 'power:athletic' }
    expect(messages(hero)).toEqual(["Major Regeneration requires Vitality, which you don't have."])
  })

  it('warns about taking the same ability twice', () => {
    const hero = completeHero()
    hero.redAbilities[1] = { ...hero.redAbilities[0]!, customName: 'Something Else' }
    expect(messages(hero)).toEqual(['You already have a Red ability called Paragon Feat; choose a different one.'])
  })

  it('never allows two Red abilities with the same name, even from different lists (the user’s ruling)', () => {
    const hero = completeHero()
    hero.powerSource!.powers[2] = A(P('stone'), 'd8')
    hero.archetype!.abilities = []
    hero.redAbilities = [
      { source: 'red', name: 'Powerful Strike', category: 'power:elemental-energy', uses: [P('fire')] },
      { source: 'red', name: 'Powerful Strike', category: 'power:materials', uses: [P('stone')] },
    ]
    expect(messages(hero)).toEqual(['You already have a Red ability called Powerful Strike; choose a different one.'])
    // A player's own name for one of them doesn't make them different.
    hero.redAbilities[1]!.customName = 'Rock Smash'
    expect(messages(hero)).toEqual(['You already have a Red ability called Powerful Strike; choose a different one.'])
  })

  it('limits only one trait slot to the category: Resurrection and Harmony', () => {
    const hero = completeHero()
    hero.powerSource!.powers[2] = A(P('density-control'), 'd8')
    hero.redAbilities[1] = {
      source: 'red',
      name: 'Resurrection',
      category: 'power:self-control',
      uses: [P('density-control'), Q('fitness')],
    }
    expect(check(hero)).toEqual([])
    hero.redAbilities[1].uses = [P('agility'), Q('fitness')]
    expect(messages(hero)).toEqual(['Resurrection must use a Self Control power, not Agility.'])
    hero.redAbilities[1] = { source: 'red', name: 'Harmony', category: 'quality:mental', uses: [Q('alertness'), P('fire')] }
    expect(check(hero)).toEqual([])
    hero.redAbilities[1].uses = [Q('fitness'), P('fire')]
    expect(messages(hero)).toEqual(['Harmony must use a Mental quality, not Fitness.'])
  })

  it('lets a Minion-Maker take its extra Red options, not tied to a category', () => {
    const hero = completeHero()
    hero.archetype = { id: 'minion-maker', traits: [A(P('robotics'), 'd12'), A(Q('creativity'), 'd6')], abilities: [], bonus: [] }
    hero.redAbilities[1] = { source: 'red', name: 'Swarm Combat', uses: [P('robotics')] }
    expect(check(hero)).toEqual([])
    const other = completeHero()
    other.redAbilities[1] = { source: 'red', name: 'Swarm Combat', uses: [P('agility')] }
    expect(messages(other)).toEqual(["Swarm Combat isn't a Red ability you can choose."])
  })

  it('checks a Red ability gained from a retcon too', () => {
    const hero = completeHero()
    hero.retcon = { id: 'extra-red-ability', kind: 'gainRedAbility', ability: { source: 'red', name: 'Reactive Strike', category: 'power:athletic', uses: [P('speed')] } }
    expect(check(hero)).toEqual([])
    hero.retcon.ability.uses = [Q('fitness')]
    expect(check(hero)).toEqual([
      { step: 'retcon', code: 'slot-wrong-trait', message: "[power] for Reactive Strike can't be Fitness." },
    ])
    hero.retcon.ability = { ...hero.redAbilities[0]! }
    expect(messages(hero)).toEqual(['You already have a Red ability called Paragon Feat; choose a different one.'])
  })

  it('flags picks in the Red list recorded with another source', () => {
    const hero = completeHero()
    hero.redAbilities[1] = { source: 'archetype.green', name: 'Push Your Limits', category: 'power:athletic' }
    expect(messages(hero)).toContain("Push Your Limits isn't recorded as a Red ability.")
  })
})

describe('listing Red abilities for the editor', () => {
  it('puts each pick under its category, the extra options, or aside', () => {
    const hero = minionMakerHero()
    expect(redPickSection(hero, { source: 'red', name: 'Paragon Feat', category: 'power:athletic' })).toBe('power:athletic')
    expect(redPickSection(hero, { source: 'red', name: 'Sacrifice' })).toBe('extra')
    expect(redPickSection(hero, { source: 'red', name: 'Nope' })).toBe('stray')
  })

  it('knows which categories the hero has a trait in', () => {
    const traits = deriveTraits(completeHero()).traits
    const byKey = (key: string) => redAbilityCategories.find((c) => (c.powerCategory ? `power:${c.powerCategory}` : `quality:${c.qualityCategory}`) === key)!
    expect(hasRedCategory(traits, byKey('power:athletic'))).toBe(true)
    expect(hasRedCategory(traits, byKey('power:psychic'))).toBe(false)
  })
})
