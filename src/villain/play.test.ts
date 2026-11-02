import { describe, expect, it } from 'vitest'
import { villainArchetypesById } from '../rules/villain-data'
import { adaptiveBruiser } from '../test/villains'
import { advanceScene, emptyVillainPlay, newScene, resetVillain, setChallengeParts, setSceneHeroes, setStatusCount, setWeaknessTier, villainHealth, villainStatusDie, villainZone } from './play'

let n = 0
const clock = { now: new Date('2026-10-27T12:00:00Z'), newId: () => `id${++n}` }
const rule = (id: string) => villainArchetypesById.get(id)!.status

describe('a villain in play', () => {
  it('has Health for the heroes in this scene, and a zone by it', () => {
    const v = adaptiveBruiser()
    expect(villainHealth(v, undefined).maxHealth).toBe(55)
    expect(villainHealth(v, { heroCount: 2 }).maxHealth).toBe(45)
    const health = villainHealth(v, undefined)
    expect(villainZone(health, {})).toBe('green')
    expect(villainZone(health, { health: health.healthRanges!.yellow[0] })).toBe('yellow')
    expect(villainZone(health, { health: 0 })).toBe('out')
  })

  it('works out its status die by its archetype’s rule', () => {
    expect(villainStatusDie(rule('bruiser'), { zone: 'yellow' })).toBe('d8')
    expect(villainStatusDie(rule('bruiser'), { zone: 'out' })).toBeUndefined()
    // Domain: 0 → d6, 1–2 → d8, 3 or more → d10.
    expect([0, 2, 5].map((statusCount) => villainStatusDie(rule('domain'), { statusCount }))).toEqual(['d6', 'd8', 'd10'])
    expect(villainStatusDie(rule('indomitable'), {})).toBe('d8')
    // Formidable: the best tier (no penalties) until one is chosen.
    expect(villainStatusDie(rule('formidable'), {})).toBe('d12')
    expect(villainStatusDie(rule('formidable'), { weaknessTier: 0 })).toBe('d4')
    // Titan: d12, one size smaller per completed part.
    expect([0, 1, 2, 9].map((challengeParts) => villainStatusDie(rule('titan'), { challengeParts }))).toEqual(['d12', 'd10', 'd8', 'd8'])
  })

  it('records changes to the scene, counts, and the once-per-scene advance', () => {
    let p = setSceneHeroes(emptyVillainPlay(), 3, clock)
    expect(p.heroCount).toBe(3)
    p = setSceneHeroes(p, undefined, clock)
    expect(p).not.toHaveProperty('heroCount')
    p = setStatusCount(p, 4, clock)
    expect(setStatusCount(p, 4, clock)).toBe(p)
    p = setWeaknessTier(p, 1, 'Some bonuses', clock)
    p = setChallengeParts(p, 1, clock)
    p = advanceScene(p, clock)
    expect(advanceScene(p, clock)).toBe(p)
    p = { ...p, reactionUsed: true }
    p = newScene(p, clock)
    expect(p).toMatchObject({ reactionUsed: false, statusCount: 4, weaknessTier: 1, challengeParts: 1 })
    expect(p).not.toHaveProperty('sceneAdvanced')
    expect(p.history.map((h) => h.text)).toEqual([
      '3 heroes in this scene.',
      'Back to the heroes it was built for.',
      'Status count is now 4.',
      'Weakness: Some bonuses.',
      'Challenge parts complete: 1.',
      'Used its Overcome to advance the scene tracker (once per scene).',
      'New scene: its reaction and scene advance are ready again.',
    ])
    // Starting over clears everything, the history too.
    expect(resetVillain()).toEqual({ reactionUsed: false, mods: [], twists: [], history: [] })
  })
})
