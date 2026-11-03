import { describe, expect, it } from 'vitest'
import { readLastGame } from './types'

describe('reading the last game', () => {
  it('reads a saved last game, and ignores malformed or other-version ones', () => {
    expect(readLastGame({ v: 1, room: 'ABCD-EFGH', at: '2026-10-27T10:00:00.000Z' })).toEqual({ v: 1, room: 'ABCD-EFGH', at: '2026-10-27T10:00:00.000Z' })
    expect(readLastGame({ v: 2, room: 'ABCD-EFGH' })).toBeUndefined()
    expect(readLastGame({ v: 1, room: '' })).toBeUndefined()
    expect(readLastGame({ v: 1, room: 'ABCD-EFGH', at: 'x'.repeat(41) })).toBeUndefined()
    expect(readLastGame(null)).toBeUndefined()
  })
})
