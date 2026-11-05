import { describe, expect, it } from 'vitest'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { emptyPlay, type Clock } from '../play/state'
import { applyHeroAction } from './actions'
import { changeHeroPoints, backIssueStatuses, defaultIssueTitle, finishIssue, finishRows, issueStartFacts, issueToPrompt, oppositionStaying, recordIssueAck, scenesByIssue, scenesPlayed, setIssueRecord, startIssue } from './issues'
import { betweenIssues, createGame, createScene, currentIssue, heroCopy, villainCopy, type Game } from './model'
import { project } from './project'
import { duplicateGame, startScene, defaultChoices, draftOfNew, savePlannedScene, startPlan } from './scenes'
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
  it('says what will happen for each player\'s hero', () => {
    const g = table()
    const rows = (connected: string[], checked = ['h1', 'h2']) => finishRows(g, new Set(checked), new Set(connected))
    expect(rows(['c1'])[0]).toMatchObject({ who: 'Alex', note: 'Alex confirms on their device.' })
    expect(rows([])[0]).toMatchObject({ who: 'Alex · disconnected', note: 'Alex gets the prompt next time they join.' })
    expect(rows(['c1'], ['h2'])[0]!.note).toBe('No back issue for this hero.')
  })

  it("leaves out the GM's own heroes", () => {
    expect(finishRows(table(), new Set(['h1', 'h2']), new Set()).map((r) => r.heroId)).toEqual(['h1'])
  })

  it('tags a hero reaching six and one already there', () => {
    const g = table()
    const issues = (n2: number) => Array.from({ length: n2 }, (_, i) => ({ id: `b${i}`, title: 'x', at: 'x' }))
    g.heroes[0]!.sheet.backIssues = issues(5)
    expect(finishRows(g, new Set(['h1']), new Set(['c1']))[0]).toMatchObject({ tag: 'Reaches six', count: 5 })
    g.heroes[0]!.sheet.backIssues = issues(6)
    expect(finishRows(g, new Set(['h1']), new Set(['c1']))[0]).toMatchObject({ tag: 'Full', note: 'Already at six. Alex is asked to name a collection first.' })
  })

  it('names what stays on the table', () => {
    const g = table()
    expect(oppositionStaying({ villains: [], groups: [], challenges: [] })).toBeUndefined()
    expect(oppositionStaying(g)).toBe(g.villains[0]!.sheet.details.name || g.villains[0]!.sheet.details.alias || 'Unnamed villain')
    expect(oppositionStaying({ villains: g.villains, groups: [{}, {}] as never, challenges: [{}] as never })).toMatch(/, 2 groups and 1 challenge$/)
  })
})

describe('who has recorded the issue', () => {
  it('reads each offered hero from the answers, and never offers the GM\'s own', () => {
    const g = finishIssue(table(), { ...choices, heroIds: ['h1', 'h2'] }, clock)
    const id = g.issues[0]!.id
    expect(g.issues[0]!.offeredTo!.map((o) => o.heroId)).toEqual(['h1'])
    expect(backIssueStatuses(g, new Set())).toMatchObject([{ name: 'Afterimage', who: 'Alex · disconnected', text: 'Not seen yet', added: false }])
    expect(recordIssueAck(g, id, 'h2', { status: 'added', count: 1 }, clock)).toBe(g)
    const later = recordIssueAck(g, id, 'h1', { status: 'later' }, clock)
    expect(backIssueStatuses(later, new Set(['c1']))[0]).toMatchObject({ who: 'Alex', text: 'Later', added: false })
    const added = recordIssueAck(later, id, 'h1', { status: 'added', count: 3 }, clock)
    expect(backIssueStatuses(added, new Set())[0]).toMatchObject({ text: 'Added · 3 of 6', added: true })
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
  })
})

describe('the next issue', () => {
  /** A finished table with hero points, and a planned scene. */
  function between(): Game {
    const start = table()
    start.scenes.push(createScene({ id: 's2', name: 'Tunnels' }))
    start.heroPoints = 5
    return finishIssue(start, choices, clock)
  }
  const go = (g: Game, recover = true) => startIssue(g, 's2', { ...defaultChoices(startPlan(g, 's2')), recover }, clock)
  const act = (g: Game, action: Parameters<typeof applyHeroAction>[2]) => applyHeroAction(g, 'h1', action, { basedOn: 0, versions: {} }, clock)
  const bought = (g: Game, size: number) => {
    const r = act(g, { kind: 'buyHeroPointBonus', size })
    if (!r.ok) throw new Error(r.reason)
    return r.game
  }

  it('players can buy and return bonuses only between issues, and it is logged', () => {
    const g = bought(between(), 3)
    expect(g.heroes[0]!.play).toMatchObject({ heroPointBuys: [{ size: 3 }] })
    expect(g.heroPoints).toBe(5)
    expect(g.feed.at(-1)).toMatchObject({ by: 'Afterimage', text: 'Afterimage bought a +3 bonus for issue 2.' })
    expect(act(g, { kind: 'buyHeroPointBonus', size: 3 })).toEqual({ ok: false, reason: "you don't have that many hero points left" })
    const back = act(g, { kind: 'returnHeroPointBonus', buyId: g.heroes[0]!.play.heroPointBuys![0]!.id })
    expect(back).toMatchObject({ ok: true })
    expect(back.ok && back.game.heroes[0]!.play.heroPointBuys).toEqual([])
    expect(back.ok && back.game.feed.at(-1)?.text).toBe('Afterimage returned a +3 bonus for issue 2.')
    expect(act(g, { kind: 'returnHeroPointBonus', buyId: 'nope' })).toMatchObject({ ok: false })
    expect(act(table(), { kind: 'buyHeroPointBonus', size: 1 })).toEqual({ ok: false, reason: 'hero points are spent between issues' })
  })

  it("each player's hero spends the count separately", () => {
    const g = between()
    g.heroes.push(heroCopy({ ...completeHero(), id: 'jo-src' }, 'h3', { clientId: 'c3', name: 'Jo' }))
    const r = applyHeroAction(bought(g, 4), 'h3', { kind: 'buyHeroPointBonus', size: 5 }, { basedOn: 0, versions: {} }, clock)
    expect(r).toMatchObject({ ok: true })
    expect(r.ok && r.game.heroPoints).toBe(5)
    expect(r.ok && r.game.heroes.map((h) => h.play.heroPointBuys?.map((b) => b.size))).toEqual([[4], undefined, [5]])
  })

  it("the GM's own heroes are NPCs: nothing to spend, lose or be listed for", () => {
    const g = between()
    expect(applyHeroAction(g, 'h2', { kind: 'buyHeroPointBonus', size: 1 }, { basedOn: 0, versions: {} }, clock)).toEqual({ ok: false, reason: "only players' heroes have hero points" })
    expect(issueStartFacts(g, new Set()).unspent.map((u) => u.name)).toEqual(['Afterimage'])
    const started = go(g)
    expect(started.feed.at(-2)?.text).toBe('Unspent hero points lost: Afterimage 5.')
    expect(started.heroes[1]!.play.history.map((h) => h.text).join()).not.toContain('hero point')
  })

  it('the GM changes the count, logged for everyone, between 0 and 5', () => {
    let g = changeHeroPoints(table(), 1, clock)
    expect(g.heroPoints).toBe(1)
    expect(g.feed.at(-1)).toMatchObject({ text: 'The heroes gained a hero point. They have 1.' })
    expect(g.feed.at(-1)?.gmOnly).toBeUndefined()
    g = changeHeroPoints(g, -1, clock)
    expect(g.feed.at(-1)?.text).toBe('The heroes lost a hero point. They have 0.')
    expect(changeHeroPoints(g, -1, clock)).toBe(g)
    const full = { ...g, heroPoints: 5 }
    expect(changeHeroPoints(full, 1, clock)).toBe(full)
    expect(project(changeHeroPoints(g, 1, clock), 'player', 'h1').heroPoints).toBe(1)
  })

  it("lowered below what's bought, a hero's newest bonuses go back until it fits", () => {
    const g = bought(bought(between(), 2), 3)
    const lower = (x: Game, times: number): Game => (times ? lower(changeHeroPoints(x, -1, clock), times - 1) : x)
    const four = lower(g, 1)
    expect(four.heroPoints).toBe(4)
    expect(four.heroes[0]!.play.heroPointBuys).toMatchObject([{ size: 2 }])
    expect(four.feed.at(-2)?.text).toBe('The heroes lost a hero point. They have 4.')
    expect(four.feed.at(-1)?.text).toBe('Bonuses returned for the lower count: Afterimage +3.')
    expect(four.heroes[0]!.play.history.at(-1)?.text).toBe('Returned a +3 bonus for issue 2.')
    const one = lower(four, 3)
    expect(one.heroes[0]!.play.heroPointBuys).toEqual([])
    // Raising it doesn't bring them back.
    expect(changeHeroPoints(one, 1, clock).heroes[0]!.play.heroPointBuys).toEqual([])
  })

  it('a duplicate starts with no hero points', () => {
    expect(duplicateGame(between()).heroPoints).toBe(0)
  })

  it('a +5 is allowed (ruling 70)', () => {
    expect(bought(between(), 5).heroes[0]!.play.heroPointBuys).toMatchObject([{ size: 5 }])
  })

  it('opens a new issue with the planned scene, keeping the finished scene as it was', () => {
    const before = between()
    const g = go(before)
    expect(g.issues).toHaveLength(2)
    expect(currentIssue(g)).toMatchObject({ number: 2, state: 'now' })
    expect(g.currentSceneId).toBe('s2')
    expect(g.scenes[1]).toMatchObject({ state: 'now', issueId: g.currentIssueId, position: 0 })
    expect(g.scenes[0]).toEqual(before.scenes[0])
    expect(g.feed.at(-1)?.text).toBe('Issue 2 began with scene 2: Tunnels.')
    expect(parseSavedGame(gameToSaved(g))).toMatchObject({ ok: true })
  })

  it('turns bought bonuses into exclusive ones, and unspent points are lost', () => {
    const g = go(bought(between(), 2))
    expect(g.heroes[0]!.play.mods).toMatchObject([{ label: 'Hero point', value: 2, exclusive: true, source: 'heroPoint' }])
    expect(g.heroPoints).toBe(0)
    expect(g.heroes[0]!.play.heroPointBuys).toBeUndefined()
    expect(g.feed.at(-2)?.text).toBe('Hero point bonuses: Afterimage +2. Unspent hero points lost: Afterimage 3.')
  })

  it('Heroes recover resets them, but hero points go either way', () => {
    const hurt = between()
    hurt.heroes[0]!.play = { ...hurt.heroes[0]!.play, health: 1, twists: [{ id: 't', kind: 'major', text: 'x' }], form: 'mode:1', reactionUsed: true, minions: [] }
    const on = go(hurt).heroes[0]!.play
    expect(on).toMatchObject({ twists: [], reactionUsed: false })
    expect(on.health).toBeUndefined()
    expect(on.form).toBeUndefined()
    const off = go(hurt, false).heroes[0]!.play
    expect(off).toMatchObject({ health: 1, twists: [{ id: 't' }] })
  })

  it("hero point bonuses survive a new scene in the issue, and go when it finishes", () => {
    const g = go(bought(between(), 2))
    const planned = savePlannedScene(g, 's3', draftOfNew(g), clock).game
    const next = startScene(planned, 's3', defaultChoices(startPlan(planned, 's3')), clock)
    expect(next.heroes[0]!.play.mods).toMatchObject([{ source: 'heroPoint' }])
    const other = { ...g, heroes: g.heroes.map((h, i) => (i === 0 ? { ...h, play: { ...h.play, mods: [...h.play.mods, { id: 'x', label: 'a', value: 1 }] } } : h)) }
    const planned2 = savePlannedScene(other, 's3', draftOfNew(other), clock).game
    expect(startScene(planned2, 's3', defaultChoices(startPlan(planned2, 's3')), clock).heroes[0]!.play.mods).toHaveLength(1)
    expect(finishIssue(next, choices, clock).heroes[0]!.play.mods).toEqual([])
  })

  it('needs a planned scene, between issues', () => {
    const g = between()
    const none = { ...g, scenes: g.scenes.filter((s) => s.id !== 's2') }
    expect(go(none)).toBe(none)
    const running = table()
    expect(startIssue(running, 's2', { ...defaultChoices({ leaving: [], coming: [] }), recover: true }, clock)).toBe(running)
  })

  it('the second issue finishes as issue 2, with a title of its own', () => {
    const g = finishIssue(go(between()), { title: 'Issue 2', summary: '', heroIds: [] }, clock)
    expect(g.issues[1]).toMatchObject({ number: 2, title: 'Issue 2', state: 'finished' })
    expect(defaultIssueTitle(g, { number: 3 })).toBe('Issue 3')
  })

  it('says what stands before starting', () => {
    const g = bought(between(), 2)
    const facts = issueStartFacts({ ...g, pendingSyncs: [{ heroId: 'h1', sheet: g.heroes[0]!.sheet, at: 'x' }] }, new Set())
    expect(facts).toMatchObject({ unspent: [{ name: 'Afterimage', points: 3, away: true }], bought: ['Afterimage +2'], syncs: [{ heroId: 'h1', player: 'Alex' }], notRecorded: ['Afterimage'] })
    expect(issueStartFacts(recordIssueAck(g, g.issues[0]!.id, 'h1', { status: 'added', count: 1 }, clock), new Set(['c1']))).toMatchObject({ notRecorded: [], unspent: [{ away: false }] })
  })

  it('groups scenes by issue, planned ones under the next', () => {
    const g = between()
    expect(scenesByIssue(table())).toMatchObject([{ number: 1, state: 'now' }])
    const groups = scenesByIssue(g)
    expect(groups.map((x) => [x.number, x.state, x.scenes.map((s) => s.name)])).toEqual([
      [1, 'finished', ['The Foundry']],
      [2, 'next', ['Tunnels']],
    ])
    expect(scenesByIssue(go(g)).map((x) => [x.number, x.state])).toEqual([
      [1, 'finished'],
      [2, 'now'],
    ])
  })

  it('renames and describes an issue; a finished one keeps a title', () => {
    const g = between()
    const id = g.issues[0]!.id
    expect(setIssueRecord(g, id, { title: 'New' }).issues[0]!.title).toBe('New')
    expect(setIssueRecord(g, id, { title: ' ' }).issues[0]!.title).toBe('The Gravelord Saga')
    expect(setIssueRecord(g, id, { summary: '' }).issues[0]).not.toHaveProperty('summary')
    const running = table()
    expect(setIssueRecord(setIssueRecord(running, running.issues[0]!.id, { title: 'Early' }), running.issues[0]!.id, { title: '' }).issues[0]).not.toHaveProperty('title')
  })
})

