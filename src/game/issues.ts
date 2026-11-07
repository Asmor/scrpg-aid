/**
 * The end of an issue (scrpg-aid-designs/issues/spec.md): finishing one, and what the Finish dialog says
 * about it. Pure: each change takes the game and returns the new one. Back issues go on players'
 * library heroes, on their own devices; the game never changes those.
 */
import { BACK_ISSUES_PER_COLLECTION } from '../creation/advancement'
import { heroDisplayName, type Hero } from '../hero/model'
import { holdsIssue } from '../advancement/records'
import { villainDisplayName } from '../villain/model'
import { clearHeroMods, heroPointsLeft, heroRecovers, MAX_HERO_POINTS, modSizes, returnHeroPointBonus, spendHeroPoints, type Clock } from '../play/state'
import { MAX_NAME, MAX_TEXT } from '../session/protocol'
import { nameList } from './names'
import { betweenIssues, createIssue, currentIssue, gameDisplayName, nextIssueNumber, sceneName, sceneNumber, type Game, type GameFeedEntry, type HeroInGame, type Issue, type IssueAck, type Scene } from './model'
import { draftOfCurrent, enterScene, sceneEndSummary, type StartChoices } from './scenes'
import { GM, heroLabel, resolveHit, withLog } from './table'

/** A new issue's title: the game's name for its first, and "Issue N" otherwise. */
export function defaultIssueTitle(game: Pick<Game, 'name' | 'issues'>, issue: Pick<Issue, 'number'>): string {
  return issue.number === 1 && game.name.trim() && !game.issues.some((i) => i.state === 'finished') ? gameDisplayName(game) : `Issue ${issue.number}`
}

export interface FinishChoices {
  title: string
  summary: string
  /** The players' heroes offered a back issue (the game's ids). */
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
  const offeredTo = settled.heroes.filter((h) => h.player && choices.heroIds.includes(h.id)).map((h) => ({ heroId: h.id, sourceId: h.sourceId, name: heroDisplayName(h.sheet) }))
  const issues = settled.issues.map((i): Issue => {
    if (i.id !== issue.id) return i
    const { summary: _, ...rest } = i
    return { ...rest, title, ...(summary ? { summary } : {}), state: 'finished', finishedAt: clock.now.toISOString(), offeredTo }
  })
  const { currentIssueId: _, ...rest } = settled
  const lines = [...(cleared.length ? [logLine(clock, `Bonuses and penalties removed: ${cleared.map((c) => `${c.name} ${c.sizes}`).join('; ')}.`)] : []), logLine(clock, `Issue ${issue.number} finished: ${title}.`)]
  return withLog({ ...rest, heroes, scenes, issues }, lines)
}

/**
 * The GM changes the game's hero points (scrpg-aid-designs/game-table/spec.md, section 5), logged for
 * everyone. Lowered below what a hero has already bought for the next issue, that hero's newest
 * bonuses go back until it fits (scrpg-aid-designs/issues/spec.md, section 4a).
 */
export function changeHeroPoints(game: Game, by: 1 | -1, clock: Clock): Game {
  const count = game.heroPoints + by
  if (count < 0 || count > MAX_HERO_POINTS) return game
  const next = nextIssueNumber(game)
  const returned: string[] = []
  const heroes = game.heroes.map((h) => {
    let play = h.play
    const back: number[] = []
    while ((play.heroPointBuys ?? []).reduce((n, b) => n + b.size, 0) > count) {
      const newest = play.heroPointBuys!.at(-1)!
      back.push(newest.size)
      play = returnHeroPointBonus(play, newest.id, next, clock)
    }
    if (back.length) returned.push(`${heroLabel(game.heroes, h)} ${back.map((s) => `+${s}`).join(', ')}`)
    return play === h.play ? h : { ...h, play }
  })
  const lines = [logLine(clock, `The heroes ${by > 0 ? 'gained' : 'lost'} a hero point. They have ${count}.`), ...(returned.length ? [logLine(clock, `Bonuses returned for the lower count: ${returned.join('; ')}.`)] : [])]
  return withLog({ ...game, heroPoints: count, heroes }, lines)
}

/** A hero's answer to a back issue, for the GM's list. It's only ever information. */
export function recordIssueAck(game: Game, issueId: string, heroId: string, ack: Omit<IssueAck, 'at'>, clock: Clock): Game {
  const issue = game.issues.find((i) => i.id === issueId)
  if (!issue || issue.state !== 'finished' || !issue.offeredTo?.some((o) => o.heroId === heroId)) return game
  const entry: IssueAck = { status: ack.status, ...(ack.count !== undefined ? { count: ack.count } : {}), at: clock.now.toISOString() }
  return { ...game, issues: game.issues.map((i) => (i === issue ? { ...i, acks: { ...i.acks, [heroId]: entry } } : i)) }
}

/** A hero's row in the Finish dialog. */
export interface FinishRow {
  heroId: string
  name: string
  /** The player, and whether they're connected. */
  who: string
  /** What will happen. */
  note: string
  /** Back issues now, as last known: a hint for a player's hero. */
  count: number
  /** A checked hero's tag. */
  tag?: 'Full' | 'Reaches six'
}

function finishRow(game: Pick<Game, 'heroes'>, hero: HeroInGame, on: boolean, connected: ReadonlySet<string>): FinishRow {
  const count = hero.sheet.backIssues.length
  const away = Boolean(hero.player && !connected.has(hero.player.clientId))
  const player = hero.player?.name || 'The player'
  const base = { heroId: hero.id, name: heroLabel(game.heroes, hero), who: `${player}${away ? ' · disconnected' : ''}`, count }
  if (!on) return { ...base, note: 'No back issue for this hero.' }
  if (count >= BACK_ISSUES_PER_COLLECTION) return { ...base, tag: 'Full', note: `Already at six. ${player} is asked to name a collection first.` }
  const tag = count === BACK_ISSUES_PER_COLLECTION - 1 ? ({ tag: 'Reaches six' } as const) : {}
  return { ...base, ...tag, note: away ? `${player} gets the prompt next time they join.` : `${player} confirms on their device.` }
}

/** A row for each player's hero, as the dialog's checkboxes stand. The GM's own heroes are NPCs, with no back issues. */
export function finishRows(game: Pick<Game, 'heroes'>, checked: ReadonlySet<string>, connected: ReadonlySet<string>): FinishRow[] {
  return game.heroes.filter((h) => h.player).map((h) => finishRow(game, h, checked.has(h.id), connected))
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
    const who = !hero?.player ? 'left the game' : `${hero.player.name || 'A player'}${connected.has(hero.player.clientId) ? '' : ' · disconnected'}`
    const text = !ack ? 'Not seen yet' : ack.status === 'later' ? 'Later' : `Added${ack.count !== undefined ? ` · ${ack.count} of ${BACK_ISSUES_PER_COLLECTION}` : ''}`
    return { heroId: o.heroId, name: o.name, who, text, added: ack?.status === 'added' }
  })
}

/** What a player's device asks about next: the oldest issue offered to this hero and not answered. */
export function issueToPrompt<I extends { id: string; state: 'now' | 'finished'; offeredTo?: readonly { sourceId: string }[] }>(issues: readonly I[], sourceId: string, hero: Pick<Hero, 'backIssues' | 'collections'> | undefined, prompts: Readonly<Record<string, string>>): I | undefined {
  return offeredIssues(issues, sourceId).find((i) => !prompts[i.id] && !(hero && holdsIssue(hero, i.id)))
}

/** Every finished issue offered to this hero. */
export function offeredIssues<I extends { state: 'now' | 'finished'; offeredTo?: readonly { sourceId: string }[] }>(issues: readonly I[], sourceId: string): I[] {
  return issues.filter((i) => i.state === 'finished' && i.offeredTo?.some((o) => o.sourceId === sourceId))
}

export interface IssueStartChoices extends StartChoices {
  /** Heroes recover: Health to max; twists, bonuses and penalties and minions cleared; forms back to their default. */
  recover: boolean
}

/**
 * Starts the next issue with a planned scene (scrpg-aid-designs/issues/spec.md, section 5): a new current
 * issue, the scene start steps, the hero resets, then bought bonuses become exclusive ones and any
 * points left are lost, whatever was chosen. The scene's "Bonuses and penalties" is the opposition's.
 */
export function startIssue(game: Game, sceneId: string, choices: IssueStartChoices, clock: Clock): Game {
  if (!betweenIssues(game) || game.solo) return game
  const number = nextIssueNumber(game)
  const issue = createIssue(clock.newId(), number)
  const opened = { ...game, issues: [...game.issues, issue], currentIssueId: issue.id }
  const entered = enterScene(opened, sceneId, choices, clock, false)
  if (entered === opened) return game
  const bought = game.heroes.flatMap((h) => (h.play.heroPointBuys?.length ? [`${heroLabel(game.heroes, h)} ${h.play.heroPointBuys.map((b) => `+${b.size}`).join(', ')}`] : []))
  // The GM's own heroes are NPCs: only players' heroes have points to lose.
  const left = (h: HeroInGame) => (h.player ? heroPointsLeft(game.heroPoints, h.play) : 0)
  const lost = game.heroes.flatMap((h) => (left(h) > 0 ? [`${heroLabel(game.heroes, h)} ${left(h)}`] : []))
  const heroes = entered.heroes.map((h) => ({ ...h, play: spendHeroPoints(choices.recover ? heroRecovers(h.play, clock) : h.play, left(h), clock) }))
  const points = [...(bought.length ? [`Hero point bonuses: ${bought.join('; ')}.`] : []), ...(lost.length ? [`Unspent hero points lost: ${lost.join(', ')}.`] : [])].join(' ')
  const scene = entered.scenes.find((s) => s.id === sceneId)!
  const name = scene.name.trim()
  return withLog({ ...entered, heroes, heroPoints: 0 }, [...(points ? [logLine(clock, points)] : []), logLine(clock, `Issue ${number} began with scene ${sceneNumber(entered, sceneId)}${name ? `: ${name}` : ''}.`)])
}

/** What "Before you start" says about the game (section 5). */
export interface IssueStartFacts {
  /** Heroes with hero points left, disconnected ones marked. */
  unspent: { name: string; points: number; away: boolean }[]
  /** "Afterimage +2, +3". */
  bought: string[]
  syncs: { heroId: string; name: string; player: string }[]
  /** Heroes offered the last issue who haven't recorded it. */
  notRecorded: string[]
}

export function issueStartFacts(game: Pick<Game, 'heroes' | 'heroPoints' | 'pendingSyncs' | 'issues'>, connected: ReadonlySet<string>): IssueStartFacts {
  const last = game.issues.at(-1)
  return {
    unspent: game.heroes.flatMap((h) => {
      const points = heroPointsLeft(game.heroPoints, h.play)
      return h.player && points > 0 ? [{ name: heroLabel(game.heroes, h), points, away: !connected.has(h.player.clientId) }] : []
    }),
    bought: game.heroes.flatMap((h) => (h.play.heroPointBuys?.length ? [`${heroLabel(game.heroes, h)} ${h.play.heroPointBuys.map((b) => `+${b.size}`).join(', ')}`] : [])),
    syncs: game.pendingSyncs.flatMap((r) => {
      const hero = game.heroes.find((h) => h.id === r.heroId)
      return hero ? [{ heroId: r.heroId, name: heroLabel(game.heroes, hero), player: hero.player?.name || 'The player' }] : []
    }),
    notRecorded: (last?.offeredTo ?? []).filter((o) => last?.acks?.[o.heroId]?.status !== 'added').map((o) => o.name),
  }
}

/** One heading of the Scenes tab, and the scenes under it. */
export interface IssueGroup {
  /** Unset for the issue that hasn't started. */
  issue?: Issue
  number: number
  state: 'finished' | 'now' | 'next'
  scenes: Scene[]
}

/** Scenes under their issues: finished ones, then the current or next one, which has everything else, planned scenes included. */
export function scenesByIssue(game: Pick<Game, 'scenes' | 'issues' | 'currentIssueId'>): IssueGroup[] {
  const finished = game.issues.filter((i) => i.state === 'finished')
  const finishedIds = new Set(finished.map((i) => i.id))
  const groups: IssueGroup[] = finished.map((issue) => ({ issue, number: issue.number, state: 'finished', scenes: game.scenes.filter((s) => s.issueId === issue.id) }))
  const rest = game.scenes.filter((s) => !s.issueId || !finishedIds.has(s.issueId))
  const current = currentIssue(game)
  return [...groups, current ? { issue: current, number: current.number, state: 'now', scenes: rest } : { number: nextIssueNumber(game), state: 'next', scenes: rest }]
}

/** Names or describes an issue. A finished issue always has a title; renaming doesn't change back issues already added. */
export function setIssueRecord(game: Game, issueId: string, record: { title?: string; summary?: string }): Game {
  return {
    ...game,
    issues: game.issues.map((i) => {
      if (i.id !== issueId) return i
      const { title: _t, summary: _s, ...rest } = i
      const title = record.title === undefined ? i.title : record.title.trim().slice(0, MAX_NAME) || (i.state === 'finished' ? i.title : undefined)
      const summary = record.summary === undefined ? i.summary : record.summary.trim().slice(0, MAX_TEXT)
      return { ...rest, ...(title ? { title } : {}), ...(summary ? { summary } : {}) }
    }),
  }
}

/** The table's toast for a new issue. */
export const issueBeganText = (number: number, scene: Pick<Scene, 'name'>) => `Issue ${number} began: ${sceneName(scene)}.`

