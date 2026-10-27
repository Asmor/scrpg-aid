import { describe, expect, it } from 'vitest'
import { formatFull, formatWhen } from './time'

const now = new Date('2026-10-26T20:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('formatWhen', () => {
  it('is relative under an hour', () => {
    expect(formatWhen(ago(0), now, 'en-US')).toBe('now')
    expect(formatWhen(ago(40_000), now, 'en-US')).toBe('now')
    expect(formatWhen(ago(60_000), now, 'en-US')).toBe('1 minute ago')
    expect(formatWhen(ago(3 * 60_000), now, 'en-US')).toBe('3 minutes ago')
    expect(formatWhen(ago(59 * 60_000), now, 'en-US')).toBe('59 minutes ago')
  })

  it('is the time of day under a day, in the locale and time zone', () => {
    expect(formatWhen(ago(2 * 3_600_000), now, 'en-US', 'UTC')).toBe('6:00 PM')
    expect(formatWhen(ago(2 * 3_600_000), now, 'en-GB', 'UTC')).toBe('18:00')
    expect(formatWhen(ago(2 * 3_600_000), now, 'en-US', 'America/New_York')).toBe('2:00 PM')
  })

  it('is the full date and time after a day', () => {
    expect(formatWhen(ago(3 * 86_400_000), now, 'en-US', 'UTC')).toBe('Oct 23, 2026, 8:00 PM')
  })

  it('has a long form for tooltips', () => {
    expect(formatFull('2026-10-26T20:00:00Z', 'en-US', 'UTC')).toContain('Monday, October 26, 2026')
  })
})
