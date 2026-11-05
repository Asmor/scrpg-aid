import { describe, expect, it } from 'vitest'
import { createHero, emptyDetails } from './model'
import { dividedHero, formChangerHero, minionMakerHero, modularHero } from '../test/heroes'
import { CURRENT_VERSION, HERO_FORMAT, parseSaved, parseSavedJson, toSaved } from './serialize'

const hero = () => createHero('guided', { id: 'h1', now: new Date('2026-10-23T12:00:00Z') })

describe('version 3 heroes', () => {
  it('read with empty lists, dropping the old advancement', () => {
    const { backIssues: _b, collections: _c, advancement: _a, ...old } = createHero('guided', { id: 'old' })
    const r = parseSaved({ format: HERO_FORMAT, version: 3, hero: { ...old, advancement: { backIssues: 2, collections: [], changes: [] } } })
    expect(r).toMatchObject({ ok: true, hero: { backIssues: [], collections: [], advancement: [] } })
  })
})

describe('serialize', () => {
  it('wraps a hero in a versioned envelope', () => {
    expect(toSaved(hero())).toEqual({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: hero() })
  })

  it('round-trips through JSON', () => {
    const result = parseSavedJson(JSON.stringify(toSaved(hero())))
    expect(result).toEqual({ ok: true, hero: hero() })
  })

  it('rejects things that are not saved heroes', () => {
    expect(parseSavedJson('{nope')).toEqual({ ok: false, error: 'not valid JSON' })
    expect(parseSaved(null)).toMatchObject({ ok: false, error: 'not a saved hero' })
    expect(parseSaved([])).toMatchObject({ ok: false, error: 'not a saved hero' })
    expect(parseSaved({ format: 'other', version: 1, hero: hero() })).toMatchObject({ ok: false })
    expect(parseSaved({ format: HERO_FORMAT, version: 1 })).toEqual({ ok: false, error: 'missing hero' })
  })

  it('rejects bad versions, including ones newer than the app', () => {
    for (const version of [undefined, 0, 1.5, '1']) {
      expect(parseSaved({ format: HERO_FORMAT, version, hero: hero() })).toEqual({
        ok: false,
        error: 'missing or invalid version',
      })
    }
    expect(parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION + 1, hero: hero() })).toMatchObject({
      ok: false,
      error: expect.stringContaining('newer version'),
    })
  })

  it('rejects heroes with missing or malformed fields', () => {
    const t = { kind: 'power', id: 'flight' }
    const cases: [Record<string, unknown>, string][] = [
      [{ id: '' }, 'hero.id is missing'],
      [{ createdAt: 5 }, 'hero.createdAt is missing'],
      [{ method: 'freeform' }, 'hero.method has an unknown value'],
      [{ details: null }, 'hero.details should be an object'],
      [{ details: {} }, 'hero.details.name should be text'],
      [{ traitNames: { x: 1 } }, 'hero.traitNames.x should be text'],
      [{ traitNames: [] }, 'hero.traitNames should be an object'],
      [{ background: { id: 'x', qualities: [], roll: { dice: [], results: [], manual: 'yes' } } }, 'hero.background.roll.manual should be true or false'],
      [{ redAbilities: {} }, 'hero.redAbilities should be a list'],
      [{ redAbilities: [{ source: 'red' }] }, 'hero.redAbilities[0].name is missing'],
      [{ archetype: 'modular' }, 'hero.archetype should be an object'],
      [{ background: { id: 'x' } }, 'hero.background.qualities should be a list'],
      [{ background: { id: 'x', qualities: [{ trait: t, die: 'd7' }] } }, 'hero.background.qualities[0].die has an unknown value'],
      [{ background: { id: 'x', qualities: [], roll: { dice: ['d10'], results: [1.5], manual: false } } }, 'hero.background.roll.results[0] should be a whole number'],
      [{ powerSource: { id: 'x', powers: [], abilities: [{ source: 'a', name: 'b', uses: [{ kind: 'trait', id: 'x' }] }], bonus: [] } }, 'hero.powerSource.abilities[0].uses[0].kind has an unknown value'],
      [{ personality: { id: 'x', bonus: [], outBlanks: { a: 3 } } }, 'hero.personality.outBlanks.a is malformed'],
      [{ personality: { id: 'x', bonus: [], outUses: [{ kind: 'nope', id: 'a' }] } }, 'hero.personality.outUses[0].kind has an unknown value'],
      [{ retcon: { id: 'x', kind: 'nope' } }, 'hero.retcon.kind has an unknown value'],
      [{ archetype: { id: 'x', traits: [], abilities: [], bonus: [], forms: [{ zone: 'red', powers: [] }] } }, 'hero.archetype.forms[0].zone has an unknown value'],
      [{ archetype: { id: 'x', traits: [], abilities: [], bonus: [], forms: [{ zone: 'yellow', powers: [], upgrades: ['speed'] }] } }, 'hero.archetype.forms[0].upgrades[0] should be an object'],
      [{ archetype: { id: 'x', traits: [], abilities: [], bonus: [], minionForms: { forms: [''] } } }, 'hero.archetype.minionForms.forms[0] is missing'],
      [{ archetype: { id: 'x', traits: [], abilities: [], bonus: [], minionForms: { quality: 'creativity', forms: [] } } }, 'hero.archetype.minionForms.quality should be an object'],
      [{ retcon: { id: 'x', kind: 'swapDice', traits: [] } }, 'hero.retcon.traits should name exactly two traits'],
      [{ retcon: { id: 'x', kind: 'swapDice', traits: [{ kind: 'power' }] } }, 'hero.retcon.traits[0].id is missing'],
      [{ retcon: { id: 'x', kind: 'gainPowerOrQuality' } }, 'hero.retcon.gained should be an object'],
      [{ health: { mode: 'average' } }, 'hero.health.mode has an unknown value'],
      [{ background: { id: 'x', qualities: [], principle: { id: 'custom', custom: { category: 'nope' } } } }, 'hero.background.principle.custom.category has an unknown value'],
      [{ advancement: [{ id: 'e', at: 'x', kind: 'details', text: 't', change: { kind: 'levelUp' } }] }, 'hero.advancement[0].change.kind has an unknown value'],
      [{ advancement: [{ id: 'e', at: 'x', kind: 'promotion', text: 't' }] }, 'hero.advancement[0].kind has an unknown value'],
      [{ backIssues: [{ title: 'x' }] }, 'hero.backIssues[0].id is missing'],
      [{ pendingRolls: [] }, 'hero.pendingRolls should be an object'],
      [{ pendingRolls: { archetype: { dice: ['d8'], results: [2] } } }, 'hero.pendingRolls.archetype.manual should be true or false'],
      [{ pendingRolls: { secondaryArchetype: { dice: ['d8'] } } }, 'hero.pendingRolls.secondaryArchetype.results should be a list'],
      [{ background: { id: 'x', qualities: [], principle: { id: 'custom', custom: { category: 'ideals', name: '', roleplaying: '', minorTwist: '', majorTwist: '', greenAbility: { name: '', text: '', effects: [{ actions: ['dance'], use: 'max' }] } } } } }, 'hero.background.principle.custom.greenAbility.effects[0].actions[0] has an unknown value'],
      [{ background: { id: 'x', qualities: [], principle: { id: 'custom', custom: { category: 'ideals', name: '', roleplaying: '', minorTwist: '', majorTwist: '', greenAbility: { name: '', text: '', effects: [{ actions: [], use: 'max' }] } } } } }, 'hero.background.principle.custom.greenAbility.effects[0].actions should name one action'],
      [{ background: { id: 'x', qualities: [], principle: { id: 'custom', custom: { category: 'ideals', name: '', roleplaying: '', minorTwist: '', majorTwist: '', greenAbility: { name: '', text: '', effects: [{ actions: ['boost'], use: 'single' }] } } } } }, 'hero.background.principle.custom.greenAbility.effects[0].use has an unknown value'],
    ]
    for (const [patch, error] of cases) {
      expect(parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: { ...hero(), ...patch } })).toEqual({ ok: false, error })
    }
  })

  it('drops play state on load: it lives in games now', () => {
    const play = { health: 12, heroPoints: 3, reactionUsed: true, mods: [], twists: [], history: [] }
    // A version 2 hero with play state is migrated without it.
    expect(parseSaved({ format: HERO_FORMAT, version: 2, hero: { ...hero(), play, currentHealth: 12 } })).toEqual({ ok: true, hero: hero(), migratedFrom: 2 })
    // Play state an older app wrote back into a current hero is dropped too, even malformed.
    expect(parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: { ...hero(), play: { heroPoints: 'x' } } })).toEqual({ ok: true, hero: hero() })
  })

  it('keeps draft status, furthest step, and who rolls; rejects bad values', () => {
    const draft = { ...hero(), status: 'draft' as const, furthestStep: 4, rollMode: 'manual' as const }
    expect(parseSavedJson(JSON.stringify(toSaved(draft)))).toEqual({ ok: true, hero: draft })
    expect(parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: { ...hero(), status: 'half' } }).ok).toBe(false)
    expect(parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: { ...hero(), rollMode: 'gm' } }).ok).toBe(false)
    expect(parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: { ...hero(), furthestStep: 1.5 } }).ok).toBe(false)
  })

  it('accepts fully filled-in heroes', () => {
    const t = { kind: 'quality', id: 'fitness' } as const
    const full = {
      ...hero(),
      traitNames: { 'quality:roleplaying-quality': 'Lucky' },
      background: {
        id: 'upper-class',
        roll: { dice: ['d10', 'd10'], results: [1, 4], manual: true, rerolled: true },
        qualities: [{ trait: t, die: 'd10' }],
        principle: { id: 'custom', custom: { category: 'responsibility', name: 'P', roleplaying: 'r', minorTwist: 'm', majorTwist: 'M', greenAbility: { name: '', text: 't' } } },
      },
      powerSource: { id: 'accident', powers: [], abilities: [{ source: 'powerSource.yellow', name: 'X', uses: [t], blanks: { a: 'b', c: ['d', 'e'] }, customName: 'Y' }], bonus: [] },
      archetype: { id: 'speedster', traits: [{ trait: t, die: 'd8', upgrades: true }], abilities: [], bonus: [], principle: { id: 'energy-element', customization: 'Fire' } },
      personality: { id: 'impulsive', outBlanks: { x: 'y' }, bonus: [] },
      retcon: { id: 'change-principle', kind: 'changePrinciple', replace: 'archetype', with: { id: 'destiny' } },
      health: { trait: t, mode: 'roll', rollResult: 5, manual: true },
      backIssues: [{ id: 'b', title: 'The Bank Job', gameId: 'g', gameName: 'Thursday', at: 'x' }],
      collections: [{ id: 'c', name: 'Year One', at: 'x', issues: [{ title: 'T', gameName: 'G', at: 'x' }] }, { id: 'c2', name: 'Origins', at: 'x', issues: [], starting: true }],
      advancement: [
        { id: 'a', at: 'x', kind: 'details', text: 't', after: 'T', change: { kind: 'swapPower', from: { kind: 'power', id: 'fire' }, to: { kind: 'power', id: 'cold' } } },
        { id: 'b', at: 'x', kind: 'details', text: 't', change: { kind: 'swapPrinciple', replace: 'background', with: { id: 'destiny' } } },
        { id: 'c', at: 'x', kind: 'details', text: 't', change: { kind: 'swapAbility', from: { source: 'red', name: 'A' }, to: { source: 'red', name: 'B', category: 'power:athletic' } } },
        { id: 'd', at: 'x', kind: 'cosmetic', text: 't', change: { kind: 'cosmetic', before: { costume: 'Old' } } },
        { id: 'e', at: 'x', kind: 'rewrite', text: 't', open: true, before: { method: 'guided', details: emptyDetails(), traitNames: {}, background: null, powerSource: null, archetype: null, personality: null, redAbilities: [], retcon: null, health: null } },
      ],
      pendingRolls: { personality: { dice: ['d10', 'd10'], results: [3, 7], manual: false }, secondaryArchetype: { dice: ['d12', 'd6'], results: [2, 5], manual: false } },
      notes: 'n',
    }
    expect(parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: full })).toEqual({ ok: true, hero: full })
    const swap = { ...hero(), retcon: { id: 'swap-power-dice', kind: 'swapDice', traits: [t, { kind: 'quality', id: 'finesse' }] } }
    expect(parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: swap })).toEqual({ ok: true, hero: swap })
  })

  it('round-trips Form-Changer, Minion-Maker, and Divided heroes', () => {
    const divided = dividedHero()
    divided.archetype!.divided!.heroicPersonality = { id: 'stoic', bonus: [], outUses: [{ kind: 'quality', id: 'alertness' }] }
    divided.archetype!.divided!.outFrom = 'heroic'
    divided.archetype!.divided!.split = { always: [], civilian: [{ kind: 'power', id: 'fire' }], heroic: [] }
    divided.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie', form: 'heroic' }
    for (const h of [formChangerHero(), minionMakerHero(), divided, modularHero()]) {
      expect(parseSavedJson(JSON.stringify(toSaved(h)))).toEqual({ ok: true, hero: h })
    }
  })

  it('rejects malformed Divided choices, however deep they are', () => {
    const bad = (change: (h: ReturnType<typeof dividedHero>) => void) => {
      const h = dividedHero()
      change(h)
      return parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: h }).ok
    }
    expect(bad(() => {})).toBe(true)
    expect(bad((h) => Object.assign(h.archetype!.divided!, { outFrom: 'secret' }))).toBe(false)
    expect(bad((h) => Object.assign(h.archetype!.divided!, { split: { always: [], civilian: 'fire', heroic: [] } }))).toBe(false)
    expect(bad((h) => Object.assign(h.archetype!.secondary!, { traits: 'speed' }))).toBe(false)
    expect(bad((h) => Object.assign(h.archetype!.secondary!, { secondary: { id: '' } }))).toBe(false)
    expect(bad((h) => (h.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie', form: 'both' as 'heroic' }))).toBe(false)
    // Modular's modes.
    const badModular = (change: (h: ReturnType<typeof modularHero>) => void) => {
      const h = modularHero()
      change(h)
      return parseSaved({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: h }).ok
    }
    expect(badModular(() => {})).toBe(true)
    expect(badModular((h) => Object.assign(h.archetype!.modular!, { modes: 'all' }))).toBe(false)
    expect(badModular((h) => Object.assign(h.archetype!.modular!.modes[0]!, { powers: [{ trait: { kind: 'power', id: 'fire' }, die: 'd7' }] }))).toBe(false)
    expect(badModular((h) => Object.assign(h.archetype!.modular!, { powerless: [{}] }))).toBe(false)
  })

  it('reads a version-1 hero with no tags, and tidies the tags it reads', () => {
    const { tags: _, ...v1 } = hero()
    expect(parseSaved({ format: HERO_FORMAT, version: 1, hero: v1 })).toEqual({ ok: true, hero: hero(), migratedFrom: 1 })
    const messy = { ...hero(), tags: ['  scene   3 ', 'Scene 3', '   ', 'x'.repeat(50)] }
    expect(parseSaved(toSaved(messy))).toEqual({ ok: true, hero: { ...hero(), tags: ['scene 3', 'x'.repeat(40)] } })
    expect(parseSaved(toSaved({ ...hero(), tags: [3] as unknown as string[] }))).toEqual({ ok: false, error: 'hero.tags[0] should be text' })
  })

  it('migrates old versions forward, one version at a time', () => {
    const migrations = {
      1: (h: Record<string, unknown>) => ({ ...h, notes: 'from v1' }),
      2: (h: Record<string, unknown>) => ({ ...h, notes: `${String(h.notes)}, then v2` }),
    }
    const result = parseSaved({ format: HERO_FORMAT, version: 1, hero: hero() }, migrations, 3)
    expect(result).toEqual({ ok: true, hero: { ...hero(), notes: 'from v1, then v2' }, migratedFrom: 1 })
  })

  it('reports a missing migration', () => {
    expect(parseSaved({ format: HERO_FORMAT, version: 1, hero: hero() }, {}, 2)).toEqual({
      ok: false,
      error: 'no migration from format 1',
    })
  })

  it('checks the migrated result too', () => {
    const broken = { 1: (h: Record<string, unknown>) => ({ ...h, method: 'oops' }) }
    expect(parseSaved({ format: HERO_FORMAT, version: 1, hero: hero() }, broken, 2)).toEqual({
      ok: false,
      error: 'hero.method has an unknown value',
    })
  })

  it('reports a migration that throws instead of throwing', () => {
    const throwing = {
      1: () => {
        throw new Error('boom')
      },
    }
    expect(parseSaved({ format: HERO_FORMAT, version: 1, hero: hero() }, throwing, 2)).toEqual({
      ok: false,
      error: 'migration from format 1 failed: boom',
    })
    const throwsText = {
      1: () => {
        throw 'plain text'
      },
    }
    expect(parseSaved({ format: HERO_FORMAT, version: 1, hero: hero() }, throwsText, 2)).toEqual({
      ok: false,
      error: 'migration from format 1 failed: plain text',
    })
  })

  it('never lets migrations or callers change the input', () => {
    const input = { format: HERO_FORMAT, version: 1, hero: hero() }
    const mutating = {
      1: (h: Record<string, unknown>) => {
        ;(h.details as Record<string, string>).name = 'changed by migration'
        return h
      },
    }
    const result = parseSaved(input, mutating, 2)
    expect(result.ok && result.hero.details.name).toBe('changed by migration')
    expect(input.hero.details.name).toBe('')
    const plain = parseSaved(input)
    if (plain.ok) plain.hero.details.name = 'changed by caller'
    expect(input.hero.details.name).toBe('')
  })
})
