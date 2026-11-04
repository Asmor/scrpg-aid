import { describe, expect, it } from 'vitest'
import { adaptiveBruiser } from '../test/villains'
import { createGame, currentScene, emptyOffTable, type Game } from './model'
import { project } from './project'
import { addAsideTo, asideChips, deleteScene, draftAddChallenge, draftAddGroup, draftAddVillain, draftOfCurrent, draftOfNew, draftOfPlanned, draftSetEnvironment, duplicateScene, gcOffTable, hasChanged, itemTitle, moveScene, moveToTable, removeAside, saveCurrentScene, savePlannedScene, sceneChips, sceneDetail, setAside, setSceneRecord, sourceText, trackerLine, waitingNote, type SceneDraft } from './scenes'
import { addChallenge, addGroup, addVillain, newEnvironment, setEnvironment, setTrackerPosition, startRound } from './table'

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
    expect(hasChanged({ ...g.challenges[0]!, steps: [true, false, false] }, challengeRef(g))).toBe(true)
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
