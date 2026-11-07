/**
 * History timestamps (scrpg-aid-designs/hero-sheet/spec.md, History; GOAL.md, Phase 3): relative for a
 * week ("now", "3 minutes ago", "2 hours ago", "1 day ago"), then the full date and time in the
 * user's locale and time zone. Days count elapsed time, so they say "1 day ago" rather than a
 * calendar "yesterday". `locale` and `timeZone` are injectable for tests.
 */
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatWhen(at: string, now: Date, locale?: string, timeZone?: string): string {
  const then = new Date(at)
  if (Number.isNaN(then.getTime())) return 'unknown time'
  const ago = now.getTime() - then.getTime()
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
  // Under a minute reads as "now".
  if (ago < MINUTE) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second')
  if (ago < HOUR) return relative.format(-Math.floor(ago / MINUTE), 'minute')
  if (ago < DAY) return relative.format(-Math.floor(ago / HOUR), 'hour')
  if (ago < 7 * DAY) return relative.format(-Math.floor(ago / DAY), 'day')
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(then)
}

/** The full date and time, for a tooltip on any timestamp. */
export function formatFull(at: string, locale?: string, timeZone?: string): string {
  const then = new Date(at)
  if (Number.isNaN(then.getTime())) return 'unknown time'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'medium', timeZone }).format(then)
}
