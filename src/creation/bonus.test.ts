import { describe, expect, it } from 'vitest'
import { powerSourcesById } from '../rules/data'
import type { Bonus } from '../rules/types'
import { P, Q } from '../test/heroes'
import type { HeroTrait } from './traits'
import { fallbackOptions, gainOptions, shiftTargets, splitShift, upgradeTargets, usesFallback } from './bonus'

const held = (trait: HeroTrait['trait'], die: HeroTrait['die']): HeroTrait => ({ trait, die, step: 'powerSource', name: trait.id })
const bonusOf = <K extends Bonus['kind']>(id: string, kind: K) => powerSourcesById.get(id)!.bonuses!.find((b): b is Extract<Bonus, { kind: K }> => b.kind === kind)!
const ids = (traits: { id: string }[]) => traits.map((t) => t.id)

describe('bonus choices', () => {
  it('gain bonuses offer their list, any power, or any power not on the power source’s list', () => {
    const genius = bonusOf('genius', 'gainQuality')
    expect(gainOptions(genius, []).every((t) => t.kind === 'quality')).toBe(true)
    expect(ids(gainOptions(genius, []))).toContain('history')

    const supernatural = powerSourcesById.get('supernatural')!
    const notListed = gainOptions(bonusOf('supernatural', 'gainPower'), supernatural.powers.options)
    expect(ids(notListed)).toContain('gadgets')
    expect(ids(notListed)).not.toContain('fire')

    const anyPower = gainOptions(bonusOf('the-multiverse', 'gainPower'), [])
    expect(ids(anyPower)).toContain('fire')
    expect(anyPower.every((t) => t.kind === 'power')).toBe(true)
    expect(ids(gainOptions({ kind: 'gainPower', die: 'd10', options: [{ power: 'flight' }], summary: '' }, []))).toEqual(['flight'])
  })

  it('upgrades raise matching dice, by size or to a set die, never past the max', () => {
    const alien = bonusOf('alien', 'upgradeDie')
    const before = [held(P('flight'), 'd6'), held(Q('banter'), 'd6'), held(P('fire'), 'd8')]
    expect(upgradeTargets(alien, before).map((t) => [t.trait.trait.id, t.die])).toEqual([
      ['flight', 'd8'],
      ['banter', 'd8'],
    ])
    const raise: Bonus = { kind: 'upgradeDie', targets: ['power', 'quality'], steps: 1, max: 'd12', summary: '' }
    expect(upgradeTargets(raise, [held(P('fire'), 'd12'), held(Q('banter'), 'd10')]).map((t) => [t.trait.trait.id, t.die])).toEqual([['banter', 'd12']])
  })

  it('falls back to gaining a listed power when no power has a die to upgrade', () => {
    const alien = bonusOf('alien', 'upgradeDie')
    expect(usesFallback(alien, [held(P('flight'), 'd6')])).toBe(false)
    // A d6 quality doesn't count: the fallback is about powers.
    expect(usesFallback(alien, [held(P('fire'), 'd8'), held(Q('banter'), 'd6')])).toBe(true)
    const options = fallbackOptions(alien, powerSourcesById.get('alien')!.powers.options)
    expect(ids(options)).toContain('signature-vehicle')
    expect(ids(options)).not.toContain('metal')
    expect(fallbackOptions({ kind: 'upgradeDie', targets: ['power'], summary: '' }, [])).toEqual([])
    expect(fallbackOptions({ kind: 'upgradeDie', targets: ['power'], fallback: { kind: 'gainPower', die: 'd6', fromListed: false }, summary: '' }, []).length).toBeGreaterThan(50)
  })

  it('shifts offer powers to lower and to raise', () => {
    const cosmos = bonusOf('cosmos', 'shiftDice')
    const before = [held(P('flight'), 'd6'), held(P('fire'), 'd12'), held(P('cosmic'), 'd8'), held(Q('banter'), 'd8')]
    const { down, up } = shiftTargets(cosmos, before)
    expect(down.map((t) => [t.trait.trait.id, t.die])).toEqual([
      ['fire', 'd10'],
      ['cosmic', 'd6'],
    ])
    expect(up.map((t) => [t.trait.trait.id, t.die])).toEqual([
      ['flight', 'd8'],
      ['cosmic', 'd10'],
    ])
  })

  it('tells the lowered and raised dice of a shift apart, in any order', () => {
    const before = [held(P('flight'), 'd6'), held(P('fire'), 'd12')]
    const lowered = { trait: P('fire'), die: 'd10' as const }
    const raised = { trait: P('flight'), die: 'd8' as const }
    expect(splitShift([raised, lowered], before)).toEqual({ lowered, raised })
    expect(splitShift([raised], before)).toEqual({ raised })
    expect(splitShift([lowered], before)).toEqual({ lowered })
    expect(splitShift([], before)).toEqual({})
  })
})
