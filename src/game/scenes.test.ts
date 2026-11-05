import { describe, expect, it } from 'vitest'
import { tableViewProblem } from '../session/protocol'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createGame, currentScene, emptyOffTable, sceneOnTable, type Game } from './model'
import { project } from './project'
import { addAsideTo, ALL_RESETS, asideChips, defaultChoices, deleteScene, draftAddChallenge, draftAddGroup, draftAddVillain, draftOfCurrent, draftOfNew, draftOfPlanned, draftSetEnvironment, duplicateGame, duplicateScene, gcOffTable, hasChanged, itemTitle, moveScene, moveToTable, plannedForText, playersWillSee, refKey, removeAside, saveCurrentScene, savePlannedScene, sceneChips, sceneDetail, setAside, setSceneRecord, sourceText, startPlan, startScene, trackerLine, waitingNote, type SceneDraft, type SceneResets, type StartChoices } from './scenes'
import { addChallenge, addGroup, addHero, addVillain, newEnvironment, setEnvironment, setRound, setTrackerPosition, startRound } from './table'

let n = 0
const clock = { now: new Date('2026-11-04T12:00:00Z'), newId: () => `id${++n}` }

function table(): Game {
  let g = addVillain(createGame({ id: 'g' }), adaptiveBruiser(), clock, false, 3)
  g = addGroup(g, { kind: 'minions', name: 'Burglars', die: 'd8', count: 3, hidden: false }, clock)
  g = addChallenge(g, { name: 'Catch the van', steps: 3, hidden: true }, clock)
  return { ...g, feed: [] }
}

const texts = (g: Game) => g.feed.map((e) => e.text)
const villainRef = (g: Game) => ({ kind: 'villain' as const, id: g.villains[0]!.id })
const groupRef = (g: Game) => ({ kind: 'group' as const, id: g.groups[0]!.id })
const challengeRef = (g: Game) => ({ kind: 'challenge' as const, id: g.challenges[0]!.id })

describe('chips that would read the same', () => {
  const twoBurglars = (counts: [number, number]) => {
    let g: Game = createGame({ id: 'g' })
    for (const count of counts) g = addGroup(g, { kind: 'minions', name: 'Burglar', die: 'd8', count, hidden: false }, clock)
    return g
  }

  it('numbers identical scene chips and leaves the others alone', () => {
    const same = twoBurglars([4, 4])
    expect(sceneChips(same, same.scenes[0]!).map((c) => c.text)).toEqual(['Burglar ×4 (1)', 'Burglar ×4 (2)'])
    const different = twoBurglars([1, 4])
    expect(sceneChips(different, different.scenes[0]!).map((c) => c.text)).toEqual(['Burglar ×1', 'Burglar ×4'])
  })

  it('numbers identical set-aside chips, in their text and their name', () => {
    let g = twoBurglars([4, 4])
    for (const group of [...g.groups]) g = setAside(g, { kind: 'group', id: group.id }, 1, clock)
    expect(asideChips(g).map((c) => [c.text, c.name])).toEqual([
      ['Burglar · 4 (1)', 'Burglar (1)'],
      ['Burglar · 4 (2)', 'Burglar (2)'],
    ])
  })
})

describe('plannedForText', () => {
  it('names the scenes', () => {
    expect(plannedForText([])).toBe('')
    expect(plannedForText([3])).toBe('Planned for scene 3')
    expect(plannedForText([3, 4])).toBe('Planned for scenes 3 and 4')
    expect(plannedForText([3, 4, 6])).toBe('Planned for scenes 3, 4 and 6')
  })
})

describe('reading scenes', () => {
  it('describes the tracker by state', () => {
    const scene = currentScene(createGame())
    expect(trackerLine({ ...scene, position: 2 })).toBe('Standard · Yellow 1')
    expect(trackerLine({ ...scene, state: 'planned', tracker: { green: 3, yellow: 5, red: 3 } })).toBe('Prolonged · 3 / 5 / 3')
    expect(trackerLine({ ...scene, state: 'planned', tracker: { green: 1, yellow: 1, red: 1 } })).toBe('Custom · 1 / 1 / 1')
    expect(trackerLine({ ...scene, state: 'done', position: 6 })).toBe('Standard · ended at Red 1')
  })

  it('describes the current scene: environment, round and chips, hidden ones marked', () => {
    let g = setEnvironment(table(), { name: 'Rooftop Heist', hidden: false }, clock)
    g = startRound(g, { kind: 'group', id: g.groups[0]!.id }, clock)
    const scene = currentScene(g)
    expect(sceneDetail(g, scene)).toBe('Rooftop Heist · round 1')
    expect(sceneChips(g, scene).map((c) => [c.text, c.hidden])).toEqual([
      ['Ironclad', false],
      ['Burglars ×3', false],
      ['Catch the van', true],
    ])
  })

  it('gives a done scene its summary and no chips', () => {
    const g = table()
    const done = { ...currentScene(g), state: 'done' as const, summary: 'Ended after round 4.' }
    expect(sceneDetail(g, done)).toBe('Ended after round 4.')
    expect(sceneChips(g, done)).toEqual([])
  })

  it('names sources', () => {
    expect(sourceText({ kind: 'library' })).toBe('From library')
    expect(sourceText({ kind: 'quick' })).toBe('Quick added')
    expect(sourceText({ kind: 'tag', tag: 'scene-3' })).toBe('Tagged scene-3')
    expect(sourceText({ kind: 'aside', afterScene: 1 })).toBe('Set aside after scene 1')
    expect(sourceText({ kind: 'aside' })).toBe('Set aside')
  })

  it('knows what has changed from its template', () => {
    const g = table()
    const villain = g.villains[0]!
    expect(hasChanged(villain, villainRef(g))).toBe(false)
    expect(hasChanged({ ...villain, play: { ...villain.play, health: 3 } }, villainRef(g))).toBe(true)
    const group = g.groups[0]!
    expect(hasChanged(group, groupRef(g))).toBe(false)
    expect(hasChanged({ ...group, members: group.members.map((m, i) => (i === 1 ? { ...m, die: 'd4' as const } : m)) }, groupRef(g))).toBe(true)
    expect(hasChanged({ ...g.challenges[0]!, steps: g.challenges[0]!.steps.map((x, i) => ({ ...x, done: i === 0 })) }, challengeRef(g))).toBe(true)
    const env = newEnvironment({ name: 'Foundry', hidden: true, twists: [{ id: 't', zone: 'green', kind: 'minor', text: 'x', used: { round: 1 } }] }, clock)
    expect(hasChanged(env, { kind: 'environment', id: env.id })).toBe(true)
    expect(itemTitle(g.groups[0]!, groupRef(g))).toBe('Burglars ×3')
  })
})

describe('moving things on and off the table', () => {
  it('sets a villain aside with its play state, and brings the same copy back', () => {
    let g = table()
    const ref = villainRef(g)
    g = { ...g, villains: g.villains.map((v) => ({ ...v, play: { ...v.play, health: 41 } })) }
    const aside = setAside(g, ref, 1, clock)
    expect(aside.villains).toEqual([])
    expect(aside.aside).toEqual([{ ref, afterScene: 1 }])
    expect(aside.offTable.villains[0]).toMatchObject({ id: ref.id, play: { health: 41 } })
    expect(aside.turn.order.some((o) => o.id === ref.id)).toBe(false)
    expect(texts(aside)).toEqual(['Ironclad left the table.'])

    const back = moveToTable(aside, ref, true, clock)
    expect(back.villains[0]).toMatchObject({ id: ref.id, hidden: true, play: { health: 41 } })
    expect(back.aside).toEqual([])
    expect(back.offTable.villains).toEqual([])
    expect(back.feed.at(-1)).toMatchObject({ text: 'The GM brought in Ironclad, hidden from players.', gmOnly: true })
    const shown = moveToTable(aside, ref, false, clock)
    expect(shown.feed.at(-1)?.text).toBe('Ironclad joined the table.')
    expect(shown.turn.order.some((o) => o.id === ref.id)).toBe(true)
  })

  it('moves groups and challenges too; a group leaving becomes the GM’s; hidden lines are the GM’s', () => {
    let g = table()
    g = { ...g, groups: g.groups.map((x) => ({ ...x, owner: { kind: 'environment' as const } })) }
    g = setAside(g, groupRef(g), undefined, clock)
    expect(g.offTable.groups[0]!.owner).toEqual({ kind: 'gm' })
    expect(g.aside[0]).toEqual({ ref: { kind: 'group', id: g.offTable.groups[0]!.id } })
    g = setAside(g, challengeRef(g), 2, clock)
    expect(g.feed.at(-1)).toMatchObject({ text: 'Catch the van left the table.', gmOnly: true })
    const ref = { kind: 'challenge' as const, id: g.offTable.challenges[0]!.id }
    g = moveToTable(g, ref, false, clock)
    expect(g.challenges[0]).toMatchObject({ id: ref.id, hidden: false })
    expect(moveToTable(g, { kind: 'villain', id: 'nobody' }, false, clock)).toBe(g)
    expect(setAside(g, { kind: 'villain', id: 'nobody' }, 1, clock)).toBe(g)
  })

  it('drops off-table copies nothing refers to', () => {
    const t = table()
    let g = setAside(t, villainRef(t), 1, clock)
    expect(gcOffTable(g).offTable.villains).toHaveLength(1)
    g = { ...g, aside: [] }
    expect(gcOffTable(g).offTable.villains).toEqual([])
  })

  it('keeps a replaced environment off the table only while a planned scene names it', () => {
    let g = setEnvironment(createGame(), { name: 'Rooftop', hidden: false }, clock)
    const old = g.environment!
    expect(setEnvironment(g, { name: 'Foundry', hidden: false }, clock).offTable.environments).toEqual([])
    g = { ...g, scenes: [...g.scenes, { ...currentScene(g), id: 'later', state: 'planned', environmentId: old.id }] }
    const replaced = setEnvironment(g, { name: 'Foundry', hidden: false }, clock)
    expect(replaced.environment?.name).toBe('Foundry')
    expect(replaced.offTable.environments).toEqual([old])
  })
})

describe('saving the current scene', () => {
  const save = (g: Game, change: (d: SceneDraft) => SceneDraft, restart = false) => saveCurrentScene(g, change(draftOfCurrent(g)), restart, clock)

  it('starts from what is on the table', () => {
    const g = table()
    const draft = draftOfCurrent(g)
    expect(draft.rows.map((r) => [r.ref.kind, r.startHidden, r.source.kind])).toEqual([
      ['villain', false, 'library'],
      ['group', false, 'quick'],
      ['challenge', true, 'quick'],
    ])
  })

  it('applies the name, tracker and notes; the box stays, clamped, unless it restarts', () => {
    let g = setTrackerPosition(table(), 7, clock)
    g = save(g, (d) => ({ ...d, name: ' The Foundry ', tracker: { green: 1, yellow: 1, red: 1 }, notes: 'Mine' }))
    expect(currentScene(g)).toMatchObject({ name: 'The Foundry', tracker: { green: 1, yellow: 1, red: 1 }, position: 2, notes: 'Mine' })
    expect(texts(g)).toContain('The scene is now The Foundry.')
    g = save(g, (d) => d, true)
    expect(currentScene(g).position).toBe(0)
  })

  it('applies Hidden with the same meaning as Reveal and Hide', () => {
    const g = save(table(), (d) => ({ ...d, rows: d.rows.map((r) => ({ ...r, startHidden: r.ref.kind === 'villain' })) }))
    expect(g.villains[0]!.hidden).toBe(true)
    expect(g.challenges[0]!.hidden).toBe(false)
    expect(texts(g)).toEqual(['The GM hid Ironclad from players.', 'The GM revealed Catch the van.'])
  })

  it('takes out a removed item: gone from the game, or back to set aside if it came from there', () => {
    let g = table()
    const villain = villainRef(g)
    const group = groupRef(g)
    g = { ...g, scenes: g.scenes.map((s) => ({ ...s, opposition: [{ ref: villain, startHidden: false, source: { kind: 'aside' as const, afterScene: 1 } }] })) }
    g = save(g, (d) => ({ ...d, rows: d.rows.filter((r) => r.ref.kind === 'challenge') }))
    expect(g.villains).toEqual([])
    expect(g.aside).toEqual([{ ref: villain, afterScene: 1 }])
    expect(g.offTable.villains[0]!.id).toBe(villain.id)
    expect(g.groups).toEqual([])
    expect(g.offTable.groups).toEqual([])
    expect(g.turn.order.some((o) => o.id === group.id)).toBe(false)
  })

  it('brings on a row from off the table, and a new copy', () => {
    const t = table()
    let g = setAside(t, villainRef(t), 1, clock)
    const ref = g.aside[0]!.ref
    const fresh = { ...g.groups[0]!, id: 'fresh', name: 'Guards' }
    g = save(g, (d) => ({ ...d, rows: [...d.rows, { ref, startHidden: false, source: { kind: 'aside' as const, afterScene: 1 } }, { ref: { kind: 'group', id: 'fresh' }, startHidden: true, source: { kind: 'library' as const } }], copies: { ...emptyOffTable(), groups: [fresh] } }))
    expect(g.villains.map((v) => v.id)).toEqual([ref.id])
    expect(g.aside).toEqual([])
    expect(g.groups.find((x) => x.id === 'fresh')).toMatchObject({ name: 'Guards', hidden: true })
    expect(g.offTable).toEqual(emptyOffTable())
    expect(currentScene(g).opposition.find((r) => r.ref.id === ref.id)?.source).toEqual({ kind: 'aside', afterScene: 1 })
  })

  it('changes the environment: hidden flag, a new one, or none', () => {
    let g = setEnvironment(createGame(), { name: 'Rooftop', hidden: true }, clock)
    const id = g.environment!.id
    g = save(g, (d) => ({ ...d, environment: { id, hidden: false } }))
    expect(g.environment?.hidden).toBe(false)
    const made = newEnvironment({ name: 'Foundry', hidden: true }, clock)
    g = save(g, (d) => ({ ...d, environment: { id: made.id, hidden: true }, copies: { ...emptyOffTable(), environments: [made] } }))
    expect(g.environment).toMatchObject({ id: made.id, name: 'Foundry', hidden: true })
    expect(g.offTable.environments).toEqual([])
    g = save(g, (d) => {
      const { environment: _, ...rest } = d
      return rest
    })
    expect(g.environment).toBeUndefined()
  })
})

describe('what players receive', () => {
  it('gets the current scene and its number, never the plan, notes or set aside items', () => {
    let g = table()
    g = setAside(g, villainRef(g), 1, clock)
    const planned = { ...currentScene(g), id: 'plan', name: 'The secret lair', notes: 'Twist ending', state: 'planned' as const, opposition: [{ ref: g.aside[0]!.ref, startHidden: true, source: { kind: 'aside' as const } }] }
    // The villain leaving is public; what became of it isn't.
    g = { ...g, feed: [], scenes: [...g.scenes.map((s) => ({ ...s, name: 'Rooftop chase', notes: 'GM secret' })), planned] }
    for (const audience of ['player', 'observer'] as const) {
      const view = project(g, audience)
      expect(view.scene).toEqual({ name: 'Rooftop chase', tracker: ['green', 'green', 'yellow', 'yellow', 'yellow', 'yellow', 'red', 'red'], position: 0, number: 1 })
      const sent = JSON.stringify(view)
      for (const secret of ['The secret lair', 'Twist ending', 'GM secret', 'Ironclad', 'offTable', 'aside']) expect(sent).not.toContain(secret)
    }
    expect(project(g, 'gm').scene.total).toBe(2)
  })
})

describe('planning scenes', () => {
  const villain = adaptiveBruiser()
  const planned = (g: Game) => g.scenes.filter((s) => s.state === 'planned')
  const plan = (g: Game, change: (d: SceneDraft) => SceneDraft = (d) => d) => savePlannedScene(g, undefined, change(draftOfNew(g)), clock).game

  it('starts a new scene named for its number, on Standard', () => {
    const g = plan(createGame())
    expect(planned(g)[0]).toMatchObject({ name: 'Scene 2', tracker: { green: 2, yellow: 4, red: 2 }, state: 'planned', opposition: [], notes: '' })
    expect(draftOfNew(g).name).toBe('Scene 3')
  })

  it('copies library items off the table: a villain, groups and challenges, nothing reaching the table', () => {
    const g = plan(createGame(), (d) => {
      let x = draftAddVillain(createGame(), d, villain, { heroCount: 4, source: { kind: 'library' }, hidden: true }, clock)
      x = draftAddGroup(x, { kind: 'minions', name: 'Guard', die: 'd6', count: 4, hidden: false }, { kind: 'tag', tag: 'scene-3' }, clock)
      return draftAddChallenge(x, { name: 'Furnace', steps: 2, hidden: true }, { kind: 'quick' }, clock)
    })
    expect([g.villains, g.groups, g.challenges]).toEqual([[], [], []])
    expect(g.offTable.villains[0]).toMatchObject({ sourceId: villain.id, play: { heroCount: 4 } })
    expect(g.offTable.groups[0]!.members).toHaveLength(4)
    const scene = planned(g)[0]!
    expect(scene.opposition.map((r) => [r.ref.kind, r.startHidden, r.source.kind])).toEqual([
      ['villain', true, 'library'],
      ['group', false, 'tag'],
      ['challenge', true, 'quick'],
    ])
    expect(sceneDetail(g, scene)).toBe('No environment yet · 3 in the opposition, 2 start hidden')
    expect(sceneChips(g, scene).map((c) => c.text)).toEqual(['Ironclad', 'Guard ×4', 'Furnace'])
    expect(waitingNote(g, 'villain', villain.id)).toBe('Planned for scene 2')
    expect(waitingNote(g, 'challenge', 'no-template')).toBeUndefined()
  })

  it('never re-copies a villain the game already has, on the table or off it', () => {
    const t = addVillain(createGame(), villain, clock, false)
    const onTable = draftAddVillain(t, draftOfNew(t), villain, { source: { kind: 'library' }, hidden: true }, clock)
    expect(onTable.copies.villains).toEqual([])
    expect(onTable.rows[0]!.ref.id).toBe(t.villains[0]!.id)
    const twice = draftAddVillain(t, onTable, villain, { source: { kind: 'library' }, hidden: false }, clock)
    expect(twice.rows).toHaveLength(1)
    const fresh = createGame()
    const once = draftAddVillain(fresh, draftOfNew(fresh), villain, { source: { kind: 'library' }, hidden: true }, clock)
    const again = draftAddVillain(fresh, { ...once, rows: [] }, villain, { source: { kind: 'library' }, hidden: true }, clock)
    expect(again.copies.villains).toHaveLength(1)
    expect(again.rows).toHaveLength(1)
  })

  it('ignores a quick add with counts out of range', () => {
    const d = draftOfNew(createGame())
    expect(draftAddGroup(d, { kind: 'minions', name: 'x', die: 'd6', count: 0, hidden: true }, { kind: 'quick' }, clock)).toBe(d)
    expect(draftAddChallenge(d, { name: 'x', steps: 99, hidden: true }, { kind: 'quick' }, clock)).toBe(d)
  })

  it('edits a planned scene and drops what it no longer holds', () => {
    let g = plan(createGame(), (d) => draftAddGroup(d, { kind: 'minions', name: 'Guard', die: 'd6', count: 2, hidden: true }, { kind: 'library' }, clock))
    const id = planned(g)[0]!.id
    const draft = draftOfPlanned(g, id)
    expect(draft.rows).toHaveLength(1)
    const saved = savePlannedScene(g, id, { ...draft, name: 'The Foundry', tracker: { green: 3, yellow: 5, red: 3 }, notes: 'Secret', rows: [] }, clock)
    g = saved.game
    expect(saved.sceneId).toBe(id)
    expect(planned(g)[0]).toMatchObject({ name: 'The Foundry', notes: 'Secret', tracker: { green: 3, yellow: 5, red: 3 } })
    expect(g.offTable.groups).toEqual([])
    expect(draftOfPlanned(g, 'nobody').name).toBe('Scene 3')
  })

  it('holds an environment: a new copy, or the one on the table', () => {
    let g = setEnvironment(createGame(), { name: 'Rooftop', hidden: false }, clock)
    const keep = g.environment!.id
    g = plan(g, (d) => ({ ...d, environment: { id: keep, hidden: false } }))
    expect(g.offTable.environments).toEqual([])
    expect(sceneDetail(g, planned(g)[0]!)).toContain('Rooftop')
    const made = newEnvironment({ name: 'Foundry', hidden: true }, clock)
    g = plan(g, (d) => draftSetEnvironment(d, made))
    expect(g.offTable.environments).toEqual([made])
    expect(planned(g)[1]).toMatchObject({ environmentId: made.id, environmentHidden: true })
    expect(draftOfPlanned(g, planned(g)[1]!.id).environment).toEqual({ id: made.id, hidden: true })
    // A second new copy replaces the first in the draft.
    const other = newEnvironment({ name: 'Other', hidden: true }, clock)
    const replaced = draftSetEnvironment(draftSetEnvironment(draftOfNew(g), newEnvironment({ name: 'First', hidden: true }, clock)), other)
    expect(replaced.copies.environments).toEqual([other])
    // Taking the environment off drops the copy.
    const id = planned(g)[1]!.id
    const { environment: _, ...without } = draftOfPlanned(g, id)
    g = savePlannedScene(g, id, without, clock).game
    expect(g.offTable.environments).toEqual([])
    expect(planned(g)[1]!.environmentId).toBeUndefined()
  })

  it('reorders planned scenes only, staying among them', () => {
    let g = plan(plan(plan(createGame())))
    const [a, b, c] = planned(g).map((s) => s.id)
    g = moveScene(g, c!, 1)
    expect(planned(g).map((s) => s.id)).toEqual([c, a, b])
    // It can't go ahead of the current scene.
    g = moveScene(g, b!, 0)
    expect(g.scenes[0]!.state).toBe('now')
    expect(planned(g).map((s) => s.id)).toEqual([b, c, a])
    g = moveScene(g, b!, 99)
    expect(planned(g).map((s) => s.id)).toEqual([c, a, b])
    expect(moveScene(g, g.currentSceneId, 2)).toBe(g)
    expect(moveScene(g, c!, 1)).toBe(g)
  })

  it('duplicates a planned scene with fresh groups and challenges, sharing the villain', () => {
    let g = plan(createGame(), (d) => {
      const x = draftAddVillain(createGame(), d, villain, { source: { kind: 'library' }, hidden: true }, clock)
      return draftAddChallenge(draftAddGroup(x, { kind: 'minions', name: 'Guard', die: 'd6', count: 2, hidden: true }, { kind: 'library' }, clock), { name: 'Furnace', steps: 1, hidden: true }, { kind: 'quick' }, clock)
    })
    const scene = planned(g)[0]!
    g = duplicateScene(g, scene.id, clock)
    const [one, two] = planned(g)
    expect(two!.name).toBe('Scene 2 (copy)')
    expect(two!.opposition[0]!.ref).toEqual(one!.opposition[0]!.ref)
    expect(two!.opposition[1]!.ref.id).not.toBe(one!.opposition[1]!.ref.id)
    expect(two!.opposition[2]!.ref.id).not.toBe(one!.opposition[2]!.ref.id)
    expect(g.offTable.groups).toHaveLength(2)
    expect(duplicateScene(g, g.currentSceneId, clock)).toBe(g)
  })

  it('deletes a planned scene and what only it held; not the current one', () => {
    let g = plan(createGame(), (d) => draftAddGroup(d, { kind: 'minions', name: 'Guard', die: 'd6', count: 2, hidden: true }, { kind: 'library' }, clock))
    g = deleteScene(g, planned(g)[0]!.id)
    expect(g.scenes).toHaveLength(1)
    expect(g.offTable.groups).toEqual([])
    expect(deleteScene(g, g.currentSceneId)).toBe(g)
  })

  it('changes only the summary and notes of a done scene', () => {
    const g = table()
    const id = g.currentSceneId
    expect(setSceneRecord(g, id, { summary: 'x', notes: 'y' }).scenes[0]!.summary).toBeUndefined()
    const done = { ...g, scenes: g.scenes.map((s) => ({ ...s, state: 'done' as const, summary: 'Ended after round 4.' })) }
    expect(setSceneRecord(done, id, { summary: 'Ironclad escaped', notes: 'Note' }).scenes[0]).toMatchObject({ summary: 'Ironclad escaped', notes: 'Note' })
  })

  describe('set aside', () => {
    function withAside(): Game {
      const t = table()
      let g = setAside(t, villainRef(t), 1, clock)
      g = { ...g, offTable: { ...g.offTable, villains: g.offTable.villains.map((v) => ({ ...v, play: { ...v.play, health: 12 } })) } }
      return plan(g)
    }

    it('lists each with its Health or count', () => {
      let g = withAside()
      g = setAside(g, groupRef(g), undefined, clock)
      g = setAside(g, challengeRef(g), undefined, clock)
      expect(asideChips(g).map((c) => c.text)).toEqual([expect.stringMatching(/^Ironclad · 12 \/ \d+$/), 'Burglars · 3', 'Catch the van'])
    })

    it('stays set aside when added to a planned scene, in as many as wanted', () => {
      let g = withAside()
      const ref = g.aside[0]!.ref
      const scene = planned(g)[0]!.id
      g = addAsideTo(g, ref, scene, clock)
      g = addAsideTo(g, ref, scene, clock)
      expect(planned(g)[0]!.opposition).toEqual([{ ref, startHidden: false, source: { kind: 'aside', afterScene: 1 } }])
      expect(g.aside).toHaveLength(1)
      expect(sceneChips(g, planned(g)[0]!)[0]!.text).toBe('Ironclad (set aside)')
      expect(waitingNote(g, 'villain', villain.id)).toBe('Planned for scene 2')
      // Taking it back out of the scene leaves it set aside.
      const saved = savePlannedScene(g, scene, { ...draftOfPlanned(g, scene), rows: [] }, clock).game
      expect(saved.offTable.villains).toHaveLength(1)
      expect(waitingNote(saved, 'villain', villain.id)).toBe('Set aside')
    })

    it('comes onto the current scene hidden, keeping its Health and source', () => {
      let g = withAside()
      const ref = g.aside[0]!.ref
      g = addAsideTo(g, ref, g.currentSceneId, clock)
      expect(g.villains[0]).toMatchObject({ id: ref.id, hidden: true, play: { health: 12 } })
      expect(g.aside).toEqual([])
      expect(draftOfCurrent(g).rows.find((r) => r.ref.id === ref.id)?.source).toEqual({ kind: 'aside', afterScene: 1 })
      expect(addAsideTo(g, ref, g.currentSceneId, clock)).toBe(g)
    })

    it('leaves the game on Remove, and any scene planning on it loses it', () => {
      let g = withAside()
      const ref = g.aside[0]!.ref
      g = addAsideTo(g, ref, planned(g)[0]!.id, clock)
      g = removeAside(g, ref, clock)
      expect(g.aside).toEqual([])
      expect(g.offTable.villains).toEqual([])
      expect(planned(g)[0]!.opposition).toEqual([])
      expect(g.feed.at(-1)).toMatchObject({ text: 'Ironclad left the game.', gmOnly: true })
      expect(removeAside(g, ref, clock)).toBe(g)
    })

    it('handles an environment set aside: to a scene, to the table, and removed', () => {
      const env = newEnvironment({ name: 'Foundry', hidden: false }, clock)
      const ref = { kind: 'environment' as const, id: env.id }
      let g = plan(createGame())
      g = { ...g, aside: [{ ref }], offTable: { ...g.offTable, environments: [env] } }
      const scene = planned(g)[0]!.id
      const toScene = addAsideTo(g, ref, scene, clock)
      expect(planned(toScene)[0]).toMatchObject({ environmentId: env.id, environmentHidden: true })
      expect(removeAside(toScene, ref, clock).scenes.find((s) => s.id === scene)!.environmentId).toBeUndefined()
      const onTable = addAsideTo(g, ref, g.currentSceneId, clock)
      expect(onTable.environment).toMatchObject({ id: env.id, hidden: true })
      expect(onTable.aside).toEqual([])
      expect(onTable.offTable.environments).toEqual([])
    })
  })
})

describe('starting a scene', () => {
  /** On the table: a villain, a group, a challenge, an environment; a hero with mods. Scene 2 planned with a new group and a challenge. */
  function ready(): { g: Game; id: string } {
    let g = setEnvironment(table(), { name: 'Rooftop Heist', hidden: false, twists: [{ id: 't', zone: 'green', kind: 'minor', text: 'Gust' }] }, clock)
    g = addHero(g, completeHero(), clock)
    g = startRound(g, { kind: 'hero', id: g.heroes[0]!.id }, clock)
    g = setRound(g, 3, clock)
    const envCopy = newEnvironment({ name: 'Foundry Floor', hidden: true }, clock)
    let d = draftOfNew(g)
    d = { ...draftSetEnvironment(d, envCopy), name: 'The Foundry', tracker: { green: 3, yellow: 5, red: 3 } }
    d = draftAddGroup(d, { kind: 'minions', name: 'Grave Guard', die: 'd8', count: 4, hidden: false }, { kind: 'library' }, clock)
    d = draftAddChallenge(d, { name: 'Furnace', steps: 2, hidden: true }, { kind: 'quick' }, clock)
    const saved = savePlannedScene(g, undefined, d, clock)
    return { g: { ...saved.game, feed: [] }, id: saved.sceneId }
  }
  const start = (g: Game, id: string, change: (c: StartChoices) => StartChoices = (c) => c) => startScene(g, id, change(defaultChoices(startPlan(g, id))), clock)

  it('plans what leaves and what comes in, with default fates', () => {
    const { g, id } = ready()
    const plan = startPlan(g, id)
    expect(plan.leaving.map((l) => [l.name, l.fate])).toEqual([
      ['Ironclad', 'aside'],
      ['Burglars ×3', 'remove'],
      ['Catch the van', 'remove'],
    ])
    expect(plan.replaced).toEqual({ name: 'Rooftop Heist', by: 'Foundry Floor' })
    expect(plan.coming.map((c) => [c.name, c.hidden, c.fromAside])).toEqual([
      ['Grave Guard ×4', false, false],
      ['Furnace', true, false],
      ['Foundry Floor', true, false],
    ])
    expect(startPlan(g, 'nobody')).toEqual({ leaving: [], coming: [] })
  })

  it('makes the current scene done, the next one current at its first box, and logs one public line', () => {
    const { g, id } = ready()
    const previous = g.currentSceneId
    const next = start(setTrackerPosition(g, 4, clock), id)
    expect(next.currentSceneId).toBe(id)
    expect(next.scenes.find((s) => s.id === previous)).toMatchObject({ state: 'done', summary: 'Ended after round 3.', position: 4 })
    expect(next.scenes.find((s) => s.id === id)).toMatchObject({ state: 'now', position: 0 })
    expect(sceneOnTable(next)).toMatchObject({ name: 'The Foundry', number: 2, position: 0 })
    expect(next.feed.at(-1)).toMatchObject({ text: 'Scene 2 began: The Foundry.' })
    expect(next.feed.at(-1)!.gmOnly).toBeUndefined()
    expect(next.feed.filter((e) => e.text.includes('Ironclad'))).toEqual([])
  })

  it('says a scene ended before round 1, and logs an unnamed scene plainly', () => {
    const c = createGame()
    const { game, sceneId } = savePlannedScene(c, undefined, { ...draftOfNew(c), name: '' }, clock)
    const next = start(game, sceneId)
    expect(next.scenes[0]!.summary).toBe('Ended before round 1.')
    expect(next.feed.at(-1)!.text).toBe('Scene 2 began.')
  })

  it('applies each fate: Set aside keeps its state, Remove leaves the game, Bring along stays as it is', () => {
    const { g, id } = ready()
    const hurt = { ...g, villains: g.villains.map((v) => ({ ...v, play: { ...v.play, health: 41 } })) }
    const [villain, group, challenge] = startPlan(hurt, id).leaving.map((l) => refKey(l.ref))
    const next = start(hurt, id, (c) => ({ ...c, fates: { [villain!]: 'aside', [group!]: 'along', [challenge!]: 'remove' } }))
    expect(next.villains).toEqual([])
    expect(next.offTable.villains[0]).toMatchObject({ play: { health: 41 } })
    expect(next.aside).toEqual([{ ref: villainRef(g), afterScene: 1 }])
    expect(next.groups.map((x) => x.name)).toEqual(['Burglars', 'Grave Guard'])
    expect(next.challenges.map((x) => x.name)).toEqual(['Furnace'])
    expect(next.offTable.challenges).toEqual([])
  })

  it('brings in the planned items with their Hidden choices, editable at the last minute', () => {
    const { g, id } = ready()
    const coming = startPlan(g, id).coming
    const guard = refKey(coming[0]!.ref)
    const env = refKey(coming[2]!.ref)
    const next = start(g, id, (c) => ({ ...c, hidden: { ...c.hidden, [guard]: true, [env]: false } }))
    expect(next.groups.find((x) => x.name === 'Grave Guard')?.hidden).toBe(true)
    expect(next.challenges[0]).toMatchObject({ name: 'Furnace', hidden: true })
    expect(next.environment).toMatchObject({ name: 'Foundry Floor', hidden: false })
    expect(next.offTable.groups).toEqual([])
    expect(next.offTable.environments).toEqual([])
  })

  it('brings a villain back from set aside with the Health it left with, and out of set aside', () => {
    let { g, id } = ready()
    const ref = villainRef(g)
    g = { ...g, villains: g.villains.map((v) => ({ ...v, dangerUsed: {}, play: { ...v.play, health: 41, mods: [{ id: 'm', label: 'Angry', value: 2 }], reactionUsed: true } })) }
    g = start(g, id)
    const third = savePlannedScene(g, undefined, { ...draftOfNew(g), rows: [{ ref, startHidden: false, source: { kind: 'aside', afterScene: 1 } }] }, clock)
    id = third.sceneId
    const next = start(third.game, id)
    expect(next.villains[0]).toMatchObject({ id: ref.id, hidden: false, play: { health: 41, reactionUsed: false } })
    // It keeps its mods (it left with them), but it's a new scene for its once-per-scene Overcome.
    expect(next.villains[0]!.play.mods).toHaveLength(1)
    expect(next.villains[0]!.dangerUsed).toBeUndefined()
    expect(next.aside).toEqual([])
  })

  it('keeps an item in the next scene on the table with its state, and its Hidden choice', () => {
    let { g, id } = ready()
    const ref = villainRef(g)
    g = { ...g, villains: g.villains.map((v) => ({ ...v, play: { ...v.play, health: 20 } })), scenes: g.scenes.map((s) => (s.id === id ? { ...s, opposition: [...s.opposition, { ref, startHidden: true, source: { kind: 'library' as const } }] } : s)) }
    expect(startPlan(g, id).leaving.map((l) => l.name)).not.toContain('Ironclad')
    const next = start(g, id)
    expect(next.villains[0]).toMatchObject({ id: ref.id, hidden: true, play: { health: 20 } })
  })

  it('defaults a group to Set aside when a later scene needs it', () => {
    let { g, id } = ready()
    g = savePlannedScene(g, undefined, { ...draftOfNew(g), rows: [{ ref: groupRef(g), startHidden: false, source: { kind: 'library' } }] }, clock).game
    expect(startPlan(g, id).leaving.find((l) => l.ref.kind === 'group')?.fate).toBe('aside')
    const next = start(g, id)
    expect(next.offTable.groups.map((x) => x.name)).toEqual(['Burglars'])
    // That later scene still has it.
    expect(sceneChips(next, next.scenes.at(-1)!).map((c) => c.text)).toEqual(['Burglars ×3 (set aside)'])
  })

  describe('the environment', () => {
    it('replaced: gone unless a later scene names it, and its groups become the GM’s', () => {
      let { g, id } = ready()
      g = { ...g, groups: g.groups.map((x) => ({ ...x, owner: { kind: 'environment' as const } })) }
      const old = g.environment!
      const [, group] = startPlan(g, id).leaving
      const next = start(g, id, (c) => ({ ...c, fates: { ...c.fates, [refKey(group!.ref)]: 'along' } }))
      expect(next.environment?.name).toBe('Foundry Floor')
      expect(next.offTable.environments).toEqual([])
      expect(next.groups[0]!.owner).toEqual({ kind: 'gm' })
      const later = savePlannedScene(g, undefined, { ...draftOfNew(g), environment: { id: old.id, hidden: false } }, clock).game
      expect(start(later, id).offTable.environments.map((e) => e.name)).toEqual(['Rooftop Heist'])
    })

    it('replaced: its challenges leave like anything else, and any kept become the GM’s', () => {
      let { g, id } = ready()
      g = addChallenge(g, { name: 'Vault', steps: 1, hidden: false, owner: { kind: 'environment' } }, clock)
      const vault = { kind: 'challenge' as const, id: g.challenges.at(-1)!.id }
      const item = startPlan(g, id).leaving.find((l) => l.name === 'Vault')!
      expect(item.fate).toBe('remove')
      expect(start(g, id).challenges.some((c) => c.id === vault.id)).toBe(false)
      const kept = start(g, id, (c) => ({ ...c, fates: { ...c.fates, [refKey(item.ref)]: 'along' } }))
      expect(kept.challenges.find((c) => c.id === vault.id)!.owner).toEqual({ kind: 'gm' })
    })

    it('kept: its challenges default to coming along, still its own', () => {
      let t = setEnvironment(table(), { name: 'Rooftop', hidden: false }, clock)
      t = addChallenge(t, { name: 'Vault', steps: 1, hidden: false, owner: { kind: 'environment' } }, clock)
      const { game, sceneId } = savePlannedScene(t, undefined, { ...draftOfNew(t), environment: { id: t.environment!.id, hidden: false } }, clock)
      expect(startPlan(game, sceneId).leaving.find((l) => l.name === 'Vault')?.fate).toBe('along')
      expect(start(game, sceneId).challenges.find((c) => c.name === 'Vault')!.owner).toEqual({ kind: 'environment' })
    })

    it('a challenge set aside is the GM’s', () => {
      let t = setEnvironment(table(), { name: 'Rooftop', hidden: false }, clock)
      t = addChallenge(t, { name: 'Vault', steps: 1, hidden: false, owner: { kind: 'environment' } }, clock)
      const ref = { kind: 'challenge' as const, id: t.challenges.at(-1)!.id }
      expect(setAside(t, ref, 1, clock).offTable.challenges.at(-1)!.owner).toEqual({ kind: 'gm' })
    })

    it('kept: stays, with twists reset, and its groups default to coming along', () => {
      const t = setEnvironment(table(), { name: 'Rooftop', hidden: false, twists: [{ id: 't', zone: 'green', kind: 'minor', text: 'Gust', used: { round: 1 } }] }, clock)
      const env = t.environment!
      const owned = { ...t, groups: t.groups.map((x) => ({ ...x, owner: { kind: 'environment' as const } })) }
      const { game, sceneId } = savePlannedScene(owned, undefined, { ...draftOfNew(owned), environment: { id: env.id, hidden: false } }, clock)
      const plan = startPlan(game, sceneId)
      expect(plan.replaced).toBeUndefined()
      expect(plan.leaving.find((l) => l.ref.kind === 'group')?.fate).toBe('along')
      const next = start(game, sceneId)
      expect(next.environment!.id).toBe(env.id)
      expect(next.environment!.twists![0]!.used).toBeUndefined()
      expect(next.groups[0]!.owner).toEqual({ kind: 'environment' })
      expect(start(game, sceneId, (c) => ({ ...c, resets: { ...c.resets, twists: false } })).environment!.twists![0]!.used).toEqual({ round: 1 })
    })

    it('with no environment planned: it has a fate like anything else', () => {
      const t = setEnvironment(createGame(), { name: 'Rooftop', hidden: false }, clock)
      const { game, sceneId } = savePlannedScene(t, undefined, draftOfNew(t), clock)
      const key = refKey({ kind: 'environment', id: t.environment!.id })
      expect(startPlan(game, sceneId).leaving.map((l) => [l.name, l.fate])).toEqual([['Rooftop', 'remove']])
      expect(start(game, sceneId).environment).toBeUndefined()
      expect(start(game, sceneId, (c) => ({ ...c, fates: { [key]: 'along' } })).environment?.name).toBe('Rooftop')
      const aside = start(game, sceneId, (c) => ({ ...c, fates: { [key]: 'aside' } }))
      expect(aside.environment).toBeUndefined()
      expect(aside.offTable.environments.map((e) => e.name)).toEqual(['Rooftop'])
      expect(aside.aside).toEqual([{ ref: { kind: 'environment', id: t.environment!.id }, afterScene: 1 }])
    })

    it('comes back from set aside', () => {
      const env = newEnvironment({ name: 'Rooftop', hidden: false }, clock)
      let g: Game = { ...createGame(), aside: [{ ref: { kind: 'environment', id: env.id } }], offTable: { ...emptyOffTable(), environments: [env] } }
      const saved = savePlannedScene(g, undefined, { ...draftOfNew(g), environment: { id: env.id, hidden: false } }, clock)
      g = start(saved.game, saved.sceneId)
      expect(g.environment).toMatchObject({ id: env.id, hidden: false })
      expect(g.aside).toEqual([])
    })
  })

  describe('resets', () => {
    function busy() {
      const { g, id } = ready()
      const mod = { id: 'm', label: 'Pumped', value: 2 }
      const defense = { id: 'd', value: 3, from: 'x' }
      const next: Game = {
        ...g,
        heroes: g.heroes.map((h) => ({ ...h, play: { ...h.play, health: 7, reactionUsed: true, mods: [mod], defenses: [defense], twists: [{ id: 't', kind: 'minor' as const, text: 'Hurt' }], minions: [{ id: 'mn', name: 'Drone', die: 'd6' as const, action: 'any' as const, mods: [mod], defenses: [defense] }] } })),
        villains: g.villains.map((v) => ({ ...v, dangerUsed: {}, play: { ...v.play, reactionUsed: true, mods: [mod], defenses: [defense] } })),
        groups: g.groups.map((x) => ({ ...x, members: x.members.map((m) => ({ ...m, mods: [mod], acted: true, defenses: [defense] })) })),
      }
      const keep = (c: StartChoices): StartChoices => ({ ...c, fates: Object.fromEntries(Object.keys(c.fates).map((k) => [k, 'along' as const])) })
      return { g: next, id, keep }
    }
    const only = (r: Partial<SceneResets>) => (c: StartChoices): StartChoices => ({ ...c, resets: { round: false, mods: false, once: false, twists: false, ...r } })

    it('Round and turn order: round 0, nobody acted, reactions ready, defenses gone; the rest stays', () => {
      const { g, id, keep } = busy()
      const next = start(g, id, (c) => only({ round: true })(keep(c)))
      expect(next.round).toBe(0)
      expect(next.turn.current).toBeUndefined()
      expect(next.turn.acted).toEqual([])
      expect(next.heroes[0]!.play).toMatchObject({ reactionUsed: false, mods: [{ id: 'm' }] })
      expect(next.heroes[0]!.play.defenses).toBeUndefined()
      expect(next.heroes[0]!.play.minions![0]!.defenses).toBeUndefined()
      expect(next.villains[0]!.play).toMatchObject({ reactionUsed: false })
      expect(next.villains[0]!.dangerUsed).toEqual({})
      expect(next.groups[0]!.members[0]).toMatchObject({ acted: false })
      // In the order: the heroes and what's revealed.
      expect(next.turn.order.map((o) => o.kind)).toEqual(['hero', 'villain', 'group', 'group'])
    })

    it('Round left alone: the round goes on, and whoever left leaves the order', () => {
      const { g, id } = busy()
      const next = start(g, id, only({}))
      expect(next.round).toBe(3)
      expect(next.turn.current?.kind).toBe('hero')
      expect(next.heroes[0]!.play.reactionUsed).toBe(true)
      expect(next.turn.order.some((o) => o.kind === 'villain')).toBe(false)
    })

    it('Bonuses and penalties: cleared from heroes, their minions, villains and members still here', () => {
      const { g, id, keep } = busy()
      const next = start(g, id, (c) => only({ mods: true })(keep(c)))
      expect(next.heroes[0]!.play.mods).toEqual([])
      expect(next.heroes[0]!.play.minions![0]!.mods).toEqual([])
      expect(next.villains[0]!.play.mods).toEqual([])
      expect(next.groups[0]!.members[0]!.mods).toEqual([])
      expect(start(g, id, (c) => only({})(keep(c))).villains[0]!.play.mods).toHaveLength(1)
    })

    it('Bonuses and penalties: what arrives keeps the mods it was prepped with', () => {
      const { g, id } = ready()
      const prepped = { ...g, offTable: { ...g.offTable, groups: g.offTable.groups.map((x) => ({ ...x, members: x.members.map((m) => ({ ...m, mods: [{ id: 'p', label: 'Prep', value: 1 }] })) })) } }
      expect(start(prepped, id).groups.find((x) => x.name === 'Grave Guard')!.members[0]!.mods).toHaveLength(1)
    })

    it('Once-per-scene uses: each villain’s tracker Overcome is ready again', () => {
      const { g, id, keep } = busy()
      expect(start(g, id, (c) => only({ once: true })(keep(c))).villains[0]!.dangerUsed).toBeUndefined()
      expect(start(g, id, (c) => only({})(keep(c))).villains[0]!.dangerUsed).toEqual({})
    })

    it('the heroes stay, with their Health and twists, whatever is checked', () => {
      const { g, id } = busy()
      const next = start(g, id)
      expect(next.heroes[0]!.play).toMatchObject({ health: 7, twists: [{ text: 'Hurt' }] })
    })
  })

  it('refuses to start anything but a planned scene', () => {
    const { g } = ready()
    expect(startScene(g, g.currentSceneId, defaultChoices({ leaving: [], coming: [] }), clock)).toBe(g)
    expect(startScene(g, 'nobody', defaultChoices({ leaving: [], coming: [] }), clock)).toBe(g)
  })

  it('previews what players will see, including what comes along', () => {
    const { g, id } = ready()
    const plan = startPlan(g, id)
    const choices = defaultChoices(plan)
    expect(playersWillSee(plan, choices)).toEqual({ seen: ['Grave Guard ×4'], hidden: 2 })
    const group = refKey(plan.leaving[1]!.ref)
    expect(playersWillSee(plan, { ...choices, fates: { ...choices.fates, [group]: 'along' } }).seen).toEqual(['Burglars ×3', 'Grave Guard ×4'])
  })

  it('previews a hidden item brought along as still hidden, and an environment never as opposition', () => {
    const { g, id } = ready()
    const plan = startPlan(g, id)
    const choices = defaultChoices(plan)
    const challenge = refKey(plan.leaving[2]!.ref)
    expect(plan.leaving[2]).toMatchObject({ name: 'Catch the van', hidden: true })
    expect(playersWillSee(plan, { ...choices, fates: { ...choices.fates, [challenge]: 'along' } })).toEqual({ seen: ['Grave Guard ×4'], hidden: 3 })
    // And it does stay hidden.
    const next = start(g, id, (c) => ({ ...c, fates: { ...c.fates, [challenge]: 'along' } }))
    expect(next.challenges.find((x) => x.name === 'Catch the van')?.hidden).toBe(true)
    const t = setEnvironment(createGame(), { name: 'Rooftop', hidden: false }, clock)
    const saved = savePlannedScene(t, undefined, draftOfNew(t), clock)
    const envPlan = startPlan(saved.game, saved.sceneId)
    expect(playersWillSee(envPlan, { ...defaultChoices(envPlan), fates: { [refKey(envPlan.leaving[0]!.ref)]: 'along' } })).toEqual({ seen: [], hidden: 0 })
  })

  it('never sends the next scene, set aside items or their names to players after it starts', () => {
    const { g, id } = ready()
    let later = savePlannedScene(g, undefined, { ...draftOfNew(g), name: 'The secret lair', notes: 'Twist ending' }, clock).game
    later = start(later, id)
    for (const audience of ['player', 'observer'] as const) {
      const view = project(later, audience)
      const sent = JSON.stringify(view)
      for (const secret of ['The secret lair', 'Twist ending', 'Furnace', 'Foundry Floor']) expect(sent).not.toContain(secret)
      expect(view.scene.number).toBe(2)
      expect(view.scene.total).toBeUndefined()
      expect(tableViewProblem(view)).toBeUndefined()
    }
  })
})

describe('starting a scene and status overrides', () => {
  it('clears them on and off the table, whatever the resets', () => {
    const t = table()
    const planned = savePlannedScene(t, undefined, { ...draftOfNew(t), rows: [] }, clock)
    const override = { die: 'd4' as const }
    const g: Game = { ...planned.game, villains: planned.game.villains.map((v) => ({ ...v, statusOverride: override })), offTable: { ...planned.game.offTable, villains: planned.game.villains.map((v) => ({ ...v, id: 'waiting', statusOverride: override })) }, aside: [{ ref: { kind: 'villain', id: 'waiting' } }] }
    const next = startScene(g, planned.sceneId, { ...defaultChoices(startPlan(g, planned.sceneId)), fates: { [refKey(villainRef(t))]: 'along' }, resets: { round: false, mods: false, once: false, twists: false } }, clock)
    expect(next.villains[0]!.statusOverride).toBeUndefined()
    expect(next.offTable.villains[0]!.statusOverride).toBeUndefined()
  })
})

describe('duplicating a game with scenes', () => {
  it('copies every scene back to planned, the first one current, with fresh play state', () => {
    const t = table()
    const villain = villainRef(t)
    const hurt: Game = { ...t, villains: t.villains.map((v) => ({ ...v, play: { ...v.play, health: 3 } })), challenges: t.challenges.map((c) => ({ ...c, steps: c.steps.map((x, i) => ({ ...x, done: i === 0 })) })) }
    const withEnv = setEnvironment(hurt, { name: 'Rooftop', hidden: false, twists: [{ id: 't', zone: 'green', kind: 'minor', text: 'x', used: { round: 1 } }] }, clock)
    const named = { ...withEnv, scenes: withEnv.scenes.map((s) => ({ ...s, name: 'Bank job' })) }
    const planned = savePlannedScene(named, undefined, { ...draftOfNew(named), name: 'Rooftop chase', rows: [] }, clock)
    let g: Game = { ...planned.game, round: 4 }
    g = startScene(g, planned.sceneId, { fates: { [refKey(villain)]: 'along', [refKey(groupRef(t))]: 'remove', [refKey(challengeRef(t))]: 'remove', [refKey({ kind: 'environment', id: g.environment!.id })]: 'remove' }, hidden: {}, resets: ALL_RESETS }, clock)
    const copy = duplicateGame(g, { id: 'copy' })
    expect(copy.scenes.map((s) => [s.name, s.state, s.position, s.summary])).toEqual([
      ['Bank job', 'now', 0, undefined],
      ['Rooftop chase', 'planned', 0, undefined],
    ])
    expect(copy.currentSceneId).toBe(copy.scenes[0]!.id)
    expect(copy.round).toBe(0)
    // Scene 1 had the villain, which came along and so still exists. What was removed is gone.
    expect(copy.villains.map((v) => v.id)).toEqual([villain.id])
    expect(copy.villains[0]!.play.health).toBeUndefined()
    expect(copy.groups).toEqual([])
    expect(copy.feed).toEqual([])
    expect(copy.turn.order.map((o) => o.id)).toEqual([villain.id])
  })

  it('gives an environment’s group to the GM unless the copy opens on that environment’s scene', () => {
    const owned = (g: Game): Game => ({ ...g, groups: g.groups.map((x) => ({ ...x, owner: { kind: 'environment' as const } })) })
    // The copy opens on the current scene: the environment and its group are both there.
    const here = duplicateGame(owned(setEnvironment(table(), { name: 'Rooftop', hidden: false }, clock)), { id: 'copy' })
    expect(here.environment?.name).toBe('Rooftop')
    expect(here.groups[0]!.owner).toEqual({ kind: 'environment' })
    // The current scene isn't the first: its group is in a planned scene, and will act on its own.
    const first = createGame()
    const { game, sceneId } = savePlannedScene(first, undefined, { ...draftOfNew(first), name: 'Second' }, clock)
    let later: Game = startScene(game, sceneId, defaultChoices(startPlan(game, sceneId)), clock)
    later = owned(addGroup(setEnvironment(later, { name: 'Rooftop', hidden: false }, clock), { kind: 'minions', name: 'Burglars', die: 'd6', count: 2, hidden: false }, clock))
    const copy = duplicateGame(later, { id: 'copy' })
    expect(copy.environment).toBeUndefined()
    expect(copy.groups).toEqual([])
    expect(copy.offTable.groups[0]!.owner).toEqual({ kind: 'gm' })
    expect(copy.scenes[1]).toMatchObject({ name: 'Second', state: 'planned', position: 0 })
    expect(copy.scenes[1]!.opposition.map((r) => r.ref.id)).toEqual([copy.offTable.groups[0]!.id])
    expect(copy.offTable.environments.map((e) => e.name)).toEqual(['Rooftop'])
  })

  it('resets groups, challenges and twists, and keeps a planned scene’s copies off the table', () => {
    let g: Game = table()
    g = setEnvironment(g, { name: 'Rooftop', hidden: true, twists: [{ id: 't', zone: 'green', kind: 'minor', text: 'x', used: { round: 1 } }] }, clock)
    g = { ...g, challenges: g.challenges.map((c) => ({ ...c, steps: c.steps.map((x, i) => ({ ...x, done: i === 0 })) })), groups: g.groups.map((x) => ({ ...x, members: x.members.map((m) => ({ ...m, acted: true, mods: [{ id: 'm', label: 'x', value: 1 }] })) })) }
    g = savePlannedScene(g, undefined, draftAddGroup(draftOfNew(g), { kind: 'minions', name: 'Later', die: 'd6', count: 1, hidden: true }, { kind: 'quick' }, clock), clock).game
    const copy = duplicateGame(g, { id: 'copy' })
    expect(copy.challenges[0]!.steps.map((x) => x.done)).toEqual([false, false, false])
    expect(copy.challenges[0]!.hidden).toBe(true)
    expect(copy.groups[0]!.members[0]).toMatchObject({ acted: false, mods: [] })
    expect(copy.environment).toMatchObject({ name: 'Rooftop', hidden: true })
    expect(copy.environment!.twists![0]!.used).toBeUndefined()
    expect(copy.offTable.groups.map((x) => x.name)).toEqual(['Later'])
  })
})
