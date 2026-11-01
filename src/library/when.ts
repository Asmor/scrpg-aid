/**
 * Relative times in the library: "2 hours ago", "Yesterday", "Last week" in the Changed column,
 * and "19 days ago" for the last backup (docs/design/library/spec.md). `locale` is injectable
 * for tests.
 */
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)

/**
 * How long ago `at` was, in words, starting with a capital ("Just now", "5 minutes ago",
 * "Yesterday", "Last week", "3 months ago"). With `daysOnly`, anything a day or more counts in
 * days ("19 days ago").
 */
export function formatAgo(at: string, now: Date, options: { daysOnly?: boolean; locale?: string } = {}): string {
  const then = new Date(at)
  if (Number.isNaN(then.getTime())) return 'Unknown time'
  const ago = Math.max(0, now.getTime() - then.getTime())
  const rtf = new Intl.RelativeTimeFormat(options.locale, { numeric: 'auto' })
  const say = (n: number, unit: Intl.RelativeTimeFormatUnit) => capitalize(rtf.format(-n, unit))
  if (ago < MINUTE) return 'Just now'
  if (ago < HOUR) return say(Math.floor(ago / MINUTE), 'minute')
  if (ago < DAY) return say(Math.floor(ago / HOUR), 'hour')
  const days = Math.floor(ago / DAY)
  if (options.daysOnly || days < 7) return say(days, 'day')
  if (days < 30) return say(Math.floor(days / 7), 'week')
  if (days < 365) return say(Math.floor(days / 30), 'month')
  return say(Math.floor(days / 365), 'year')
}

/** The same, starting lower-case, for the middle of a sentence ("Last backup 19 days ago"). */
export function formatAgoInline(at: string, now: Date, options: { daysOnly?: boolean; locale?: string } = {}): string {
  const text = formatAgo(at, now, options)
  return text.charAt(0).toLocaleLowerCase() + text.slice(1)
}
