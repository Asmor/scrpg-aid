import { describe, expect, it } from 'vitest'
import { createGame, createScene, villainCopy, heroCopy, type Challenge, type EnvironmentOnTable, type Game, type NpcGroup } from '../game/model'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createChallengeTemplate, createEnvironmentTemplate, createLieutenantTemplate, createMinionTemplate, type ChallengeTemplate, type EnvironmentTemplate, type MinionTemplate } from '../template/model'
import { sheetContents, type LibrarySheetItem, type SheetSource } from './contents'
import type { ChallengeCard, EnvironmentCard, NpcCard } from './model'

const now = new Date('2026-11-08T12:00:00Z')

function minion(id: string, name: string, extra: Partial<MinionTemplate> = {}): MinionTemplate {
  return { ...createMinionTemplate({ id, now }), name, ...extra }
}

function challenge(id: string, name: string): ChallengeTemplate {
  return { ...createChallengeTemplate({ id, now }), name, steps: [{ label: 'Cut the power' }, { label: '' }], done: 'The lights hold.' }
}

function foundry(attached: EnvironmentTemplate['attached'] = []): EnvironmentTemplate {
  const env = { ...createEnvironmentTemplate({ id: 'env', now }), name: 'Molten Foundry', description: 'Hot.', attached }
  env.aspects = [
    { name: 'Molten Steel', die: 'd10' },
    { name: 'Catwalks', die: 'd8' },
    { name: '', die: 'd6' },
  ]
  env.twists = [
    { id: 't1', zone: 'red', kind: 'major', text: 'It all goes critical.' },
    { id: 't2', zone: 'green', kind: 'major', text: 'A furnace door blows open.' },
    { id: 't3', zone: 'green', kind: 'minor', name: 'Slag', text: 'A ladle tips.' },
    { id: 't4', zone: 'yellow', kind: 'minor', text: 'Sparks.' },
  ]
  return env
}

const library = (items: LibrarySheetItem[], extra: (MinionTemplate | ChallengeTemplate)[] = []): SheetSource => {
  const all = [...items.map((i) => i.doc), ...extra]
  return { kind: 'library', items, lookup: (_kind, id) => all.find((d) => d.id === id) as MinionTemplate | undefined }
}

describe('sheetContents from the library', () => {
  it('puts heroes then villains as full pages, by name, and the rest as cards', () => {
    const hero = completeHero()
    const villain = adaptiveBruiser()
    const contents = sheetContents(
      library([
        { kind: 'villain', doc: villain },
        { kind: 'minion', doc: minion('m1', 'Ember Drones') },
        { kind: 'hero', doc: hero },
      ]),
      { bringAttached: true, includeHeroes: false },
    )
    expect(contents.pages.map((p) => p.kind)).toEqual(['hero', 'villain'])
    expect(contents.pages[1]).toMatchObject({ name: 'Ironclad', draft: false })
    expect(contents.cards).toHaveLength(1)
    const card = contents.cards[0] as NpcCard
    expect(card).toMatchObject({ type: 'minion', name: 'Ember Drones', die: 'd6', actions: 'any' })
    expect(card.members).toEqual(Array.from({ length: 4 }, () => ({ die: 'd6', out: false })))
    expect(contents.scene).toBeUndefined()
  })

  it('marks drafts', () => {
    const hero = { ...completeHero(), status: 'draft' as const }
    expect(sheetContents(library([{ kind: 'hero', doc: hero }]), { bringAttached: true, includeHeroes: false }).pages[0]!.draft).toBe(true)
  })

  it('gives a lieutenant its abilities, and a challenge its steps', () => {
    const lt = { ...createLieutenantTemplate({ id: 'lt', now }), name: 'Slag Brute', abilities: [{ name: 'Molten Fists', type: 'A' as const, text: 'Attack.' }] }
    const contents = sheetContents(
      library([
        { kind: 'lieutenant', doc: lt },
        { kind: 'challenge', doc: challenge('c1', 'Rolling Blackout') },
      ]),
      { bringAttached: true, includeHeroes: false },
    )
    expect(contents.cards[0]).toMatchObject({
      type: 'lieutenant',
      abilities: lt.abilities,
      members: [
        { die: 'd8', out: false },
        { die: 'd8', out: false },
      ],
    })
    expect(contents.cards[1]).toMatchObject({
      type: 'challenge',
      steps: [
        { label: 'Cut the power', done: false },
        { label: '', done: false },
      ],
      whenDone: 'The lights hold.',
    })
  })

  it("orders an environment's twists by zone, minor before major, and names what it brings", () => {
    const env = foundry([{ kind: 'minion', templateId: 'thugs' }])
    const contents = sheetContents(library([{ kind: 'environment', doc: env }], [minion('thugs', 'Foundry Thugs')]), { bringAttached: false, includeHeroes: false })
    const card = contents.cards[0] as EnvironmentCard
    expect(card.twists.map((t) => `${t.zone} ${t.kind}`)).toEqual(['green minor', 'green major', 'yellow minor', 'red major'])
    expect(card.twists[0]).toMatchObject({ name: 'Slag', used: false })
    expect(card.brings).toEqual(['Foundry Thugs'])
    expect(card.appearance).toEqual({ primary: 'green' })
  })

  it('adds attached templates once, skipping missing ones and ones already selected', () => {
    const thugs = minion('thugs', 'Foundry Thugs')
    const env = foundry([
      { kind: 'minion', templateId: 'thugs' },
      { kind: 'challenge', templateId: 'gate' },
      { kind: 'minion', templateId: 'gone' },
    ])
    const other = { ...foundry([{ kind: 'minion', templateId: 'thugs' }]), id: 'env2', name: 'Night Shift' }
    const source = library(
      [
        { kind: 'environment', doc: env },
        { kind: 'environment', doc: other },
      ],
      [thugs, challenge('gate', 'Gate Lock')],
    )
    const on = sheetContents(source, { bringAttached: true, includeHeroes: false })
    expect(on.cards.map((c) => c.name)).toEqual(['Molten Foundry', 'Night Shift', 'Foundry Thugs', 'Gate Lock'])
    expect(on.cards[2]).toMatchObject({ brought: true, from: 'Molten Foundry', appearance: { primary: 'green' } })
    expect(on.bringable).toEqual(['Foundry Thugs', 'Gate Lock'])
    const off = sheetContents(source, { bringAttached: false, includeHeroes: false })
    expect(off.cards.map((c) => c.name)).toEqual(['Molten Foundry', 'Night Shift'])
    expect(off.bringable).toEqual(['Foundry Thugs', 'Gate Lock'])

    const selected = sheetContents(
      library(
        [
          { kind: 'environment', doc: env },
          { kind: 'minion', doc: thugs },
        ],
        [challenge('gate', 'Gate Lock')],
      ),
      { bringAttached: true, includeHeroes: false },
    )
    expect(selected.cards.map((c) => c.name)).toEqual(['Molten Foundry', 'Foundry Thugs', 'Gate Lock'])
    expect(selected.cards[1]!.brought).toBeUndefined()
    expect(selected.bringable).toEqual(['Gate Lock'])
  })
})

// ---- Scenes ----

let ids = 0
const id = () => `id${++ids}`

function group(name: string, n: number, extra: Partial<NpcGroup> = {}): NpcGroup {
  return { id: id(), kind: 'minions', name, hidden: false, owner: { kind: 'gm' }, actions: ['attack', 'hinder'], members: Array.from({ length: n }, (_, i) => ({ id: id(), n: i + 1, die: 'd6' as const, mods: [], acted: false })), ...extra }
}

function tableChallenge(name: string, extra: Partial<Challenge> = {}): Challenge {
  return {
    id: id(),
    name,
    hidden: false,
    owner: { kind: 'gm' },
    requests: [],
    steps: [
      { label: 'Find the panel', done: true },
      { label: 'Bypass', done: false },
    ],
    ...extra,
  }
}

function tableEnvironment(extra: Partial<EnvironmentOnTable> = {}): EnvironmentOnTable {
  return {
    id: id(),
    name: 'The Foundry',
    hidden: false,
    aspects: [{ name: 'Heat', die: 'd8' }],
    twists: [
      { id: 't1', zone: 'green', kind: 'minor', text: 'Sparks.', used: { round: 2 } },
      { id: 't2', zone: 'yellow', kind: 'minor', text: 'Steam.' },
    ],
    attached: [
      { kind: 'minion', templateId: 'thugs', name: 'Foundry Thugs', die: 'd6', actions: 'any', groupSize: 3 },
      { kind: 'challenge', templateId: 'gate', name: 'Gate Lock', labels: ['Open it'] },
    ],
    ...extra,
  }
}

function sceneGame(): Game {
  const game = createGame({ id: 'g', now, name: 'Thursday game' })
  game.issues = [{ id: 'i1', number: 2, state: 'now' }]
  game.currentIssueId = 'i1'
  const done = { ...createScene({ id: 's1', name: 'Opening', state: 'done' }), issueId: 'i1' }
  const current = { ...game.scenes[0]!, id: 's2', name: 'The Foundry', position: 3, notes: 'Keep the lights low.', issueId: 'i1' }
  game.scenes = [done, current]
  game.currentSceneId = 's2'
  const env = tableEnvironment()
  game.environment = env
  const thugs = group('Foundry Thugs', 3, { owner: { kind: 'environment' }, templateId: 'thugs' })
  thugs.members = [thugs.members[0]!, { ...thugs.members[2]!, die: 'd4' }]
  game.groups = [group('Burglars', 2, { hidden: true }), thugs]
  game.challenges = [tableChallenge('Rolling Blackout')]
  game.villains = [villainCopy(adaptiveBruiser(), 'vc', false)]
  game.heroes = [heroCopy(completeHero(), 'hc')]
  return game
}

describe('sheetContents from a scene', () => {
  it('reads the current scene from the table: groups as they are, done steps, used twists', () => {
    const game = sceneGame()
    const contents = sheetContents({ kind: 'scene', game, sceneId: 's2' }, { bringAttached: true, includeHeroes: false })
    expect(contents.pages.map((p) => p.name)).toEqual(['Ironclad'])
    expect(contents.cards.map((c) => c.name)).toEqual(['The Foundry', 'Burglars', 'Foundry Thugs', 'Rolling Blackout', 'Gate Lock'])
    const env = contents.cards[0] as EnvironmentCard
    expect(env.twists.map((t) => t.used)).toEqual([true, false])
    expect(env.brings).toEqual(['Foundry Thugs', 'Gate Lock'])
    expect(contents.cards[1]).toMatchObject({ hidden: 'now', die: 'd6', actions: ['attack', 'hinder'] })
    // Member 2 is out; member 3 is at a d4.
    expect((contents.cards[2] as NpcCard).members).toEqual([
      { die: 'd6', out: false },
      { die: 'd6', out: true },
      { die: 'd4', out: false },
    ])
    expect(contents.cards[2]).toMatchObject({ from: 'The Foundry' })
    expect(contents.cards[2]!.brought).toBeUndefined()
    expect((contents.cards[3] as ChallengeCard).steps.map((s) => s.done)).toEqual([true, false])
    // The thugs are already on the table; only the gate lock is brought.
    expect(contents.bringable).toEqual(['Gate Lock'])
    expect(contents.cards[4]).toMatchObject({ brought: true, steps: [{ label: 'Open it', done: false }] })
    expect(contents.scene).toEqual({
      gameName: 'Thursday game',
      where: 'Issue 2 · Scene 2',
      name: 'The Foundry',
      number: 2,
      notes: 'Keep the lights low.',
      tracker: { counts: game.scenes[1]!.tracker, name: 'Standard', zones: ['green', 'green', 'yellow', 'yellow', 'yellow', 'yellow', 'red', 'red'], filled: 4, now: 'Yellow 2' },
    })
  })

  it('adds the heroes only when asked', () => {
    const game = sceneGame()
    const contents = sheetContents({ kind: 'scene', game, sceneId: 's2' }, { bringAttached: false, includeHeroes: true })
    expect(contents.pages.map((p) => p.kind)).toEqual(['hero', 'villain'])
    expect(contents.cards.map((c) => c.name)).not.toContain('Gate Lock')
  })

  it("reads a planned scene's copies, marks what starts hidden, and leaves the tracker empty", () => {
    const game = sceneGame()
    const env = tableEnvironment({ name: 'Rooftops', attached: [] })
    const g = group('Snipers', 2)
    const c = tableChallenge('Defuse')
    const v = villainCopy(adaptiveBruiser(), 'v-off', true)
    game.offTable = { villains: [v], groups: [g], challenges: [c], environments: [env] }
    const planned = {
      ...createScene({ id: 's3', name: '', state: 'planned' }),
      environmentId: env.id,
      environmentHidden: true,
      opposition: [
        { ref: { kind: 'villain' as const, id: 'v-off' }, startHidden: true, source: { kind: 'library' as const } },
        { ref: { kind: 'group' as const, id: g.id }, startHidden: false, source: { kind: 'quick' as const } },
        { ref: { kind: 'challenge' as const, id: c.id }, startHidden: true, source: { kind: 'quick' as const } },
        { ref: { kind: 'group' as const, id: 'removed' }, startHidden: false, source: { kind: 'quick' as const } },
      ],
    }
    game.scenes.push(planned)
    const contents = sheetContents({ kind: 'scene', game, sceneId: 's3' }, { bringAttached: true, includeHeroes: false })
    expect(contents.pages).toMatchObject([{ name: 'Ironclad', hidden: 'starts' }])
    expect(contents.cards.map((x) => [x.name, x.hidden])).toEqual([
      ['Rooftops', 'starts'],
      ['Snipers', undefined],
      ['Defuse', 'starts'],
    ])
    expect(contents.scene).toMatchObject({ name: 'Scene 3', where: 'Issue 2 · Scene 3', tracker: { filled: 0 } })
    expect(contents.scene!.tracker.now).toBeUndefined()
  })

  it('names the next issue for a planned scene between issues', () => {
    const game = sceneGame()
    game.issues[0]!.state = 'finished'
    delete game.currentIssueId
    game.scenes.push(createScene({ id: 's3', name: 'Later', state: 'planned' }))
    expect(sheetContents({ kind: 'scene', game, sceneId: 's3' }, { bringAttached: true, includeHeroes: false }).scene!.where).toBe('Issue 3 · Scene 3')
  })

  it('refuses a scene that is gone', () => {
    expect(() => sheetContents({ kind: 'scene', game: sceneGame(), sceneId: 'nope' }, { bringAttached: true, includeHeroes: false })).toThrow(/no longer/)
  })
})
