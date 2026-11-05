/**
 * A hero's back issues, collections and history (docs/design/advancement/spec.md, sections 1 and
 * 5; Core Rules p. 142–143). Pure: each takes the hero and returns the next one. The player has
 * full control: nothing here asks a GM or checks when a change is allowed.
 */
import { BACK_ISSUES_PER_COLLECTION } from '../creation/advancement'
import { DETAIL_LABEL } from '../hero/labels'
import type { AdvancementEntry, BackIssue, Hero, HeroDetails } from '../hero/model'
import type { Clock } from '../play/state'

/** The game a back issue came from: the name stays on it, so it reads right after the game is deleted. */
export interface IssueGame {
  id: string
  name: string
}

const gameFields = (game: IssueGame | undefined) => (game ? { gameId: game.id, gameName: game.name } : {})

/** The finished issue a back issue comes from. */
export interface IssueRef {
  id: string
  number: number
}

const issueFields = (issue: IssueRef | undefined) => (issue ? { issueId: issue.id, issueNumber: issue.number } : {})

/** Whether the hero already holds this issue, as a back issue or in a collection. */
export const holdsIssue = (hero: Pick<Hero, 'backIssues' | 'collections'>, issueId: string) => hero.backIssues.some((b) => b.issueId === issueId) || hero.collections.some((c) => c.issues.some((i) => i.issueId === issueId))

/** Adds a back issue, if there's a title and room: a hero can't hold a seventh, or the same issue twice. */
export function addBackIssue(hero: Hero, input: { title: string; game?: IssueGame; issue?: IssueRef }, clock: Clock): Hero {
  const title = input.title.trim()
  if (!title || hero.backIssues.length >= BACK_ISSUES_PER_COLLECTION || (input.issue && holdsIssue(hero, input.issue.id))) return hero
  const issue: BackIssue = { id: clock.newId(), title, ...gameFields(input.game), ...issueFields(input.issue), at: clock.now.toISOString() }
  return { ...hero, backIssues: [...hero.backIssues, issue] }
}

/** What adding an issue's back issue would do: the prompt's three situations, or nothing at all. */
export type BackIssueSituation = 'adds' | 'reachesSix' | 'alreadySix' | 'recorded'

/** Which situation applies to this hero and issue, and its count now. */
export function backIssueOffer(hero: Pick<Hero, 'backIssues' | 'collections'>, issueId: string): { situation: BackIssueSituation; count: number } {
  const count = hero.backIssues.length
  const situation = holdsIssue(hero, issueId) ? 'recorded' : count >= BACK_ISSUES_PER_COLLECTION ? 'alreadySix' : count === BACK_ISSUES_PER_COLLECTION - 1 ? 'reachesSix' : 'adds'
  return { situation, count }
}

/** Changes a back issue's title and game. `game` undefined means None. */
export function editBackIssue(hero: Hero, id: string, input: { title: string; game?: IssueGame }): Hero {
  const title = input.title.trim()
  if (!title) return hero
  return {
    ...hero,
    backIssues: hero.backIssues.map((b) => {
      if (b.id !== id) return b
      // It still came from that issue while it still names that game.
      const issue = b.issueId && b.issueNumber !== undefined && input.game?.id === b.gameId ? { issueId: b.issueId, issueNumber: b.issueNumber } : {}
      return { id: b.id, title, ...gameFields(input.game), ...issue, at: b.at }
    }),
  }
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
  const issues = hero.backIssues.map((b) => ({ title: b.title, ...(b.gameName ? { gameName: b.gameName } : {}), ...(b.issueId && b.issueNumber !== undefined ? { issueId: b.issueId, issueNumber: b.issueNumber } : {}), at: b.at }))
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

/** The newest change Undo can take back: anything but a recorded collection. */
export const undoable = (hero: Pick<Hero, 'advancement'>) => hero.advancement.findLast((e) => e.kind !== 'collection')

/** Reverses the newest change: a swap comes off, a cosmetic field goes back, a rewrite's build returns. */
export function undoLast(hero: Hero): Hero {
  const entry = undoable(hero)
  if (!entry) return hero
  const advancement = hero.advancement.filter((e) => e !== entry)
  if (entry.kind === 'cosmetic' && entry.change?.kind === 'cosmetic') return { ...hero, advancement, details: { ...hero.details, ...entry.change.before } }
  if (entry.kind === 'rewrite' && entry.before) {
    const { rollMode: _, ...rest } = hero
    return { ...rest, ...structuredClone(entry.before), advancement }
  }
  return { ...hero, advancement }
}

/** The cosmetic changes: each opens a small dialog of its fields. */
export type CosmeticKind = 'appearance' | 'codename' | 'costume'

const COSMETIC_FIELDS: Record<CosmeticKind, readonly (keyof HeroDetails)[]> = {
  // A hero's appearance is these fields; there's no one field for it.
  appearance: ['gender', 'age', 'height', 'eyes', 'hair', 'skin', 'build'],
  codename: ['name'],
  costume: ['costume'],
}

export const cosmeticFields = (kind: CosmeticKind) => COSMETIC_FIELDS[kind]

const COSMETIC_WORD: Record<CosmeticKind, string> = { appearance: 'Appearance', codename: 'Codename', costume: 'Costume' }

const shown = (value: string) => value.trim() || '(none)'

/** Changes cosmetic fields, in the history with what they were. Nothing changed, nothing logged. */
export function changeCosmetic(hero: Hero, kind: CosmeticKind, values: Partial<HeroDetails>, clock: Clock): Hero {
  const fields = COSMETIC_FIELDS[kind].filter((f) => values[f] !== undefined && values[f] !== hero.details[f])
  if (!fields.length) return hero
  const before = Object.fromEntries(fields.map((f) => [f, hero.details[f]]))
  const after = Object.fromEntries(fields.map((f) => [f, values[f]!]))
  const parts = fields.map((f) => (kind === 'appearance' ? `${DETAIL_LABEL[f]} ${shown(hero.details[f])} → ${shown(values[f]!)}` : `${shown(hero.details[f])} → ${shown(values[f]!)}`))
  const by = followed(hero)
  return { ...hero, details: { ...hero.details, ...after }, advancement: [...hero.advancement, historyEntry(clock, 'cosmetic', `${COSMETIC_WORD[kind]}: ${parts.join('; ')}.`, { change: { kind: 'cosmetic', before }, ...(by ? { after: by } : {}) })] }
}

/** What a change followed: the last back issue, or if there are none since, the last collection. */
export function followed(hero: Hero): string | undefined {
  return hero.backIssues.at(-1)?.title ?? hero.collections.at(-1)?.name
}

/** "Oct 22": how the page dates things. */
export const shortDate = (at: string) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** "2 collections". */
export const collectionsText = (n: number) => `${n} ${n === 1 ? 'collection' : 'collections'}`
