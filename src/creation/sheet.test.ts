import { describe, expect, it } from 'vitest'
import { createHero } from '../hero/model'
import { completeHero, P, Q } from '../test/heroes'
import { buildSheet, fillText } from './sheet'

describe('buildSheet', () => {
  it('assembles a complete, legal hero with no warnings', () => {
    const sheet = buildSheet(completeHero())
    expect(sheet.warnings).toEqual([])
    expect(sheet.characteristics).toEqual({ background: 'Upper Class', powerSource: 'Accident', archetype: 'Speedster', personality: 'Lone Wolf' })
    expect(sheet.powers.map((t) => `${t.name} ${t.die}`)).toEqual(['Speed d12', 'Agility d10', 'Awareness d8', 'Fire d8', 'Flight d6'])
    expect(sheet.qualities.map((t) => `${t.name} ${t.die}`)).toEqual(['Fitness d10', 'Alertness d8', 'Old Money d8'])
    expect(sheet.statusDice).toEqual({ green: 'd8', yellow: 'd8', red: 'd8' })
    expect(sheet.maxHealth).toBe(30)
    expect(sheet.healthRanges?.green).toEqual([30, 23])
    expect(sheet.outAbility).toBe('Boost an ally by rolling your single Fitness die.')
  })

  it('lists abilities by zone, with blanks filled in', () => {
    const sheet = buildSheet(completeHero())
    const byZone = (zone: string) => sheet.abilities.filter((a) => a.zone === zone).map((a) => a.name)
    expect(byZone('green')).toEqual(['Immunity', 'Always on the Move', 'Non-stop Assault', 'Principle of Business', 'Principle of the Gearhead'])
    expect(byZone('yellow')).toEqual(['Inflict', 'Area Alteration', 'Speedy Analysis'])
    expect(byZone('red')).toEqual(['Paragon Feat', 'Push Your Limits'])
    const area = sheet.abilities.find((a) => a.name === 'Area Alteration')!
    expect(area.text).toMatch(/^Boost any number of nearby targets using Agility\./)
    expect(sheet.abilities.find((a) => a.name === 'Immunity')?.text).toBe('You do not take damage from Fire.')
  })

  it('shows principles’ text and twists', () => {
    const sheet = buildSheet(completeHero())
    expect(sheet.principles.map((p) => p.name)).toEqual(['Principle of Business', 'Principle of the Gearhead'])
    expect(sheet.principles[0]?.minorTwist.length).toBeGreaterThan(0)
  })

  it('fills a principle’s blank, and applies the principle retcon', () => {
    const hero = completeHero()
    hero.retcon = { id: 'change-principle', kind: 'changePrinciple', replace: 'archetype', with: { id: 'energy-element', customization: 'Fire' } }
    const sheet = buildSheet(hero)
    expect(sheet.principles.map((p) => p.name)).toEqual(['Principle of Business', 'Principle of Fire'])
    expect(sheet.principles[1]?.roleplaying).toContain('affinity to or a love of Fire')
    expect(sheet.abilities.find((a) => a.source === 'principle' && a.name === 'Principle of Fire')?.text).toContain('involving Fire')
  })

  it('uses custom ability names, and applies the ability and Red retcons', () => {
    const hero = completeHero()
    hero.powerSource!.abilities[1]!.customName = 'Searing Blow'
    hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'powerSource.yellow', name: 'Inflict' }, uses: [P('awareness')] }
    const sheet = buildSheet(hero)
    const blow = sheet.abilities.find((a) => a.baseName === 'Inflict')!
    expect(blow.name).toBe('Searing Blow')
    expect(blow.text).toMatch(/^Attack using Awareness\./)
    hero.retcon = { id: 'extra-red-ability', kind: 'gainRedAbility', ability: { source: 'red', name: 'Reactive Strike', category: 'power:athletic', uses: [P('speed')] } }
    expect(buildSheet(hero).abilities.filter((a) => a.zone === 'red').map((a) => a.name)).toEqual(['Paragon Feat', 'Push Your Limits', 'Reactive Strike'])
  })

  it('includes fixed abilities without blanks even when no pick is recorded', () => {
    const hero = completeHero()
    hero.archetype = { id: 'modular', traits: [], abilities: [], bonus: [] }
    const names = buildSheet(hero).abilities.map((a) => a.name)
    expect(names).toEqual(expect.arrayContaining(['Switch', 'Quick Switch', 'Emergency Switch']))
  })

  it('collects warnings from every check, including the Out ability', () => {
    const hero = completeHero()
    hero.personality!.outUses = []
    hero.redAbilities.pop()
    const codes = buildSheet(hero).warnings.map((w) => `${w.step}:${w.code}`)
    expect(codes).toEqual(expect.arrayContaining(['personality:slot-empty', 'redAbilities:ability-count']))
  })

  it('handles a brand-new hero', () => {
    expect(buildSheet(createHero('guided'))).toEqual({
      characteristics: { background: undefined, powerSource: undefined, archetype: undefined, personality: undefined },
      powers: [],
      qualities: [],
      statusDice: undefined,
      maxHealth: undefined,
      healthRanges: undefined,
      principles: [],
      abilities: [],
      outAbility: undefined,
      warnings: [],
    })
  })
})

describe('fillText', () => {
  it('leaves unfilled blanks in brackets, and joins multi-choices', () => {
    const hero = completeHero()
    expect(fillText(hero, 'Attack using [power]. [Boost or Hinder] someone.')).toBe('Attack using [power]. [Boost or Hinder] someone.')
    expect(fillText(hero, 'Take [choose two basic actions] using [quality].', [Q('fitness')], { 'choose two basic actions': ['Attack', 'Defend'] })).toBe(
      'Take Attack and Defend using Fitness.',
    )
  })
})
