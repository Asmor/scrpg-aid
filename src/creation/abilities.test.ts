import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import { A, completeHero, dividedHero, heroWithAbilities, P, Q, validHero } from '../test/heroes'
import { parseSlots, type TraitSlot } from '../rules/slots'
import { checkAbilities, checkAbilityPick, checkAbilityRetcon, limitedSlotIndex, primaryUse, slotCandidates } from './abilities'
import { deriveTraits } from './traits'
import { buildSheet } from './sheet'

const check = (hero: Hero) => checkAbilities(hero, deriveTraits(hero).traits)
const codes = (hero: Hero) => check(hero).map((w) => w.code)
const messages = (hero: Hero) => check(hero).map((w) => w.message)

describe('checkAbilities', () => {
  it('accepts legal power source and archetype abilities', () => {
    expect(check(heroWithAbilities())).toEqual([])
  })

  it('warns about abilities a power source doesn’t offer', () => {
    const hero = heroWithAbilities()
    // Training has no Green ability to choose.
    hero.powerSource!.id = 'training'
    expect(messages(hero)).toContain('Training has no Green abilities to choose.')
    const other = heroWithAbilities()
    other.powerSource!.abilities.push({ source: 'archetype.green', name: 'Inflict' })
    expect(messages(other)).toContain("Inflict isn't a power source ability.")
  })

  it('warns about archetype picks for a block the archetype doesn’t have', () => {
    const hero = heroWithAbilities()
    // Armored has fixed Green abilities and Green choices, but no Yellow ones.
    hero.archetype!.id = 'armored'
    expect(messages(hero)).toContain('Armored has no Yellow abilities to choose.')
  })

  it('describes category requirements', () => {
    const hero = heroWithAbilities()
    hero.archetype = { id: 'psychic', traits: [A(P('telepathy'), 'd12'), A(P('suggestion'), 'd6')], abilities: [{ source: 'archetype.yellow', name: 'Psychic Analysis', uses: [Q('alertness')] }], bonus: [] }
    expect(codes(hero)).not.toContain('requirement-unmet')
    hero.background!.qualities = [A(Q('fitness'), 'd10'), A(Q('finesse'), 'd8')]
    hero.archetype.abilities[0]!.uses = [Q('fitness')]
    expect(messages(hero)).toContain("Psychic Analysis requires a Mental quality, which you don't have.")
  })

  it('needs a power source and archetype to check anything', () => {
    const hero = heroWithAbilities()
    hero.powerSource = null
    hero.archetype = null
    expect(check(hero)).toEqual([])
  })

  describe('each pick', () => {
    it('needs its trait slots filled with traits the hero has, of the right kind', () => {
      const hero = heroWithAbilities()
      const yellow = hero.powerSource!.abilities
      yellow[1] = { source: 'powerSource.yellow', name: 'Inflict' }
      expect(messages(hero)).toEqual(['Fill in [power] for Inflict.'])
      yellow[1] = { source: 'powerSource.yellow', name: 'Inflict', uses: [P('telepathy')] }
      expect(messages(hero)).toEqual(["Inflict uses Telepathy, which you don't have."])
      yellow[1] = { source: 'powerSource.yellow', name: 'Inflict', uses: [Q('fitness')], customName: 'Searing Blow' }
      expect(messages(hero)).toEqual(["[power] for Searing Blow can't be Fitness."])
    })

    it('needs its choices filled from the allowed options', () => {
      const hero = heroWithAbilities()
      const area = hero.powerSource!.abilities[2]!
      area.blanks = {}
      expect(messages(hero)).toEqual(['Fill in [Boost or Hinder] for Area Alteration.'])
      area.blanks = { 'Boost or Hinder': 'Attack' }
      expect(messages(hero)).toEqual(['[Boost or Hinder] for Area Alteration must be Boost or Hinder.'])
      hero.powerSource!.abilities[0]!.blanks = { 'energy/element': '  ' }
      expect(codes(hero)).toContain('blank-empty')
    })

    it('checks multi-choice blanks (Higher Power’s Embolden: two different basic actions)', () => {
      const hero = heroWithAbilities()
      hero.powerSource!.id = 'higher-power'
      const embolden = { source: 'powerSource.yellow' as const, name: 'Embolden', uses: [P('fire')], blanks: { 'choose two basic actions': ['Attack', 'Boost'] } }
      hero.powerSource!.abilities = [embolden]
      const blankCodes = () => codes(hero).filter((c) => c.startsWith('blank'))
      expect(blankCodes()).toEqual([])
      embolden.blanks['choose two basic actions'] = ['Attack', 'Attack']
      expect(messages(hero)).toContain('[choose two basic actions] for Embolden needs 2 different choices.')
      embolden.blanks['choose two basic actions'] = ['Attack']
      expect(blankCodes()).toEqual(['blank-empty'])
      embolden.blanks['choose two basic actions'] = ['Attack', 'Dance']
      expect(blankCodes()).toEqual(['blank-invalid'])
    })

    it('checks ability requirements (Psychic Yellow abilities)', () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'psychic',
        traits: [A(P('telepathy'), 'd12'), A(P('suggestion'), 'd6')],
        abilities: [
          { source: 'archetype.green', name: 'Psychic Assault', uses: [P('telepathy')] },
          { source: 'archetype.green', name: 'Psychic Insight' },
          { source: 'archetype.yellow', name: 'Telepathic Whammy' },
          { source: 'archetype.yellow', name: 'Swarm' },
        ],
        bonus: [],
      }
      expect(messages(hero)).toEqual(["Swarm requires Animal Control, which you don't have."])
    })
  })

  describe('blocks', () => {
    it('checks how many abilities are taken, and that they exist', () => {
      const hero = heroWithAbilities()
      hero.archetype!.abilities.pop()
      expect(messages(hero)).toEqual(['Choose 1 of the Speedster Yellow abilities; you have 0.'])
      hero.archetype!.abilities.push({ source: 'archetype.yellow', name: 'Made Up' })
      expect(codes(hero)).toEqual(['unknown-ability'])
    })

    it('warns about the same ability twice', () => {
      const hero = heroWithAbilities()
      hero.archetype!.abilities[1] = { source: 'archetype.green', name: 'Always on the Move', uses: [Q('alertness')] }
      expect(codes(hero)).toContain('ability-twice')
    })

    it('rule: different powers / powers or qualities', () => {
      const hero = heroWithAbilities()
      hero.powerSource!.abilities[2]!.uses = [P('fire')]
      expect(messages(hero)).toEqual(['Each of your Accident Yellow abilities must use a different power.'])
      const other = heroWithAbilities()
      other.archetype!.abilities[1] = { source: 'archetype.green', name: 'Fast Fingers', uses: [P('speed')] }
      expect(codes(other)).toEqual(['not-different'])
    })

    it('usesFrom archetypeLists: Speedster abilities use traits from its lists', () => {
      const hero = heroWithAbilities()
      hero.archetype!.abilities[0]!.uses = [P('fire')]
      expect(messages(hero)).toEqual([
        "Your Speedster Green abilities must use a power or quality from the Speedster lists; Fire isn't one.",
      ])
    })

    it('requireAtLeast: Marksman needs Signature Weaponry and a quality', () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'marksman',
        traits: [A(P('signature-weaponry'), 'd12'), A(Q('ranged-combat'), 'd6')],
        abilities: [
          { source: 'archetype.green', name: 'Load', uses: [P('signature-weaponry')] },
          { source: 'archetype.green', name: 'Precise Shot', uses: [Q('ranged-combat')] },
          { source: 'archetype.yellow', name: 'X' },
        ],
        bonus: [],
      }
      expect(codes(hero).filter((c) => c === 'uses-at-least')).toEqual([])
      hero.archetype.abilities[1]!.uses = [P('signature-weaponry')]
      expect(messages(hero)).toContain('Your Marksman Green abilities need 1 using Signature Weaponry and 1 using a quality.')
    })

    it('minDifferentPowers counts only abilities that use a trait', () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'armored',
        traits: [A(P('power-suit'), 'd12'), A(Q('fitness'), 'd6')],
        abilities: [
          { source: 'archetype.fixedGreen', name: 'Armored' },
          { source: 'archetype.green', name: 'Deflect' },
          { source: 'archetype.green', name: 'Dual Offense', uses: [P('power-suit')] },
          { source: 'archetype.green', name: 'Repair', uses: [P('agility')] },
        ],
        bonus: [],
      }
      expect(codes(hero).filter((c) => c === 'too-few-powers')).toEqual([])
      hero.archetype.abilities[3]!.uses = [P('power-suit')]
      expect(messages(hero)).toContain('Your Armored Green abilities must use at least 2 different powers.')
    })

    it('fromGreenList and differentFromGreen: Physical Powerhouse’s Yellow ability', () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'physical-powerhouse',
        traits: [A(P('strength'), 'd12'), A(P('leaping'), 'd6')],
        abilities: [
          { source: 'archetype.green', name: 'Power Strike', uses: [P('strength')] },
          { source: 'archetype.green', name: 'Galvanize', uses: [P('leaping')] },
          { source: 'archetype.yellow', name: 'Frontline Fighting', uses: [Q('fitness')] },
        ],
        bonus: [],
      }
      expect(codes(hero)).toEqual([])
      hero.archetype.abilities[2] = { source: 'archetype.yellow', name: 'Frontline Fighting', uses: [P('strength')] }
      expect(codes(hero)).toEqual(['same-as-green'])
      hero.archetype.abilities[2] = { source: 'archetype.yellow', name: 'Galvanize', uses: [Q('fitness')] }
      expect(codes(hero)).toEqual(['ability-twice'])
    })
  })

  describe('fixed abilities', () => {
    it('need their blanks filled, and follow Minion-Maker’s different-powers rule', () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'minion-maker',
        traits: [A(P('robotics'), 'd12'), A(Q('creativity'), 'd6')],
        abilities: [
          { source: 'archetype.fixedGreen', name: 'Make Minion', uses: [P('robotics')] },
          { source: 'archetype.fixedGreen', name: 'Power Up', uses: [P('agility')] },
          { source: 'archetype.yellow', name: 'Minion Formation', uses: [P('robotics')] },
        ],
        bonus: [],
      }
      const fixedCodes = () => codes(hero).filter((c) => ['fixed-unfilled', 'not-different', 'unknown-ability'].includes(c))
      expect(fixedCodes()).toEqual([])
      hero.archetype.abilities[1]!.uses = [P('robotics')]
      expect(messages(hero)).toContain('Each of your Minion-Maker fixed Green abilities must use a different power.')
      hero.archetype.abilities.splice(0, 2)
      expect(messages(hero)).toEqual(expect.arrayContaining(['Fill in the blanks for Make Minion.', 'Fill in the blanks for Power Up.']))
      hero.archetype.abilities.push({ source: 'archetype.fixedGreen', name: 'Not Fixed' })
      expect(fixedCodes()).toContain('unknown-ability')
    })
  })

  describe('more restrictions', () => {
    const blasterHero = () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'blaster',
        traits: [A(P('cold'), 'd12'), A(P('flight'), 'd6')],
        abilities: [
          { source: 'archetype.green', name: 'Exploit Vulnerability', uses: [P('cold')] },
          { source: 'archetype.green', name: 'Disabling Blast', uses: [P('flight')] },
          { source: 'archetype.yellow', name: 'Heedless Blast', uses: [P('cold')] },
          { source: 'archetype.yellow', name: 'Imbue with Element', uses: [P('fire')] },
        ],
        bonus: [],
      }
      return hero
    }

    it('usesFrom archetypePowerList: Blaster Green abilities use powers from its power lists', () => {
      const hero = blasterHero()
      expect(codes(hero)).toEqual([])
      hero.archetype!.abilities[1]!.uses = [P('agility')]
      expect(messages(hero)).toEqual([
        "Your Blaster Green abilities must use a power from the Blaster lists; Agility isn't one.",
      ])
    })

    it('usesFrom a list of references: Elemental Manipulator', () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'elemental-manipulator',
        traits: [A(P('cold'), 'd12'), A(P('flight'), 'd6')],
        abilities: [
          // Both may use the same Elemental/Energy power (the user's ruling).
          { source: 'archetype.green', name: 'Backlash', uses: [P('cold')] },
          { source: 'archetype.green', name: 'Energy Conversion', uses: [P('cold')] },
          { source: 'archetype.yellow', name: 'Energy Alignment', uses: [P('fire')] },
        ],
        bonus: [],
      }
      expect(codes(hero)).toEqual([])
      hero.archetype.abilities[1]!.uses = [P('flight')]
      expect(messages(hero)).toEqual([
        "Your Elemental Manipulator Green abilities must use an Elemental/Energy power; Flight isn't one.",
      ])
    })

    it('differentQualities: Marksman Yellow abilities', () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'marksman',
        traits: [A(P('signature-weaponry'), 'd12'), A(Q('ranged-combat'), 'd6')],
        abilities: [
          { source: 'archetype.green', name: 'Load', uses: [P('signature-weaponry')] },
          { source: 'archetype.green', name: 'Precise Shot', uses: [Q('ranged-combat')] },
          { source: 'archetype.yellow', name: 'Called Shot', uses: [Q('fitness')] },
          { source: 'archetype.yellow', name: 'Ricochet', uses: [Q('ranged-combat')] },
        ],
        bonus: [],
      }
      expect(codes(hero)).toEqual([])
      hero.archetype.abilities[3]!.uses = [Q('fitness')]
      expect(messages(hero)).toEqual(['Each of your Marksman Yellow abilities must use a different quality.'])
    })

    it('an ability that names its trait uses it: two Powered Suit Yellow abilities can’t both use Power Suit', () => {
      const hero = heroWithAbilities()
      hero.powerSource = {
        id: 'powered-suit',
        powers: [A(P('power-suit'), 'd10'), A(P('fire'), 'd8'), A(P('awareness'), 'd8')],
        abilities: [
          { source: 'powerSource.green', name: 'Damage Reduction', blanks: { 'physical or energy': 'Physical' } },
          { source: 'powerSource.yellow', name: 'Onboard Upgrade' },
          { source: 'powerSource.yellow', name: 'Explosive Attack', uses: [P('fire')] },
        ],
        bonus: [],
      }
      expect(codes(hero).filter((c) => c !== 'dice-mismatch')).toEqual([])
      hero.powerSource.abilities[2]!.uses = [P('power-suit')]
      expect(messages(hero)).toContain('Each of your Powered Suit Yellow abilities must use a different power.')
    })

    it('rules about powers ignore abilities used with a quality (the user’s ruling)', () => {
      const hero = heroWithAbilities()
      hero.archetype = {
        id: 'wild-card',
        traits: [A(P('leaping'), 'd12'), A(Q('banter'), 'd6')],
        abilities: [
          { source: 'archetype.green', name: 'Gimmick', uses: [P('leaping')], blanks: {} },
          { source: 'archetype.green', name: 'Multitask', uses: [Q('banter')] },
          { source: 'archetype.yellow', name: 'Danger!', uses: [P('leaping')] },
        ],
        bonus: [],
      }
      expect(codes(hero)).toEqual([])
      const armored = heroWithAbilities()
      armored.archetype = {
        id: 'armored',
        traits: [A(P('power-suit'), 'd12'), A(Q('fitness'), 'd6')],
        abilities: [
          { source: 'archetype.green', name: 'Dual Offense', uses: [P('power-suit')] },
          { source: 'archetype.green', name: 'Repair', uses: [P('power-suit')] },
          { source: 'archetype.green', name: 'Unstoppable Charge', uses: [Q('fitness')] },
        ],
        bonus: [],
      }
      // Two power uses, both Power Suit: still too few different powers; the quality use doesn't count.
      expect(codes(armored)).toContain('too-few-powers')
      armored.archetype.abilities[1]!.uses = [Q('fitness')]
      expect(codes(armored)).not.toContain('too-few-powers')
    })

    it('Modular skips its base archetype’s abilities', () => {
      const hero = heroWithAbilities()
      const speedster = hero.archetype!
      hero.archetype = { id: 'modular', traits: [], abilities: [], bonus: [], secondary: speedster }
      expect(messages(hero)).toContain("Modular skips Speedster's abilities; remove them.")
      speedster.abilities = []
      expect(codes(hero)).not.toContain('skipped-abilities')
    })

    it('skips the archetype’s own blocks for Divided and Modular', () => {
      const hero = heroWithAbilities()
      hero.archetype = { id: 'modular', traits: [A(P('leaping'), 'd12'), A(P('flight'), 'd6')], abilities: [{ source: 'archetype.green', name: 'Whatever' }], bonus: [] }
      // Modular has no Green/Yellow choice blocks; stray picks are flagged in ./modular.ts.
      expect(codes(hero)).not.toContain('ability-count')
      expect(codes(hero)).not.toContain('unknown-ability')
    })
  })

  describe('single picks', () => {
    it('“a power gained from your archetype” only accepts powers from the archetype step', () => {
      const hero = heroWithAbilities()
      const traits = deriveTraits(hero).traits
      const ability = { name: 'Test', type: 'A' as const, text: 'Attack using [a power gained from your archetype].' }
      expect(checkAbilityPick(hero, traits, ability, { source: 'archetype.green', name: 'Test', uses: [P('speed')] }, 'archetype')).toEqual([])
      expect(checkAbilityPick(hero, traits, ability, { source: 'archetype.green', name: 'Test', uses: [P('agility')] }, 'archetype')).toEqual([
        { step: 'archetype', code: 'slot-wrong-trait', message: "[a power gained from your archetype] for Test can't be Agility.", field: 'ability:Test' },
      ])
    })

    it('warns about extra uses, and duplicate fixed abilities', () => {
      const hero = heroWithAbilities()
      hero.powerSource!.abilities[1]!.uses = [P('fire'), P('agility')]
      expect(messages(hero)).toContain('Inflict only uses one power or quality; remove the extra.')
      hero.powerSource!.abilities[0]!.uses = [P('fire')]
      expect(messages(hero)).toContain("Immunity doesn't use a power or quality; remove the extra.")
      const mm = heroWithAbilities()
      mm.archetype = {
        id: 'minion-maker',
        traits: [A(P('robotics'), 'd12'), A(Q('creativity'), 'd6')],
        abilities: [
          { source: 'archetype.fixedGreen', name: 'Make Minion', uses: [P('robotics')] },
          { source: 'archetype.fixedGreen', name: 'Make Minion', uses: [P('robotics')] },
        ],
        bonus: [],
      }
      expect(messages(mm)).toContain('Make Minion is recorded more than once.')
    })

    it('finds the trait an ability uses', () => {
      const onboard = { name: 'Onboard Upgrade', type: 'A' as const, text: 'Boost yourself using Power Suit.', requires: { power: 'power-suit' } }
      expect(primaryUse(onboard, { source: 'powerSource.yellow', name: 'Onboard Upgrade' })).toEqual(P('power-suit'))
      const analysis = { name: 'Psychic Analysis', type: 'A' as const, text: 'Boost yourself using [Mental quality].', requires: { qualityCategory: 'mental' } }
      expect(primaryUse(analysis, { source: 'archetype.yellow', name: 'x', uses: [Q('alertness')] })).toEqual(Q('alertness'))
      const named = { name: 'Q', type: 'A' as const, text: 'Use History.', requires: { quality: 'history' } }
      expect(primaryUse(named, { source: 'red', name: 'Q' })).toEqual(Q('history'))
      expect(primaryUse({ name: 'D', type: 'R' as const, text: 'Deflect.' }, { source: 'red', name: 'D' })).toBeUndefined()
    })
  })

  describe('named-trait abilities', () => {
    it('may record the trait they name, but nothing else', () => {
      const hero = heroWithAbilities()
      const onboard = { name: 'Onboard Upgrade', type: 'A' as const, text: 'Boost yourself using Power Suit.', requires: { power: 'power-suit' } }
      hero.powerSource!.powers[0] = A(P('power-suit'), 'd10')
      const t = deriveTraits(hero).traits
      expect(checkAbilityPick(hero, t, onboard, { source: 'powerSource.yellow', name: 'Onboard Upgrade', uses: [P('power-suit')] }, 'powerSource')).toEqual([])
      expect(checkAbilityPick(hero, t, onboard, { source: 'powerSource.yellow', name: 'Onboard Upgrade', uses: [P('fire')] }, 'powerSource')).toEqual([
        { step: 'powerSource', code: 'slot-extra', message: 'Onboard Upgrade always uses Power Suit; remove the extra.', field: 'ability:Onboard Upgrade' },
      ])
    })
  })

  describe('ability retcon', () => {
    it('changes which trait an ability the hero took uses', () => {
      const hero = heroWithAbilities()
      const traits = () => deriveTraits(hero).traits
      hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'powerSource.yellow', name: 'Inflict' }, uses: [P('awareness')] }
      expect(checkAbilityRetcon(hero, traits())).toEqual([])
      hero.retcon.uses = [Q('fitness')]
      expect(checkAbilityRetcon(hero, traits()).map((w) => w.code)).toEqual(['slot-wrong-trait'])
      hero.retcon.uses = [P('fire')]
      expect(checkAbilityRetcon(hero, traits()).map((w) => w.code)).toEqual(['retcon-no-change'])
      hero.retcon.ability = { source: 'powerSource.yellow', name: 'Reflexive Burst' }
      expect(checkAbilityRetcon(hero, traits()).map((w) => w.message)).toEqual([
        "This retcon changes Reflexive Burst, which you haven't taken.",
      ])
    })

    it('works for Red abilities, and does nothing for other retcons', () => {
      const hero = heroWithAbilities()
      hero.redAbilities = [{ source: 'red', name: 'Paragon Feat', category: 'power:athletic', uses: [P('agility')] }]
      hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'red', name: 'Paragon Feat' }, uses: [P('speed')] }
      expect(checkAbilityRetcon(hero, deriveTraits(hero).traits)).toEqual([])
      // Only the bracket matters after the retcon (the user's ruling): Fire isn't Athletic, but that's fine.
      hero.retcon.uses = [P('fire')]
      expect(checkAbilityRetcon(hero, deriveTraits(hero).traits)).toEqual([])
      hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
      expect(checkAbilityRetcon(hero, deriveTraits(hero).traits)).toEqual([])
    })
  })
})

describe('slotCandidates', () => {
  const slot = (text: string) => parseSlots(text)[0] as TraitSlot
  it('offers the hero’s traits that fit a trait slot', () => {
    const hero = validHero()
    const traits = deriveTraits(hero).traits
    const ids = (text: string) => slotCandidates(hero, traits, slot(text), 'powerSource').map((t) => t.trait.id)
    expect(ids('[power]')).toEqual(['agility', 'fire', 'awareness', 'speed', 'flight'])
    expect(ids('[quality]')).toEqual(['fitness', 'alertness', 'roleplaying-quality'])
    expect(ids('[element/energy you have a related power for]')).toEqual(['fire'])
    // Only powers given dice in the archetype step.
    expect(ids('[a power gained from your archetype]')).toEqual(['speed', 'flight'])
  })

  it('applies a slot limit, such as a Red ability’s category, to slots of its kind', () => {
    const hero = validHero()
    const traits = deriveTraits(hero).traits
    const limit = { kind: 'power' as const, refs: [{ powerCategory: 'athletic' }], what: 'an Athletic power' }
    const ids = (text: string) => slotCandidates(hero, traits, slot(text), 'redAbilities', limit).map((t) => t.trait.id)
    expect(ids('[power]')).toContain('agility')
    expect(ids('[power]')).not.toContain('fire')
    // A quality slot isn't limited by a power category.
    expect(ids('[quality]')).toEqual(['fitness', 'alertness', 'roleplaying-quality'])
  })
})

describe('limitedSlotIndex', () => {
  const ability = (text: string) => ({ name: 'Test', type: 'A' as const, text })
  it('finds the first trait slot of the limit’s kind', () => {
    const limit = { kind: 'power' as const, refs: [], what: '' }
    expect(limitedSlotIndex(ability('Boost using [quality], then Attack using [power].'), limit)).toBe(1)
    expect(limitedSlotIndex(ability('Attack using [power] and [power].'), limit)).toBe(0)
    expect(limitedSlotIndex(ability('Boost using [quality].'), limit)).toBe(-1)
  })
})

describe('which list an issue is about', () => {
  const fields = (hero: Hero, code: string) => buildSheet(hero).warnings.filter((w) => w.code === code).map((w) => w.field)

  it('names the list for a list’s own problems, so they show on that list’s box', () => {
    const hero = completeHero()
    hero.powerSource!.abilities = hero.powerSource!.abilities.filter((p) => p.source !== 'powerSource.yellow')
    expect(fields(hero, 'ability-count')).toEqual(['abilities:powerSource.yellow'])
    const divided = dividedHero()
    divided.archetype!.abilities = divided.archetype!.abilities.filter((p) => p.source !== 'archetype.green')
    expect(fields(divided, 'ability-count')).toEqual(['abilities:archetype.green'])
    const red = completeHero()
    red.redAbilities = red.redAbilities.slice(1)
    expect(fields(red, 'ability-count')).toEqual(['abilities:red'])
  })
})

