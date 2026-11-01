import { describe, expect, it } from 'vitest'
import { formatAgo, formatAgoInline } from './when'

const now = new Date('2026-10-31T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
const MIN = 60_000
const DAY = 24 * 60 * MIN

describe('formatAgo', () => {
  it('counts minutes, hours, then days, weeks, months and years', () => {
    expect(formatAgo(ago(10_000), now, { locale: 'en' })).toBe('Just now')
    expect(formatAgo(ago(5 * MIN), now, { locale: 'en' })).toBe('5 minutes ago')
    expect(formatAgo(ago(2 * 60 * MIN), now, { locale: 'en' })).toBe('2 hours ago')
    expect(formatAgo(ago(DAY), now, { locale: 'en' })).toBe('Yesterday')
    expect(formatAgo(ago(3 * DAY), now, { locale: 'en' })).toBe('3 days ago')
    expect(formatAgo(ago(8 * DAY), now, { locale: 'en' })).toBe('Last week')
    expect(formatAgo(ago(15 * DAY), now, { locale: 'en' })).toBe('2 weeks ago')
    expect(formatAgo(ago(65 * DAY), now, { locale: 'en' })).toBe('2 months ago')
    expect(formatAgo(ago(400 * DAY), now, { locale: 'en' })).toBe('Last year')
  })

  it('can count in days only, and starts lower-case inline', () => {
    expect(formatAgoInline(ago(19 * DAY), now, { daysOnly: true, locale: 'en' })).toBe('19 days ago')
    expect(formatAgoInline(ago(DAY), now, { daysOnly: true, locale: 'en' })).toBe('yesterday')
  })

  it('handles bad and future times', () => {
    expect(formatAgo('nope', now)).toBe('Unknown time')
    expect(formatAgo(ago(-5 * MIN), now)).toBe('Just now')
  })
})
