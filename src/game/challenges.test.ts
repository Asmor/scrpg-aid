import { describe, expect, it } from 'vitest'
import type { Clock } from '../play/state'
import { readClientMessage, tableViewProblem } from '../session/protocol'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import type { Villain } from '../villain/model'
import { applyHeroAction } from './actions'
import { challengeDone, createGame, type Game } from './model'
import { project } from './project'
import { parseSavedGame, gameToSaved } from './serialize'
import { addChallenge, addHero, addVillain, answerRequest, removeFromTable, renameChallengeSteps, resetChallenge, setChallengeStep, setHidden, stepsText, titanStepLabels, updateSheet } from './table'
import { defaultChoices, duplicateGame, draftAddVillain, draftOfNew, moveToTable, savePlannedScene, setAside, startPlan, startScene, refKey } from './scenes'
import { villainStatus } from './villain-status'

const c: Clock = (() => {
  let n = 0
  return { now: new Date('2026-11-04T12:00:00Z'), newId: () => `id${++n}` }
})()

const titan = (id = 'v'): Villain => ({ ...adaptiveBruiser(), id, details: { ...adaptiveBruiser().details, name: 'Gravelord' }, archetype: { id: 'titan', abilities: [] } })

const furnace = { name: 'Shut down the furnace', steps: 3, hidden: false, labels: ['Seal the gas line', 'Vent the pressure', 'Kill the main burner'], description: 'It will blow.', whenDone: 'The furnace sputters out.' }

function withHeroes(): Game {
  let g = createGame({ id: 'g' })
  g = addHero(g, { ...completeHero(), id: 'a', details: { ...completeHero().details, name: 'Maya Reyes' } }, c, { clientId: 'c1', name: 'Alex' })
  g = addHero(g, { ...completeHero(), id: 'b', details: { ...completeHero().details, name: 'Paradigm' } }, c, { clientId: 'c2', name: 'Bo' })
  return addChallenge(g, furnace, c)
}
const ctx = { basedOn: 0, versions: {} }
const overcome = (g: Game, heroIndex: number, total = 9, trait: string | undefined = 'Agility') => {
  const r = applyHeroAction(g, g.heroes[heroIndex]!.id, { kind: 'overcomeChallenge', challengeId: g.challenges[0]!.id, total, ...(trait ? { trait } : {}) }, ctx, c)
  if (!r.ok) throw new Error(r.reason)
  return r.game
}
const texts = (g: Game) => g.feed.map((e) => e.text)

describe('labeled steps', () => {
  it('quick add reads Step 1 until renamed; a template keeps its labels, with blanks filled', () => {
    let g = addChallenge(createGame({ id: 'g' }), { name: 'Quick', steps: 2, hidden: false }, c)
    expect(g.challenges[0]!.steps).toEqual([{ label: 'Step 1', done: false }, { label: 'Step 2', done: false }])
    g = renameChallengeSteps(g, g.challenges[0]!.id, ['First', ' '])
    expect(g.challenges[0]!.steps.map((s) => s.label)).toEqual(['First', 'Step 2'])
    const t = addChallenge(createGame({ id: 'g' }), { name: 'T', steps: 2, hidden: false, labels: ['One', ''] }, c)
    expect(t.challenges[0]!.steps.map((s) => s.label)).toEqual(['One', 'Step 2'])
  })

  it('progress reads "1 of 3", then "Done"', () => {
    let g = withHeroes()
    const id = g.challenges[0]!.id
    expect(stepsText(g.challenges[0]!)).toBe('0 of 3')
    g = setChallengeStep(g, id, 0, true, c)
    expect(stepsText(g.challenges[0]!)).toBe('1 of 3')
    g = setChallengeStep(setChallengeStep(g, id, 1, true, c), id, 2, true, c)
    expect(stepsText(g.challenges[0]!)).toBe('Done')
  })

  it('logs each check and uncheck, and the "when it\'s done" text once done', () => {
    let g = withHeroes()
    const id = g.challenges[0]!.id
    g = setChallengeStep(g, id, 1, true, c)
    expect(texts(g).at(-1)).toBe('The GM checked off "Vent the pressure".')
    g = setChallengeStep(g, id, 1, false, c)
    expect(texts(g).at(-1)).toBe('The GM unchecked "Vent the pressure".')
    for (const i of [0, 1, 2]) g = setChallengeStep(g, id, i, true, c)
    expect(texts(g).at(-1)).toBe('Shut down the furnace is done. The furnace sputters out.')
    expect(challengeDone(g.challenges[0]!)).toBe(true)
  })

  it('a hidden challenge logs for the GM only', () => {
    const g = addChallenge(createGame({ id: 'g' }), { name: 'Secret', steps: 1, hidden: true }, c)
    const next = setChallengeStep(g, g.challenges[0]!.id, 0, true, c)
    expect(next.feed.slice(-2).every((e) => e.gmOnly)).toBe(true)
  })

  it('ignores a step out of range or already so', () => {
    const g = withHeroes()
    expect(setChallengeStep(g, g.challenges[0]!.id, 9, true, c)).toBe(g)
    expect(setChallengeStep(g, g.challenges[0]!.id, 0, false, c)).toBe(g)
    expect(setChallengeStep(g, 'nope', 0, true, c)).toBe(g)
  })

  it('reset undoes every step and keeps what waits', () => {
    let g = overcome(withHeroes(), 0)
    const id = g.challenges[0]!.id
    expect(resetChallenge(g, id, c)).toBe(g)
    g = setChallengeStep(g, id, 0, true, c)
    g = resetChallenge(g, id, c)
    expect(g.challenges[0]!.steps.every((s) => !s.done)).toBe(true)
    expect(g.challenges[0]!.requests).toHaveLength(1)
    expect(texts(g).at(-1)).toBe('The GM reset Shut down the furnace.')
  })
})

describe("players' Overcomes", () => {
  it('a request waits on the card, with a public line', () => {
    const g = overcome(withHeroes(), 0)
    expect(g.challenges[0]!.requests).toMatchObject([{ heroId: g.heroes[0]!.id, total: 9, trait: 'Agility' }])
    expect(texts(g).at(-1)).toBe('Maya Reyes rolled 9 to Overcome on Shut down the furnace. Waiting for the GM.')
    expect(g.feed.at(-1)?.gmOnly).toBeUndefined()
  })

  it('refuses a hidden, finished or missing challenge', () => {
    const start = withHeroes()
    const id = start.challenges[0]!.id
    const act = (g: Game) => applyHeroAction(g, g.heroes[0]!.id, { kind: 'overcomeChallenge', challengeId: id, total: 5 }, ctx, c)
    expect(act(setHidden(start, { kind: 'challenge', id }, true, c)).ok).toBe(false)
    let done = start
    for (const i of [0, 1, 2]) done = setChallengeStep(done, id, i, true, c)
    expect(act(done).ok).toBe(false)
    expect(act({ ...start, challenges: [] }).ok).toBe(false)
  })

  it('Check off takes the next unchecked step, and clears that request', () => {
    let g = overcome(overcome(withHeroes(), 0), 1, 7)
    const ch = () => g.challenges[0]!
    g = setChallengeStep(g, ch().id, 0, true, c)
    g = answerRequest(g, ch().id, ch().requests[0]!.id, true, c)
    expect(ch().steps.map((s) => s.done)).toEqual([true, true, false])
    expect(ch().requests.map((r) => r.total)).toEqual([7])
    expect(texts(g).at(-1)).toBe(`Maya Reyes's Overcome checked off "Vent the pressure".`)
  })

  it('Not this time clears it and says so', () => {
    let g = overcome(withHeroes(), 0)
    g = answerRequest(g, g.challenges[0]!.id, g.challenges[0]!.requests[0]!.id, false, c)
    expect(g.challenges[0]!.requests).toEqual([])
    expect(g.challenges[0]!.steps.some((s) => s.done)).toBe(false)
    expect(texts(g).at(-1)).toBe("Maya Reyes's Overcome didn't complete a step.")
  })

  it('finishing a challenge closes what still waits, told to that player alone', () => {
    let g = overcome(overcome(withHeroes(), 0), 1, 7)
    const id = g.challenges[0]!.id
    g = setChallengeStep(setChallengeStep(g, id, 0, true, c), id, 1, true, c)
    g = answerRequest(g, id, g.challenges[0]!.requests[0]!.id, true, c)
    expect(g.challenges[0]!.requests).toEqual([])
    const line = g.feed.at(-1)!
    expect(line).toMatchObject({ text: 'The GM closed this challenge before answering.', by: 'Shut down the furnace', forHero: g.heroes[1]!.id })
    expect(g.feed.filter((e) => e.forHero)).toHaveLength(1)
  })

  it('removing or hiding a challenge closes what waits', () => {
    const g = overcome(withHeroes(), 0)
    const ref = { kind: 'challenge' as const, id: g.challenges[0]!.id }
    expect(removeFromTable(g, ref, c).feed.some((e) => e.forHero === g.heroes[0]!.id)).toBe(true)
    const hidden = setHidden(g, ref, true, c)
    expect(hidden.challenges[0]!.requests).toEqual([])
    expect(hidden.feed.some((e) => e.forHero === g.heroes[0]!.id)).toBe(true)
    const aside = setAside(g, ref, 1, c)
    expect(aside.offTable.challenges[0]!.requests).toEqual([])
    expect(aside.feed.some((e) => e.forHero === g.heroes[0]!.id)).toBe(true)
  })

  it("a hero leaving takes their request", () => {
    const g = overcome(withHeroes(), 0)
    const next = removeFromTable(g, { kind: 'hero', id: g.heroes[0]!.id }, c)
    expect(next.challenges[0]!.requests).toEqual([])
  })
})

describe('what each audience receives', () => {
  it("sends a player only their own requests and lines; observers none; the done text waits", () => {
    let g = overcome(overcome(withHeroes(), 0), 1, 7)
    const [a, b] = g.heroes
    const forA = project(g, 'player', a!.id).challenges[0]!
    expect(forA.requests.map((r) => r.heroId)).toEqual([a!.id])
    expect(forA.whenDone).toBeUndefined()
    expect(project(g, 'observer').challenges[0]!.requests).toEqual([])
    expect(project(g, 'gm').challenges[0]!.requests).toHaveLength(2)
    expect(project(g, 'gm').challenges[0]!.whenDone).toBe('The furnace sputters out.')

    const id = g.challenges[0]!.id
    g = setChallengeStep(g, id, 0, true, c)
    g = setChallengeStep(g, id, 1, true, c)
    g = setChallengeStep(g, id, 2, true, c)
    expect(project(g, 'player', a!.id).challenges[0]!.whenDone).toBe('The furnace sputters out.')
    const closed = (heroId?: string, audience: 'player' | 'observer' = 'player') => project(g, audience, heroId).feed.filter((e) => e.forHero).length
    expect(closed(a!.id)).toBe(1)
    expect(closed(b!.id)).toBe(1)
    expect(closed(undefined, 'observer')).toBe(0)
    expect(project(g, 'player', a!.id).feed.filter((e) => e.forHero).every((e) => e.forHero === a!.id)).toBe(true)
    expect(tableViewProblem(project(g, 'player', a!.id))).toBeUndefined()
  })

  it('keeps hidden challenges and the link to a status die from players', () => {
    let g = addVillain(withHeroes(), titan(), c, false)
    g = addChallenge(g, { name: 'Secret', steps: 1, hidden: true }, c)
    const view = project(g, 'player', g.heroes[0]!.id)
    expect(view.challenges.map((x) => x.name)).toEqual(['Shut down the furnace', "Gravelord's Titan challenge"])
    expect(view.challenges.every((x) => x.linkedVillainId === undefined)).toBe(true)
    expect(project(g, 'gm').challenges.some((x) => x.linkedVillainId)).toBe(true)
  })

  it('the action reads through the protocol', () => {
    const base = { v: 4, type: 'action', id: 'a', heroId: 'h', basedOn: 0 }
    expect(readClientMessage({ ...base, action: { kind: 'overcomeChallenge', challengeId: 'c', total: 9, trait: 'Agility' } })).toBeDefined()
    expect(readClientMessage({ ...base, action: { kind: 'overcomeChallenge', challengeId: 'c', total: 9999 } })).toBeUndefined()
  })

  it('a game with requests and steps saves and reads back', () => {
    const g = overcome(withHeroes(), 0)
    const r = parseSavedGame(gameToSaved(g))
    expect(r.ok).toBe(true)
    expect(parseSavedGame({ format: 'scrpg-game', version: 3, game: g }).ok).toBe(false)
  })
})

describe("the Titan's challenge", () => {
  it('comes in with the villain, named and with steps from its rule, hidden with it', () => {
    const g = addVillain(createGame({ id: 'g' }), titan(), c, true)
    const ch = g.challenges[0]!
    expect(ch).toMatchObject({ name: "Gravelord's Titan challenge", hidden: true, linkedVillainId: g.villains[0]!.id })
    expect(ch.steps.map((s) => s.label)).toEqual(['Expose a vulnerable part (1 of 2)', 'Expose a vulnerable part (2 of 2)', 'Take advantage of the exposed weakness'])
    expect(titanStepLabels(adaptiveBruiser())).toEqual([])
  })

  it('only a Titan gets one, and only at a table', () => {
    expect(addVillain(createGame({ id: 'g' }), adaptiveBruiser(), c).challenges).toEqual([])
    expect(addVillain({ ...createGame({ id: 'g' }), solo: { kind: 'villain', sourceId: 'v' } }, titan(), c).challenges).toEqual([])
  })

  it('completed parts lower the status die', () => {
    let g = addVillain(createGame({ id: 'g' }), titan(), c, false)
    const id = g.challenges[0]!.id
    const die = () => villainStatus(g.villains[0]!, g)?.die
    expect(die()).toBe('d12')
    g = setChallengeStep(g, id, 0, true, c)
    expect(die()).toBe('d12')
    g = setChallengeStep(g, id, 1, true, c)
    expect(die()).toBe('d10')
    g = setChallengeStep(g, id, 2, true, c)
    expect(die()).toBe('d8')
    g = resetChallenge(g, id, c)
    expect(die()).toBe('d12')
  })

  it('follows the villain: revealed, hidden and removed', () => {
    let g = addVillain(createGame({ id: 'g' }), titan(), c, true)
    const ref = { kind: 'villain' as const, id: g.villains[0]!.id }
    g = setHidden(g, ref, false, c)
    expect(g.challenges[0]!.hidden).toBe(false)
    g = setHidden(g, ref, true, c)
    expect(g.challenges[0]!.hidden).toBe(true)
    expect(removeFromTable(g, ref, c).challenges).toEqual([])
  })

  it('goes aside with its progress and comes back with the villain', () => {
    let g = addVillain(createGame({ id: 'g' }), titan(), c, false)
    const ref = { kind: 'villain' as const, id: g.villains[0]!.id }
    g = setChallengeStep(g, g.challenges[0]!.id, 2, true, c)
    g = setAside(g, ref, 1, c)
    expect(g.challenges).toEqual([])
    expect(g.offTable.challenges).toHaveLength(1)
    expect(g.aside.map((a) => a.ref.kind)).toEqual(['villain'])
    g = moveToTable(g, ref, false, c)
    expect(g.offTable.challenges).toEqual([])
    expect(g.challenges[0]!.steps[2]!.done).toBe(true)
    expect(villainStatus(g.villains[0]!, g)?.die).toBe('d10')
  })

  it('a planned Titan gets its challenge when it reaches the table', () => {
    const g = createGame({ id: 'g' })
    const d = draftAddVillain(g, draftOfNew(g), titan(), { source: { kind: 'library' }, hidden: false }, c)
    const { game, sceneId } = savePlannedScene(g, undefined, d, c)
    expect(game.challenges).toEqual([])
    const next = startScene(game, sceneId, defaultChoices(startPlan(game, sceneId)), c)
    expect(next.challenges.map((x) => x.linkedVillainId)).toEqual([next.villains[0]!.id])
  })

  it("isn't a choice of its own when a scene starts: it does what the villain does", () => {
    const g = addVillain(createGame({ id: 'g' }), titan(), c, false)
    const { game, sceneId } = savePlannedScene(g, undefined, draftOfNew(g), c)
    const plan = startPlan(game, sceneId)
    expect(plan.leaving.map((l) => l.ref.kind)).toEqual(['villain'])
    const aside = startScene(game, sceneId, defaultChoices(plan), c)
    expect(aside.challenges).toEqual([])
    expect(aside.offTable.challenges).toHaveLength(1)
    const along = startScene(game, sceneId, { ...defaultChoices(plan), fates: { [refKey(plan.leaving[0]!.ref)]: 'along' } }, c)
    expect(along.challenges).toHaveLength(1)
  })

  it('a duplicate game keeps one link, undone', () => {
    let g = addVillain(createGame({ id: 'g' }), titan(), c, false)
    g = setChallengeStep(g, g.challenges[0]!.id, 0, true, c)
    const copy = duplicateGame(g, { id: 'copy' })
    expect(copy.challenges).toHaveLength(1)
    expect(copy.challenges[0]!.linkedVillainId).toBe(copy.villains[0]!.id)
    expect(copy.challenges[0]!.steps[0]!.done).toBe(false)
  })

  it('a sheet update away from Titan leaves a plain challenge; one to Titan adds it', () => {
    let g = addVillain(createGame({ id: 'g' }), titan(), c, false)
    const id = g.villains[0]!.id
    g = updateSheet(g, { kind: 'villain', id, sheet: { ...titan(), archetype: { id: 'bruiser', abilities: [] } } }, c)
    expect(g.challenges[0]!.linkedVillainId).toBeUndefined()
    g = updateSheet(g, { kind: 'villain', id, sheet: titan() }, c)
    expect(g.challenges.filter((x) => x.linkedVillainId === id)).toHaveLength(1)
  })
})
