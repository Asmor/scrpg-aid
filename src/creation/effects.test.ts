import { describe, expect, it } from 'vitest'
import { abilityEffects, effectMentions } from './effects'

describe('abilityEffects', () => {
  it('finds "<Action> … using <power, quality, or dice>" (the user’s rule)', () => {
    expect(abilityEffects('Attack using Fire. Hinder that same target using your Min die.')).toEqual(['attack', 'hinder'])
    expect(abilityEffects('Boost multiple targets using [power]. Use your Max die.')).toEqual(['boost'])
  })

  it('counts other ways of naming the dice', () => {
    expect(abilityEffects('Attack using [power]. Hinder that target with your Min die.')).toEqual(['attack', 'hinder'])
    expect(abilityEffects('Defend using [power]. Use your Max die. Recover Health equal to your Min die.')).toEqual(['defend', 'recover'])
    expect(abilityEffects('When a new target enters close range, Attack that target by rolling your single [quality] die.')).toEqual(['attack'])
    expect(abilityEffects('When you are attacked, first roll your single [power] die. Defend yourself with that roll.')).toEqual(['defend'])
    // The principles: "and use your Max die", or "… . Use your Max die."
    expect(abilityEffects('Overcome a technological challenge and use your Max die. You and each of your allies gain a hero point.')).toEqual(['overcome'])
    expect(abilityEffects('Overcome in a situation related to your business. Use your Max die. You and each of your allies gain a hero point.')).toEqual(['overcome'])
  })

  it('lets joined actions share their clause', () => {
    expect(abilityEffects('Boost or Hinder using [power]. Use your Max die.')).toEqual(['boost', 'hinder'])
    expect(abilityEffects('Boost, Hinder, Defend, or Attack using [power].')).toEqual(['boost', 'hinder', 'defend', 'attack'])
  })

  it('leaves out triggers and nouns', () => {
    expect(abilityEffects('When hit with an Attack, change to any form before resolving the Attack. Take a minor twist.')).toEqual([])
    expect(abilityEffects('When you are Attacked, redirect the Attack to one of your nearby minions.')).toEqual([])
    expect(abilityEffects('Boost using [power]. Apply that bonus to all hero Attack and Overcome actions until the start of your next turn.')).toEqual(['boost'])
    expect(abilityEffects('Attack using [power]. Boost all nearby heroes taking Attack or Overcome actions using your Min die until your next turn.')).toEqual(['attack', 'boost'])
    expect(abilityEffects('Whenever you Attack an enemy that has inflicted a penalty on you, treat that penalty as a bonus for that Attack.')).toEqual([])
    expect(abilityEffects('Choose whether it can Attack, Defend, Boost, Hinder, or Overcome. It acts on the start of your turn.')).toEqual([])
    // A comma that ends a trigger isn't a list.
    expect(abilityEffects('When damaged by an environment target or a surprise Attack, Defend by rolling your single [power] die.')).toEqual(['defend'])
  })

  it('skips choices still in brackets until they’re filled in', () => {
    expect(abilityEffects('[Boost or Hinder] any number of nearby targets using [power].')).toEqual([])
    expect(abilityEffects('Boost any number of nearby targets using Agility.')).toEqual(['boost'])
  })
})

describe('effectMentions', () => {
  it('gives where each effect word is', () => {
    const text = 'Attack using Fire. Hinder that same target using your Min die.'
    expect(effectMentions(text).map((m) => text.slice(m.start, m.end))).toEqual(['Attack', 'Hinder'])
  })
})
