import { describe, expect, it } from 'vitest'
import { createGame } from '../game/model'
import { project, VIEW_HISTORY } from '../game/project'
import { addHero } from '../game/table'
import { completeHero } from '../test/heroes'
import { messageVersion, readClientMessage, readHostMessage, tableViewProblem } from './protocol'

const clock = { now: new Date('2026-11-03T12:00:00Z'), newId: () => 'h1' }
const hello = { v: 3, type: 'hello', role: 'player', clientId: 'c1', name: 'Alex', heroSourceId: 'maya', sheet: completeHero() }
const action = (a: unknown) => ({ v: 3, type: 'action', id: 'a1', heroId: 'h1', action: a, basedOn: 3 })
const roll = {
  subject: { kind: 'ability', name: 'Non-stop Assault' },
  record: { title: 'Non-stop Assault', rolled: [{ label: 'Speed', die: 'd8', value: 5 }], results: [{ action: 'attack', use: 'max', base: 5, mods: [], total: 5 }], manual: false },
  selfMods: [],
  minionMods: [],
  others: [{ to: { kind: 'member', groupId: 'g', memberId: 'm' }, mod: { label: 'Dazed', value: -1 } }],
  made: [],
  attacks: [{ result: 0, to: { kind: 'villain', id: 'v1' } }],
  defends: [{ result: 1 }, { result: 2, to: { kind: 'hero', id: 'h2' } }],
}

describe('reading messages from players and observers', () => {
  it('reads hellos for both roles', () => {
    expect(readClientMessage(hello)).toEqual(hello)
    const observer = { v: 3, type: 'hello', role: 'observer', clientId: 'c2', screenName: 'Living room TV' }
    expect(readClientMessage(observer)).toEqual(observer)
    expect(readClientMessage({ ...hello, sheet: { not: 'a hero' } })).toBeUndefined()
    expect(readClientMessage({ ...hello, name: 'x'.repeat(500) })).toBeUndefined()
    // Sheets have no limits of their own, so the whole message is capped.
    expect(readClientMessage({ ...hello, sheet: { ...completeHero(), details: { ...completeHero().details, backstory: 'x'.repeat(1_100_000) } } })).toBeUndefined()
  })

  it('reads every kind of action, and refuses malformed ones', () => {
    const good = [
      { kind: 'health', by: -3 },
      { kind: 'setHealth', value: 14 },
      { kind: 'addMod', mod: { label: 'Tailwind', value: 2, persistent: true } },
      { kind: 'removeMod', modId: 'm1' },
      { kind: 'addTwist', twist: { kind: 'minor', text: 'Lost a shoe' } },
      { kind: 'removeTwist', twistId: 't1' },
      { kind: 'heroPoints', by: -1 },
      { kind: 'reaction', used: true },
      { kind: 'form', key: '' },
      { kind: 'dividedForm', form: 'heroic' },
      { kind: 'roll', roll },
      { kind: 'makeMinion', minion: { name: 'Drone', die: 'd6', action: 'any' } },
      { kind: 'removeMinion', minionId: 'x' },
      { kind: 'shrinkMinion', minionId: 'x' },
      { kind: 'minionMod', minionId: 'x', mod: { label: 'Aim', value: 1 } },
      { kind: 'removeMinionMod', minionId: 'x', modId: 'y' },
      { kind: 'minionRoll', minionId: 'x', roll: { action: 'attack', value: 4, mods: [] } },
      { kind: 'minionForm', minionId: 'x', form: 'Fast' },
      { kind: 'handOff', to: { kind: 'villain', id: 'v' } },
      { kind: 'startRound', first: { kind: 'hero', id: 'h' } },
    ]
    for (const a of good) expect(readClientMessage(action(a)), a.kind).toBeDefined()
    const bad = [
      { kind: 'nope' },
      { kind: 'constructor' },
      { kind: 'health', by: 1.5 },
      { kind: 'addMod', mod: { label: 'x', value: 0 } },
      { kind: 'addMod', mod: { label: 'x', value: 40 } },
      { kind: 'heroPoints', by: 3 },
      { kind: 'roll', roll: { ...roll, record: { ...roll.record, rolled: [{ label: 'x', die: 'd8', value: 13 }] } } },
      { kind: 'roll', roll: { ...roll, others: [{ to: { kind: 'member', groupId: 'g' }, mod: { label: 'x', value: -1 } }] } },
      { kind: 'roll', roll: { ...roll, attacks: [{ result: 12, to: { kind: 'villain', id: 'v1' } }] } },
      { kind: 'roll', roll: { ...roll, attacks: [{ result: 0, to: { kind: 'group', id: 'g' } }] } },
      { kind: 'roll', roll: { ...roll, defends: [{ result: 0, to: { kind: 'environment' } }] } },
      { kind: 'roll', roll: { ...roll, defends: undefined } },
      { kind: 'handOff', to: { kind: 'challenge', id: 'c' } },
    ]
    for (const a of bad) expect(readClientMessage(action(a)), JSON.stringify(a)).toBeUndefined()
    expect(readClientMessage({ ...action({ kind: 'reaction', used: true }), basedOn: 'x' })).toBeUndefined()
  })

  it('reads sync requests and cancels', () => {
    expect(readClientMessage({ v: 3, type: 'syncRequest', heroId: 'h', sheet: completeHero() })).toBeDefined()
    expect(readClientMessage({ v: 3, type: 'syncCancel', heroId: 'h' })).toBeDefined()
    expect(readClientMessage({ v: 3, type: 'syncCancel' })).toBeUndefined()
  })

  it('ignores other versions, unknown types and non-objects, and reports a version', () => {
    expect(readClientMessage({ ...hello, v: 1 })).toBeUndefined()
    expect(readClientMessage({ ...hello, type: 'toString' })).toBeUndefined()
    expect(readClientMessage('hi')).toBeUndefined()
    expect(messageVersion({ v: 1, type: 'hello' })).toBe(1)
    expect(messageVersion(null)).toBeUndefined()
  })
})

describe('reading messages from the GM', () => {
  const table = project(createGame({ id: 'g' }), 'player')

  it('reads a state with the projection, and refuses a malformed one', () => {
    const state = { v: 3, type: 'state', room: 'ABCD-EFGH', version: 4, table, gm: 'Sam', you: { heroId: 'h', since: '2026-10-30T20:00:00Z' } }
    expect(readHostMessage(state)).toEqual(state)
    expect(readHostMessage({ ...state, table: { ...table, scene: { ...table.scene, position: 99 } } })).toBeUndefined()
    expect(readHostMessage({ ...state, table: { ...table, heroes: 'x' } })).toBeUndefined()
    const long = project(addHero(createGame({ id: 'g' }), completeHero(), clock), 'player')
    long.heroes[0]!.play.history = Array.from({ length: VIEW_HISTORY + 1 }, (_, i) => ({ id: `h${i}`, at: 'x', text: 'x' }))
    expect(tableViewProblem(long)).toBeDefined()
    expect(tableViewProblem({ ...table, villains: [{ id: 'v', name: 'G', major: true, hidden: false, playersSee: 'everything' }] })).toBeDefined()
  })

  it('reads results, sync results and refusals', () => {
    expect(readHostMessage({ v: 3, type: 'result', id: 'a1', ok: true })).toBeDefined()
    expect(readHostMessage({ v: 3, type: 'result', id: 'a1', ok: false, reason: "it isn't your turn" })).toBeDefined()
    expect(readHostMessage({ v: 3, type: 'result', id: 'a1', ok: false })).toBeUndefined()
    expect(readHostMessage({ v: 3, type: 'syncResult', heroId: 'h', approved: true, adjustments: ['Health 30 → 28'] })).toBeDefined()
    expect(readHostMessage({ v: 3, type: 'refused', reason: 'full' })).toBeDefined()
    expect(readHostMessage({ v: 3, type: 'refused', reason: 'bored' })).toBeUndefined()
  })
})
