import { describe, expect, it } from 'vitest'
import { countsText, DEFAULT_TRACKER, presetOf, TRACKER_PRESETS, trackerName } from './trackers'

describe('tracker presets', () => {
  it('has the Standard, Prolonged and Epic trackers from the data', () => {
    expect(TRACKER_PRESETS.map((p) => [p.id, countsText(p.counts)])).toEqual([
      ['standard', '2 / 4 / 2'],
      ['prolonged', '3 / 5 / 3'],
      ['epic', '1 / 3 / 4'],
    ])
    expect(DEFAULT_TRACKER).toEqual({ green: 2, yellow: 4, red: 2 })
  })

  it('names a tracker from its counts, with no preset field to keep in step', () => {
    expect(trackerName({ green: 3, yellow: 5, red: 3 })).toBe('Prolonged')
    expect(trackerName({ green: 3, yellow: 5, red: 2 })).toBe('Custom')
    expect(presetOf({ green: 1, yellow: 3, red: 4 })?.id).toBe('epic')
    expect(presetOf({ green: 0, yellow: 0, red: 1 })).toBeUndefined()
  })
})
