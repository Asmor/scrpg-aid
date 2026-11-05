import { describe, expect, it } from 'vitest'
import { createHero } from '../hero/model'
import { completeHero, P, Q } from '../test/heroes'
import { buildSheet, fillText, heroIdentity } from './sheet'

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

  it('gives each ability its effects from the data, narrowed by the player’s choices', () => {
    const sheet = buildSheet(completeHero())
    const effects = (name: string) => sheet.abilities.find((a) => a.name === name)!.effects
    expect(effects('Inflict')).toEqual(['attack', 'hinder'])
    expect(effects('Immunity')).toEqual([])
    // "[Boost or Hinder]" filled in as Boost.
    expect(effects('Area Alteration')).toEqual(['boost'])
    expect(effects('Paragon Feat')).toEqual(['overcome', 'boost'])
    expect(sheet.outEffects).toEqual(['boost'])
  })

  it('gives each ability what using it takes: effects, pool, and traits', () => {
    const hero = completeHero()
    const sheet = buildSheet(hero)
    const use = (name: string) => sheet.abilities.find((a) => a.name === name)!.use
    // Filled slots give the traits; "[Boost or Hinder]" filled as Boost narrows the effect.
    expect(use('Inflict')).toEqual({ effects: [{ actions: ['attack'], use: 'mid' }, { actions: ['hinder'], use: 'min' }], traits: [P('fire')] })
    expect(use('Area Alteration')).toEqual({ effects: [{ actions: ['boost'], use: 'max', fromBlank: 'Boost or Hinder' }], traits: [P('agility')] })
    // Left unfilled, both actions stay.
    hero.powerSource!.abilities = hero.powerSource!.abilities.map((a) => (a.name === 'Area Alteration' ? { ...a, blanks: {} } : a))
    expect(buildSheet(hero).abilities.find((a) => a.name === 'Area Alteration')!.use.effects[0]!.actions).toEqual(['boost', 'hinder'])
    // The Out ability rolls a single die: its quality.
    expect(sheet.outUse).toEqual({ effects: [{ actions: ['boost'], use: 'single' }], pool: { single: 'trait' }, traits: [Q('fitness')] })
  })

  it('takes the trait an ability names when it has no slots', () => {
    const hero = completeHero()
    hero.redAbilities = [{ source: 'red', name: 'Major Regeneration', category: 'power:athletic' }]
    expect(buildSheet(hero).abilities.find((a) => a.name === 'Major Regeneration')!.use.traits).toEqual([P('vitality')])
  })

  it('works out a custom principle’s effects from its text', () => {
    const hero = completeHero()
    hero.background!.principle = { id: 'custom', custom: { category: 'identity', name: 'Grit', roleplaying: 'r', minorTwist: 'm', majorTwist: 'M', greenAbility: { name: 'Grit', text: 'Defend using your Max die.' } } }
    const grit = buildSheet(hero).abilities.find((a) => a.name === 'Grit')!
    expect(grit.effects).toEqual(['defend'])
    expect(grit.use).toEqual({ effects: [{ actions: ['defend'], use: 'max' }], traits: [] })
    // Effects the player set win over the text.
    hero.background!.principle!.custom!.greenAbility.effects = [{ actions: ['overcome'], use: 'mid' }]
    const set = buildSheet(hero).abilities.find((a) => a.name === 'Grit')!
    expect(set.effects).toEqual(['overcome'])
    expect(set.use.effects).toEqual([{ actions: ['overcome'], use: 'mid' }])
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

  it('includes fixed abilities even when no pick is recorded, with unfilled blanks in brackets', () => {
    const hero = completeHero()
    hero.archetype = { id: 'modular', traits: [], abilities: [], bonus: [] }
    const names = buildSheet(hero).abilities.map((a) => a.name)
    expect(names).toEqual(expect.arrayContaining(['Switch', 'Quick Switch', 'Emergency Switch']))
    hero.archetype = { id: 'minion-maker', traits: [], abilities: [], bonus: [] }
    expect(buildSheet(hero).abilities.find((a) => a.name === 'Make Minion')?.text).toContain('[power]')
  })

  it('fills in Principle of Dependence’s blank', () => {
    const hero = completeHero()
    hero.background = { ...hero.background!, id: 'unremarkable', qualities: hero.background!.qualities, principle: { id: 'dependence', customization: 'my inhaler' } }
    const sheet = buildSheet(hero)
    expect(sheet.principles[0]?.roleplaying).toBe('You are reliant on my inhaler and cannot normally function without it.')
  })

  it('lets the ability retcon change the Out ability', () => {
    const hero = completeHero()
    hero.retcon = { id: 'change-ability-trait', kind: 'changeAbilityTrait', ability: { source: 'out', name: 'Out ability' }, uses: [Q('alertness')] }
    const sheet = buildSheet(hero)
    expect(sheet.outAbility).toBe('Boost an ally by rolling your single Alertness die.')
    expect(sheet.warnings.filter((w) => w.step === 'retcon')).toEqual([])
  })

  it('warns about a retcon the hero can’t take', () => {
    const hero = completeHero()
    hero.personality = { id: 'nurturing', bonus: [], outUses: [Q('fitness')] }
    hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
    expect(buildSheet(hero).warnings.map((w) => w.code)).toContain('retcon-not-allowed')
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
      advancement: { backIssues: 0, collections: [], changes: [] },
      characteristics: { background: undefined, powerSource: undefined, archetype: undefined, personality: undefined },
      powers: [],
      qualities: [],
      statusDice: undefined,
      maxHealth: undefined,
      healthRanges: undefined,
      principles: [],
      abilities: [],
      outAbility: undefined,
      outEffects: [],
      forms: [],
      minionForms: [],
      modes: [],
      powerlessMode: undefined,
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

  it('names the hero’s identity from whichever characteristics are chosen', () => {
    expect(heroIdentity(buildSheet(completeHero()))).toBe('Upper Class · Accident · Speedster · Lone Wolf')
    const partial = completeHero()
    partial.powerSource = null
    partial.personality = null
    expect(heroIdentity(buildSheet(partial))).toBe('Upper Class · Speedster')
    expect(heroIdentity(buildSheet(createHero('guided')))).toBe('')
  })
})
