/**
 * History timestamps (GOAL.md, Phase 3): under an hour ago, relative ("3 minutes ago"); under
 * a day, the time in the user's time zone and locale ("3:12 PM", "15:12"); older, the full
 * date and time in their locale. `locale` and `timeZone` are injectable for tests.
 */
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatWhen(at: string, now: Date, locale?: string, timeZone?: string): string {
  const then = new Date(at)
  const ago = now.getTime() - then.getTime()
  if (ago < HOUR) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    // Under a minute reads as "now".
    return ago < MINUTE ? relative.format(0, 'second') : relative.format(-Math.floor(ago / MINUTE), 'minute')
  }
  if (ago < DAY) return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(then)
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(then)
}

/** The full date and time, for a tooltip on any timestamp. */
export function formatFull(at: string, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'medium', timeZone }).format(new Date(at))
}
