import { describe, expect, it } from 'vitest'
import { P, Q } from '../test/heroes'
import { diceChanges, noChanges } from './dice-changes'

const t = (trait: ReturnType<typeof P>, die: 'd4' | 'd6' | 'd8' | 'd10' | 'd12', name = trait.id) => ({ trait, die, name })

describe('diceChanges', () => {
  const base = [t(P('cold'), 'd12', 'Cold'), t(P('fire'), 'd10', 'Fire'), t(P('agility'), 'd8', 'Agility'), t(Q('fitness'), 'd8', 'Fitness')]

  it('lists changed dice, added traits and dropped ones, leaving out what stays the same', () => {
    const mode = [t(P('fire'), 'd12', 'Fire'), t(P('agility'), 'd8', 'Agility'), t(P('speed'), 'd6', 'Speed'), t(Q('fitness'), 'd8', 'Fitness')]
    expect(diceChanges(base, mode)).toEqual({
      changed: [{ name: 'Fire', from: 'd10', to: 'd12' }],
      added: [t(P('speed'), 'd6', 'Speed')],
      dropped: [t(P('cold'), 'd12', 'Cold')],
    })
  })

  it('finds nothing for the base dice themselves', () => {
    expect(noChanges(diceChanges(base, base))).toBe(true)
    expect(noChanges(diceChanges(base, base.slice(1)))).toBe(false)
  })

  it('tells a power from a quality with the same id', () => {
    expect(diceChanges([t(P('x'), 'd8')], [t(Q('x'), 'd8')])).toEqual({ changed: [], added: [t(Q('x'), 'd8')], dropped: [t(P('x'), 'd8')] })
  })
})
