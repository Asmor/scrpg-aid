import { describe, expect, it } from 'vitest'
import { createHero, type Hero } from '../hero/model'
import { CURRENT_VERSION, HERO_FORMAT, toSaved } from '../hero/serialize'
import { completeHero, dividedHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createVillain } from '../villain/model'
import { villainToSaved, VILLAIN_FORMAT } from '../villain/serialize'
import { BACKUP_FORMAT, BACKUP_VERSION, backupFileName, backupJson, conflicts, heroesToSave, heroFileName, heroJson, readImport, villainFileName, villainJson } from './files'

const now = new Date('2026-10-26T12:00:00Z')
const hero = (id: string, name = '') => {
  const h = createHero('guided', { id, now })
  h.details.name = name
  return h
}

describe('heroJson', () => {
  it('saves a hero in the stored envelope, and reads it back unchanged', () => {
    const h = { ...dividedHero(), id: 'd1' }
    const text = heroJson(h)
    expect(JSON.parse(text)).toEqual({ format: HERO_FORMAT, version: CURRENT_VERSION, hero: h })
    expect(readImport(text)).toEqual({ ok: true, heroes: [h], villains: [], skipped: [] })
  })
})

describe('play state', () => {
  it('stays in a hero’s JSON and in backups', () => {
    const h = { ...hero('a', 'Ann'), play: { health: 4, heroPoints: 2, reactionUsed: false, mods: [], twists: [], history: [] } }
    expect(readImport(heroJson(h))).toEqual({ ok: true, heroes: [h], villains: [], skipped: [] })
    expect(readImport(backupJson([h], [], now))).toEqual({ ok: true, heroes: [h], villains: [], skipped: [] })
  })
})

describe('backupJson', () => {
  it('wraps every hero in a versioned backup, which reads back in order', () => {
    const heroes = [hero('a', 'Ann'), { ...completeHero(), id: 'b' }]
    const text = backupJson(heroes, [], now)
    expect(JSON.parse(text)).toEqual({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: '2026-10-26T12:00:00.000Z', heroes: heroes.map(toSaved), villains: [] })
    expect(readImport(text)).toEqual({ ok: true, heroes, villains: [], skipped: [] })
  })
})

describe('file names', () => {
  it('names a hero’s file after the hero, safely', () => {
    expect(heroFileName(hero('a', 'Maya Reyes'), 'json')).toBe('maya-reyes.json')
    expect(heroFileName(hero('a', '  Élan / "Vital" '), 'md')).toBe('elan-vital.md')
    const alias = hero('a')
    alias.details.alias = 'Quicksilver'
    expect(heroFileName(alias, 'json')).toBe('quicksilver.json')
    expect(heroFileName(hero('a', '???'), 'json')).toBe('hero.json')
    expect(heroFileName(hero('a', 'x'.repeat(100)), 'json')).toBe(`${'x'.repeat(60)}.json`)
  })

  it('dates a backup in local time', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 30))).toBe('scrpg-aid-backup-2026-01-05.json')
  })
})

describe('readImport', () => {
  it('explains files it can’t read', () => {
    const notOurs = "This file isn't a hero, villain, or backup the app can read."
    expect(readImport('{nope')).toEqual({ ok: false, error: notOurs })
    expect(readImport('[1, 2]')).toEqual({ ok: false, error: notOurs })
    expect(readImport(JSON.stringify({ format: 'other' }))).toEqual({ ok: false, error: notOurs })
    expect(readImport(JSON.stringify({ format: HERO_FORMAT, version: CURRENT_VERSION + 1, hero: hero('a') }))).toEqual({
      ok: false,
      error: `This hero couldn't be read: saved by a newer version of the app (format ${CURRENT_VERSION + 1}).`,
    })
  })

  it('checks a backup’s version and shape', () => {
    const backup = (fields: object) => JSON.stringify({ format: BACKUP_FORMAT, ...fields })
    expect(readImport(backup({ heroes: [] }))).toEqual({ ok: false, error: "This backup couldn't be read: missing or invalid version." })
    expect(readImport(backup({ version: BACKUP_VERSION + 1, heroes: [] }))).toEqual({
      ok: false,
      error: `This backup was made by a newer version of the app (format ${BACKUP_VERSION + 1}).`,
    })
    expect(readImport(backup({ version: 1 }))).toEqual({ ok: false, error: "This backup couldn't be read: it has no list of heroes." })
  })

  it('imports the heroes in a backup it can read, and lists the rest', () => {
    const good = hero('a')
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 1, heroes: [{ nope: true }, toSaved(good), { format: HERO_FORMAT, version: 1, hero: { ...good, method: 'freeform' } }] })
    expect(readImport(text)).toEqual({
      ok: true,
      heroes: [good],
      villains: [],
      skipped: [
        { kind: 'hero', index: 1, error: 'not a saved hero' },
        { kind: 'hero', index: 3, error: expect.stringContaining('method') },
      ],
    })
  })
})

describe('import conflicts', () => {
  const saved = new Set(['a', 'b'])
  let n = 0
  const makeId = () => `new${++n}`

  it('lists the imported heroes that are already saved, once each', () => {
    const incoming = [hero('a'), hero('c'), hero('a'), hero('b')]
    expect(conflicts(incoming, saved).map((h) => h.id)).toEqual(['a', 'b'])
  })

  it('replaces or copies each conflict as chosen, and copies anything not chosen', () => {
    n = 0
    const incoming: Hero[] = [hero('a', 'A'), hero('b', 'B'), hero('c', 'C')]
    const result = heroesToSave(incoming, saved, { a: 'replace', b: 'copy' }, makeId)
    expect(result.map((h) => [h.id, h.details.name])).toEqual([
      ['a', 'A'],
      ['new1', 'B'],
      ['c', 'C'],
    ])
    // Nothing else about a copy changes.
    expect({ ...result[1], id: 'b' }).toEqual(incoming[1])
    // With no choice made, a conflict is kept as a copy.
    expect(heroesToSave([hero('a')], saved, {}, makeId).map((h) => h.id)).toEqual(['new2'])
  })

  it('copies a repeat of an id within the same file', () => {
    n = 0
    expect(heroesToSave([hero('c'), hero('c'), hero('a'), hero('a')], saved, { a: 'replace' }, makeId).map((h) => h.id)).toEqual(['c', 'new1', 'a', 'new2'])
  })
})

describe('villains in files', () => {
  it('reads a villain’s JSON back, and names its file after it', () => {
    const v = adaptiveBruiser()
    expect(readImport(villainJson(v))).toEqual({ ok: true, heroes: [], villains: [v], skipped: [] })
    expect(villainFileName(v, 'pdf')).toBe('ironclad.pdf')
    expect(villainFileName(createVillain({ id: 'x' }), 'json')).toBe('villain.json')
  })

  it('backs up heroes and villains together, and still reads a version-1 backup of heroes', () => {
    const v = adaptiveBruiser()
    const h = hero('a', 'Ann')
    const text = backupJson([h], [v], now)
    expect(JSON.parse(text)).toMatchObject({ version: 2, villains: [villainToSaved(v)] })
    expect(readImport(text)).toEqual({ ok: true, heroes: [h], villains: [v], skipped: [] })
    const v1 = JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: 'x', heroes: [toSaved(h)] })
    expect(readImport(v1)).toEqual({ ok: true, heroes: [h], villains: [], skipped: [] })
  })

  it('lists villains in a backup it can’t read, and explains a damaged villain file', () => {
    const v = adaptiveBruiser()
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 2, exportedAt: 'x', heroes: [], villains: [{ nope: 1 }, villainToSaved(v)] })
    expect(readImport(text)).toEqual({ ok: true, heroes: [], villains: [v], skipped: [{ kind: 'villain', index: 1, error: 'not a saved villain' }] })
    expect(readImport(JSON.stringify({ format: BACKUP_FORMAT, version: 2, exportedAt: 'x', heroes: [] }))).toEqual({ ok: false, error: "This backup couldn't be read: it has no list of villains." })
    expect(readImport(JSON.stringify({ format: VILLAIN_FORMAT, version: 99, villain: {} }))).toEqual({ ok: false, error: "This villain couldn't be read: saved by a newer version of the app (format 99)." })
  })

  it('finds conflicts and copies for villains the same way', () => {
    const v = adaptiveBruiser()
    expect(conflicts([v], new Set(['v1']))).toEqual([v])
    expect(heroesToSave([v], new Set(['v1']), {}, () => 'new')).toEqual([{ ...v, id: 'new' }])
  })
})
