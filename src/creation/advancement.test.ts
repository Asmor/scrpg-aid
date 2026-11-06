import { describe, expect, it } from 'vitest'
import type { AdvancementChange, AdvancementEntry, Hero } from '../hero/model'
import { completeHero, dividedHero, formChangerHero, P, Q } from '../test/heroes'
import { abilitySwapOptions, advancedHero, changesInForce, checkAdvancement, swappablePicks, traitSwapIssues, traitSwapOptions } from './advancement'
import { buildSheet } from './sheet'
import { deriveTraits } from './traits'

const entry = (change: AdvancementChange, i: number): AdvancementEntry => ({ id: `e${i}`, at: '2026-11-04T12:00:00Z', kind: 'details', text: 'a change', change })
const withChanges = (...changes: AdvancementChange[]): Hero => {
  const hero = completeHero()
  hero.advancement = changes.map(entry)
  return hero
}
const codes = (hero: Hero) => checkAdvancement(hero).map((w) => w.code)

describe('advancement', () => {
  it('swaps a power at the same die, updating the abilities that use it, without creation warnings', () => {
    const hero = withChanges({ kind: 'swapPower', from: P('fire'), to: P('cold') })
    const now = advancedHero(hero)
    const traits = deriveTraits(now).traits
    expect(traits.find((t) => t.trait.id === 'cold')?.die).toBe('d8')
    expect(traits.some((t) => t.trait.id === 'fire')).toBe(false)
    expect(now.powerSource!.abilities.find((p) => p.name === 'Inflict')?.uses).toEqual([P('cold')])
    // The creation choices are left as they were.
    expect(hero.powerSource!.powers.some((a) => a.trait.id === 'fire')).toBe(true)
    const sheet = buildSheet(hero)
    expect(sheet.warnings).toEqual([])
    expect(sheet.powers.map((t) => t.trait.id)).toContain('cold')
    expect(sheet.advancement).toEqual({ backIssues: 0, collections: [], changes: ['a change'] })
  })

  it('applies changes in order, each to the hero as the ones before left them', () => {
    const hero = withChanges({ kind: 'swapPower', from: P('fire'), to: P('cold') }, { kind: 'swapPower', from: P('cold'), to: P('electricity') })
    expect(checkAdvancement(hero)).toEqual([])
    expect(deriveTraits(advancedHero(hero)).traits.find((t) => t.trait.id === 'electricity')?.die).toBe('d8')
    expect(deriveTraits(advancedHero(hero, 1)).traits.some((t) => t.trait.id === 'cold')).toBe(true)
  })

  it('warns about swaps that don’t fit', () => {
    expect(codes(withChanges({ kind: 'swapPower', from: P('cold'), to: P('sonic') }))).toEqual(['advancement-not-held'])
    expect(codes(withChanges({ kind: 'swapPower', from: P('fire'), to: P('speed') }))).toEqual(['advancement-already-have'])
    expect(codes(withChanges({ kind: 'swapQuality', from: P('fire'), to: P('cold') }))).toEqual(['advancement-kind'])
    expect(codes(withChanges({ kind: 'swapPower', from: P('fire'), to: P('nope') }))).toEqual(['unknown-trait'])
  })

  it('swaps the roleplaying quality for a listed one, keeping its die', () => {
    const hero = withChanges({ kind: 'swapQuality', from: Q('roleplaying-quality'), to: Q('banter') })
    expect(checkAdvancement(hero)).toEqual([])
    const trait = deriveTraits(advancedHero(hero)).traits.find((t) => t.trait.id === 'roleplaying-quality')
    expect([trait?.name, trait?.die]).toEqual(['Banter', 'd8'])
    // It holds Banter now, so Banter isn't on offer again.
    expect(traitSwapOptions(advancedHero(hero), 'quality').some((t) => t.id === 'banter')).toBe(false)
  })

  it('flags a swap that breaks an ability\'s slot, without blocking it', () => {
    const hero = completeHero()
    hero.archetype!.id = 'blaster'
    hero.archetype!.abilities = [...hero.archetype!.abilities, { source: 'archetype.yellow', name: 'Energy Immunity', uses: [P('fire')] }]
    expect(traitSwapIssues(hero, P('fire'), P('cold'))).toEqual([])
    const issues = traitSwapIssues(hero, P('fire'), P('strength'))
    expect(issues).toEqual([{ source: 'archetype.yellow', name: 'Energy Immunity', message: "Needs an energy or element power. Strength isn't one, so this ability would need swapping too." }])
    hero.advancement = [entry({ kind: 'swapPower', from: P('fire'), to: P('strength') }, 0)]
    expect(checkAdvancement(hero).map((w) => [w.code, w.message])).toEqual([['advancement-slot', `Energy Immunity: ${issues[0]!.message}`]])
  })

  it('swaps a quality', () => {
    const hero = withChanges({ kind: 'swapQuality', from: Q('alertness'), to: Q('banter') })
    expect(checkAdvancement(hero)).toEqual([])
    expect(deriveTraits(advancedHero(hero)).traits.find((t) => t.trait.id === 'banter')?.die).toBe('d8')
  })

  it('swaps a principle, even one a retcon replaced', () => {
    const hero = withChanges({ kind: 'swapPrinciple', replace: 'background', with: { id: 'destiny' } })
    expect(checkAdvancement(hero)).toEqual([])
    expect(buildSheet(hero).principles.map((p) => p.name)).toEqual(['Principle of Destiny', 'Principle of the Gearhead'])
    hero.retcon = { id: 'change-principle', kind: 'changePrinciple', replace: 'background', with: { id: 'detective' } }
    expect(buildSheet(hero).principles[0]?.name).toBe('Principle of Destiny')
    expect(codes(withChanges({ kind: 'swapPrinciple', replace: 'background', with: { id: 'business' } }))).toEqual(['advancement-no-change'])
    expect(codes(withChanges({ kind: 'swapPrinciple', replace: 'background', with: { id: 'nope' } }))).toEqual(['unknown-entry'])
    // The other principle can't be taken twice, but any category will do (ruling 51).
    expect(codes(withChanges({ kind: 'swapPrinciple', replace: 'background', with: { id: 'gearhead' } }))).toEqual(['advancement-duplicate-principle'])
  })

  it('swaps an ability for another of the same color from the same list, using the same power', () => {
    const hero = completeHero()
    const inflict = hero.powerSource!.abilities.find((p) => p.name === 'Inflict')!
    // Area Alteration is already taken, so it isn't offered.
    expect(abilitySwapOptions(hero, inflict).map((a) => a.name)).toEqual(['Reflexive Burst'])
    const ok = withChanges({ kind: 'swapAbility', from: { source: 'powerSource.yellow', name: 'Inflict' }, to: { source: 'powerSource.yellow', name: 'Reflexive Burst', uses: [P('fire')] } })
    expect(checkAdvancement(ok)).toEqual([])
    expect(buildSheet(ok).abilities.map((a) => a.name)).toContain('Reflexive Burst')
    expect(buildSheet(ok).abilities.map((a) => a.name)).not.toContain('Inflict')
    const otherPower = withChanges({ kind: 'swapAbility', from: { source: 'powerSource.yellow', name: 'Inflict' }, to: { source: 'powerSource.yellow', name: 'Reflexive Burst', uses: [P('agility')] } })
    expect(codes(otherPower)).toEqual(['advancement-ability-use'])
    const otherList = withChanges({ kind: 'swapAbility', from: { source: 'powerSource.yellow', name: 'Inflict' }, to: { source: 'powerSource.green', name: 'Immunity' } })
    expect(codes(otherList)).toEqual(['advancement-ability-source'])
    const twice = withChanges({ kind: 'swapAbility', from: { source: 'powerSource.yellow', name: 'Inflict' }, to: { source: 'powerSource.yellow', name: 'Area Alteration', uses: [P('fire')] } })
    expect(codes(twice)).toEqual(['advancement-ability-source'])
    expect(codes(withChanges({ kind: 'swapAbility', from: { source: 'powerSource.yellow', name: 'Gone' }, to: { source: 'powerSource.yellow', name: 'Inflict' } }))).toEqual(['advancement-not-held'])
  })

  it('swaps the ability as the retcon left it, keeping the power the retcon gave it', () => {
    const hero = withChanges({ kind: 'swapAbility', from: { source: 'powerSource.yellow', name: 'Inflict' }, to: { source: 'powerSource.yellow', name: 'Reflexive Burst', uses: [P('speed')] } })
    hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'powerSource.yellow', name: 'Inflict' }, uses: [P('speed')] }
    expect(checkAdvancement(hero)).toEqual([])
    hero.advancement[0]!.change = { kind: 'swapAbility', from: { source: 'powerSource.yellow', name: 'Inflict' }, to: { source: 'powerSource.yellow', name: 'Reflexive Burst', uses: [P('fire')] } }
    expect(codes(hero)).toEqual(['advancement-ability-use'])
    expect(swappablePicks(hero).find((p) => p.pick.name === 'Inflict')?.pick.uses).toEqual([P('speed')])
  })

  it('only swaps abilities the player picked from a list (ruling 50)', () => {
    const fc = formChangerHero()
    // Change Forms comes with Form-Changer; Form Recovery was chosen.
    const names = swappablePicks(fc).map((p) => p.pick.name)
    expect(names).toContain('Form Recovery')
    expect(names).not.toContain('Change Forms')
    fc.advancement = [entry({ kind: 'swapAbility', from: { source: 'archetype.fixedGreen', name: 'Change Forms' }, to: { source: 'archetype.fixedGreen', name: 'Change Forms' } }, 0)]
    expect(codes(fc)).toEqual(['advancement-ability-source'])
    const divided = dividedHero()
    expect(swappablePicks(divided).map((p) => p.pick.source)).not.toContain('archetype.transition')
  })

  it('swaps a Red ability within its category', () => {
    const hero = withChanges({ kind: 'swapAbility', from: { source: 'red', name: 'Paragon Feat' }, to: { source: 'red', name: 'Reactive Strike', category: 'power:athletic', uses: [P('agility')] } })
    expect(checkAdvancement(hero)).toEqual([])
    expect(advancedHero(hero).redAbilities.map((p) => p.name)).toEqual(['Reactive Strike', 'Push Your Limits'])
  })

  it('only applies what came after the last rewrite, which built the rest in', () => {
    const hero = withChanges({ kind: 'swapPower', from: P('fire'), to: P('cold') }, { kind: 'swapPower', from: P('cold'), to: P('sonic') })
    hero.advancement.splice(1, 0, { id: 'r', at: 'x', kind: 'rewrite', text: 'Rebuilt.' })
    expect(changesInForce(hero)).toEqual([{ kind: 'swapPower', from: P('cold'), to: P('sonic') }])
  })

  it('offers traits the hero doesn’t have', () => {
    const hero = completeHero()
    expect(traitSwapOptions(hero, 'power').some((t) => t.id === 'fire')).toBe(false)
    expect(traitSwapOptions(hero, 'power').some((t) => t.id === 'cold')).toBe(true)
  })
})
