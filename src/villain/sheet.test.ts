import { describe, expect, it } from 'vitest'
import { A, P, Q } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createVillain } from './model'
import { isKnownBracket } from '../rules/slots'
import { villainApproaches, villainArchetypes, villainMasteries, villainUpgrades } from '../rules/villain-data'
import { buildVillainSheet, fitsUsePattern } from './sheet'

const codes = (v: ReturnType<typeof adaptiveBruiser>) => buildVillainSheet(v).warnings.map((w) => w.code)
const messages = (v: ReturnType<typeof adaptiveBruiser>) => buildVillainSheet(v).warnings.map((w) => w.message)

describe('the villain sheet', () => {
  it('builds a legal minor villain with no warnings', () => {
    const sheet = buildVillainSheet(adaptiveBruiser())
    expect(sheet.warnings).toEqual([])
    expect(sheet).toMatchObject({ name: 'Ironclad', approach: 'Adaptive', archetype: 'Bruiser', major: false })
    expect(sheet.powers.map((t) => `${t.name} ${t.die}`)).toEqual(['Robotics d10', 'Power Suit d8', 'Strength d8', 'Agility d6'])
    expect(sheet.qualities.map((t) => `${t.name} ${t.die}`)).toEqual(['Technology d10', 'Fitness d8', 'Relentless d8', 'Science d8'])
    expect(sheet.abilities.map((a) => [a.source, a.name])).toEqual([
      ['approach', 'Adapt and Thrive'],
      ['approach', 'Initiate Upgrade Procedure'],
      ['approach', 'Powerful Imitation'],
      ['archetype', 'Lash Out'],
      ['archetype', 'Grin and Bear It'],
    ])
    expect(sheet.abilities[0]!.text).toBe('When Attacked, Defend by rolling your single Power Suit die. Also Boost yourself with the result of that die.')
    // Effects from the data, for icons and the game aid.
    expect(sheet.abilities[0]).toMatchObject({ effects: ['defend', 'boost'], use: { pool: { single: 'trait' }, traits: [{ kind: 'power', id: 'power-suit' }] } })
    const fragile = adaptiveBruiser()
    fragile.archetype = { id: 'fragile', abilities: [{ source: 'archetype', name: 'Cheese It!' }] }
    expect(buildVillainSheet(fragile).abilities.find((a) => a.name === 'Cheese It!')?.use).toEqual({ effects: [{ actions: ['defend'], use: 'single' }], pool: { single: 'status' }, traits: [] })
    expect(sheet.abilities.find((a) => a.name === 'Initiate Upgrade Procedure')?.use.effects).toEqual([
      { actions: ['boost'], use: 'max' },
      { actions: ['attack'], use: 'mid' },
      { actions: ['defend'], use: 'min' },
    ])
    // Adaptive 15 + Bruiser 20 + 4 heroes × 5 = 55.
    expect(sheet.health).toMatchObject({ max: 55, heroCount: 4, ranges: { green: [55, expect.any(Number)] } })
    expect(sheet.health!.parts.map((p) => p.value)).toEqual([15, 20, 20])
    expect(sheet.status).toMatchObject({ basis: 'healthZone', zones: { green: 'd6', yellow: 'd8', red: 'd10' } })
  })

  it('starts out asking for an approach and archetype', () => {
    expect(codes(createVillain())).toEqual(['approach-missing', 'archetype-missing'])
    const unknown = createVillain()
    unknown.approach = { id: 'nope', traits: [], abilities: [] }
    unknown.archetype = { id: 'nope', abilities: [] }
    expect(codes(unknown)).toEqual(['unknown-entry', 'unknown-entry'])
    expect(buildVillainSheet(unknown).health).toBeUndefined()
  })

  it('checks the approach’s dice', () => {
    const v = adaptiveBruiser()
    v.approach!.traits[0] = A(P('robotics'), 'd12')
    v.approach!.traits.push(A(Q('roleplaying-quality'), 'd10'), A(Q('science'), 'd6'))
    expect(messages(v)).toEqual([
      'The roleplaying quality comes with the approach at d8; assign the approach’s dice to other qualities.',
      'Science has more than one die.',
      "Assign Adaptive's power dice to powers: d10, d8, d8, d6.",
      "Assign Adaptive's quality dice to qualities: d10, d8, d8.",
    ])
  })

  it('checks ability picks with the hero rules: count, blanks, and traits held', () => {
    const v = adaptiveBruiser()
    v.approach!.abilities.pop()
    v.archetype!.abilities[0] = { source: 'archetype', name: 'Lash Out', uses: [P('flight')] }
    expect(messages(v)).toEqual(['Choose 3 of the Adaptive abilities; you have 2.', "Lash Out uses Flight, which you don't have."])
  })

  it('checks a “two share one power, the third another” approach', () => {
    expect(fitsUsePattern([P('a'), P('a'), P('b')], { uses: 'power', groups: [2, 1] })).toBe(true)
    expect(fitsUsePattern([P('a'), P('b')], { uses: 'power', groups: [2, 1] })).toBe(true)
    expect(fitsUsePattern([P('a'), P('b'), P('c')], { uses: 'power', groups: [2, 1] })).toBe(false)
    expect(fitsUsePattern([P('a'), P('a'), P('a')], { uses: 'power', groups: [2, 1] })).toBe(false)
    expect(fitsUsePattern([P('a'), Q('b')], { uses: 'power', groups: [2, 1] })).toBe(false)
    // Extra abilities (Quality Upgrade) may use anything (ruling 57).
    expect(fitsUsePattern([P('a'), P('a'), P('b'), P('c')], { uses: 'power', groups: [2, 1] }, 1)).toBe(true)
    expect(fitsUsePattern([P('a'), P('a'), P('b'), Q('x')], { uses: 'power', groups: [2, 1] }, 1)).toBe(true)
    expect(fitsUsePattern([P('a'), P('b'), P('c'), P('d')], { uses: 'power', groups: [2, 1] }, 1)).toBe(false)
    const v = adaptiveBruiser()
    v.approach = {
      id: 'focused',
      traits: [A(P('fire'), 'd12'), A(P('agility'), 'd8'), A(Q('fitness'), 'd10'), A(Q('science'), 'd8')],
      abilities: [
        { source: 'approach', name: 'Defensive Charging', uses: [P('fire')] },
        { source: 'approach', name: 'Pour it On', uses: [P('agility')] },
        { source: 'approach', name: 'Vicious Entanglement', uses: [P('fire')] },
      ],
    }
    v.archetype!.abilities = [
      { source: 'archetype', name: 'Lash Out', uses: [P('fire')] },
      { source: 'archetype', name: 'Grin and Bear It', uses: [Q('fitness')] },
    ]
    expect(codes(v)).toEqual([])
    v.approach.abilities[2] = { source: 'approach', name: 'Vicious Entanglement', uses: [Q('science')] }
    expect(codes(v)).toContain('use-pattern')
  })

  it('makes a major villain with upgrades, which needs a mastery', () => {
    const v = adaptiveBruiser()
    v.upgrades = [{ id: 'mook-squad', abilities: [] }, { id: 'defense-shield', abilities: [] }]
    // Both Defense Shield abilities have a [power] blank to fill.
    expect(codes(v)).toEqual(['fixed-unfilled', 'fixed-unfilled', 'mastery-missing'])
    v.upgrades[1]!.abilities = [
      { source: 'upgrade', name: 'Defense Shield', uses: [P('robotics')] },
      { source: 'upgrade', name: 'Reestablish Shield', uses: [P('robotics')] },
    ]
    const sheet = buildVillainSheet(v)
    expect(sheet.major).toBe(true)
    expect(sheet.warnings.map((w) => w.code)).toEqual(['mastery-missing'])
    expect(sheet.abilities.filter((a) => a.source === 'upgrade').map((a) => [a.name, a.upgrade])).toEqual([
      ['Alert!', 'Mook Squad'],
      [expect.any(String), 'Defense Shield'],
      [expect.any(String), 'Defense Shield'],
    ])
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    expect(buildVillainSheet(v)).toMatchObject({ warnings: [], mastery: { name: 'Master of Annihilation', type: 'I' } })
    // Neither adds Health; Calming Aura adds 10, listed in how Health adds up.
    expect(buildVillainSheet(v).health!.max).toBe(55)
    v.upgrades.push({ id: 'calming-aura', abilities: [] })
    expect(buildVillainSheet(v).health).toMatchObject({ max: 65, parts: expect.arrayContaining([{ label: 'Calming Aura', value: 10 }]) })
    v.upgrades.pop()
    v.upgrades = []
    expect(codes(v)).toEqual(['mastery-minor'])
    v.mastery = { source: 'mastery', name: 'Master of Nothing' }
    expect(codes(v)).toEqual(['unknown-entry', 'mastery-minor'])
    v.upgrades = [{ id: 'mook-squad', abilities: [] }, { id: 'mook-squad', abilities: [] }, { id: 'nope', abilities: [] }]
    expect(codes(v)).toEqual(['upgrade-twice', 'unknown-entry', 'unknown-entry'])
  })

  it('raises dice with Power Upgrade, and gives archetype abilities for powers already at d12', () => {
    const v = adaptiveBruiser()
    v.approach!.traits[0] = A(P('robotics'), 'd10')
    v.upgrades = [{ id: 'power-upgrade', abilities: [] }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    const sheet = buildVillainSheet(v)
    expect(sheet.powers.map((t) => t.die)).toEqual(['d12', 'd10', 'd10', 'd8'])
    expect(sheet.warnings).toEqual([])
    // With a d12 power to begin with, the archetype gives one more ability.
    const big = adaptiveBruiser()
    big.approach = { ...big.approach!, id: 'focused', traits: [A(P('robotics'), 'd12'), A(P('strength'), 'd8'), A(Q('fitness'), 'd10'), A(Q('science'), 'd8')], abilities: [] }
    big.upgrades = [{ id: 'power-upgrade', abilities: [] }]
    expect(messages(big)).toContain('Choose 3 of the Bruiser abilities; you have 2.')
  })

  it('builds a Villainous Vehicle with its die’s number of abilities', () => {
    const v = adaptiveBruiser()
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [] }]
    expect(codes(v)).toEqual(['vehicle-die'])
    v.upgrades[0]!.vehicle = { die: 'd12', abilities: [{ source: 'vehicle', name: 'Sturdy' }] }
    expect(messages(v)).toEqual(['Choose 2 of the Villainous Vehicle abilities; you have 1.'])
    v.upgrades[0]!.vehicle.abilities.push({ source: 'vehicle', name: 'Reliable', blanks: { 'basic action': 'Attack' } })
    const sheet = buildVillainSheet(v)
    expect(sheet.warnings).toEqual([])
    expect(sheet.vehicle).toMatchObject({ die: 'd12', abilities: [{ name: 'Sturdy' }, { name: 'Reliable', text: expect.stringContaining('Attack on its turn') }] })
    v.upgrades = [{ id: 'mook-squad', abilities: [], vehicle: { abilities: [] } }]
    expect(codes(v)).toEqual(['not-a-vehicle'])
  })

  it('gives Legion its fixed ability, and a Domain villain’s count-based status', () => {
    const v = adaptiveBruiser()
    v.archetype = { id: 'legion', abilities: [] }
    const sheet = buildVillainSheet(v)
    expect(sheet.abilities.find((a) => a.source === 'archetype.fixed')?.name).toBe('Uncoordinated Actions')
    expect(sheet.status).toMatchObject({ basis: 'count' })
    v.archetype.abilities.push({ source: 'archetype.fixed', name: 'Something Else' })
    expect(codes(v)).toContain('unknown-ability')
  })

  it('works out Health for the number of heroes, and warns off the chart', () => {
    const v = adaptiveBruiser()
    v.heroCount = 2
    expect(buildVillainSheet(v).health).toMatchObject({ max: 45, heroCount: 2 })
    v.heroCount = 0
    expect(codes(v)).toEqual(['hero-count'])
    v.heroCount = 30
    // 15 + 20 + 150 = 185: the top row covers 100 or more, its Green range from the max down.
    expect(buildVillainSheet(v).health).toMatchObject({ max: 185, ranges: { max: 185, green: [185, 75] } })
  })
})

describe('the villain data’s blanks', () => {
  it('are all ones the app knows how to fill', () => {
    const all = [
      ...villainApproaches.flatMap((a) => a.abilities.options),
      ...villainArchetypes.flatMap((a) => [...a.abilities.options, ...(a.fixedAbilities ?? [])]),
      ...villainUpgrades.flatMap((u) => [...(u.abilities ?? []), ...(u.vehicleAbilities ?? [])]),
      ...villainMasteries.options,
    ]
    const brackets = all.flatMap((a) => [...a.text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!))
    expect(brackets.length).toBeGreaterThan(0)
    expect(brackets.filter((b) => !isKnownBracket(b))).toEqual([])
  })
})

describe('more villain checks', () => {
  it('lets Quality Upgrade’s extra abilities use any quality, even with a pattern (ruling 57)', () => {
    // Specialized: two abilities share one quality, the third uses another. Its d12 quality
    // overflows under Quality Upgrade, so it takes four.
    const v = adaptiveBruiser()
    v.approach = {
      id: 'specialized',
      traits: [A(P('robotics'), 'd10'), A(P('strength'), 'd8'), A(Q('fitness'), 'd12'), A(Q('science'), 'd8')],
      abilities: [
        { source: 'approach', name: 'Cleaving Slash', uses: [Q('fitness')] },
        { source: 'approach', name: 'Focused Attack', uses: [Q('fitness')] },
        { source: 'approach', name: 'Tangled Torment', uses: [Q('science')] },
        { source: 'approach', name: 'Neutralizing Strike', uses: [Q('roleplaying-quality')] },
      ],
    }
    v.upgrades = [{ id: 'quality-upgrade', abilities: [] }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    expect(buildVillainSheet(v).warnings).toEqual([])
    // Without the upgrade, three abilities, and a third quality breaks the pattern.
    v.upgrades = []
    v.mastery = null
    v.approach.abilities.splice(1, 1)
    expect(buildVillainSheet(v).warnings.map((w) => w.code)).toEqual(['use-pattern'])
  })

  it('warns about fixed abilities recorded twice, and picks in the wrong place', () => {
    const v = adaptiveBruiser()
    v.archetype = { id: 'legion', abilities: [{ source: 'archetype.fixed', name: 'Uncoordinated Actions' }, { source: 'archetype.fixed', name: 'Uncoordinated Actions' }] }
    expect(buildVillainSheet(v).warnings.map((w) => w.code)).toContain('ability-twice')
    const w = adaptiveBruiser()
    w.approach!.abilities.push({ source: 'upgrade', name: 'Alert!' })
    expect(buildVillainSheet(w).warnings.map((x) => x.message)).toContain('Alert! is recorded in the wrong place; take it again from its list.')
  })
})

