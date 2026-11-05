/**
 * The end of an issue (docs/design/issues/spec.md): finishing one, and what the Finish dialog says
 * about it. Pure: each change takes the game and returns the new one. Back issues go on library
 * heroes, which the game never changes, so adding them is the caller's.
 */
import { BACK_ISSUES_PER_COLLECTION } from '../creation/advancement'
import { heroDisplayName, type Hero } from '../hero/model'
import { holdsIssue } from '../advancement/records'
import { villainDisplayName } from '../villain/model'
import { clearHeroMods, modSizes, type Clock } from '../play/state'
import { MAX_NAME, MAX_TEXT } from '../session/protocol'
import { nameList } from './names'
import { currentIssue, gameDisplayName, type Game, type GameFeedEntry, type HeroInGame, type Issue, type IssueAck, type Scene } from './model'
import { draftOfCurrent, sceneEndSummary } from './scenes'
import { GM, heroLabel, resolveHit, withLog } from './table'

/** A new issue's title: the game's name for its first, and "Issue N" otherwise. */
export function defaultIssueTitle(game: Pick<Game, 'name' | 'issues'>, issue: Pick<Issue, 'number'>): string {
  return issue.number === 1 && game.name.trim() && !game.issues.some((i) => i.state === 'finished') ? gameDisplayName(game) : `Issue ${issue.number}`
}

export interface FinishChoices {
  title: string
  summary: string
  /** The heroes offered a back issue (the game's ids). */
  heroIds: readonly string[]
}

const logLine = (clock: Clock, text: string): GameFeedEntry => ({ id: clock.newId(), at: clock.now.toISOString(), by: GM, text })

/** The heroes who'd lose bonuses or penalties at the end of the issue, each with their mods' sizes. */
export function modsToClear(game: Pick<Game, 'heroes'>): { name: string; sizes: string }[] {
  return game.heroes.flatMap((h) => {
    const mods = [...h.play.mods, ...(h.play.minions ?? []).flatMap((m) => m.mods)]
    return mods.length ? [{ name: heroLabel(game.heroes, h), sizes: modSizes(mods) }] : []
  })
}

/**
 * Finishes the current issue: its scene becomes done, hits still waiting take the default defense
 * (nobody can answer them while paused), every hero loses their bonuses and penalties (ruling 69),
 * and the game goes between issues with the table paused. The opposition stays until the next issue.
 */
export function finishIssue(game: Game, choices: FinishChoices, clock: Clock): Game {
  const issue = currentIssue(game)
  const title = choices.title.trim().slice(0, MAX_NAME)
  if (!issue || game.solo || !title) return game
  const summary = choices.summary.trim().slice(0, MAX_TEXT)
  const settled = (game.pendingHits ?? []).reduce((g, h) => resolveHit(g, h.id, undefined, clock), game)
  const record = draftOfCurrent(settled).rows
  const cleared = modsToClear(settled)
  const heroes = settled.heroes.map((h) => ({ ...h, play: clearHeroMods(h.play, 'Bonuses and penalties removed: the issue is over.', clock) }))
  const scenes = settled.scenes.map((s): Scene => {
    if (s.id !== settled.currentSceneId) return s
    return { ...s, state: 'done', summary: sceneEndSummary(settled), opposition: record, ...(settled.environment ? { environmentId: settled.environment.id, environmentHidden: settled.environment.hidden } : {}) }
  })
  const offeredTo = settled.heroes.filter((h) => choices.heroIds.includes(h.id)).map((h) => ({ heroId: h.id, sourceId: h.sourceId, name: heroDisplayName(h.sheet) }))
  const issues = settled.issues.map((i): Issue => {
    if (i.id !== issue.id) return i
    const { summary: _, ...rest } = i
    return { ...rest, title, ...(summary ? { summary } : {}), state: 'finished', finishedAt: clock.now.toISOString(), offeredTo }
  })
  const { currentIssueId: _, ...rest } = settled
  const lines = [...(cleared.length ? [logLine(clock, `Bonuses and penalties removed: ${cleared.map((c) => `${c.name} ${c.sizes}`).join('; ')}.`)] : []), logLine(clock, `Issue ${issue.number} finished: ${title}.`)]
  return withLog({ ...rest, heroes, scenes, issues }, lines)
}

/** A hero's answer to a back issue, for the GM's list. It's only ever information. */
export function recordIssueAck(game: Game, issueId: string, heroId: string, ack: Omit<IssueAck, 'at'>, clock: Clock): Game {
  const issue = game.issues.find((i) => i.id === issueId)
  if (!issue || issue.state !== 'finished' || !issue.offeredTo?.some((o) => o.heroId === heroId)) return game
  const entry: IssueAck = { status: ack.status, ...(ack.count !== undefined ? { count: ack.count } : {}), at: clock.now.toISOString() }
  return { ...game, issues: game.issues.map((i) => (i === issue ? { ...i, acks: { ...i.acks, [heroId]: entry } } : i)) }
}

/** The library hero behind one of the GM's own heroes: `gone` when it's been deleted. */
export type OwnHeroState = { gone: boolean; backIssues?: number }

/** A hero's row in the Finish dialog. */
export interface FinishRow {
  heroId: string
  name: string
  /** The player, or "your hero", and whether they're connected. */
  who: string
  /** What will happen. */
  note: string
  /** Back issues now, as last known: a hint for a player's hero. */
  count: number
  /** The GM's hero whose library document is gone. */
  disabled: boolean
  /** A checked hero's tag. */
  tag?: 'Full' | 'Reaches six'
}

function finishRow(game: Pick<Game, 'heroes'>, hero: HeroInGame, on: boolean, connected: ReadonlySet<string>, own: (sourceId: string) => OwnHeroState): FinishRow {
  const name = heroLabel(game.heroes, hero)
  const mine = !hero.player
  const state = mine ? own(hero.sourceId) : undefined
  const count = state?.backIssues ?? hero.sheet.backIssues.length
  const away = Boolean(hero.player && !connected.has(hero.player.clientId))
  const player = hero.player?.name || 'The player'
  const base = { heroId: hero.id, name, who: hero.player ? `${player}${away ? ' · disconnected' : ''}` : 'your hero', count, disabled: Boolean(state?.gone) }
  if (state?.gone) return { ...base, note: 'Not in your library any more.' }
  if (!on) return { ...base, note: 'No back issue for this hero.' }
  if (count >= BACK_ISSUES_PER_COLLECTION) return { ...base, tag: 'Full', note: mine ? 'Already at six. Name a collection on the Advancement page first.' : `Already at six. ${player} is asked to name a collection first.` }
  const tag = count === BACK_ISSUES_PER_COLLECTION - 1 ? ({ tag: 'Reaches six' } as const) : {}
  if (mine) return { ...base, ...tag, note: 'Added to your library hero when you finish.' }
  return { ...base, ...tag, note: away ? `${player} gets the prompt next time they join.` : `${player} confirms on their device.` }
}

/** Every hero's row, as the dialog's checkboxes stand. */
export function finishRows(game: Pick<Game, 'heroes'>, checked: ReadonlySet<string>, connected: ReadonlySet<string>, own: (sourceId: string) => OwnHeroState): FinishRow[] {
  return game.heroes.map((h) => finishRow(game, h, checked.has(h.id), connected, own))
}

/** The scenes of the issue being finished, played so far. */
export const scenesPlayed = (game: Pick<Game, 'scenes' | 'currentIssueId'>) => game.scenes.filter((s) => s.issueId === game.currentIssueId)

/** The opposition staying on the table: "Gravelord, 2 groups and 1 challenge". */
export function oppositionStaying(game: Pick<Game, 'villains' | 'groups' | 'challenges'>): string | undefined {
  const count = (n: number, word: string) => (n ? [`${n} ${word}${n === 1 ? '' : 's'}`] : [])
  const parts = [...game.villains.map((v) => villainDisplayName(v.sheet)), ...count(game.groups.length, 'group'), ...count(game.challenges.length, 'challenge')]
  return parts.length ? nameList(parts) : undefined
}

/** A row of the GM's Back issues card. */
export interface BackIssueStatus {
  heroId: string
  name: string
  who: string
  text: string
  added: boolean
}

/** Who has recorded the last finished issue, from players' answers. Unchecked heroes aren't listed. */
export function backIssueStatuses(game: Pick<Game, 'issues' | 'heroes'>, connected: ReadonlySet<string>): BackIssueStatus[] {
  const issue = game.issues.at(-1)
  if (issue?.state !== 'finished') return []
  return (issue.offeredTo ?? []).map((o) => {
    const hero = game.heroes.find((h) => h.id === o.heroId)
    const ack = issue.acks?.[o.heroId]
    const who = !hero ? 'left the game' : hero.player ? `${hero.player.name || 'A player'}${connected.has(hero.player.clientId) ? '' : ' · disconnected'}` : 'your hero'
    const text = !ack ? 'Not seen yet' : ack.status === 'later' ? 'Later' : `Added${ack.count !== undefined ? ` · ${ack.count} of ${BACK_ISSUES_PER_COLLECTION}` : ''}`
    return { heroId: o.heroId, name: o.name, who, text, added: ack?.status === 'added' }
  })
}

/** What a player's device asks about next: the oldest issue offered to this hero and not answered. */
export function issueToPrompt<I extends { id: string; state: 'now' | 'finished'; offeredTo?: readonly { sourceId: string }[] }>(issues: readonly I[], sourceId: string, hero: Pick<Hero, 'backIssues' | 'collections' | 'dismissedIssues'> | undefined, prompts: Readonly<Record<string, string>>): I | undefined {
  return offeredIssues(issues, sourceId).find((i) => !prompts[i.id] && !hero?.dismissedIssues?.includes(i.id) && !(hero && holdsIssue(hero, i.id)))
}

/** Every finished issue offered to this hero. */
export function offeredIssues<I extends { state: 'now' | 'finished'; offeredTo?: readonly { sourceId: string }[] }>(issues: readonly I[], sourceId: string): I[] {
  return issues.filter((i) => i.state === 'finished' && i.offeredTo?.some((o) => o.sourceId === sourceId))
}
