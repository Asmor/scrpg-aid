import { describe, expect, it } from 'vitest'
import { archetypes, personalities, powerSources, principles, redAbilityCategories } from './data'
import { choiceSlots, isKnownBracket, parseSlots, traitSlots } from './slots'

function allTexts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => allTexts(n, out))
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (typeof o.text === 'string') out.push(o.text)
    if (typeof o.outAbility === 'string') out.push(o.outAbility)
    Object.values(o).forEach((v) => allTexts(v, out))
  }
  return out
}

describe('slots', () => {
  it('recognizes every bracket in the hero data', () => {
    const texts = allTexts([powerSources, archetypes, personalities, redAbilityCategories, principles])
    const unknown = new Set(
      texts.flatMap((t) => [...t.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!)).filter((l) => !isKnownBracket(l)),
    )
    expect([...unknown]).toEqual([])
  })

  it('reads trait slots, in order', () => {
    expect(parseSlots('Attack using [power]. Boost using [Mental quality].')).toEqual([
      { type: 'trait', label: 'power', kinds: ['power'] },
      { type: 'trait', label: 'Mental quality', kinds: ['quality'], only: [{ qualityCategory: 'mental' }] },
    ])
    expect(traitSlots('Overcome using [power/quality].')[0]?.kinds).toEqual(['power', 'quality'])
    expect(traitSlots('Attack using [a power gained from your archetype].')[0]).toMatchObject({ fromStep: 'archetype' })
    expect(traitSlots('Reduce damage from [element/energy you have a related power for].')[0]).toMatchObject({
      kinds: ['power'],
      only: [{ powerCategory: 'elemental-energy' }],
    })
  })

  it('reads choices, with fixed options where the bracket lists them', () => {
    expect(choiceSlots('[Boost or Hinder] using [power].')).toEqual([
      { type: 'choice', label: 'Boost or Hinder', options: ['Boost', 'Hinder'] },
    ])
    expect(choiceSlots('Take [choose two basic actions].')[0]).toMatchObject({ count: 2, options: expect.arrayContaining(['Attack', 'Overcome']) })
    expect(choiceSlots('Affinity for [energy/element].')).toEqual([{ type: 'choice', label: 'energy/element' }])
  })

  it('treats unknown brackets as free-text choices', () => {
    expect(isKnownBracket('something new')).toBe(false)
    expect(parseSlots('Use [something new].')).toEqual([{ type: 'choice', label: 'something new' }])
  })

  it('finds no slots in plain text', () => {
    expect(parseSlots('Defend yourself. Use your Max die.')).toEqual([])
  })
})
