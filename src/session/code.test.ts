import { describe, expect, it } from 'vitest'
import { newRoomCode, normalizeRoomCode } from './code'

describe('room codes', () => {
  it('makes readable codes, and reads typed ones', () => {
    expect(newRoomCode((n) => new Uint8Array(n).map((_, i) => i))).toBe('ABCD-EFGH')
    // Bytes that would bias the choice are skipped.
    let calls = 0
    expect(newRoomCode((n) => new Uint8Array(n).fill(calls++ === 0 ? 255 : 0))).toBe('AAAA-AAAA')
    expect(newRoomCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(normalizeRoomCode(' abcd efgh ')).toBe('ABCD-EFGH')
    expect(normalizeRoomCode('ABCD-EFGH')).toBe('ABCD-EFGH')
    // Too short, or with look-alike characters the codes never use.
    expect(normalizeRoomCode('ABCD')).toBeUndefined()
    expect(normalizeRoomCode('ABCD-EFG0')).toBeUndefined()
    expect(normalizeRoomCode('ABCD-EFGI')).toBeUndefined()
  })
})
