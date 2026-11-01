import { describe, expect, it } from 'vitest'
import { memoryStorage } from '../session/storage'
import { backupStatus, localBackupTime } from './backup-time'

const now = new Date('2026-10-31T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

describe('last backup time', () => {
  it('saves and loads, ignoring junk', () => {
    const storage = memoryStorage()
    const store = localBackupTime(storage)
    expect(store.load()).toBeUndefined()
    store.save('2026-10-12T12:00:00.000Z')
    expect(store.load()).toBe('2026-10-12T12:00:00.000Z')
    storage.setItem('scrpg.library.lastBackupAt', 'nope')
    expect(store.load()).toBeUndefined()
  })

  it('works without storage, or when storage throws', () => {
    expect(localBackupTime(null).load()).toBeUndefined()
    const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    const store = localBackupTime(throwing)
    expect(store.load()).toBeUndefined()
    expect(() => store.save('2026-10-12T12:00:00.000Z')).not.toThrow()
  })
})

describe('backupStatus', () => {
  const items = [{ updatedAt: daysAgo(1) }, { updatedAt: daysAgo(3) }, { updatedAt: daysAgo(30) }]

  it('counts items changed since the last backup', () => {
    expect(backupStatus(items, daysAgo(19), now)).toEqual({ changedSince: 2, remind: true, text: 'Saved in this browser only. Last backup 19 days ago; 2 items changed since.' })
    expect(backupStatus(items, daysAgo(2), now).text).toBe('Saved in this browser only. Last backup 2 days ago; 1 item changed since.')
  })

  it('says when there has never been a backup', () => {
    expect(backupStatus(items, undefined, now)).toEqual({ changedSince: 3, remind: true, text: 'Saved in this browser only. Never backed up.' })
  })

  it('reminds only with items, a backup never or over 14 days ago, and a change since', () => {
    expect(backupStatus([], undefined, now).remind).toBe(false)
    expect(backupStatus(items, daysAgo(14), now).remind).toBe(false)
    expect(backupStatus(items, daysAgo(15), now).remind).toBe(true)
    expect(backupStatus([{ updatedAt: daysAgo(40) }], daysAgo(20), now).remind).toBe(false)
  })
})
