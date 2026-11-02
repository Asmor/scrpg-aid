import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import type { PlayState } from '../hero/model'
import { emptyPlay } from '../play/state'
import { completeHero, dividedHero, formChangerHero, minionMakerHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { emptyVillainPlay } from '../villain/play'
import { healthLine, reconcile, reconcileVillain } from './reconcile'

/** completeHero with a lower max Health (a fixed 1 instead of its trait's die). */
function lowerMax() {
  const h = completeHero()
  h.health = { ...h.health!, mode: 'roll', rollResult: 1 }
  return h
}

const max = (h: ReturnType<typeof completeHero>) => buildSheet(h).maxHealth!

describe('reconcile, row by row', () => {
  it('Health above the new max is lowered to it', () => {
    const newMax = max(lowerMax())
    const { play, adjustments } = reconcile({ ...emptyPlay(), health: newMax + 2 }, lowerMax(), completeHero())
    expect(play.health).toBe(newMax)
    expect(adjustments).toEqual([`Health lowered to ${newMax}, the new max.`])
    // At full Health (none recorded) on the old, higher max: down to the new max too.
    expect(reconcile(emptyPlay(), lowerMax(), completeHero()).play.health).toBe(newMax)
  })

  it('a higher max never raises current Health', () => {
    const oldMax = max(lowerMax())
    const { play, adjustments } = reconcile(emptyPlay(), completeHero(), lowerMax())
    expect(play.health).toBe(oldMax)
    expect(adjustments).toEqual([])
    expect(reconcile({ ...emptyPlay(), health: 5 }, completeHero(), lowerMax()).play.health).toBe(5)
    expect(healthLine({ health: 5 }, oldMax, [])).toBe('Health stays at 5.')
    expect(healthLine({}, oldMax, [])).toBe(`Health stays at ${oldMax}.`)
    expect(healthLine({ health: 99 }, 30, ['Health lowered to 30, the new max.'])).toBeUndefined()
  })

  it('a form that is gone switches to the base form; one that moved is followed', () => {
    // Named forms: an unnamed one is named by its place ("Green form 2"), so it can't be followed when others move.
    const named = () => {
      const h = formChangerHero()
      h.archetype!.forms = h.archetype!.forms!.map((f, i) => ({ ...f, name: f.name ?? `Form ${i}` }))
      return h
    }
    const old = named()
    const gone = named()
    gone.archetype!.forms = gone.archetype!.forms!.slice(1) // Brute is gone, the others move up
    const inBrute: PlayState = { ...emptyPlay(), form: 'form:0' }
    const r = reconcile(inBrute, gone, old)
    expect(r.play.form).toBeUndefined()
    expect(r.adjustments).toEqual(["Brute is no longer on the sheet, so you're back in your base form."])
    // In the second form (now the first), the key follows it.
    const second = buildSheet(old).forms[1]!.name
    const moved = reconcile({ ...emptyPlay(), form: 'form:1' }, gone, old)
    expect(moved.play.form).toBe('form:0')
    expect(buildSheet(gone).forms[0]!.name).toBe(second)
    expect(moved.adjustments).toEqual([])
    // A form still where it was is kept as it is.
    const kept = reconcile(inBrute, named(), old)
    expect(kept.play).toBe(inBrute)
  })

  it('the Divided form always exists, so it is kept', () => {
    const play: PlayState = { ...emptyPlay(), dividedForm: 'heroic' }
    expect(reconcile(play, dividedHero(), dividedHero())).toEqual({ play, adjustments: [] })
  })

  it('a minion whose form is gone stays, with its die and mods, marked to pick a new form', () => {
    const fewer = minionMakerHero()
    fewer.archetype!.minionForms = { ...fewer.archetype!.minionForms!, forms: ['Autonomous'] }
    const mods = [{ id: 'm', label: 'charged', value: 1 }]
    const play: PlayState = {
      ...emptyPlay(),
      minions: [
        { id: 'a', name: 'Drone', die: 'd8', action: 'attack', form: 'Explosive', mods },
        { id: 'b', name: 'Scout', die: 'd6', action: 'any', form: 'Autonomous', mods: [] },
        { id: 'c', name: 'Plain', die: 'd4', action: 'defend', mods: [] },
      ],
    }
    const { play: next, adjustments } = reconcile(play, fewer, minionMakerHero())
    expect(next.minions).toEqual([{ ...play.minions![0], needsForm: true }, play.minions![1], play.minions![2]])
    expect(adjustments).toEqual(['Drone (d8) needs a new form: Explosive is no longer on the sheet. Pick a new form before it acts.'])
    // Already waiting for one: not reported again.
    expect(reconcile(next, fewer, fewer).adjustments).toEqual([])
  })

  it('minions over a limit are kept (the app sets none), and nothing tracks used-up abilities to drop', () => {
    const many: PlayState = { ...emptyPlay(), minions: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, name: `M${i}`, die: 'd6' as const, action: 'attack' as const, mods: [] })) }
    expect(reconcile(many, minionMakerHero(), minionMakerHero())).toEqual({ play: many, adjustments: [] })
  })

  it('never touches mods, twists, hero points, the reaction or the history', () => {
    const play: PlayState = {
      ...emptyPlay(),
      health: 3,
      heroPoints: 2,
      reactionUsed: true,
      mods: [{ id: 'm', label: 'x', value: 2 }],
      twists: [{ id: 't', kind: 'minor', text: 'Pinned' }],
      history: [{ id: 'h', at: 'now', text: 'Something.' }],
    }
    const { play: next } = reconcile(play, lowerMax(), completeHero())
    expect(next).toEqual(play)
  })

  it('works without the old sheet', () => {
    expect(reconcile({ ...emptyPlay(), health: 500 }, completeHero()).play.health).toBe(max(completeHero()))
    expect(reconcile({ ...emptyPlay(), form: 'form:9' }, formChangerHero()).play.form).toBeUndefined()
  })
})

describe('reconcileVillain', () => {
  it('lowers Health above the new max, keeping mods and the rest', () => {
    const fewer = { ...adaptiveBruiser(), heroCount: 3 }
    const play = { ...emptyVillainPlay(), health: 54, mods: [{ id: 'm', label: 'x', value: -1 }] }
    const r = reconcileVillain(play, fewer, adaptiveBruiser())
    expect(r.play).toEqual({ ...play, health: 50 })
    expect(r.adjustments).toEqual(['Health lowered to 50, the new max.'])
    // At full Health, a higher max doesn't raise it.
    expect(reconcileVillain(emptyVillainPlay(), adaptiveBruiser(), fewer).play.health).toBe(50)
  })

  it('drops a weakness tier the new status rule doesn’t have', () => {
    const r = reconcileVillain({ ...emptyVillainPlay(), weaknessTier: 2 }, adaptiveBruiser(), adaptiveBruiser())
    expect(r.play.weaknessTier).toBeUndefined()
    expect(r.adjustments).toEqual(['The weakness chosen for its status die is no longer on the sheet, so it uses the default.'])
  })
})
