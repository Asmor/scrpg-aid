import { describe, expect, it } from 'vitest'
import { retcons } from '../rules/data'
import { completeHero, dividedHero, formChangerHero, modularHero, P, Q } from '../test/heroes'
import { deriveTraits } from './traits'
import { abilityRetconTargets, availableRetcons, checkRetcon, retconUnavailableReason } from './retcons'

describe('retcons', () => {
  it('offers every retcon to most heroes', () => {
    expect(availableRetcons(completeHero())).toEqual(retcons)
  })

  it('doesn’t offer raising a Red status die that is already d12 (the user’s ruling)', () => {
    const hero = completeHero()
    hero.personality = { id: 'nurturing', bonus: [] }
    expect(availableRetcons(hero).map((r) => r.id)).not.toContain('upgrade-red-status')
    const upgrade = retcons.find((r) => r.id === 'upgrade-red-status')!
    expect(retconUnavailableReason(hero, upgrade)).toBe('Your Red status die is already d12.')
  })

  it('warns when a saved hero has a retcon they can’t take', () => {
    const hero = completeHero()
    hero.personality = { id: 'naive', bonus: [] }
    hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
    expect(checkRetcon(hero)).toEqual([
      { step: 'retcon', code: 'retcon-not-allowed', message: 'Your Red status die is already d12. Choose a different retcon.' },
    ])
    hero.personality = { id: 'lone-wolf', bonus: [] }
    expect(checkRetcon(hero)).toEqual([])
    hero.retcon = null
    expect(checkRetcon(hero)).toEqual([])
  })

  it('offers everything before a personality is chosen', () => {
    const hero = completeHero()
    hero.personality = null
    expect(availableRetcons(hero)).toEqual(retcons)
  })
})

describe('abilityRetconTargets', () => {
  it('lists the abilities that use a power or quality through a slot, the Out ability included', () => {
    const labels = abilityRetconTargets(completeHero(), deriveTraits(completeHero()).traits).map((t) => t.label)
    expect(labels).toContain('Inflict')
    expect(labels).toContain('Paragon Feat')
    expect(labels).toContain('Out ability')
    // Immunity's only blank is a word, and Push Your Limits has none.
    expect(labels).not.toContain('Immunity')
    expect(labels).not.toContain('Push Your Limits')
  })

  it('lists form and mode abilities, naming where they’re from, with that form’s or mode’s dice', () => {
    const forms = formChangerHero()
    const strong = abilityRetconTargets(forms, deriveTraits(forms).traits).find((t) => t.label === 'Strong Form (Brute)')!
    // Strength is a power only the Brute form has, at d12.
    expect(strong.traits.find((t) => t.trait.id === 'strength')?.die).toBe('d12')
    const modular = modularHero()
    const regen = abilityRetconTargets(modular, deriveTraits(modular).traits).find((t) => t.label === 'Regeneration (Patch Job)')!
    // Patch Job raises Flight to d10 and leaves out the powers it doesn't pick.
    expect(regen.traits.filter((t) => t.trait.kind === 'power').map((t) => `${t.trait.id} ${t.die}`)).toEqual(['speed d12', 'flight d10'])
  })

  it('gives the Out ability the traits of the form whose personality gives it', () => {
    const hero = dividedHero()
    hero.archetype!.abilities = [{ source: 'archetype.green', name: 'Split Form' }]
    hero.archetype!.divided!.split = { always: [P('speed'), P('agility'), Q('fitness'), Q('alertness')], civilian: [P('awareness')], heroic: [P('fire'), P('flight')] }
    // With two personalities, the Out ability is the civilian one's here.
    hero.archetype!.divided!.heroicPersonality = { id: 'natural-leader', bonus: [] }
    hero.archetype!.divided!.outFrom = 'civilian'
    const out = abilityRetconTargets(hero, deriveTraits(hero).traits).find((t) => t.label === 'Out ability')!
    expect(out.traits.map((t) => t.trait.id)).not.toContain('fire')
    expect(out.traits.map((t) => t.trait.id)).toContain('awareness')
  })
})
