import { describe, expect, it } from 'vitest'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { emptyPlay, type Clock } from '../play/state'
import { applyHeroAction } from './actions'
import { backIssueStatuses, defaultIssueTitle, finishIssue, finishRows, issueToPrompt, oppositionStaying, recordIssueAck, scenesPlayed } from './issues'
import { betweenIssues, createGame, createScene, currentIssue, heroCopy, villainCopy, type Game } from './model'
import { project } from './project'
import { duplicateGame, startScene, defaultChoices, startPlan } from './scenes'
import { gameToSaved, parseSavedGame } from './serialize'
import { handOff, startRound } from './table'

let n = 0
const clock: Clock = { now: new Date('2026-11-05T12:00:00Z'), newId: () => `n${++n}` }

function table(): Game {
  const g = createGame({ id: 'g', name: 'Thursday game' })
  const hero = completeHero()
  hero.details.name = 'Afterimage'
  const own = completeHero()
  own.id = 'h-own'
  own.details.name = 'Redline'
  g.heroes.push(
    { ...heroCopy(hero, 'h1', { clientId: 'c1', name: 'Alex' }), play: { ...emptyPlay(), mods: [{ id: 'm1', label: 'high ground', value: 2 }, { id: 'm2', label: 'tied up', value: -1 }] } },
    heroCopy(own, 'h2'),
  )
  g.villains.push(villainCopy(adaptiveBruiser(), 'v1', false))
  g.scenes[0]!.name = 'The Foundry'
  g.round = 4
  g.turn = { order: [{ kind: 'hero', id: 'h1' }], acted: [] }
  return g
}

const choices = { title: 'The Gravelord Saga', summary: ' He got away. ', heroIds: ['h1'] }

describe('the default title', () => {
  it("is the game's name for a first issue, and Issue N otherwise", () => {
    const g = table()
    expect(defaultIssueTitle(g, { number: 1 })).toBe('Thursday game')
    expect(defaultIssueTitle(g, { number: 2 })).toBe('Issue 2')
    expect(defaultIssueTitle({ ...g, name: ' ' }, { number: 1 })).toBe('Issue 1')
    expect(defaultIssueTitle({ ...g, issues: [{ id: 'i', number: 1, state: 'finished', title: 'x' }] }, { number: 1 })).toBe('Issue 1')
  })
})

describe('finishing an issue', () => {
  it('ends the scene and the issue, and pauses the table', () => {
    const before = table()
    const g = finishIssue(before, choices, clock)
    expect(betweenIssues(g)).toBe(true)
    expect(g.scenes[0]).toMatchObject({ state: 'done', summary: 'Ended after round 4.' })
    expect(g.currentSceneId).toBe(before.currentSceneId)
    expect(g.issues[0]).toMatchObject({ number: 1, title: 'The Gravelord Saga', summary: 'He got away.', state: 'finished', finishedAt: '2026-11-05T12:00:00.000Z' })
    expect(g.feed.at(-1)?.text).toBe('Issue 1 finished: The Gravelord Saga.')
    // The opposition stays where it is.
    expect(g.villains).toHaveLength(1)
  })

  it('offers a back issue to checked heroes only', () => {
    const g = finishIssue(table(), choices, clock)
    expect(g.issues[0]!.offeredTo).toEqual([{ heroId: 'h1', sourceId: expect.any(String), name: 'Afterimage' }])
  })

  it("removes every hero's bonuses and penalties, and logs them (ruling 69)", () => {
    const start = table()
    start.heroes[1]!.play = { ...emptyPlay(), minions: [{ id: 'mn', name: 'Drone', die: 'd6', action: 'any', mods: [{ id: 'm3', label: '', value: 1 }] }] }
    const g = finishIssue(start, choices, clock)
    expect(g.heroes[0]!.play.mods).toEqual([])
    expect(g.heroes[1]!.play.minions![0]!.mods).toEqual([])
    expect(g.feed.at(-2)?.text).toBe('Bonuses and penalties removed: Afterimage +2, −1; Redline +1.')
    expect(g.heroes[0]!.play.history.at(-1)?.text).toMatch(/Bonuses and penalties removed/)
  })

  it("leaves the opposition's bonuses and penalties for the start dialog", () => {
    const start = table()
    start.villains[0]!.play.mods = [{ id: 'm9', label: '', value: 2 }]
    expect(finishIssue(start, choices, clock).villains[0]!.play.mods).toHaveLength(1)
  })

  it('settles hits waiting on a defense, since nobody can answer them while paused', () => {
    const start = table()
    start.heroes[0]!.play.defenses = [{ id: 'd1', value: 3, from: 'Afterimage' }, { id: 'd2', value: 5, from: 'Afterimage' }]
    start.pendingHits = [{ id: 'hit', heroId: 'h1', by: 'Gravelord', amount: 4, at: 'x' }]
    const g = finishIssue(start, choices, clock)
    expect(g.pendingHits).toEqual([])
    expect(g.heroes[0]!.play.defenses).toHaveLength(1)
  })

  it('needs a title, a current issue, and not a solo game', () => {
    const start = table()
    expect(finishIssue(start, { ...choices, title: '  ' }, clock)).toBe(start)
    const finished = finishIssue(start, choices, clock)
    expect(finishIssue(finished, choices, clock)).toBe(finished)
    const solo = { ...start, solo: { kind: 'hero' as const, sourceId: 'x' } }
    expect(finishIssue(solo, choices, clock)).toBe(solo)
  })

  it('leaves planned scenes planned, and lists only what this issue played', () => {
    const start = table()
    start.scenes.push(createScene({ id: 's2', name: 'Tunnels' }))
    expect(scenesPlayed(start).map((s) => s.name)).toEqual(['The Foundry'])
    expect(finishIssue(start, choices, clock).scenes[1]!.state).toBe('planned')
  })

  it('still saves and loads', () => {
    const g = finishIssue(table(), choices, clock)
    expect(parseSavedGame(gameToSaved(g))).toMatchObject({ ok: true })
  })

  it('reads a current scene or issue between issues as unreadable', () => {
    const g = finishIssue(table(), choices, clock)
    expect(parseSavedGame(gameToSaved({ ...g, currentIssueId: 'nope' })).ok).toBe(false)
    expect(parseSavedGame(gameToSaved({ ...g, scenes: g.scenes.map((s) => ({ ...s, state: 'now' as const })) })).ok).toBe(false)
  })
})

describe('the table between issues', () => {
  const paused = () => finishIssue(table(), choices, clock)

  it("refuses players' actions", () => {
    const result = applyHeroAction(paused(), 'h1', { kind: 'health', by: -1 }, { basedOn: 0, versions: {} }, clock)
    expect(result).toEqual({ ok: false, reason: 'the issue is over. Play is paused until the GM starts the next issue' })
  })

  it("won't run the turn order or start a scene", () => {
    const g = paused()
    expect(handOff(g, { kind: 'hero', id: 'h1' }, clock)).toBe(g)
    expect(startRound(g, { kind: 'hero', id: 'h1' }, clock)).toBe(g)
    const planned = { ...g, scenes: [...g.scenes, createScene({ id: 's2' })] }
    expect(startScene(planned, 's2', defaultChoices(startPlan(planned, 's2')), clock)).toBe(planned)
  })

  it('projects issues without acks, for every audience', () => {
    const finished = paused()
    const g = recordIssueAck(finished, finished.issues[0]!.id, 'h1', { status: 'later' }, clock)
    expect(g.issues[0]!.acks?.h1?.status).toBe('later')
    for (const audience of ['gm', 'player', 'observer'] as const) {
      const view = project(g, audience, 'h1')
      expect(view.issues[0]).toMatchObject({ number: 1, title: 'The Gravelord Saga', state: 'finished', sceneCount: 1, offeredTo: [{ heroId: 'h1' }] })
      expect(view.issues[0]).not.toHaveProperty('acks')
      expect(view.currentIssueId).toBeUndefined()
    }
  })

  it('takes acks only for a finished issue that offered the hero one', () => {
    const g = paused()
    expect(recordIssueAck(g, 'nope', 'h1', { status: 'later' }, clock)).toBe(g)
    expect(recordIssueAck(g, g.issues[0]!.id, 'h2', { status: 'later' }, clock)).toBe(g)
    const running = table()
    expect(recordIssueAck(running, running.issues[0]!.id, 'h1', { status: 'later' }, clock)).toBe(running)
  })
})

describe('issues and scenes', () => {
  it('a new game starts in issue 1, its first scene in it', () => {
    const g = createGame()
    expect(currentIssue(g)).toMatchObject({ number: 1, state: 'now' })
    expect(g.scenes[0]!.issueId).toBe(g.currentIssueId)
  })

  it('a scene takes the current issue when it starts', () => {
    const g = table()
    g.scenes.push(createScene({ id: 's2' }))
    expect(g.scenes[1]!.issueId).toBeUndefined()
    const next = startScene(g, 's2', defaultChoices(startPlan(g, 's2')), clock)
    expect(next.scenes[1]!.issueId).toBe(g.currentIssueId)
  })

  it('duplicating a finished game copies its scenes into a fresh issue 1', () => {
    const g = finishIssue(table(), choices, clock)
    const copy = duplicateGame(g, { id: 'copy' })
    expect(copy.issues).toHaveLength(1)
    expect(currentIssue(copy)).toMatchObject({ number: 1, state: 'now' })
    expect(copy.scenes[0]).toMatchObject({ state: 'now', issueId: copy.currentIssueId })
    expect(parseSavedGame(gameToSaved(copy))).toMatchObject({ ok: true })
  })
})

describe('the Finish dialog rows', () => {
  const own = () => ({ gone: false })

  it("says what will happen for each hero", () => {
    const g = table()
    const rows = (connected: string[], checked = ['h1', 'h2']) => finishRows(g, new Set(checked), new Set(connected), own)
    expect(rows(['c1'])[0]).toMatchObject({ who: 'Alex', note: 'Alex confirms on their device.' })
    expect(rows([])[0]).toMatchObject({ who: 'Alex · disconnected', note: 'Alex gets the prompt next time they join.' })
    expect(rows(['c1'])[1]).toMatchObject({ who: 'your hero', note: 'Added to your library hero when you finish.' })
    expect(rows(['c1'], ['h2'])[0]!.note).toBe('No back issue for this hero.')
  })

  it('tags a hero reaching six and one already there', () => {
    const g = table()
    const issues = (n2: number) => Array.from({ length: n2 }, (_, i) => ({ id: `b${i}`, title: 'x', at: 'x' }))
    g.heroes[0]!.sheet.backIssues = issues(5)
    g.heroes[1]!.sheet.backIssues = issues(6)
    const rows = finishRows(g, new Set(['h1', 'h2']), new Set(['c1']), own)
    expect(rows[0]).toMatchObject({ tag: 'Reaches six', count: 5 })
    expect(rows[1]).toMatchObject({ tag: 'Full', note: 'Already at six. Name a collection on the Advancement page first.' })
    g.heroes[0]!.sheet.backIssues = issues(6)
    expect(finishRows(g, new Set(['h1']), new Set(['c1']), own)[0]!.note).toBe('Already at six. Alex is asked to name a collection first.')
  })

  it("disables the GM's hero whose library document is gone, and counts the library's back issues", () => {
    const g = table()
    expect(finishRows(g, new Set(['h2']), new Set(), () => ({ gone: true }))[1]).toMatchObject({ disabled: true, note: 'Not in your library any more.' })
    expect(finishRows(g, new Set(['h2']), new Set(), () => ({ gone: false, backIssues: 3 }))[1]!.count).toBe(3)
  })

  it('names what stays on the table', () => {
    const g = table()
    expect(oppositionStaying({ villains: [], groups: [], challenges: [] })).toBeUndefined()
    expect(oppositionStaying(g)).toBe(g.villains[0]!.sheet.details.name || g.villains[0]!.sheet.details.alias || 'Unnamed villain')
    expect(oppositionStaying({ villains: g.villains, groups: [{}, {}] as never, challenges: [{}] as never })).toMatch(/, 2 groups and 1 challenge$/)
  })
})

describe('who has recorded the issue', () => {
  it('reads each offered hero from the answers', () => {
    const g = finishIssue(table(), { ...choices, heroIds: ['h1', 'h2'] }, clock)
    const id = g.issues[0]!.id
    expect(backIssueStatuses(g, new Set())).toMatchObject([{ name: 'Afterimage', who: 'Alex · disconnected', text: 'Not seen yet', added: false }, { name: 'Redline', who: 'your hero', text: 'Not seen yet' }])
    const later = recordIssueAck(g, id, 'h1', { status: 'later' }, clock)
    expect(backIssueStatuses(later, new Set(['c1']))[0]).toMatchObject({ who: 'Alex', text: 'Later', added: false })
    const added = recordIssueAck(later, id, 'h2', { status: 'added', count: 3 }, clock)
    expect(backIssueStatuses(added, new Set())[1]).toMatchObject({ text: 'Added · 3 of 6', added: true })
    expect(backIssueStatuses(table(), new Set())).toEqual([])
  })
})

describe('what a player is asked about', () => {
  const issues = [{ id: 'i1', state: 'finished' as const, offeredTo: [{ sourceId: 's' }] }, { id: 'i2', state: 'finished' as const, offeredTo: [{ sourceId: 's' }] }]
  const hero = { backIssues: [], collections: [] }

  it('is the oldest offered issue with no answer', () => {
    expect(issueToPrompt(issues, 's', hero, {})?.id).toBe('i1')
    expect(issueToPrompt(issues, 's', hero, { i1: 'later' })?.id).toBe('i2')
    expect(issueToPrompt(issues, 's', hero, { i1: 'later', i2: 'dismissed' })).toBeUndefined()
    expect(issueToPrompt(issues, 'other', hero, {})).toBeUndefined()
    expect(issueToPrompt(issues, 's', undefined, {})?.id).toBe('i1')
  })

  it("skips one already on the hero, or dismissed there", () => {
    expect(issueToPrompt(issues, 's', { ...hero, backIssues: [{ id: 'b', title: 'x', issueId: 'i1', at: 'x' }] }, {})?.id).toBe('i2')
    expect(issueToPrompt(issues, 's', { ...hero, dismissedIssues: ['i1'] }, {})?.id).toBe('i2')
  })
})

