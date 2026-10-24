import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { exampleHero } from './example'
import { parseSaved, toSaved } from './serialize'

describe('exampleHero', () => {
  it('is complete and rules-legal', () => {
    const sheet = buildSheet(exampleHero())
    expect(sheet.warnings).toEqual([])
    expect(sheet.maxHealth).toBe(30)
    expect(sheet.characteristics.archetype).toBe('Speedster')
  })

  it('saves like any other hero, with a new id each time', () => {
    const hero = exampleHero()
    expect(parseSaved(toSaved(hero))).toEqual({ ok: true, hero })
    expect(exampleHero().id).not.toBe(hero.id)
  })
})
