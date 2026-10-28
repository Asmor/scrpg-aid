import { describe, expect, it } from 'vitest'
import { createMinion, minionDisplayName, minionKind, type Minion } from './model'
import { minionToSaved, MINION_FORMAT, parseSavedMinion, parseSavedMinionJson } from './serialize'
import { minionProblem } from './validate'

const now = new Date('2026-10-27T12:00:00Z')

describe('the minion document', () => {
  it('starts blank: a d6 minion, or a d8 lieutenant', () => {
    const m = createMinion({ id: 'm1', now })
    expect(m).toEqual({ id: 'm1', createdAt: now.toISOString(), updatedAt: now.toISOString(), name: '', lieutenant: false, die: 'd6', count: '', description: '', abilities: [], tactics: '' })
    expect(minionProblem(m)).toBeUndefined()
    expect(createMinion({ lieutenant: true })).toMatchObject({ lieutenant: true, die: 'd8' })
  })

  it('is named by its name, or by its kind', () => {
    const m = createMinion({ id: 'm1', now })
    expect(minionDisplayName(m)).toBe('Unnamed minion')
    expect(minionKind(m)).toBe('Minion')
    m.lieutenant = true
    expect(minionDisplayName(m)).toBe('Unnamed lieutenant')
    expect(minionKind(m)).toBe('Lieutenant')
    m.name = '  Captain Krill '
    expect(minionDisplayName(m)).toBe('Captain Krill')
  })
})

describe('saving minions', () => {
  const full = (): Minion => ({
    ...createMinion({ id: 'm1', now }),
    name: 'Blade Battalion',
    die: 'd8',
    count: '1 per hero',
    description: 'Armed soldiers with jetpacks.',
    abilities: [
      { name: 'Covering Fire', text: '+2 to Defend an ally in the same location.', bonus: { amount: 2, actions: ['defend'] } },
      { name: 'Expendable', text: 'Sacrifice itself to shield the villain.' },
    ],
    tactics: 'Swarm the weakest hero.',
    notes: 'From issue 3.',
  })

  it('round-trips through the versioned envelope and JSON', () => {
    const m = full()
    expect(minionToSaved(m)).toEqual({ format: MINION_FORMAT, version: 1, minion: m })
    expect(parseSavedMinion(minionToSaved(m))).toEqual({ ok: true, minion: m })
    expect(parseSavedMinionJson(JSON.stringify(minionToSaved(m)))).toEqual({ ok: true, minion: m })
  })

  it('rejects what isn’t a well-formed minion', () => {
    expect(parseSavedMinionJson('nope')).toEqual({ ok: false, error: 'not valid JSON' })
    expect(parseSavedMinion({ format: 'scrpg-villain', version: 1, villain: {} })).toEqual({ ok: false, error: 'not a saved minion' })
    expect(parseSavedMinion({ format: MINION_FORMAT, version: 9, minion: {} })).toEqual({ ok: false, error: 'saved by a newer version of the app (format 9)' })
    const bad = (change: (m: Record<string, unknown>) => void) => {
      const m = full() as unknown as Record<string, unknown>
      change(m)
      return parseSavedMinion({ format: MINION_FORMAT, version: 1, minion: m })
    }
    expect(bad((m) => (m.die = 'd20'))).toEqual({ ok: false, error: 'minion.die has an unknown value' })
    expect(bad((m) => (m.lieutenant = 'yes'))).toEqual({ ok: false, error: 'minion.lieutenant should be true or false' })
    expect(bad((m) => (m.abilities = [{ name: 'x' }]))).toEqual({ ok: false, error: 'minion.abilities[0].text should be text' })
    expect(bad((m) => (m.abilities = [{ name: 'x', text: '', bonus: { amount: 1.5, actions: [] } }]))).toEqual({ ok: false, error: 'minion.abilities[0].bonus.amount should be a whole number' })
    expect(bad((m) => (m.abilities = [{ name: 'x', text: '', bonus: { amount: 1, actions: ['fly'] } }]))).toEqual({ ok: false, error: 'minion.abilities[0].bonus.actions[0] has an unknown value' })
  })

  it('migrates an older version forward', () => {
    const m = full()
    const old = { format: MINION_FORMAT, version: 1, minion: { ...m, tactics: undefined } }
    expect(parseSavedMinion(old, { 1: (doc) => ({ ...doc, tactics: '' }) }, 2)).toEqual({ ok: true, minion: { ...m, tactics: '' }, migratedFrom: 1 })
  })
})
