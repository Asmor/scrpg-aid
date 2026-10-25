import { describe, expect, it } from 'vitest'
import { completeHero } from '../test/heroes'
import { checkPrinciples, heroPrinciples, principleOf } from './principles'
import { buildSheet } from './sheet'
import type { CustomPrinciple } from '../hero/model'

const messages = (hero: Parameters<typeof checkPrinciples>[0]) => checkPrinciples(hero).map((w) => w.message)

describe('principles', () => {
  it('accepts a principle from each step’s category', () => {
    expect(checkPrinciples(completeHero())).toEqual([])
  })

  it('asks for missing principles', () => {
    const hero = completeHero()
    delete hero.background!.principle
    delete hero.archetype!.principle
    expect(messages(hero)).toEqual(['Choose a principle of Responsibility.', 'Choose a principle of Expertise.'])
  })

  it('warns about the wrong category, unknown principles, and unfilled blanks', () => {
    const hero = completeHero()
    hero.background!.principle = { id: 'destiny' }
    expect(messages(hero)).toEqual(["This step's principle comes from Responsibility, but Principle of Destiny is Esoteric."])
    hero.background!.principle = { id: 'nope' }
    expect(messages(hero)).toEqual(['Unknown principle "nope".'])
    hero.background = { id: 'unremarkable', qualities: [], principle: { id: 'energy-element' } }
    expect(checkPrinciples(hero).map((w) => w.code)).toContain('principle-blank')
  })

  it('takes Modular’s principle category from the archetype it builds on', () => {
    const hero = completeHero()
    const speedster = hero.archetype!
    delete speedster.principle
    hero.archetype = { id: 'modular', traits: [], abilities: [], bonus: [], principle: { id: 'gearhead' }, secondary: speedster }
    // Speedster's category is Expertise.
    expect(checkPrinciples(hero)).toEqual([])
    hero.archetype.principle = { id: 'destiny' }
    expect(messages(hero)).toEqual(["This step's principle comes from Expertise, but Principle of Destiny is Esoteric."])
    // Without a known second archetype there's no category to check against.
    delete hero.archetype.secondary
    expect(checkPrinciples(hero)).toEqual([])
    delete hero.archetype.principle
    expect(checkPrinciples(hero)).toEqual([])
  })

  it('applies a retcon that replaces a principle with any principle', () => {
    const hero = completeHero()
    hero.retcon = { id: 'change-principle', kind: 'changePrinciple', replace: 'archetype', with: { id: 'destiny' } }
    expect(checkPrinciples(hero)).toEqual([])
    expect(heroPrinciples(hero)).toEqual({ background: { id: 'business' }, archetype: { id: 'destiny' } })
    hero.retcon.with = { id: 'energy-element' }
    expect(messages(hero)).toEqual(['Fill in [Energy/Element] for Principle of [Energy/Element].'])
    hero.retcon = { id: 'change-principle', kind: 'changePrinciple', replace: 'background', with: { id: 'business' } }
    expect(messages(hero)).toEqual(['This retcon should replace a principle with a different one.'])
  })
})

describe('custom principles (p. 141)', () => {
  const custom = (over: Partial<CustomPrinciple> = {}): CustomPrinciple => ({
    category: 'responsibility',
    name: 'Principle of the Lighthouse',
    roleplaying: 'You keep a light on for anyone lost at sea.',
    minorTwist: 'Who did you fail to guide home?',
    majorTwist: 'What wreck is on your conscience?',
    greenAbility: { name: '', text: 'Overcome a danger at sea and use your Max die.' },
    ...over,
  })

  it('accepts a filled-in one from the step’s category, and puts it on the sheet', () => {
    const hero = completeHero()
    hero.background!.principle = { id: 'custom', custom: custom() }
    expect(checkPrinciples(hero)).toEqual([])
    const sheet = buildSheet(hero)
    expect(sheet.principles[0]?.name).toBe('Principle of the Lighthouse')
    // With no name of its own, the Green ability takes the principle's.
    expect(sheet.abilities).toContainEqual(expect.objectContaining({ zone: 'green', name: 'Principle of the Lighthouse', text: 'Overcome a danger at sea and use your Max die.', source: 'principle' }))
  })

  it('asks for what’s missing, and checks the category', () => {
    const hero = completeHero()
    hero.background!.principle = { id: 'custom', custom: custom({ name: ' ', minorTwist: '', greenAbility: { name: '', text: '' } }) }
    expect(messages(hero)).toEqual(['Fill in your custom principle: its name, a minor twist question and its Green ability.'])
    hero.background!.principle = { id: 'custom', custom: custom({ category: 'esoteric' }) }
    expect(messages(hero)).toEqual(['This step\'s principle comes from Responsibility, but Principle of the Lighthouse is Esoteric.'])
    hero.background!.principle = { id: 'custom' }
    expect(messages(hero)).toEqual(['Write your custom principle.'])
    expect(principleOf({ id: 'custom' })).toBeUndefined()
  })

  it('lets the retcon swap one custom principle for a different one', () => {
    const hero = completeHero()
    hero.background!.principle = { id: 'custom', custom: custom() }
    hero.retcon = { id: 'change-principle', kind: 'changePrinciple', replace: 'background', with: { id: 'custom', custom: custom({ name: 'Principle of the Harbour' }) } }
    expect(checkPrinciples(hero)).toEqual([])
    hero.retcon.with = { id: 'custom', custom: custom() }
    expect(messages(hero)).toEqual(['This retcon should replace a principle with a different one.'])
  })
})
