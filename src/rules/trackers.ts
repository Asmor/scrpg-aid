/** The scene tracker presets (data/scenes/trackers.json), and naming a tracker from its box counts. Pure. */
import trackersJson from '../../data/scenes/trackers.json'
import { typed } from './data'
import type { PageRef, Zone } from './types'

/** How many boxes of each zone a tracker has. */
export type TrackerCounts = Record<Zone, number>

export interface TrackerPreset extends PageRef {
  id: string
  name: string
  /** The printed page hasn't been filled in yet (data/README.md). */
  pageUnknown?: boolean
  counts: TrackerCounts
}

export const TRACKER_PRESETS = typed<TrackerPreset[]>(trackersJson.trackers)

const STANDARD = TRACKER_PRESETS.find((p) => p.id === 'standard')
if (!STANDARD) throw new Error('data/scenes/trackers.json has no standard tracker')

/** What a new game's first scene and every new planned scene start with. */
export const DEFAULT_TRACKER: TrackerCounts = STANDARD.counts

export const sameCounts = (a: TrackerCounts, b: TrackerCounts) => a.green === b.green && a.yellow === b.yellow && a.red === b.red

/** The preset with these counts, if there is one. */
export const presetOf = (counts: TrackerCounts) => TRACKER_PRESETS.find((p) => sameCounts(p.counts, counts))

/** A tracker's name, from its counts: the preset's, or "Custom". */
export const trackerName = (counts: TrackerCounts) => presetOf(counts)?.name ?? 'Custom'

/** "3 / 5 / 3". */
export const countsText = (counts: TrackerCounts) => `${counts.green} / ${counts.yellow} / ${counts.red}`
