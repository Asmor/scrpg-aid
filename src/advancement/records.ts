/**
 * A hero's back issues, collections and history (docs/design/advancement/spec.md, sections 1 and
 * 5; Core Rules p. 142–143). Pure: each takes the hero and returns the next one. The player has
 * full control: nothing here asks a GM or checks when a change is allowed.
 */
import { BACK_ISSUES_PER_COLLECTION } from '../creation/advancement'
import type { AdvancementEntry, BackIssue, Hero } from '../hero/model'
import type { Clock } from '../play/state'

/** The game a back issue came from: the name stays on it, so it reads right after the game is deleted. */
export interface IssueGame {
  id: string
  name: string
}

const gameFields = (game: IssueGame | undefined) => (game ? { gameId: game.id, gameName: game.name } : {})

/** Adds a back issue, if there's a title and room: a hero can't hold a seventh. */
export function addBackIssue(hero: Hero, input: { title: string; game?: IssueGame }, clock: Clock): Hero {
  const title = input.title.trim()
  if (!title || hero.backIssues.length >= BACK_ISSUES_PER_COLLECTION) return hero
  const issue: BackIssue = { id: clock.newId(), title, ...gameFields(input.game), at: clock.now.toISOString() }
  return { ...hero, backIssues: [...hero.backIssues, issue] }
}

/** Changes a back issue's title and game. `game` undefined means None. */
export function editBackIssue(hero: Hero, id: string, input: { title: string; game?: IssueGame }): Hero {
  const title = input.title.trim()
  if (!title) return hero
  return { ...hero, backIssues: hero.backIssues.map((b) => (b.id === id ? { id: b.id, title, ...gameFields(input.game), at: b.at } : b)) }
}

export function removeBackIssue(hero: Hero, id: string): Hero {
  return { ...hero, backIssues: hero.backIssues.filter((b) => b.id !== id) }
}

/** A line in the history. */
export function historyEntry(clock: Clock, kind: AdvancementEntry['kind'], text: string, more: Partial<AdvancementEntry> = {}): AdvancementEntry {
  return { id: clock.newId(), at: clock.now.toISOString(), kind, text, ...more }
}

/** The six back issues move into a new collection, the count starts again, and the history says so. */
export function recordCollection(hero: Hero, name: string, clock: Clock): Hero {
  const named = name.trim()
  if (!named || hero.backIssues.length < BACK_ISSUES_PER_COLLECTION) return hero
  const at = clock.now.toISOString()
  const issues = hero.backIssues.map((b) => ({ title: b.title, ...(b.gameName ? { gameName: b.gameName } : {}), at: b.at }))
  return {
    ...hero,
    backIssues: [],
    collections: [...hero.collections, { id: clock.newId(), name: named, at, issues }],
    advancement: [...hero.advancement, historyEntry(clock, 'collection', `Recorded the collection ${named} (${issues.length} back issues).`)],
  }
}

/** A new hero whose GM allows it starts with one empty collection. Only while the hero has none. */
export function addStartingCollection(hero: Hero, name: string, clock: Clock): Hero {
  const named = name.trim()
  if (!named || hero.collections.length) return hero
  return {
    ...hero,
    collections: [{ id: clock.newId(), name: named, at: clock.now.toISOString(), issues: [], starting: true }],
    advancement: [...hero.advancement, historyEntry(clock, 'collection', `Started with the collection ${named}.`)],
  }
}

/** What a change followed: the last back issue, or if there are none since, the last collection. */
export function followed(hero: Hero): string | undefined {
  return hero.backIssues.at(-1)?.title ?? hero.collections.at(-1)?.name
}

/** "Oct 22": how the page dates things. */
export const shortDate = (at: string) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** "2 collections". */
export const collectionsText = (n: number) => `${n} ${n === 1 ? 'collection' : 'collections'}`
