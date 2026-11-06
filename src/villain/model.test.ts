import { describe, expect, it } from 'vitest'
import { createVillain, DEFAULT_HERO_COUNT, villainDisplayName, villainTraitName } from './model'
import { parseSavedVillain, parseSavedVillainJson, villainToSaved, VILLAIN_FORMAT, VILLAIN_VERSION } from './serialize'
import { villainProblem } from './validate'

const now = new Date('2026-10-27T12:00:00Z')

describe('the villain document', () => {
  it('starts blank, built for four heroes', () => {
    const v = createVillain({ id: 'v1', now })
    expect(v).toMatchObject({ id: 'v1', createdAt: now.toISOString(), approach: null, archetype: null, upgrades: [], mastery: null, heroCount: DEFAULT_HERO_COUNT })
    expect(DEFAULT_HERO_COUNT).toBe(4)
    expect(villainProblem(v)).toBeUndefined()
  })

  it('is named by its name, then alias', () => {
    const v = createVillain({ id: 'v1', now })
    expect(villainDisplayName(v)).toBe('Unnamed villain')
    v.details.alias = 'The Hand'
    expect(villainDisplayName(v)).toBe('The Hand')
    v.details.name = 'Baron Blade'
    expect(villainDisplayName(v)).toBe('Baron Blade')
    v.traitNames['quality:roleplaying-quality'] = 'Vengeful Genius'
    expect(villainTraitName(v, { kind: 'quality', id: 'roleplaying-quality' })).toBe('Vengeful Genius')
  })
})

describe('saving villains', () => {
  const full = () => {
    const v = createVillain({ id: 'v1', now })
    v.approach = { id: 'adaptive', traits: [{ trait: { kind: 'power', id: 'robotics' }, die: 'd10' }], abilities: [{ source: 'approach', name: 'Initiate Upgrade Procedure', uses: [{ kind: 'power', id: 'robotics' }] }] }
    v.archetype = { id: 'bruiser', abilities: [{ source: 'archetype', name: 'Lash Out', uses: [{ kind: 'power', id: 'robotics' }], customName: 'Smash' }] }
    v.upgrades = [
      { id: 'mook-squad', abilities: [{ source: 'upgrade', name: 'Alert!' }] },
      { id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd10', abilities: [{ source: 'vehicle', name: 'Reliable', blanks: { 'basic action': 'Attack' } }] } },
    ]
    v.mastery = { source: 'mastery', name: 'Master of Annihilation' }
    v.notes = 'Hates the heroes.'
    return v
  }

  it('round-trips through the versioned envelope and JSON', () => {
    const v = full()
    expect(villainToSaved(v)).toEqual({ format: VILLAIN_FORMAT, version: 4, villain: v })
    expect(parseSavedVillain(villainToSaved(v))).toEqual({ ok: true, villain: v })
    expect(parseSavedVillainJson(JSON.stringify(villainToSaved(v)))).toEqual({ ok: true, villain: v })
  })

  it('rejects what isn’t a well-formed villain', () => {
    expect(parseSavedVillainJson('nope')).toEqual({ ok: false, error: 'not valid JSON' })
    expect(parseSavedVillain({ format: 'scrpg-hero', version: 1, hero: {} })).toEqual({ ok: false, error: 'not a saved villain' })
    expect(parseSavedVillain({ format: VILLAIN_FORMAT, version: 9, villain: {} })).toEqual({ ok: false, error: 'saved by a newer version of the app (format 9)' })
    expect(parseSavedVillain({ format: VILLAIN_FORMAT, version: VILLAIN_VERSION })).toEqual({ ok: false, error: 'missing villain' })
    const bad = (change: (v: Record<string, unknown>) => void) => {
      const v = full() as unknown as Record<string, unknown>
      change(v)
      return parseSavedVillain({ format: VILLAIN_FORMAT, version: VILLAIN_VERSION, villain: v })
    }
    expect(bad((v) => (v.heroCount = 0))).toEqual({ ok: false, error: 'villain.heroCount should be at least 1' })
    expect(bad((v) => (v.heroCount = 2.5))).toEqual({ ok: false, error: 'villain.heroCount should be a whole number' })
    expect(bad((v) => (v.upgrades = [{ id: 'x' }]))).toEqual({ ok: false, error: 'villain.upgrades[0].abilities should be a list' })
    expect(bad((v) => ((v.approach as { traits: unknown[] }).traits = [{ trait: { kind: 'power', id: 'x' }, die: 'd7' }]))).toEqual({ ok: false, error: 'villain.approach.traits[0].die has an unknown value' })
    expect(bad((v) => (v.mastery = { name: 'x' }))).toEqual({ ok: false, error: 'villain.mastery.source is missing' })
    expect(bad((v) => (v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd7', abilities: [] } }]))).toEqual({ ok: false, error: 'villain.upgrades[0].vehicle.die has an unknown value' })
    expect(bad((v) => (v.upgrades = [{ id: 'villainous-vehicle', abilities: [], vehicle: { die: 'd10' } }]))).toEqual({ ok: false, error: 'villain.upgrades[0].vehicle.abilities should be a list' })
  })

  it('tidies the tags it reads', () => {
    const messy = { ...full(), tags: ['  scene   3 ', 'Scene 3', '', 'prep'] }
    expect(parseSavedVillain(villainToSaved(messy))).toEqual({ ok: true, villain: { ...messy, tags: ['scene 3', 'prep'] } })
    expect(parseSavedVillain(villainToSaved({ ...full(), tags: 'prep' as unknown as string[] }))).toEqual({ ok: false, error: 'villain.tags should be a list' })
  })

  it('keeps the wizard’s draft state, attachments, Suggest 3 picks and extra abilities', () => {
    const v = full()
    v.status = 'draft'
    v.furthestStep = 3
    v.attached = [{ templateId: 't1', kind: 'lieutenant', role: 'vehicle' }]
    v.suggest = { approach: ['bully', 'ninja', 'leech'] }
    v.upgrades.push({ id: 'power-upgrade', abilities: [], extra: [{ source: 'archetype', name: 'Feel No Pain' }] })
    v.upgrades[1]!.vehicle!.name = 'Siege Crawler'
    expect(parseSavedVillainJson(JSON.stringify(villainToSaved(v)))).toEqual({ ok: true, villain: v })
    expect(villainProblem({ ...v, status: 'done' })).toBe('villain.status has an unknown value')
    expect(villainProblem({ ...v, attached: [{ templateId: 't1', kind: 'minion', role: 'boss' }] })).toBe('villain.attached[0].role has an unknown value')
  })
})
