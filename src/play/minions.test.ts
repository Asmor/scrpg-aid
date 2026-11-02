import { describe, expect, it } from 'vitest'
import { emptyPlay } from './state'
import { addMinion, addMinionMod, minionAction, minionCreation, minionEffect, minionMath, minionSize, removeMinionMod, setMinionForm, shrinkMinion, recordMinionRoll, takesAnyAction } from './minions'
import { rollChange, undoRoll } from './roll'

let n = 0
const clock = () => ({ now: new Date('2026-10-29T21:00:00Z'), newId: () => `id${++n}` })

describe('minions in play', () => {
  it('sizes a minion from the roll on the data’s minion chart', () => {
    expect([-1, 0, 1, 3, 4, 7, 8, 11, 12, 20].map(minionSize)).toEqual(['d4', 'd4', 'd6', 'd6', 'd8', 'd8', 'd10', 'd10', 'd12', 'd12'])
  })

  it('reads which dice an ability makes minions with (Mid unless it says, ruling 62)', () => {
    expect(minionCreation('Create a minion using [power]. Reference the minion chart to see what size of minion it is.')).toEqual(['mid'])
    expect(minionCreation('Create a minion using [power]. Use your Min die. Choose which basic action it can perform.')).toEqual(['min'])
    expect(minionCreation('Create two minions using [power], one with your Max die and one with your Mid die.')).toEqual(['max', 'mid'])
    expect(minionCreation('Boost one of your minions using [power].')).toBeUndefined()
    expect(minionCreation('Reduce any damage you take by the number of minions you have.')).toBeUndefined()
    // Not yet: abilities that make "a number of d6 minions equal to your Mid die" (added by hand for now).
    expect(minionCreation('Create a number of d6 minions equal to your Mid die.')).toBeUndefined()
  })

  it('lets a form whose effect says so take any basic action (Autonomous, from the data)', () => {
    expect(takesAnyAction('Autonomous')).toBe(true)
    expect(takesAnyAction('Floating')).toBe(false)
    expect(takesAnyAction(undefined)).toBe(false)
    expect(minionAction('Autonomous', 'attack')).toBe('any')
    expect(minionAction('Pack', 'hinder')).toBe('hinder')
  })

  it('undoes the minions a roll made and the mods it gave them', () => {
    const start = addMinion(emptyPlay(), { name: 'Kix', die: 'd6', action: 'attack' }, clock())
    let after = addMinion(start, { name: 'Golem', die: 'd10', action: 'defend' }, clock())
    after = addMinionMod(after, start.minions![0]!.id, { label: 'pumped', value: 2 }, clock())
    const change = rollChange(start, after, 'Used ability Make Minion:')
    expect(change.minions).toHaveLength(1)
    expect(change.minionMods).toHaveLength(1)
    const undone = undoRoll(after, change)
    expect(undone.minions!.map((m) => m.name)).toEqual(['Kix'])
    expect(undone.minions![0]!.mods).toEqual([])
    // In a game the history stays (with a note), but the minions still go.
    expect(undoRoll(after, change, clock()).minions!.map((m) => m.name)).toEqual(['Kix'])
  })

  it('makes, shrinks and loses minions, recording each', () => {
    let play = addMinion(emptyPlay(), { name: 'Kix', die: 'd6', action: 'attack' }, clock())
    const id = play.minions![0]!.id
    expect(play.history.at(-1)?.text).toBe('Made a minion: Kix (d6), attack.')
    play = shrinkMinion(play, id, clock())
    expect(play.minions![0]!.die).toBe('d4')
    expect(play.history.at(-1)?.text).toBe('Kix shrank to d4.')
    // Shrinking a d4 removes it.
    play = shrinkMinion(play, id, clock())
    expect(play.minions).toEqual([])
    expect(play.history.at(-1)?.text).toBe('Shrank away: Kix (d4).')
  })

  it('keeps each minion’s own mods, and uses up one-time ones on a roll', () => {
    let play = addMinion(emptyPlay(), { name: 'Bolt', die: 'd8', action: 'any', form: 'Autonomous' }, clock())
    const id = play.minions![0]!.id
    play = addMinionMod(play, id, { label: 'dazed', value: -1 }, clock())
    play = addMinionMod(play, id, { label: 'armor', value: 2, persistent: true }, clock())
    expect(play.mods).toEqual([])
    const [dazed, armor] = play.minions![0]!.mods
    const roll = { action: 'hinder' as const, value: 4, mods: [dazed!, armor!] }
    expect(minionMath(roll)).toBe('5 (4 − 1 + 2)')
    expect(minionEffect(roll)).toBe('Hinder 5 (single die, with -1 +2): a -2 penalty.')
    play = recordMinionRoll(play, id, roll, clock())
    expect(play.minions![0]!.mods.map((m) => m.label)).toEqual(['armor'])
    expect(play.history.at(-2)).toMatchObject({ text: 'Bolt took Hinder:', roll: true })
    expect(play.history.at(-1)?.text).toBe('Bolt used up dazed.')
    play = removeMinionMod(play, id, armor!.id, clock())
    expect(play.minions![0]!.mods).toEqual([])
  })

  it('never makes a negative effect (ruling 61)', () => {
    expect(minionEffect({ action: 'attack', value: 1, mods: [{ id: 'p', label: 'x', value: -3 }] })).toBe('Deal 0 (single die, with -3, rolled -2) damage.')
  })

  it('picks a new form for a minion whose form left the sheet; until then it can’t act', () => {
    const waiting = { ...emptyPlay(), minions: [{ id: 'm', name: 'Drone', die: 'd8' as const, action: 'attack' as const, form: 'Explosive', mods: [], needsForm: true as const }] }
    const roll = { action: 'attack' as const, value: 5, mods: [] }
    expect(recordMinionRoll(waiting, 'm', roll, clock())).toBe(waiting)
    const picked = setMinionForm(waiting, 'm', 'Reinforced', clock())
    expect(picked.minions![0]).toEqual({ id: 'm', name: 'Drone', die: 'd8', action: 'attack', form: 'Reinforced', mods: [] })
    expect(picked.history.at(-1)?.text).toBe('Drone is now Reinforced.')
    expect(recordMinionRoll(picked, 'm', roll, clock())).not.toBe(picked)
    // A form that takes any action makes it Autonomous.
    expect(setMinionForm(waiting, 'm', 'Autonomous', clock()).minions![0]!.action).toBe('any')
    expect(setMinionForm(picked, 'm', 'Reinforced', clock())).toBe(picked)
    expect(setMinionForm(picked, 'nope', 'Reinforced', clock())).toBe(picked)
  })
})
