import { describe, expect, it } from 'vitest'
import { abilitySwapOptions, advancedHero, changesInForce } from '../creation/advancement'
import { buildSheet } from '../creation/sheet'
import { parseSaved, toSaved } from '../hero/serialize'
import { sheetDiff } from '../game/sheet-diff'
import type { Hero } from '../hero/model'
import type { Clock } from '../play/state'
import { completeHero, P, Q } from '../test/heroes'
import { changeCosmetic, undoable, undoLast, recordCollection, addBackIssue } from './records'
import { finishRewrite, openRewrite, startRewrite } from './rewrite'
import { abilityCandidates, abilitySwapIssues, heldPrinciples, heldTraits, noCandidatesText, principleName, principleOptions, startingPick, swapAbility, swappableAbilities, swapPrinciple, swapTrait, traitCandidates, traitSwapPreview, traitSwapSummary, usedTrait } from './swaps'

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

describe('swap a principle', () => {
  it('holds both, offers the same categories first, and leaves out the ones held', () => {
    const h = hero()
    expect(heldPrinciples(h).map((p) => p.replace)).toEqual(['background', 'archetype'])
    const { categories, exclude } = principleOptions(h)
    expect(categories.length).toBeGreaterThan(0)
    expect(exclude).toEqual(expect.arrayContaining(['business', 'gearhead']))
  })

  it('records it, and the sheet shows the new one', () => {
    const next = swapPrinciple(hero(), 'background', { id: 'destiny' }, c)
    expect(next.advancement[0]).toMatchObject({ kind: 'details', text: `Swapped ${principleName({ id: 'business' })} for Principle of Destiny.`, change: { kind: 'swapPrinciple', replace: 'background' } })
    expect(buildSheet(next).principles.map((p) => p.name)).toContain('Principle of Destiny')
    expect(heldPrinciples(next)[0]!.choice.id).toBe('destiny')
    expect(buildSheet(undoLast(next)).principles.map((p) => p.name)).not.toContain('Principle of Destiny')
  })
})

describe('swap an ability', () => {
  const find = (h: Hero, name: string) => swappableAbilities(h).find((a) => a.pick.name === name)!

  it('lists abilities Green first, tagged with where they came from', () => {
    const list = swappableAbilities(hero())
    const zones = list.map((a) => a.zone)
    expect(zones).toEqual([...zones].sort((a, b) => ['green', 'yellow', 'red'].indexOf(a) - ['green', 'yellow', 'red'].indexOf(b)))
    expect(find(hero(), 'Inflict').tag).toMatch(/^Power source: /)
    expect(find(hero(), 'Paragon Feat')).toMatchObject({ zone: 'red', tag: 'Red ability: Athletic' })
    const archetype = list.find((a) => a.pick.source.startsWith('archetype'))
    expect(archetype?.tag).toMatch(/^Archetype: /)
  })

  it('offers only the same list, that can use the same trait, and not what the hero has', () => {
    const h = hero()
    const inflict = find(h, 'Inflict')
    const candidates = abilityCandidates(h, inflict)
    expect(candidates.map((a) => a.name)).not.toContain('Inflict')
    const options = abilitySwapOptions(advancedHero(h), inflict.pick)
    // Everything offered can take Fire in its first slot or names it.
    for (const a of candidates) expect(options).toContainEqual(a)
    expect(candidates.length).toBeGreaterThan(0)
    expect(usedTrait(inflict)).toEqual(P('fire'))
  })

  it('starts the new ability with the same trait, and says when nothing qualifies', () => {
    const h = hero()
    const inflict = find(h, 'Inflict')
    const next = abilityCandidates(h, inflict)[0]!
    expect(startingPick(inflict, next).source).toBe(inflict.pick.source)
    expect(noCandidatesText(h, inflict)).toBe(`No other Yellow abilities from ${inflict.sourceName} can use Fire.`)
    expect(startingPick(find(h, 'Paragon Feat'), abilityCandidates(h, find(h, 'Paragon Feat'))[0]!).category).toBe('power:athletic')
  })

  it('records it, applied on the sheet, with no issue when it fits, and Undo takes it back', () => {
    const h = hero()
    const inflict = find(h, 'Inflict')
    const to = startingPick(inflict, abilityCandidates(h, inflict)[0]!)
    expect(abilitySwapIssues(h, inflict.pick, to)).toBe(0)
    const next = swapAbility(h, inflict, to, c)
    expect(next.advancement[0]!.text).toBe(`Swapped Inflict for ${to.name}. It uses Fire.`)
    expect(buildSheet(next).abilities.map((a) => a.baseName)).toContain(to.name)
    expect(buildSheet(next).abilities.map((a) => a.baseName)).not.toContain('Inflict')
    expect(buildSheet(next).warnings).toEqual([])
    expect(buildSheet(undoLast(next)).abilities.map((a) => a.baseName)).toContain('Inflict')
  })

  it('counts an issue when the player gives it another trait', () => {
    const h = hero()
    const inflict = find(h, 'Inflict')
    const to = { ...startingPick(inflict, abilityCandidates(h, inflict)[0]!), uses: [P('speed')] }
    expect(abilitySwapIssues(h, inflict.pick, to)).toBeGreaterThan(0)
  })
})

describe('major rewrite', () => {
  it('builds swaps in, keeps the build for Undo, goes Constructed, and keeps the records', () => {
    let h: Hero = { ...hero(), method: 'guided', rollMode: 'manual' }
    h = addBackIssue(h, { title: 'Issue' }, c)
    h = swapTrait(h, P('fire'), P('cold'), c)
    const started = startRewrite(h, c)
    expect(started.method).toBe('constructed')
    expect(started.rollMode).toBeUndefined()
    expect(started.backIssues).toHaveLength(1)
    expect(openRewrite(started)).toMatchObject({ kind: 'rewrite', open: true, after: 'Issue' })
    // Built in, so it isn't applied twice: the choices themselves say Cold now.
    expect(started.powerSource!.powers.some((a) => a.trait.id === 'cold')).toBe(true)
    expect(changesInForce(started)).toEqual([])
    expect(buildSheet(started).powers.map((t) => t.trait.id)).toContain('cold')
    expect(startRewrite(started, c)).toBe(started)
  })

  it('done logs one entry with a summary of what changed', () => {
    const started = startRewrite(hero(), c)
    const edited = { ...started, details: { ...started.details, costume: 'Blue' } }
    const done = finishRewrite(edited, c)
    expect(openRewrite(done)).toBeUndefined()
    expect(done.advancement).toHaveLength(1)
    expect(done.advancement[0]!.text).toMatch(/^Rebuilt with the constructed method\. .*Blue\.$/)
    expect(done.advancement[0]!.before).toBeDefined()
    expect(finishRewrite(done, c)).toBe(done)
  })

  it('says when nothing changed, and counts past what it names', () => {
    expect(finishRewrite(startRewrite(hero(), c), c).advancement[0]!.text).toBe('Rebuilt with the constructed method. Nothing changed.')
    const started = startRewrite(hero(), c)
    const look = { gender: 'a', age: 'b', height: 'c', eyes: 'd', hair: 'e', skin: 'f', build: 'g', costume: 'h' }
    expect(finishRewrite({ ...started, details: { ...started.details, ...look } }, c).advancement[0]!.text).toContain('; and 2 more.')
  })

  it("doesn't report a swap from before as a change", () => {
    const swapped = swapTrait(hero(), P('fire'), P('cold'), c)
    const done = finishRewrite(startRewrite(swapped, c), c)
    expect(done.advancement.at(-1)!.text).toBe('Rebuilt with the constructed method. Nothing changed.')
  })

  it('Undo restores the build exactly, with earlier swaps back in force', () => {
    const before: Hero = swapTrait({ ...hero(), method: 'guided', rollMode: 'manual' }, P('fire'), P('cold'), c)
    const started = startRewrite(before, c)
    const edited: Hero = { ...started, details: { ...started.details, costume: 'Blue' }, redAbilities: [] }
    const undone = undoLast(finishRewrite(edited, c))
    expect(undone).toEqual(before)
  })

  it('later swaps apply on top of the rebuild, and survive save and read', () => {
    const rebuilt = finishRewrite(startRewrite(swapTrait(hero(), P('fire'), P('cold'), c), c), c)
    const again = swapTrait(rebuilt, P('cold'), P('sonic'), c)
    expect(changesInForce(again)).toHaveLength(1)
    expect(buildSheet(again).powers.map((t) => t.trait.id)).toContain('sonic')
    expect(parseSaved(JSON.parse(JSON.stringify(toSaved(again))))).toMatchObject({ ok: true })
  })
})
