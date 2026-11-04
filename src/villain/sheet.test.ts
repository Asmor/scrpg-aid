import { describe, expect, it } from 'vitest'
import { A, P, Q } from '../test/heroes'
import { adaptiveBruiser, bullyOverlord } from '../test/villains'
import { createVillain } from './model'
import { isKnownBracket } from '../rules/slots'
import { villainApproaches, villainArchetypes, villainMasteries, villainUpgrades } from '../rules/villain-data'
import { buildVillainSheet, fitsUsePattern, villainHealth, villainMakesMinions, villainTraits, villainZones } from './sheet'

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
      'Science is already assigned.',
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
    expect(buildVillainSheet(v).warnings.find((w) => w.code === 'use-pattern')).toMatchObject({ step: 'approach', field: 'abilities:approach' })
    // It's only judged once every chosen ability's slot is filled.
    v.approach.abilities[2] = { source: 'approach', name: 'Vicious Entanglement' }
    expect(codes(v)).not.toContain('use-pattern')
  })

  it('checks Prideful’s and Underpowered’s “each a different power or quality”', () => {
    const v = adaptiveBruiser()
    v.approach = {
      id: 'prideful',
      traits: [A(P('robotics'), 'd10'), A(P('strength'), 'd10'), A(P('power-suit'), 'd10'), A(P('agility'), 'd8'), A(Q('fitness'), 'd10'), A(Q('science'), 'd10'), A(Q('technology'), 'd8'), A(Q('history'), 'd8')],
      abilities: [],
    }
    v.approach.abilities = [
      { source: 'approach', name: 'I Will Deal With the Rest of You Later', uses: [P('strength')] },
      { source: 'approach', name: 'My Greatness Cannot Be Denied', uses: [P('strength')] },
    ]
    expect(buildVillainSheet(v).warnings.find((w) => w.code === 'not-different')).toMatchObject({ step: 'approach', field: 'abilities:approach' })
    v.approach.abilities[1]!.uses = [Q('fitness')]
    expect(codes(v)).not.toContain('not-different')
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
    expect(buildVillainSheet(v).health).toMatchObject({ max: 65, parts: expect.arrayContaining([{ kind: 'upgrade', label: 'Calming Aura', value: 10 }]) })
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
    big.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    // It's taken in the upgrade's own list, and named after it.
    expect(buildVillainSheet(big).warnings).toContainEqual({ step: 'upgrades', code: 'ability-count', message: 'Choose 1 of the Power Upgrade extra Bruiser abilities; you have 0.', field: 'abilities:upgrade:power-upgrade:extra' })
    big.upgrades[0]!.extra = [{ source: 'archetype', name: 'Lash Out', uses: [P('robotics')] }]
    expect(messages(big)).toContain('Lash Out is already one of your Bruiser abilities.')
    big.upgrades[0]!.extra = [{ source: 'archetype', name: 'Feel No Pain' }]
    const sheet2 = buildVillainSheet(big)
    expect(sheet2.warnings.filter((w) => w.step === 'upgrades')).toEqual([])
    expect(sheet2.abilities.find((a) => a.baseName === 'Feel No Pain')).toMatchObject({ source: 'archetype', upgrade: 'Power Upgrade' })
    // The changes, for the wizard's before-and-after list.
    expect(villainTraits(big).upgrades).toEqual([
      expect.objectContaining({ upgradeId: 'power-upgrade', list: 'archetype', extra: 1, changes: expect.arrayContaining([expect.objectContaining({ name: 'Robotics', from: 'd12', to: 'd12', overflow: true }), expect.objectContaining({ name: 'Strength', from: 'd8', to: 'd10', overflow: false })]) }),
    ])
    // Extra abilities where nothing overflowed.
    v.upgrades[0]!.extra = [{ source: 'archetype', name: 'Feel No Pain' }]
    expect(codes(v)).toContain('ability-count')
    v.upgrades = [{ id: 'mook-squad', abilities: [], extra: [{ source: 'approach', name: 'Thick' }] }]
    expect(codes(v)).toContain('overflow-count')
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

  it('works out Health for the number of heroes', () => {
    const v = adaptiveBruiser()
    v.heroCount = 2
    expect(buildVillainSheet(v).health).toMatchObject({ max: 45, heroCount: 2 })
    v.heroCount = 0
    expect(buildVillainSheet(v).warnings).toEqual([{ step: 'health', code: 'hero-count', message: 'The villain needs to face at least one hero.', field: 'hero-count' }])
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
    // The fourth comes from Quality Upgrade's own list, so the approach's three keep the pattern.
    const fourth = v.approach.abilities.pop()!
    v.upgrades = [{ id: 'quality-upgrade', abilities: [], extra: [fourth] }]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    expect(buildVillainSheet(v).warnings).toEqual([])
    // Without the upgrade, three abilities, and a third quality breaks the pattern.
    v.upgrades = []
    v.mastery = null
    v.approach.abilities.splice(1, 1, fourth)
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


describe('villain Health', () => {
  it('lists every term, upgrades with no Health included, and the total', () => {
    const v = bullyOverlord()
    expect(villainHealth(v)).toEqual({
      total: 60,
      terms: [
        { kind: 'base', label: 'Bully base', value: 25 },
        { kind: 'modifier', label: 'Overlord modifier', value: 15 },
        { kind: 'heroes', label: '5 × 4 heroes', value: 20 },
        { kind: 'upgrade', label: 'Mook Squad', value: 0 },
      ],
    })
    expect(villainHealth(v, 1)).toMatchObject({ total: 45, terms: expect.arrayContaining([{ kind: 'heroes', label: '5 × 1 hero', value: 5 }]) })
  })

  it('has no total until the approach and archetype are chosen', () => {
    const v = createVillain()
    expect(villainHealth(v)).toEqual({
      terms: [
        { kind: 'base', label: 'Approach base', value: null },
        { kind: 'modifier', label: 'Archetype modifier', value: null },
        { kind: 'heroes', label: '5 × 4 heroes', value: 20 },
      ],
    })
  })

  it('gives zones from the chart, the top row for 100 or more', () => {
    expect(villainZones(60)).toEqual({ max: 60, green: [60, 41], yellow: [40, 17], red: [16, 1] })
    expect(villainZones(100)).toMatchObject({ max: 100, green: [100, 75] })
    expect(villainZones(135)).toEqual({ max: 135, green: [135, 75], yellow: [74, 26], red: [25, 1] })
    expect(villainZones(10)).toMatchObject({ green: [10, 10] })
    expect(villainZones(62)).toBeUndefined()
  })
})

describe('abilities that make minions (ruling 66)', () => {
  it('are found in every list the villain takes from', () => {
    const v = adaptiveBruiser()
    v.archetype = { id: 'legion', abilities: [] }
    // Legion's fixed ability doesn't make minions.
    expect(villainMakesMinions(v)).toBe(false)
    v.archetype.abilities.push({ source: 'archetype', name: 'Split Up' })
    expect(villainMakesMinions(v)).toBe(true)
    v.archetype.abilities = []
    v.upgrades = [{ id: 'mook-squad', abilities: [] }]
    expect(villainMakesMinions(v)).toBe(true)
    v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd8', abilities: [{ source: 'vehicle', name: 'Minion Deployment' }] } }]
    expect(villainMakesMinions(v)).toBe(true)
  })
})
