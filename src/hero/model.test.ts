import { describe, expect, it } from 'vitest'
import { createHero, emptyDetails, heroDisplayName, newId, traitName } from './model'

describe('hero model', () => {
  it('creates a blank hero with the given method', () => {
    const now = new Date('2026-10-23T12:00:00Z')
    const hero = createHero('guided', { id: 'h1', now })
    expect(hero).toEqual({
      id: 'h1',
      createdAt: '2026-10-23T12:00:00.000Z',
      updatedAt: '2026-10-23T12:00:00.000Z',
      method: 'guided',
      details: emptyDetails(),
      traitNames: {},
      background: null,
      powerSource: null,
      archetype: null,
      personality: null,
      redAbilities: [],
      retcon: null,
      health: null,
    })
  })

  it('generates unique ids by default', () => {
    expect(createHero('constructed').id).not.toBe(createHero('constructed').id)
  })

  it('names heroes by name, then alias, then a placeholder', () => {
    const hero = createHero('guided')
    expect(heroDisplayName(hero)).toBe('Unnamed hero')
    hero.details.alias = ' Jane Doe '
    expect(heroDisplayName(hero)).toBe('Jane Doe')
    hero.details.name = 'Captain Example'
    expect(heroDisplayName(hero)).toBe('Captain Example')
  })

  it('falls back to random bytes when randomUUID is unavailable', () => {
    const id = newId({ getRandomValues: <T extends ArrayBufferView | null>(a: T) => a })
    expect(id).toBe('0'.repeat(32))
    expect(newId({ getRandomValues: (a) => a, randomUUID: () => 'a-b-c-d-e' })).toBe('a-b-c-d-e')
  })

  it('looks up the player’s names for traits', () => {
    const hero = createHero('guided')
    hero.traitNames['quality:roleplaying-quality'] = 'Raised by Wolves'
    expect(traitName(hero, { kind: 'quality', id: 'roleplaying-quality' })).toBe('Raised by Wolves')
    expect(traitName(hero, { kind: 'power', id: 'signature-weaponry' })).toBeUndefined()
  })
})
