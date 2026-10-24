import { describe, expect, it } from 'vitest'
import { createHero, type Hero } from '../hero/model'
import { A, P, Q, validHero } from '../test/heroes'
import { deriveTraits, ROLEPLAYING_QUALITY, traitLabel, traitsBefore } from './traits'

const codes = (hero: Hero) => deriveTraits(hero).warnings.map((w) => w.code)
const dice = (hero: Hero) => Object.fromEntries(deriveTraits(hero).traits.map((t) => [t.trait.id, t.die]))

describe('deriveTraits', () => {
  it('derives every trait from a legal hero without warnings', () => {
    const result = deriveTraits(validHero())
    expect(result.warnings).toEqual([])
    expect(result.traits.map((t) => [t.trait.id, t.die, t.step])).toEqual([
      ['fitness', 'd10', 'background'],
      ['alertness', 'd8', 'background'],
      ['agility', 'd10', 'powerSource'],
      ['fire', 'd8', 'powerSource'],
      ['awareness', 'd8', 'powerSource'],
      ['speed', 'd12', 'archetype'],
      ['flight', 'd6', 'archetype'],
      ['roleplaying-quality', 'd8', 'personality'],
    ])
    expect(result.traits.at(-1)?.name).toBe('Old Money')
  })

  it('handles a hero with no choices yet', () => {
    expect(deriveTraits(createHero('guided'))).toEqual({ traits: [], warnings: [] })
  })

  it('labels traits by the player’s name, then the catalog name, then the id', () => {
    const hero = validHero()
    expect(traitLabel(hero, ROLEPLAYING_QUALITY)).toBe('Old Money')
    expect(traitLabel(hero, P('fire'))).toBe('Fire')
    expect(traitLabel(hero, P('made-up'))).toBe('made-up')
  })

  describe('dice and lists', () => {
    it('warns when a step’s dice don’t match', () => {
      const hero = validHero()
      hero.background!.qualities = [A(Q('fitness'), 'd10'), A(Q('alertness'), 'd10')]
      const w = deriveTraits(hero).warnings
      expect(w).toEqual([
        { step: 'background', code: 'dice-mismatch', message: "This step's dice are d10, d8, but the dice assigned are d10, d10." },
      ])
    })

    it('warns about traits that aren’t on the step’s list, or are the wrong kind', () => {
      const hero = validHero()
      hero.background!.qualities = [A(Q('fitness'), 'd10'), A(Q('stealth'), 'd8')]
      hero.powerSource!.powers[2] = A(Q('history'), 'd8')
      expect(codes(hero)).toEqual(['not-on-list', 'wrong-kind'])
    })

    it('warns about unknown traits and entries', () => {
      const hero = validHero()
      hero.background!.qualities[1] = A(Q('nonsense'), 'd8')
      expect(codes(hero)).toEqual(['unknown-trait'])
      for (const step of ['background', 'powerSource', 'archetype', 'personality'] as const) {
        const h = validHero()
        h[step]!.id = 'nope'
        expect(codes(h), step).toContain('unknown-entry')
      }
    })

    it('requires the background’s and power source’s required traits', () => {
      const hero = validHero()
      hero.background = { id: 'medical', qualities: [A(Q('finesse'), 'd10'), A(Q('science'), 'd8'), A(Q('alertness'), 'd6')] }
      hero.powerSource = { id: 'powered-suit', powers: [A(P('fire'), 'd10'), A(P('cold'), 'd8'), A(P('awareness'), 'd8')], abilities: [], bonus: [] }
      const w = deriveTraits(hero).warnings.filter((x) => x.code === 'missing-required')
      expect(w.map((x) => x.message)).toEqual(['Medical needs a die on Medicine.', 'Powered Suit needs a die on Power Suit.'])
    })

    it('skips the power source dice check when there is no background to take them from', () => {
      const hero = validHero()
      hero.background = null
      hero.powerSource!.powers = [A(P('agility'), 'd4')]
      expect(codes(hero)).toEqual([])
    })
  })

  describe('traits the hero already has', () => {
    it('warns when a later step gives an existing trait a die without replacing it', () => {
      const hero = validHero()
      hero.archetype!.traits = [A(P('speed'), 'd12'), A(P('agility'), 'd6')]
      const w = deriveTraits(hero).warnings
      expect(w.map((x) => x.code)).toEqual(['already-have'])
      expect(w[0]?.message).toContain('Agility at d10')
      expect(dice(hero).agility).toBe('d6')
    })

    it('upgrading a die frees the old one for this step', () => {
      const hero = validHero()
      // Agility d10 → d12; the freed d10 and the step's d6 go elsewhere.
      hero.archetype!.traits = [A(P('agility'), 'd12', true), A(P('speed'), 'd10'), A(P('flight'), 'd6')]
      expect(codes(hero)).toEqual([])
      expect(dice(hero)).toMatchObject({ agility: 'd12', speed: 'd10', flight: 'd6' })
    })

    it('only lets a bigger die upgrade a trait', () => {
      const hero = validHero()
      // Fitness d10 from the background can't be "upgraded" to d6 to move its d10 elsewhere.
      hero.archetype!.traits = [A(Q('fitness'), 'd6', true), A(P('speed'), 'd12'), A(P('flight'), 'd10')]
      expect(deriveTraits(hero).warnings).toEqual([
        { step: 'archetype', code: 'not-an-upgrade', message: 'Only a bigger die can upgrade Fitness, which is already d10.' },
      ])
      // An equal die isn't an upgrade either.
      hero.archetype!.traits = [A(Q('fitness'), 'd10', true), A(P('speed'), 'd12'), A(P('flight'), 'd6')]
      expect(codes(hero)).toEqual(['not-an-upgrade'])
    })

    it('says so when a step has no dice assigned yet', () => {
      const hero = validHero()
      hero.archetype!.traits = []
      expect(deriveTraits(hero).warnings.map((w) => w.message)).toContain(
        "This step's dice are d12, d6, but no dice are assigned yet.",
      )
    })

    it('warns when an upgrade has nothing to upgrade, or a trait gets two dice in one step', () => {
      const hero = validHero()
      hero.archetype!.traits = [A(P('speed'), 'd12', true), A(P('flight'), 'd6')]
      expect(codes(hero)).toEqual(['nothing-to-upgrade'])
      hero.archetype!.traits = [A(P('speed'), 'd12'), A(P('speed'), 'd6')]
      expect(codes(hero)).toContain('assigned-twice')
    })
  })

  describe('archetype lists', () => {
    it('requires the archetype’s required trait unless the hero already has it', () => {
      const hero = validHero()
      hero.archetype!.traits = [A(P('flight'), 'd12'), A(P('leaping'), 'd6')]
      expect(deriveTraits(hero).warnings.map((w) => w.message)).toEqual([
        'Speedster needs a die on Speed (or skip this if you already have one).',
      ])
      const blaster = validHero()
      blaster.powerSource!.powers[1] = A(P('strength'), 'd8') // no Elemental/Energy power to fall back on
      blaster.archetype = { id: 'blaster', traits: [A(P('flight'), 'd12'), A(Q('banter'), 'd6')], abilities: [], bonus: [] }
      expect(deriveTraits(blaster).warnings.map((w) => w.message)).toContain(
        'Blaster needs a die on an Elemental/Energy power (or skip this if you already have one).',
      )
      // Already having Speed lets the player skip it and use both dice elsewhere.
      hero.powerSource!.powers[0] = A(P('speed'), 'd10')
      expect(codes(hero)).toEqual([])
    })

    it('lets the required trait swap in any die, freeing the old one (ruling 43), but nothing else', () => {
      const hero = validHero()
      hero.powerSource!.powers[0] = A(P('speed'), 'd10')
      hero.archetype!.traits = [A(P('speed'), 'd6', true), A(P('flight'), 'd12'), A(P('leaping'), 'd10')]
      const result = deriveTraits(hero)
      expect(result.warnings).toEqual([])
      expect(result.traits.find((t) => t.trait.id === 'speed')?.die).toBe('d6')
      // Agility isn't Speedster's required trait, so only a bigger die can replace it.
      hero.powerSource!.powers[0] = A(P('agility'), 'd10')
      hero.archetype!.traits = [A(P('agility'), 'd6', true), A(P('speed'), 'd12'), A(P('leaping'), 'd10')]
      expect(codes(hero)).toEqual(['not-an-upgrade'])
    })

    it('checks the number of powers from the list', () => {
      const hero = validHero()
      hero.archetype = { id: 'physical-powerhouse', traits: [A(P('strength'), 'd12'), A(P('leaping'), 'd6')], abilities: [], bonus: [] }
      expect(codes(hero)).toEqual([])
      hero.archetype.traits = [A(P('strength'), 'd12'), A(Q('banter'), 'd6')]
      expect(deriveTraits(hero).warnings.map((w) => w.message)).toEqual([
        'Physical Powerhouse puts exactly one die on powers from its list; you have 0.',
      ])
    })

    it('lets the Psychic put remaining dice on its extra power categories', () => {
      const hero = validHero()
      hero.archetype = {
        id: 'psychic',
        traits: [A(P('telepathy'), 'd12'), A(P('suggestion'), 'd6')],
        abilities: [],
        bonus: [],
      }
      expect(codes(hero)).toEqual([])
      hero.archetype.traits = [A(P('telepathy'), 'd12'), A(P('deduction'), 'd6')]
      expect(deriveTraits(hero).warnings.map((w) => w.message)).toEqual([
        'Psychic puts at least 2 dice on powers from its list; you have 1.',
      ])
      hero.archetype.traits = [A(P('telepathy'), 'd12'), A(P('flight'), 'd6')]
      expect(codes(hero)).toEqual(['not-on-list', 'power-count'])
    })

    it('Divided and Modular take their dice from the archetype they build on', () => {
      const hero = validHero()
      const speedster = hero.archetype!
      hero.archetype = { id: 'divided', traits: [], abilities: [], bonus: [], secondary: speedster }
      expect(codes(hero)).toEqual([])
      expect(dice(hero)).toMatchObject({ speed: 'd12', flight: 'd6' })
      // The second archetype's lists and dice are checked as usual.
      speedster.traits = [A(P('flight'), 'd12'), A(P('leaping'), 'd6')]
      expect(codes(hero)).toEqual(['missing-required'])
      // Dice recorded on the outer archetype are flagged.
      speedster.traits = [A(P('speed'), 'd12'), A(P('flight'), 'd6')]
      hero.archetype.traits = [A(Q('banter'), 'd6')]
      expect(codes(hero)).toEqual(['complex-traits'])
    })
  })

  describe('bonuses', () => {
    it('gainQuality: a quality from the listed category at the bonus die', () => {
      const hero = validHero()
      hero.powerSource = { id: 'mystical', powers: [], abilities: [], bonus: [A(Q('history'), 'd10')] }
      expect(codes(hero).filter((c) => c.startsWith('bonus'))).toEqual([])
      hero.powerSource.bonus = [A(Q('banter'), 'd8')]
      expect(codes(hero).filter((c) => c.startsWith('bonus'))).toEqual(['bonus-die', 'bonus-not-on-list'])
      hero.powerSource.bonus = [A(P('fire'), 'd10')]
      expect(codes(hero)).toContain('bonus-kind')
    })

    it('a granted die may upgrade a trait the hero has, but never lowers it', () => {
      const hero = validHero()
      hero.background = { id: 'upper-class', qualities: [A(Q('fitness'), 'd10'), A(Q('history'), 'd8')] }
      hero.powerSource = { id: 'mystical', powers: [], abilities: [], bonus: [A(Q('history'), 'd10')] }
      expect(codes(hero).filter((c) => c.startsWith('bonus') || c === 'not-an-upgrade')).toEqual([])
      expect(dice(hero).history).toBe('d10')
      hero.background.qualities = [A(Q('fitness'), 'd8'), A(Q('history'), 'd10')]
      expect(deriveTraits(hero).warnings).toContainEqual({
        step: 'powerSource',
        code: 'not-an-upgrade',
        message: "Mystical's bonus can only upgrade History, which is already d10. Choose something else.",
      })
    })

    it('warns about unknown traits in bonuses and the gain retcon', () => {
      const hero = validHero()
      hero.powerSource = { id: 'the-multiverse', powers: [], abilities: [], bonus: [A(P('made-up'), 'd6')] }
      expect(codes(hero)).toContain('unknown-trait')
      const other = validHero()
      other.retcon = { id: 'add-d6-trait', kind: 'gainPowerOrQuality', gained: A(Q('made-up'), 'd6') }
      expect(codes(other)).toEqual(['unknown-trait'])
    })

    it('gainPower with excludeListed: a power not on the power source’s list', () => {
      const hero = validHero()
      hero.powerSource = { id: 'supernatural', powers: [], abilities: [], bonus: [A(P('gadgets'), 'd10')] }
      expect(codes(hero).filter((c) => c.startsWith('bonus'))).toEqual([])
      hero.powerSource.bonus = [A(P('fire'), 'd10')]
      expect(codes(hero).filter((c) => c.startsWith('bonus'))).toEqual(['bonus-not-on-list'])
    })

    it('gainPower with mustBeNew: Robot/Cyborg’s Technological power', () => {
      const hero = validHero()
      hero.archetype = {
        id: 'robot-cyborg',
        traits: [A(P('robotics'), 'd12'), A(Q('history'), 'd6')],
        abilities: [],
        bonus: [A(P('gadgets'), 'd10')],
      }
      expect(codes(hero)).toEqual([])
      hero.archetype.bonus = [A(P('robotics'), 'd10')]
      expect(codes(hero)).toContain('bonus-not-new')
    })

    it('upgradeDie: Alien raises a d6 to d8, or adds a listed d6 power if there are no d6 powers', () => {
      const hero = validHero()
      hero.background = { id: 'medical', qualities: [A(Q('medicine'), 'd10'), A(Q('science'), 'd8'), A(Q('alertness'), 'd6')] }
      hero.powerSource = { id: 'alien', powers: [A(P('agility'), 'd10'), A(P('flight'), 'd8'), A(P('fire'), 'd8')], abilities: [], bonus: [A(Q('alertness'), 'd8')] }
      hero.archetype!.traits = [A(P('speed'), 'd8'), A(P('leaping'), 'd8'), A(Q('finesse'), 'd8')]
      expect(codes(hero)).toEqual([])
      expect(dice(hero).alertness).toBe('d8')
      hero.powerSource.bonus = [A(Q('science'), 'd10')]
      expect(codes(hero)).toEqual(['bonus-wrong-die', 'bonus-die'])
      // No d6 powers yet, so a new listed power at d6 is allowed instead.
      hero.powerSource.bonus = [A(P('strength'), 'd6')]
      expect(codes(hero)).toEqual([])
      hero.powerSource.bonus = [A(P('strength'), 'd8')]
      expect(codes(hero)).toEqual(['bonus-die'])
      hero.powerSource.bonus = [A(P('magic-nope'), 'd6')]
      expect(codes(hero)).toContain('bonus-not-on-list')
    })

    it('upgradeDie fallback is only for heroes with no d6 powers', () => {
      const hero = validHero()
      // Unremarkable's power source dice include a d6, so the hero has a d6 power to upgrade.
      hero.background = { id: 'unremarkable', qualities: [] }
      hero.powerSource = { id: 'alien', powers: [A(P('agility'), 'd10'), A(P('flight'), 'd8'), A(P('fire'), 'd6')], abilities: [], bonus: [A(P('strength'), 'd6')] }
      hero.archetype = null
      expect(codes(hero).filter((c) => c.startsWith('bonus'))).toEqual(['bonus-needs-existing'])
      hero.powerSource.bonus = [A(P('fire'), 'd8')]
      expect(codes(hero).filter((c) => c.startsWith('bonus'))).toEqual([])
    })

    it('upgradeDie: Impulsive raises any one die by one size', () => {
      const hero = validHero()
      hero.personality = { id: 'impulsive', bonus: [A(P('flight'), 'd8')] }
      expect(codes(hero)).toEqual([])
      expect(dice(hero).flight).toBe('d8')
      hero.personality.bonus = [A(P('flight'), 'd10')]
      expect(codes(hero)).toEqual(['bonus-die'])
      hero.personality.bonus = [A(P('agility'), 'd8')]
      expect(codes(hero)).toEqual(['bonus-die'])
      hero.personality.bonus = [A(P('speed'), 'd12')]
      expect(deriveTraits(hero).warnings.map((w) => w.message)).toEqual([
        "Speed is already d12, so Impulsive's bonus can't raise it. Choose something else.",
      ])
    })

    it('shiftDice: Cosmos lowers one power and raises another', () => {
      const hero = validHero()
      hero.powerSource = {
        id: 'cosmos',
        powers: [A(P('cosmic'), 'd10'), A(P('flight'), 'd8'), A(P('intuition'), 'd8')],
        abilities: [],
        bonus: [A(P('cosmic'), 'd8'), A(P('flight'), 'd10')],
      }
      hero.archetype!.traits = [A(P('speed'), 'd10'), A(P('leaping'), 'd8'), A(Q('finesse'), 'd8')]
      expect(codes(hero)).toEqual([])
      expect(dice(hero)).toMatchObject({ cosmic: 'd8', flight: 'd10' })
      hero.powerSource.bonus = [A(P('cosmic'), 'd6'), A(P('flight'), 'd10')]
      expect(codes(hero)).toEqual(['bonus-die'])
      hero.powerSource.bonus = [A(P('cosmic'), 'd12'), A(P('flight'), 'd10')]
      expect(codes(hero)).toEqual(['bonus-shift'])
      // Lowering and raising the same power isn't a shift.
      hero.powerSource.bonus = [A(P('cosmic'), 'd8'), A(P('cosmic'), 'd12')]
      expect(codes(hero)).toEqual(['bonus-shift'])
      // Lowering a d6 isn't allowed (it's not in the downgrade's "from" list).
      hero.background = { id: 'unremarkable', qualities: [] }
      hero.powerSource.powers = [A(P('cosmic'), 'd10'), A(P('flight'), 'd8'), A(P('intuition'), 'd6')]
      hero.archetype = null
      hero.powerSource.bonus = [A(P('intuition'), 'd4'), A(P('flight'), 'd10')]
      expect(codes(hero).filter((c) => c.startsWith('bonus'))).toEqual(['bonus-wrong-die'])
      hero.powerSource.bonus = [A(P('flight'), 'd10')]
      expect(codes(hero).filter((c) => c.startsWith('bonus'))).toEqual(['bonus-count', 'bonus-shift'])
    })

    it('extraArchetypeQuality: Training adds a quality from the archetype’s list during the archetype step', () => {
      const hero = validHero()
      hero.powerSource = {
        id: 'training',
        powers: [A(P('agility'), 'd10'), A(P('gadgets'), 'd8'), A(P('deduction'), 'd8')],
        abilities: [],
        bonus: [A(Q('acrobatics'), 'd8')],
      }
      hero.archetype!.traits = [A(P('speed'), 'd10'), A(P('leaping'), 'd8'), A(Q('finesse'), 'd8')]
      const result = deriveTraits(hero)
      expect(result.warnings).toEqual([])
      expect(result.traits.find((t) => t.trait.id === 'acrobatics')?.step).toBe('archetype')
      hero.powerSource.bonus = [A(Q('banter'), 'd8')]
      expect(codes(hero)).toEqual(['bonus-not-on-list'])
      // The archetype already gave Finesse a d8: the bonus can't silently take its place.
      hero.powerSource.bonus = [A(Q('finesse'), 'd8')]
      expect(codes(hero)).toEqual(['not-an-upgrade'])
    })

    it('leaves Training’s extra quality alone until an archetype is chosen', () => {
      const hero = validHero()
      hero.powerSource = { id: 'training', powers: [A(P('agility'), 'd10'), A(P('gadgets'), 'd8'), A(P('deduction'), 'd8')], abilities: [], bonus: [] }
      hero.archetype = null
      expect(codes(hero)).toEqual([])
    })

    it('warns when a bonus isn’t taken, has the wrong count, or isn’t expected', () => {
      const hero = validHero()
      hero.powerSource = { id: 'mystical', powers: [], abilities: [], bonus: [] }
      expect(deriveTraits(hero).warnings).toContainEqual(
        expect.objectContaining({ code: 'bonus-not-taken', step: 'powerSource' }),
      )
      hero.powerSource.bonus = [A(Q('history'), 'd10'), A(Q('science'), 'd10')]
      expect(codes(hero)).toContain('bonus-count')
      const other = validHero()
      other.powerSource!.bonus = [A(Q('history'), 'd10')]
      expect(codes(other)).toEqual(['unexpected-bonus'])
    })
  })

  describe('personality and retcon', () => {
    it('adds the roleplaying quality at d8 and asks for a name', () => {
      const hero = validHero()
      hero.traitNames = {}
      expect(dice(hero)['roleplaying-quality']).toBe('d8')
      expect(codes(hero)).toEqual(['name-roleplaying-quality'])
    })

    it('swaps two dice for the swap retcons', () => {
      const hero = validHero()
      hero.retcon = { id: 'swap-power-dice', kind: 'swapDice', traits: [P('speed'), P('flight')] }
      expect(codes(hero)).toEqual([])
      expect(dice(hero)).toMatchObject({ speed: 'd6', flight: 'd12' })
      hero.retcon = { id: 'swap-power-dice', kind: 'swapDice', traits: [P('speed'), Q('fitness')] }
      expect(codes(hero)).toEqual(['wrong-kind'])
      hero.retcon = { id: 'swap-power-dice', kind: 'swapDice', traits: [P('speed'), P('speed')] }
      expect(codes(hero)).toEqual(['swap-needs-two'])
    })

    it('adds a d6 trait for the gain retcon', () => {
      const hero = validHero()
      hero.retcon = { id: 'add-d6-trait', kind: 'gainPowerOrQuality', gained: A(Q('banter'), 'd6') }
      expect(codes(hero)).toEqual([])
      expect(dice(hero).banter).toBe('d6')
      hero.retcon = { id: 'add-d6-trait', kind: 'gainPowerOrQuality', gained: A(P('speed'), 'd8') }
      expect(codes(hero)).toEqual(['bonus-die', 'already-have'])
    })

    it('warns about unknown or mismatched retcons, and ignores retcons that don’t change dice', () => {
      const hero = validHero()
      hero.retcon = { id: 'nope', kind: 'upgradeStatusDie' }
      expect(codes(hero)).toEqual(['unknown-entry'])
      hero.retcon = { id: 'swap-power-dice', kind: 'upgradeStatusDie' }
      expect(codes(hero)).toEqual(['wrong-retcon-kind'])
      hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
      expect(codes(hero)).toEqual([])
    })
  })
})

describe('traitsBefore', () => {
  it('gives the traits as they stood before a step', () => {
    const hero = validHero()
    expect(traitsBefore(hero, 'powerSource').map((t) => t.trait.id)).toEqual(['fitness', 'alertness'])
    expect(traitsBefore(hero, 'powerSourceBonus').map((t) => t.trait.id)).toEqual(['fitness', 'alertness', 'agility', 'fire', 'awareness'])
  })

  it('leaves out the power source bonus it comes before', () => {
    const hero = validHero()
    hero.powerSource = { id: 'mystical', powers: [A(P('flight'), 'd10')], abilities: [], bonus: [A(Q('history'), 'd10')] }
    expect(traitsBefore(hero, 'powerSourceBonus').map((t) => t.trait.id)).toEqual(['fitness', 'alertness', 'flight'])
    hero.powerSource = null
    expect(traitsBefore(hero, 'powerSourceBonus').map((t) => t.trait.id)).toEqual(['fitness', 'alertness'])
  })

  it('gives the traits before the archetype step, its bonus, and a power source bonus taken there', () => {
    const hero = validHero()
    hero.powerSource = { id: 'training', powers: [A(P('agility'), 'd10'), A(P('gadgets'), 'd8'), A(P('deduction'), 'd8')], abilities: [], bonus: [A(Q('acrobatics'), 'd8')] }
    hero.archetype = { id: 'robot-cyborg', traits: [A(P('strength'), 'd10'), A(Q('investigation'), 'd8'), A(Q('self-discipline'), 'd8')], abilities: [], bonus: [A(P('robotics'), 'd10')] }
    const ids = (point: Parameters<typeof traitsBefore>[1]) => traitsBefore(hero, point).map((t) => t.trait.id)
    expect(ids('archetype')).toEqual(['fitness', 'alertness', 'agility', 'gadgets', 'deduction'])
    expect(ids('archetypeBonus')).toEqual(['fitness', 'alertness', 'agility', 'gadgets', 'deduction', 'strength', 'investigation', 'self-discipline'])
    expect(ids('deferredBonus')).toEqual(['fitness', 'alertness', 'agility', 'gadgets', 'deduction', 'strength', 'investigation', 'self-discipline', 'robotics'])
    // A bonus that isn't deferred is part of the traits before the archetype.
    hero.powerSource = { id: 'mystical', powers: [A(P('flight'), 'd10')], abilities: [], bonus: [A(Q('history'), 'd10')] }
    expect(ids('archetype')).toEqual(['fitness', 'alertness', 'flight', 'history'])
    hero.archetype = null
    expect(ids('archetypeBonus')).toEqual(['fitness', 'alertness', 'flight', 'history'])
  })

  it('leaves out Modular’s filler powers, and the second archetype’s bonus before it applies', () => {
    const hero = validHero()
    hero.archetype = {
      id: 'modular',
      traits: [A(P('flight'), 'd6')],
      abilities: [],
      bonus: [],
      secondary: { id: 'robot-cyborg', traits: [A(P('strength'), 'd12'), A(Q('deduction'), 'd6')], abilities: [], bonus: [A(P('robotics'), 'd10')] },
    }
    expect(traitsBefore(hero, 'archetypeBonus').map((t) => t.trait.id)).toEqual(['fitness', 'alertness', 'agility', 'fire', 'awareness', 'strength', 'deduction'])
    // Training's extra quality comes after the bonus, but still before the fillers.
    hero.powerSource = { id: 'training', powers: [A(P('agility'), 'd10'), A(P('gadgets'), 'd8'), A(P('deduction'), 'd8')], abilities: [], bonus: [A(Q('alertness'), 'd8')] }
    // ('deduction' twice: Training's power, then the second archetype's quality.)
    expect(traitsBefore(hero, 'deferredBonus').map((t) => t.trait.id)).toEqual(['fitness', 'alertness', 'agility', 'gadgets', 'deduction', 'strength', 'deduction', 'robotics'])
  })
})
