import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { sheetDiff } from '../game/sheet-diff'
import type { Hero } from '../hero/model'
import type { Clock } from '../play/state'
import { completeHero, P, Q } from '../test/heroes'
import { changeCosmetic, undoable, undoLast, recordCollection, addBackIssue } from './records'
import { heldTraits, swapTrait, traitCandidates, traitSwapPreview, traitSwapSummary } from './swaps'

const c: Clock = (() => {
  let n = 0
  return { now: new Date('2026-10-22T12:00:00Z'), newId: () => `id${++n}` }
})()

const hero = (): Hero => completeHero()
const fire = (h: Hero) => heldTraits(h, 'power').find((t) => t.trait.id === 'fire')!

describe('swap a power or quality', () => {
  it('lists what the hero holds, the roleplaying quality among them, and every other as a candidate', () => {
    const h = hero()
    expect(heldTraits(h, 'power').map((t) => t.trait.id)).toContain('fire')
    expect(heldTraits(h, 'quality').map((t) => t.trait.id)).toContain('roleplaying-quality')
    const candidates = traitCandidates(h, 'power').map((t) => t.id)
    expect(candidates).toContain('cold')
    expect(candidates).not.toContain('fire')
  })

  it('previews the abilities it changes, and keeps the die', () => {
    const h = hero()
    const changes = traitSwapPreview(h, P('fire'), P('cold'))
    const inflict = changes.find((a) => a.name === 'Inflict')!
    expect(inflict.before).toContain('Fire')
    expect(inflict.after).toContain('Cold')
    expect(inflict.after).not.toContain('Fire')
    const die = fire(h).die
    expect(traitSwapSummary(h, fire(h), P('cold'), changes)).toBe(`Fire ${die} becomes Cold ${die}, and ${changes.length === 1 ? '1 ability updates' : `${changes.length} abilities update`}.`)
  })

  it('says when it has a rule issue', () => {
    const h = hero()
    const summary = traitSwapSummary(h, fire(h), P('cold'), [{ key: 'k', name: 'x', effects: [], before: '', after: '', issue: 'no' }])
    expect(summary).toContain('1 rule issue; you can swap anyway and fix it next.')
  })

  it('records it in the history with the sentence, and the sheet follows', () => {
    const h = hero()
    const die = fire(h).die
    const next = swapTrait(h, P('fire'), P('cold'), c)
    expect(next.advancement[0]).toMatchObject({ kind: 'details', change: { kind: 'swapPower', from: P('fire'), to: P('cold') } })
    expect(next.advancement[0]!.text).toMatch(new RegExp(`^Swapped Fire ${die} for Cold ${die}\\. .*Inflict.* now uses? Cold\\.$`))
    expect(buildSheet(next).powers.map((t) => t.trait.id)).toContain('cold')
    // The hero's page shows no creation issue from it.
    expect(buildSheet(next).warnings).toEqual([])
    expect(swapTrait(h, P('nope'), P('cold'), c)).toBe(h)
  })

  it('says after what it came', () => {
    let h = hero()
    h = swapTrait(addBackIssue(h, { title: 'Rooftop Chase' }, c), P('fire'), P('cold'), c)
    expect(h.advancement[0]!.after).toBe('Rooftop Chase')
  })

  it('swaps from the hero as they are now', () => {
    const once = swapTrait(hero(), P('fire'), P('cold'), c)
    const twice = swapTrait(once, P('cold'), P('sonic'), c)
    expect(buildSheet(twice).powers.map((t) => t.trait.id)).toContain('sonic')
    expect(traitCandidates(once, 'power').map((t) => t.id)).toContain('fire')
    expect(heldTraits(once, 'power').map((t) => t.trait.id)).not.toContain('fire')
  })

  it('swaps the roleplaying quality, keeping its d8', () => {
    const next = swapTrait(hero(), Q('roleplaying-quality'), Q('banter'), c)
    const held = heldTraits(next, 'quality').find((t) => t.trait.id === 'roleplaying-quality')!
    expect([held.name, held.die]).toEqual(['Banter', 'd8'])
    expect(next.advancement[0]!.text).toContain('for Banter d8')
    expect(next.traitNames).toEqual(hero().traitNames)
  })

  it('shows up as a sheet change for games holding the hero', () => {
    const h = hero()
    expect(sheetDiff(h, swapTrait(h, P('fire'), P('cold'), c)).length).toBeGreaterThan(0)
  })
})

describe('cosmetic changes', () => {
  it('changes one field, logged with what it was', () => {
    const h = { ...hero(), details: { ...hero().details, name: 'Blur' } }
    const next = changeCosmetic(h, 'codename', { name: 'Overclock' }, c)
    expect(next.details.name).toBe('Overclock')
    expect(next.advancement[0]).toMatchObject({ kind: 'cosmetic', text: 'Codename: Blur → Overclock.', change: { kind: 'cosmetic', before: { name: 'Blur' } } })
  })

  it('logs nothing if nothing changed, and only its own fields count', () => {
    const h = hero()
    expect(changeCosmetic(h, 'costume', { costume: h.details.costume }, c)).toBe(h)
    expect(changeCosmetic(h, 'costume', { name: 'Other' }, c)).toBe(h)
  })

  it('names each appearance field, and blanks read (none)', () => {
    const h = { ...hero(), details: { ...hero().details, hair: 'Black', eyes: '' } }
    const next = changeCosmetic(h, 'appearance', { hair: 'Red', eyes: 'Green' }, c)
    expect(next.advancement[0]!.text).toBe('Appearance: Eyes (none) → Green; Hair Black → Red.')
  })

  it('shows up as a sheet change', () => {
    const h = hero()
    const diff = sheetDiff(h, changeCosmetic(h, 'costume', { costume: 'Blue' }, c))
    expect(diff).toEqual([{ section: 'Appearance', changes: [expect.stringContaining('Blue')] }])
  })
})

describe('Undo last change', () => {
  it('takes a swap back', () => {
    const h = hero()
    const next = undoLast(swapTrait(h, P('fire'), P('cold'), c))
    expect(next.advancement).toEqual([])
    expect(buildSheet(next).powers.map((t) => t.trait.id)).toContain('fire')
  })

  it('restores a cosmetic field', () => {
    const h = { ...hero(), details: { ...hero().details, costume: 'Red' } }
    expect(undoLast(changeCosmetic(h, 'costume', { costume: 'Blue' }, c)).details.costume).toBe('Red')
  })

  it("goes past a collection to the newest change, leaving the collection", () => {
    let h = swapTrait(hero(), P('fire'), P('cold'), c)
    for (let i = 0; i < 6; i++) h = addBackIssue(h, { title: `I${i}` }, c)
    h = recordCollection(h, 'Saga', c)
    expect(undoable(h)?.kind).toBe('details')
    const next = undoLast(h)
    expect(next.advancement.map((e) => e.kind)).toEqual(['collection'])
    expect(next.collections).toHaveLength(1)
    expect(undoable(next)).toBeUndefined()
    expect(undoLast(next)).toBe(next)
  })

  it('only the newest: two swaps undo one at a time', () => {
    const twice = swapTrait(swapTrait(hero(), P('fire'), P('cold'), c), P('cold'), P('sonic'), c)
    const once = undoLast(twice)
    expect(buildSheet(once).powers.map((t) => t.trait.id)).toContain('cold')
  })
})
