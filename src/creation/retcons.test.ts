import { describe, expect, it } from 'vitest'
import { retcons } from '../rules/data'
import { completeHero } from '../test/heroes'
import { availableRetcons, checkRetcon, retconUnavailableReason } from './retcons'

describe('retcons', () => {
  it('offers every retcon to most heroes', () => {
    expect(availableRetcons(completeHero())).toEqual(retcons)
  })

  it('doesn’t offer raising a Red status die that is already d12 (the user’s ruling)', () => {
    const hero = completeHero()
    hero.personality = { id: 'nurturing', bonus: [] }
    expect(availableRetcons(hero).map((r) => r.id)).not.toContain('upgrade-red-status')
    const upgrade = retcons.find((r) => r.id === 'upgrade-red-status')!
    expect(retconUnavailableReason(hero, upgrade)).toBe('Your Red status die is already d12.')
  })

  it('warns when a saved hero has a retcon they can’t take', () => {
    const hero = completeHero()
    hero.personality = { id: 'naive', bonus: [] }
    hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
    expect(checkRetcon(hero)).toEqual([
      { step: 'retcon', code: 'retcon-not-allowed', message: 'Your Red status die is already d12. Choose a different retcon.' },
    ])
    hero.personality = { id: 'lone-wolf', bonus: [] }
    expect(checkRetcon(hero)).toEqual([])
    hero.retcon = null
    expect(checkRetcon(hero)).toEqual([])
  })

  it('offers everything before a personality is chosen', () => {
    const hero = completeHero()
    hero.personality = null
    expect(availableRetcons(hero)).toEqual(retcons)
  })
})
