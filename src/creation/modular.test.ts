import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import { A, completeHero, modularHero, P, Q } from '../test/heroes'
import { checkModular, describeAdjustment, findMode } from './modular'
import { buildSheet } from './sheet'
import { deriveTraits } from './traits'

const check = (hero: Hero) => checkModular(hero, deriveTraits(hero).traits)
const codes = (hero: Hero) => check(hero).map((w) => w.code)
const messages = (hero: Hero) => check(hero).map((w) => w.message)
const modes = (hero: Hero) => hero.archetype!.modular!.modes

describe('Modular', () => {
  it('a legal Modular Speedster has no warnings at all', () => {
    const sheet = buildSheet(modularHero())
    expect(sheet.warnings).toEqual([])
    expect(sheet.characteristics.archetype).toBe('Modular Speedster')
    // Modular's fixed abilities are on the sheet; Speedster's are skipped; mode abilities are shown with their modes.
    const names = sheet.abilities.map((a) => a.name)
    expect(names).toEqual(expect.arrayContaining(['Switch', 'Quick Switch', 'Emergency Switch']))
    expect(names).not.toContain('Improvement')
    expect(sheet.modes.map((m) => [m.zone, m.name])).toEqual([
      ['green', 'Improvement Mode'],
      ['yellow', 'Analysis Mode'],
      ['yellow', 'Patch Job'],
      ['red', 'Hunter/Killer Mode'],
    ])
    expect(sheet.modes[0]!.ability?.text).toContain('Boost yourself using Fire.')
    expect(sheet.modes[3]).toMatchObject({ cannot: ['defend', 'overcome'], immobile: false })
    expect(sheet.powerlessMode?.map((t) => `${t.name} ${t.die}`)).toEqual(['Fire d6', 'Awareness d10', 'Fitness d10', 'Alertness d8', 'Old Money d8'])
  })

  it('takes one more Green mode, two Yellow modes, and one Red mode, all different (the user’s ruling)', () => {
    const hero = modularHero()
    modes(hero).pop()
    expect(messages(hero)).toEqual(['Choose 1 Red mode besides your default mode; you have 0.'])
    const twice = modularHero()
    modes(twice)[2] = { ...modes(twice)[1]! }
    expect(codes(twice)).toEqual(['mode-twice'])
    const unknown = modularHero()
    modes(unknown)[0]!.id = 'nope'
    expect(codes(unknown)).toEqual(['mode-count', 'unknown-entry'])
  })

  it('adjusts default-mode dice as the mode says', () => {
    const hero = modularHero()
    // Improvement keeps 2 the same and raises 2; raising three is wrong.
    modes(hero)[0]!.powers = [A(P('speed'), 'd12'), A(P('agility'), 'd12'), A(P('fire'), 'd10'), A(P('awareness'), 'd10')]
    expect(messages(hero)).toEqual(['Improvement Mode uses 4 default-mode powers: it keeps 2 the same, and raises 2 one size.'])
    // Too few powers.
    modes(hero)[0]!.powers = [A(P('speed'), 'd12'), A(P('fire'), 'd10'), A(P('awareness'), 'd10')]
    expect(codes(hero)).toEqual(['mode-dice'])
    // A power the hero doesn't have, and one used twice.
    modes(hero)[0]!.powers = [A(P('speed'), 'd12'), A(P('agility'), 'd10'), A(P('fire'), 'd10'), A(P('telepathy'), 'd10')]
    expect(codes(hero)).toEqual(['mode-not-held', 'mode-dice'])
    modes(hero)[0]!.powers = [A(P('speed'), 'd12'), A(P('agility'), 'd10'), A(P('fire'), 'd10'), A(P('fire'), 'd10')]
    expect(codes(hero)).toEqual(['assigned-twice', 'mode-dice'])
  })

  it('handles lowering, two-size raises, and set dice', () => {
    expect(describeAdjustment(findMode(modularHero(), 'bombardment')!.mode)).toBe(
      'Bombardment Mode uses 3 default-mode powers: it lowers 2 one size, and sets 1 to d12.',
    )
    const hero = modularHero()
    // Bombardment: Fire d8 → d12, Agility d10 → d8, Flight d6 → d4.
    modes(hero)[2] = {
      id: 'bombardment',
      powers: [A(P('fire'), 'd12'), A(P('agility'), 'd8'), A(P('flight'), 'd4')],
      ability: { source: 'archetype.mode', name: 'Bombardment', uses: [P('fire')] },
    }
    expect(check(hero)).toEqual([])
    // Stalwart: 1 same, 2 down, 1 up two sizes; lowering a d4 leaves it at d4 (the user's ruling).
    const stalwart = modularHero()
    modes(stalwart)[2] = {
      id: 'stalwart',
      powers: [A(P('speed'), 'd12'), A(P('agility'), 'd8'), A(P('fire'), 'd6'), A(P('flight'), 'd10')],
      ability: { source: 'archetype.mode', name: 'Stalwart', uses: [P('speed')] },
    }
    expect(check(stalwart)).toEqual([])
    modes(stalwart)[2]!.powers[3] = A(P('flight'), 'd8')
    expect(codes(stalwart)).toEqual(['mode-dice'])
  })

  it('a mode’s ability can only use that mode’s powers (the user’s ruling)', () => {
    const hero = modularHero()
    // Regeneration only has Speed and Flight.
    modes(hero)[2]!.ability!.uses = [P('fire')]
    expect(codes(hero)).toEqual(['slot-not-held'])
    delete modes(hero)[2]!.ability
    expect(messages(hero)).toEqual(["Fill in Regeneration, Regeneration Mode's ability."])
    modes(hero)[2]!.ability = { source: 'archetype.mode', name: 'Shield' }
    expect(codes(hero)).toEqual(['unknown-ability'])
    modes(hero)[2]!.ability = { source: 'archetype.green', name: 'Regeneration', uses: [P('flight')] }
    expect(codes(hero)).toEqual(['mode-ability-source'])
  })

  it('the ability retcon can target a mode ability, using that mode’s powers (the user’s ruling)', () => {
    const hero = modularHero()
    hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'archetype.mode', name: 'Regeneration' }, uses: [P('speed')] }
    const sheet = buildSheet(hero)
    expect(sheet.warnings).toEqual([])
    expect(sheet.modes[2]!.ability?.text).toContain('Defend using Speed.')
    hero.retcon.uses = [P('fire')]
    expect(codes(hero)).toEqual(['slot-not-held'])
    hero.retcon.uses = [P('flight')]
    expect(codes(hero)).toEqual(['retcon-no-change'])
    hero.retcon.ability.name = 'Shield'
    expect(codes(hero)).toEqual(['retcon-ability-missing'])
    // Not Modular: there are no modes to retcon.
    const plain = completeHero()
    plain.retcon = { ...hero.retcon }
    expect(codes(plain)).toEqual(['retcon-ability-missing'])
  })

  it('checks the optional Powerless mode', () => {
    const hero = modularHero()
    delete hero.archetype!.modular!.powerless
    expect(check(hero)).toEqual([])
    hero.archetype!.modular!.powerless = [A(P('fire'), 'd6'), A(P('awareness'), 'd8')]
    expect(messages(hero)).toEqual(['Powerless mode puts d6 and d10 on two different default-mode powers.'])
    hero.archetype!.modular!.powerless = [A(P('fire'), 'd6'), A(P('telepathy'), 'd10')]
    expect(codes(hero)).toEqual(['mode-not-held'])
  })

  it('adds d6 filler powers up to four, from the base archetype’s or power source’s lists (the user’s ruling)', () => {
    // Three powers: Agility and Fire from the power source, Speed from Speedster (its d6 on a quality).
    // Other steps' dice don't add up, so only the filler warnings are checked here.
    const hero = modularHero()
    hero.powerSource!.powers = [A(P('agility'), 'd10'), A(P('fire'), 'd8')]
    hero.archetype!.secondary!.traits = [A(P('speed'), 'd12'), A(Q('finesse'), 'd6')]
    const fillerCodes = new Set(['filler-count', 'filler-die', 'already-have', 'wrong-kind', 'not-on-list', 'unknown-trait'])
    const warnings = () => deriveTraits(hero).warnings.filter((w) => w.step === 'archetype' && fillerCodes.has(w.code))
    const powers = () => deriveTraits(hero).traits.filter((t) => t.trait.kind === 'power').map((t) => `${t.name} ${t.die}`)
    expect(warnings().map((w) => w.message)).toEqual(["Modular needs 4 powers: add 1 d6 power; you've added 0."])
    hero.archetype!.traits = [A(P('leaping'), 'd6')]
    expect(warnings()).toEqual([])
    expect(powers()).toContain('Leaping d6')
    // From the power source's list (any Athletic power, for example) is fine too.
    hero.archetype!.traits = [A(P('strength'), 'd6')]
    expect(warnings()).toEqual([])
    // Not on Speedster's or Accident's lists.
    hero.archetype!.traits = [A(P('flight'), 'd6')]
    expect(warnings().map((w) => w.code)).toEqual([])
    hero.archetype!.traits = [A(P('robotics'), 'd6')]
    expect(warnings().map((w) => w.message)).toEqual(["Robotics isn't on the Speedster or Accident power list."])
    hero.archetype!.traits = [A(P('leaping'), 'd8')]
    expect(warnings().map((w) => w.code)).toEqual(['filler-die'])
    hero.archetype!.traits = [A(P('agility'), 'd6')]
    expect(warnings().map((w) => w.code)).toEqual(['already-have'])
    hero.archetype!.traits = [A(Q('banter'), 'd6')]
    expect(warnings().map((w) => w.code)).toEqual(['wrong-kind'])
    // No fillers when the hero already has four powers.
    const full = modularHero()
    full.archetype!.traits = [A(P('leaping'), 'd6')]
    expect(deriveTraits(full).warnings.map((w) => w.message)).toEqual(["You already have 5 powers, so Modular doesn't add any."])
  })

  it('flags modes recorded in the wrong place', () => {
    const stray = modularHero()
    stray.archetype!.abilities.push({ source: 'archetype.green', name: 'Debilitator', uses: [P('fire')] })
    expect(codes(stray)).toEqual(['unknown-ability'])
    const plain = completeHero()
    plain.archetype!.modular = { modes: [] }
    expect(codes(plain)).toEqual(['unexpected-modular'])
    const nested = modularHero()
    nested.archetype!.secondary!.modular = { modes: [] }
    expect(codes(nested)).toEqual(['unexpected-modular'])
  })
})
