import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { completeHero, formChangerHero, minionMakerHero, P, Q } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { sheetDiff, sheetsDiffer } from './sheet-diff'

const section = (diff: ReturnType<typeof sheetDiff>, name: string) => diff.find((d) => d.section === name)?.changes ?? []

describe('sheetDiff for heroes', () => {
  it('lists a change to how the hero looks: a cosmetic change is a sheet change', () => {
    const a = completeHero()
    const b = { ...a, details: { ...a.details, costume: 'red cape', hair: 'Red' } }
    expect(sheetDiff(a, b)).toEqual([{ section: 'Appearance', changes: ['Hair: none → Red', 'Costume / equipment: none → red cape'] }])
  })

  it('is empty for the same build, whatever the timestamps, tags or notes', () => {
    const a = completeHero()
    const b = { ...completeHero(), updatedAt: '2030-01-01T00:00:00.000Z', tags: ['new'], notes: 'changed' }
    expect(sheetDiff(a, b)).toEqual([])
    // ... though they do differ, for a solo game's quiet re-copy.
    expect(sheetsDiffer(a, b)).toBe(true)
    expect(sheetsDiffer(a, { ...a, updatedAt: 'later' })).toBe(false)
  })

  it('lists dice changes, and powers and qualities added or removed', () => {
    const a = completeHero()
    const b = completeHero()
    b.background!.qualities = [{ trait: Q('fitness'), die: 'd8' }, { trait: Q('alertness'), die: 'd10' }]
    b.powerSource!.powers = [{ trait: P('agility'), die: 'd10' }, { trait: P('fire'), die: 'd8' }, { trait: P('strength'), die: 'd8' }]
    const diff = sheetDiff(a, b)
    const name = (id: string) => [...buildSheet(a).qualities, ...buildSheet(a).powers].find((t) => t.trait.id === id)!.name
    expect(section(diff, 'Dice')).toEqual(expect.arrayContaining([`${name('fitness')} d10 → d8`, `${name('alertness')} d8 → d10`]))
    expect(section(diff, 'Powers and qualities')).toEqual(expect.arrayContaining([expect.stringMatching(/^New power: .+ d8$/), `Removed power: ${name('awareness')}`]))
  })

  it('names a renamed trait', () => {
    const b = completeHero()
    b.traitNames['quality:roleplaying-quality'] = 'New Money'
    expect(section(sheetDiff(completeHero(), b), 'Dice')).toEqual(['Old Money is now called New Money'])
  })

  it('lists abilities added, removed and changed, with their zone', () => {
    const a = completeHero()
    const b = completeHero()
    b.archetype!.abilities = b.archetype!.abilities.filter((x) => x.name !== 'Non-stop Assault')
    b.archetype!.abilities[0] = { ...b.archetype!.abilities[0]!, customName: 'Blur' }
    const lines = section(sheetDiff(a, b), 'Abilities')
    expect(lines).toContain('Removed: Non-stop Assault (Green)')
    expect(lines).toContain('Changed: Always on the Move (Green) is now Blur (Green)')
    expect(section(sheetDiff(b, a), 'Abilities')).toContain('New: Non-stop Assault (Green)')
  })

  it('lists principles, forms, max Health, the name, personality and status dice', () => {
    const a = completeHero()
    const b = completeHero()
    b.details = { ...b.details, name: 'Maya R.' }
    b.background!.principle = { id: 'business' }
    b.archetype!.principle = { id: 'destiny' }
    b.health = { ...b.health!, mode: 'roll', rollResult: 1 }
    const diff = sheetDiff({ ...a, details: { ...a.details, name: 'Maya' } }, b)
    expect(section(diff, 'Name')).toEqual(['Maya → Maya R.'])
    expect(section(diff, 'Principles')).toEqual(expect.arrayContaining([expect.stringMatching(/^New principle: /), expect.stringMatching(/^Removed principle: /)]))
    expect(section(diff, 'Health')).toEqual([`Max Health ${buildSheet(a).maxHealth} → ${buildSheet(b).maxHealth}`])
    // Form-Changer forms, and Minion-Maker's minion forms.
    // Named forms (unnamed ones are named by their place: "Green form 2").
    const named = () => {
      const h = formChangerHero()
      h.archetype!.forms = h.archetype!.forms!.map((f, i) => ({ ...f, name: f.name ?? `Form ${i}` }))
      return h
    }
    const forms = named()
    const fewer = named()
    fewer.archetype!.forms = fewer.archetype!.forms!.slice(1)
    expect(section(sheetDiff(forms, fewer), 'Forms and modes')).toEqual(['Removed form: Brute'])
    const maker = minionMakerHero()
    const less = minionMakerHero()
    less.archetype!.minionForms = { ...less.archetype!.minionForms!, forms: ['Autonomous'] }
    expect(section(sheetDiff(maker, less), 'Forms and modes')).toContain('Removed minion form: Explosive')
    // A new personality changes the personality and its status dice.
    const other = completeHero()
    other.personality = { id: 'impulsive', bonus: [] }
    const personality = section(sheetDiff(completeHero(), other), 'Personality and status dice')
    expect(personality[0]).toMatch(/^Personality: .+ → .+$/)
  })

  it('keeps sections in a fixed order', () => {
    const b = completeHero()
    b.details = { ...b.details, name: 'Someone' }
    b.health = { ...b.health!, mode: 'roll', rollResult: 1 }
    expect(sheetDiff(completeHero(), b).map((d) => d.section)).toEqual(['Name', 'Health'])
  })
})

describe('sheetDiff for villains', () => {
  it('lists the name, dice, abilities and max Health', () => {
    const a = adaptiveBruiser()
    const b = adaptiveBruiser()
    b.details = { ...b.details, name: 'Ironclad II' }
    b.heroCount = 3
    b.approach = { ...b.approach!, abilities: b.approach!.abilities.slice(1) }
    const diff = sheetDiff(a, b)
    expect(section(diff, 'Name')).toEqual(['Ironclad → Ironclad II'])
    expect(section(diff, 'Health')).toEqual(['Max Health 55 → 50'])
    expect(section(diff, 'Abilities')).toEqual(['Removed: Adapt and Thrive'])
    expect(sheetDiff(a, adaptiveBruiser())).toEqual([])
  })

  it('refuses to compare a hero with a villain', () => {
    expect(() => sheetDiff(completeHero(), adaptiveBruiser() as never)).toThrow()
  })
})

describe('colors', () => {
  it('never show in a sync diff', () => {
    const a = completeHero()
    expect(sheetDiff(a, { ...a, appearance: { primary: 'pink' } })).toEqual([])
    const v = adaptiveBruiser()
    expect(sheetDiff(v, { ...v, appearance: { primary: 'pink' } })).toEqual([])
  })
})
