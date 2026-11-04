import { describe, expect, it } from 'vitest'
import { appVersion, buildTime, formatBuildDate, versionLine } from './build-info'
import pkg from '../../package.json'

describe('build info', () => {
  it('reads the version from package.json and the build time from the build', () => {
    expect(appVersion).toBe(pkg.version)
    expect(Number.isNaN(new Date(buildTime).getTime())).toBe(false)
  })

  it('formats the build date as a short month, day and year', () => {
    expect(formatBuildDate('2026-11-04T12:00:00')).toBe('Nov 4, 2026')
    expect(formatBuildDate('not a date')).toBe('')
  })

  it('builds the version line, leaving out an unreadable date', () => {
    expect(versionLine('0.9.3', '2026-11-04T12:00:00')).toBe('Version 0.9.3 · built Nov 4, 2026')
    expect(versionLine('0.9.3', '')).toBe('Version 0.9.3')
  })
})
