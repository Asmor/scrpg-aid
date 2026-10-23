import { describe, expect, it } from 'vitest'
import { A, completeHero, P } from '../test/heroes'
import { checkPrinciples, heroPrinciples } from './principles'

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

  it('skips the category check for Modular, whose principle comes from another archetype', () => {
    const hero = completeHero()
    hero.archetype = { id: 'modular', traits: [A(P('flight'), 'd12')], abilities: [], bonus: [], principle: { id: 'destiny' } }
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
