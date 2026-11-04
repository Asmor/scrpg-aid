/**
 * Suggest 3 (the villain wizard spec, section 4): an unofficial inspiration tool that shows three
 * random options from a step's Choose list instead of all of them. The draw uses
 * crypto.getRandomValues; tests inject their own random source.
 */
import type { SuggestStep } from './model'

/** A random number in [0, 1). */
export type Random = () => number

/** A random number in [0, 1) from crypto.getRandomValues. */
export const cryptoRandom: Random = () => {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0]! / 2 ** 32
}

export const SUGGEST_COUNT = 3

/** `count` different ids from `ids`, leaving out `exclude` (in step 4, the upgrades already checked). */
export function drawSuggestions(ids: readonly string[], random: Random = cryptoRandom, exclude: readonly string[] = [], count = SUGGEST_COUNT): string[] {
  const pool = ids.filter((id) => !exclude.includes(id))
  const drawn: string[] = []
  while (drawn.length < count && pool.length) {
    const i = Math.min(pool.length - 1, Math.floor(random() * pool.length))
    drawn.push(pool.splice(i, 1)[0]!)
  }
  return drawn
}

/**
 * What a step shows while Suggest 3 is on: the picks (the current choice, or every checked
 * upgrade) that aren't among the suggestions first, marked as the GM's, then the suggestions, in
 * the list's own order. Ids that aren't on the list are left out.
 */
export function suggestedView<T extends { id: string }>(all: readonly T[], suggested: readonly string[], picked: readonly string[]): { item: T; yours: boolean }[] {
  const yours = all.filter((o) => picked.includes(o.id) && !suggested.includes(o.id)).map((item) => ({ item, yours: true }))
  const drawn = all.filter((o) => suggested.includes(o.id)).map((item) => ({ item, yours: false }))
  return [...yours, ...drawn]
}

/** "3 new suggestions: Bully, Ninja, Leech." */
export function rerollAnnouncement(names: readonly string[]): string {
  return `${names.length} new ${names.length === 1 ? 'suggestion' : 'suggestions'}: ${names.join(', ')}.`
}

/** What each step's bar calls its options. */
export const SUGGEST_NOUN: Record<SuggestStep, string> = { approach: 'approaches', archetype: 'archetypes', upgrades: 'upgrades', mastery: 'masteries' }
