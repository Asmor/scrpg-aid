/**
 * A game's scenes (docs/design/scenes/spec.md): reading them for the Scenes tab, and the scene
 * editor's draft and what saving it does. Pure: each change takes the game and returns the new
 * one. What's on the table stays in ./table.ts; this moves things on and off it.
 *
 * The editor works on a draft, so Cancel leaves the game as it was. Library items are copied into
 * the draft's `copies` as they're added, and reach the game on Save.
 */
import { countsText, DEFAULT_TRACKER, trackerName, type TrackerCounts } from '../rules/trackers'
import { MAX_NAME } from '../session/protocol'
import type { Clock } from '../play/state'
import { villainDisplayName, type Villain } from '../villain/model'
import { villainSummary } from '../villain/play'
import { newId } from '../hero/model'
import { emptyPlay } from '../play/state'
import { clearDefenses } from '../play/defense'
import { emptyVillainPlay } from '../villain/play'
import { createScene, currentScene, emptyOffTable, gameDisplayName, sceneName, sceneNumber, trackerFromCounts, type Challenge, type EnvironmentOnTable, type Game, type NpcGroup, type OffTable, type OppositionRef, type Scene, type SceneItem, type SceneItemSource, type VillainInGame } from './model'
import { boxLabel, newChallenge, newGroup, newVillainCopy, placeEnvironment, removeFromTable, setHidden, setupScene, syncTurnOrder, withLog, type ChallengeSpec, type GroupSpec } from './table'

export const refKey = (ref: OppositionRef) => `${ref.kind}:${ref.id}`
export const sameRef = (a: OppositionRef, b: OppositionRef) => a.kind === b.kind && a.id === b.id

type AnyItem = VillainInGame | NpcGroup | Challenge | EnvironmentOnTable

function findIn(lists: Pick<OffTable, 'villains' | 'groups' | 'challenges'> & { environments: readonly EnvironmentOnTable[] }, ref: OppositionRef): AnyItem | undefined {
  switch (ref.kind) {
    case 'villain':
      return lists.villains.find((v) => v.id === ref.id)
    case 'group':
      return lists.groups.find((g) => g.id === ref.id)
    case 'challenge':
      return lists.challenges.find((c) => c.id === ref.id)
    case 'environment':
      return lists.environments.find((e) => e.id === ref.id)
  }
}

/** What's on the table's lists, as lists. */
const tableLists = (game: Game) => ({ villains: game.villains, groups: game.groups, challenges: game.challenges, environments: game.environment ? [game.environment] : [] })

export const isOnTable = (game: Game, ref: OppositionRef) => Boolean(findIn(tableLists(game), ref))

/** An item wherever it is in the game (or among a draft's new copies), if it's still there. */
export function findItem(game: Game, ref: OppositionRef, copies?: OffTable): AnyItem | undefined {
  return findIn(tableLists(game), ref) ?? findIn(game.offTable, ref) ?? (copies && findIn(copies, ref))
}

/** The opposition on the table: villains, then groups, then challenges. */
export function tableOpposition(game: Game): OppositionRef[] {
  return [...game.villains.map((v) => ({ kind: 'villain' as const, id: v.id })), ...game.groups.map((g) => ({ kind: 'group' as const, id: g.id })), ...game.challenges.map((c) => ({ kind: 'challenge' as const, id: c.id }))]
}

/** An item's name on a row or chip: "Gravelord", "Burglars ×3". */
export function itemTitle(item: AnyItem, ref: OppositionRef): string {
  if (ref.kind === 'villain') return villainDisplayName((item as VillainInGame).sheet)
  if (ref.kind === 'group') return `${(item as NpcGroup).name} ×${(item as NpcGroup).members.length}`
  return (item as Challenge | EnvironmentOnTable).name
}

/** An item's kind on a row: "Minions", "Challenge · 3 steps". */
export function itemKind(item: AnyItem, ref: OppositionRef): string {
  switch (ref.kind) {
    case 'villain':
      return 'Villain'
    case 'group':
      return (item as NpcGroup).kind === 'minions' ? 'Minions' : 'Lieutenants'
    case 'challenge': {
      const steps = (item as Challenge).steps.length
      return `Challenge · ${steps} ${steps === 1 ? 'step' : 'steps'}`
    }
    case 'environment':
      return 'Environment'
  }
}

/** A row's source tag. */
export function sourceText(source: SceneItemSource): string {
  switch (source.kind) {
    case 'library':
      return 'From library'
    case 'quick':
      return 'Quick added'
    case 'tag':
      return `Tagged ${source.tag}`
    case 'aside':
      return source.afterScene ? `Set aside after scene ${source.afterScene}` : 'Set aside'
  }
}

/** Where an item on the table came from: as the scene remembers it, or from what it is. */
function sourceOnTable(game: Game, ref: OppositionRef): SceneItemSource {
  const known = currentScene(game).opposition.find((i) => sameRef(i.ref, ref))?.source
  if (known) return known
  const item = findItem(game, ref)
  return ref.kind === 'villain' || (item && 'templateId' in item && item.templateId) ? { kind: 'library' } : { kind: 'quick' }
}

/** Whether an item has changed from its template: removing one that has asks first. */
export function hasChanged(item: AnyItem, ref: OppositionRef): boolean {
  switch (ref.kind) {
    case 'villain': {
      const { play } = item as VillainInGame
      return play.health !== undefined || play.mods.length > 0 || play.twists.length > 0
    }
    case 'group':
      return (item as NpcGroup).members.some((m) => m.mods.length > 0 || m.die !== (item as NpcGroup).members[0]!.die)
    case 'challenge':
      return (item as Challenge).steps.some(Boolean)
    case 'environment':
      return (item as EnvironmentOnTable).twists?.some((t) => t.used) ?? false
  }
}

// ---- The Scenes tab ----

/** "Standard · Yellow 1", "Prolonged · 3 / 5 / 3", "Standard · ended at Red 1". */
export function trackerLine(scene: Scene): string {
  const name = trackerName(scene.tracker)
  if (scene.state === 'planned') return `${name} · ${countsText(scene.tracker)}`
  const box = boxLabel(trackerFromCounts(scene.tracker), scene.position)
  return scene.state === 'done' ? `${name} · ended at ${box}` : `${name} · ${box}`
}

/** The scene's one line of detail: a done scene's summary; the current scene's environment and round; what a planned scene holds. */
export function sceneDetail(game: Game, scene: Scene): string {
  if (scene.state === 'done') return scene.summary ?? ''
  if (scene.state === 'now') return [game.environment?.name ?? 'No environment', game.round > 0 ? `round ${game.round}` : 'not started'].join(' · ')
  const env = scene.environmentId ? findItem(game, { kind: 'environment', id: scene.environmentId }) : undefined
  const items = scene.opposition.filter((i) => findItem(game, i.ref))
  const hidden = items.filter((i) => i.startHidden).length
  const counted = `${items.length} in the opposition${hidden ? `, ${hidden} start hidden` : ''}`
  return `${env ? (env as EnvironmentOnTable).name : 'No environment yet'} · ${counted}`
}

export interface SceneChip {
  key: string
  text: string
  hidden: boolean
}

/** " (1)", " (2)" for chips that would otherwise read the same, and nothing for the rest. */
function repeatNumbers(texts: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return texts.map((text) => {
    if (texts.indexOf(text) === texts.lastIndexOf(text)) return ''
    const n = (seen.get(text) ?? 0) + 1
    seen.set(text, n)
    return ` (${n})`
  })
}

/** The scene's opposition as chips. A done scene has none: it's what happened, in its summary. */
export function sceneChips(game: Game, scene: Scene): SceneChip[] {
  if (scene.state === 'done') return []
  const rows =
    scene.state === 'now'
      ? tableOpposition(game).flatMap((ref) => {
          const item = findItem(game, ref)
          return item ? [{ key: refKey(ref), title: itemTitle(item, ref), note: '', hidden: (item as { hidden: boolean }).hidden }] : []
        })
      : scene.opposition.flatMap((i) => {
          const item = findItem(game, i.ref)
          if (!item) return []
          const aside = game.aside.some((a) => sameRef(a.ref, i.ref))
          return [{ key: refKey(i.ref), title: itemTitle(item, i.ref), note: aside ? ' (set aside)' : '', hidden: i.startHidden }]
        })
  const numbers = repeatNumbers(rows.map((r) => r.title + r.note))
  return rows.map((r, i) => ({ key: r.key, text: `${r.title}${numbers[i]}${r.note}`, hidden: r.hidden }))
}

/** Scene numbers and names for the card and menus: "Scene 3" for an unnamed scene. */
export const sceneTitle = (game: Game, scene: Scene) => (scene.name.trim() ? sceneName(scene) : `Scene ${sceneNumber(game, scene.id)}`)

// ---- Moving things on and off the table ----

/** Drops off-table copies nothing refers to: no planned scene names them and they aren't set aside. */
export function gcOffTable(game: Game): Game {
  const planned = game.scenes.filter((s) => s.state === 'planned')
  const wanted = new Set([...game.aside.map((a) => refKey(a.ref)), ...planned.flatMap((s) => s.opposition.map((i) => refKey(i.ref))), ...planned.flatMap((s) => (s.environmentId ? [refKey({ kind: 'environment', id: s.environmentId })] : []))])
  const keep = (kind: OppositionRef['kind']) => (item: { id: string }) => wanted.has(refKey({ kind, id: item.id }))
  const { villains, groups, challenges, environments } = game.offTable
  return { ...game, offTable: { villains: villains.filter(keep('villain')), groups: groups.filter(keep('group')), challenges: challenges.filter(keep('challenge')), environments: environments.filter(keep('environment')) } }
}

/** Adds copies made while editing to the off-table pool. */
function withCopies(game: Game, copies: OffTable): Game {
  const { villains, groups, challenges, environments } = game.offTable
  return { ...game, offTable: { villains: [...villains, ...copies.villains], groups: [...groups, ...copies.groups], challenges: [...challenges, ...copies.challenges], environments: [...environments, ...copies.environments] } }
}

const logLine = (clock: Clock, text: string, gmOnly: boolean) => ({ id: clock.newId(), at: clock.now.toISOString(), by: 'GM', text, ...(gmOnly ? { gmOnly: true as const } : {}) })

/** Brings an off-table villain, group or challenge onto the table, and out of set aside. */
export function moveToTable(game: Game, ref: OppositionRef, hidden: boolean, clock: Clock): Game {
  const item = findIn(game.offTable, ref)
  if (!item || ref.kind === 'environment') return game
  const aside = game.aside.filter((a) => !sameRef(a.ref, ref))
  const { offTable } = game
  let next: Game
  if (ref.kind === 'villain') next = { ...game, aside, villains: [...game.villains, { ...(item as VillainInGame), hidden }], offTable: { ...offTable, villains: offTable.villains.filter((v) => v.id !== ref.id) } }
  else if (ref.kind === 'group') next = { ...game, aside, groups: [...game.groups, { ...(item as NpcGroup), hidden }], offTable: { ...offTable, groups: offTable.groups.filter((g) => g.id !== ref.id) } }
  else next = { ...game, aside, challenges: [...game.challenges, { ...(item as Challenge), hidden }], offTable: { ...offTable, challenges: offTable.challenges.filter((c) => c.id !== ref.id) } }
  const name = ref.kind === 'group' ? (item as NpcGroup).name : itemTitle(item, ref)
  return withLog(syncTurnOrder(next), [logLine(clock, hidden ? `The GM brought in ${name}, hidden from players.` : `${name} joined the table.`, hidden)])
}

/**
 * Moves a villain, group or challenge off the table and into set aside, with its play state. A
 * group becomes the GM's: the environment it came with may not be there when it returns.
 */
export function setAside(game: Game, ref: OppositionRef, afterScene: number | undefined, clock: Clock): Game {
  const item = findIn(tableLists(game), ref)
  if (!item || ref.kind === 'environment') return game
  const entry = { ref, ...(afterScene ? { afterScene } : {}) }
  const aside = [...game.aside.filter((a) => !sameRef(a.ref, ref)), entry]
  const { offTable } = game
  let next: Game
  if (ref.kind === 'villain') next = { ...game, aside, villains: game.villains.filter((v) => v.id !== ref.id), offTable: { ...offTable, villains: [...offTable.villains, item as VillainInGame] } }
  else if (ref.kind === 'group') next = { ...game, aside, groups: game.groups.filter((g) => g.id !== ref.id), offTable: { ...offTable, groups: [...offTable.groups, { ...(item as NpcGroup), owner: { kind: 'gm' } }] } }
  else next = { ...game, aside, challenges: game.challenges.filter((c) => c.id !== ref.id), offTable: { ...offTable, challenges: [...offTable.challenges, item as Challenge] } }
  const hidden = (item as { hidden: boolean }).hidden
  const name = ref.kind === 'group' ? (item as NpcGroup).name : itemTitle(item, ref)
  return withLog(syncTurnOrder(next), [logLine(clock, `${name} left the table.`, hidden)])
}

// ---- The scene editor ----

/** What the editor changes, until Save. `startHidden` on a row is its Hidden checkbox. */
export interface SceneDraft {
  name: string
  tracker: TrackerCounts
  environment?: { id: string; hidden: boolean }
  rows: SceneItem[]
  notes: string
  /** Copies made while editing (library items and quick adds), which reach the game on Save. */
  copies: OffTable
}

/** The current scene as the editor starts: what's on the table. */
export function draftOfCurrent(game: Game): SceneDraft {
  const scene = currentScene(game)
  return {
    name: scene.name,
    tracker: { ...scene.tracker },
    ...(game.environment ? { environment: { id: game.environment.id, hidden: game.environment.hidden } } : {}),
    rows: tableOpposition(game).map((ref) => ({ ref, startHidden: (findItem(game, ref) as { hidden: boolean }).hidden, source: sourceOnTable(game, ref) })),
    notes: scene.notes,
    copies: emptyOffTable(),
  }
}

/**
 * Saves the editor's changes to the current scene, which apply to the table at once. `restart`
 * sends the tracker back to its first box; otherwise it stays, clamped to the new length. A
 * removed item that came from set aside goes back there; anything else leaves the game.
 */
export function saveCurrentScene(game: Game, draft: SceneDraft, restart: boolean, clock: Clock): Game {
  let next = withCopies(setupScene(game, { name: draft.name, counts: draft.tracker, reset: restart }, clock), draft.copies)
  const number = sceneNumber(game, game.currentSceneId)
  for (const ref of tableOpposition(next)) {
    if (draft.rows.some((r) => sameRef(r.ref, ref))) continue
    const source = sourceOnTable(next, ref)
    next = source.kind === 'aside' ? setAside(next, ref, source.afterScene ?? number, clock) : removeFromTable(next, ref, clock)
  }
  for (const row of draft.rows) next = isOnTable(next, row.ref) ? setHidden(next, row.ref, row.startHidden, clock) : moveToTable(next, row.ref, row.startHidden, clock)
  const env = draft.environment
  if (!env) {
    if (next.environment) next = removeFromTable(next, { kind: 'environment', id: next.environment.id }, clock)
  } else if (next.environment?.id === env.id) {
    next = setHidden(next, { kind: 'environment', id: env.id }, env.hidden, clock)
  } else {
    const coming = next.offTable.environments.find((e) => e.id === env.id)
    if (coming) next = placeEnvironment(next, { ...coming, hidden: env.hidden }, clock)
  }
  const saved = { ...next, scenes: next.scenes.map((s) => (s.id === next.currentSceneId ? { ...s, notes: draft.notes, opposition: draft.rows } : s)) }
  return gcOffTable(saved)
}

/** The next planned scene's draft: "Scene 3" on the Standard tracker. */
export function draftOfNew(game: Game): SceneDraft {
  return { name: `Scene ${game.scenes.length + 1}`, tracker: { ...DEFAULT_TRACKER }, rows: [], notes: '', copies: emptyOffTable() }
}

/** A planned scene's draft. An environment with its Hidden choice, and rows for what's still in the game. */
export function draftOfPlanned(game: Game, sceneId: string): SceneDraft {
  const scene = game.scenes.find((s) => s.id === sceneId)
  if (!scene) return draftOfNew(game)
  const env = scene.environmentId && findItem(game, { kind: 'environment', id: scene.environmentId }) ? { environment: { id: scene.environmentId, hidden: scene.environmentHidden ?? true } } : {}
  return { name: scene.name, tracker: { ...scene.tracker }, ...env, rows: scene.opposition.filter((i) => findItem(game, i.ref)), notes: scene.notes, copies: emptyOffTable() }
}

/** The id of a villain's copy already in the game or the draft, if any: there's one copy per game. */
function villainCopyId(game: Game, draft: SceneDraft, sourceId: string): string | undefined {
  return [...game.villains, ...game.offTable.villains, ...draft.copies.villains].find((v) => v.sourceId === sourceId)?.id
}

const withRow = (draft: SceneDraft, row: SceneItem): SceneDraft => (draft.rows.some((r) => sameRef(r.ref, row.ref)) ? draft : { ...draft, rows: [...draft.rows, row] })

/** Adds a villain: the copy this game already has, keeping its Health, or a new one. */
export function draftAddVillain(game: Game, draft: SceneDraft, villain: Villain, options: { heroCount?: number; source: SceneItemSource; hidden: boolean }, clock: Clock): SceneDraft {
  const known = villainCopyId(game, draft, villain.id)
  if (known) return withRow(draft, { ref: { kind: 'villain', id: known }, startHidden: options.hidden, source: options.source })
  const copy = newVillainCopy(villain, options.hidden, options.heroCount, clock)
  return withRow({ ...draft, copies: { ...draft.copies, villains: [...draft.copies.villains, copy] } }, { ref: { kind: 'villain', id: copy.id }, startHidden: options.hidden, source: options.source })
}

export function draftAddGroup(draft: SceneDraft, group: GroupSpec, source: SceneItemSource, clock: Clock): SceneDraft {
  const made = newGroup(group, clock)
  return made ? withRow({ ...draft, copies: { ...draft.copies, groups: [...draft.copies.groups, made] } }, { ref: { kind: 'group', id: made.id }, startHidden: group.hidden, source }) : draft
}

export function draftAddChallenge(draft: SceneDraft, challenge: ChallengeSpec, source: SceneItemSource, clock: Clock): SceneDraft {
  const made = newChallenge(challenge, clock)
  return made ? withRow({ ...draft, copies: { ...draft.copies, challenges: [...draft.copies.challenges, made] } }, { ref: { kind: 'challenge', id: made.id }, startHidden: challenge.hidden, source }) : draft
}

/** Uses a newly made environment copy for the scene. A previous new copy the draft isn't using any more goes. */
export function draftSetEnvironment(draft: SceneDraft, environment: EnvironmentOnTable): SceneDraft {
  const environments = [...draft.copies.environments.filter((e) => e.id !== draft.environment?.id), environment]
  return { ...draft, copies: { ...draft.copies, environments }, environment: { id: environment.id, hidden: environment.hidden } }
}

/** Saves a planned scene, or a new one at the end of the list when no scene has `sceneId` (which it then takes). Returns the scene's id too. */
export function savePlannedScene(game: Game, sceneId: string | undefined, draft: SceneDraft, clock: Clock): { game: Game; sceneId: string } {
  const before = sceneId ? game.scenes.find((s) => s.id === sceneId) : undefined
  const base = before ?? createScene({ id: sceneId ?? clock.newId() })
  const { environmentId: _, environmentHidden: __, ...rest } = base
  const scene: Scene = {
    ...rest,
    name: draft.name.trim().slice(0, MAX_NAME),
    tracker: { ...draft.tracker },
    ...(draft.environment ? { environmentId: draft.environment.id, environmentHidden: draft.environment.hidden } : {}),
    opposition: draft.rows,
    notes: draft.notes,
  }
  const scenes = before ? game.scenes.map((s) => (s.id === scene.id ? scene : s)) : [...game.scenes, scene]
  return { game: gcOffTable({ ...withCopies(game, draft.copies), scenes }), sceneId: scene.id }
}

// ---- The list of scenes ----

/** Moves a planned scene to a place in the list; it stays among the planned scenes. */
export function moveScene(game: Game, sceneId: string, toIndex: number): Game {
  const from = game.scenes.findIndex((s) => s.id === sceneId)
  const first = game.scenes.findIndex((s) => s.state === 'planned')
  if (from < 0 || game.scenes[from]!.state !== 'planned') return game
  const to = Math.max(first, Math.min(toIndex, game.scenes.length - 1))
  if (to === from) return game
  const scenes = [...game.scenes]
  const [moved] = scenes.splice(from, 1)
  scenes.splice(to, 0, moved!)
  return { ...game, scenes }
}

/**
 * A copy of a planned scene right after it, with fresh copies of its groups and challenges. A
 * villain has one copy per game, and what's set aside stays one thing, so those are shared.
 */
export function duplicateScene(game: Game, sceneId: string, clock: Clock): Game {
  const index = game.scenes.findIndex((s) => s.id === sceneId)
  const scene = game.scenes[index]
  if (!scene || scene.state !== 'planned') return game
  const copies = emptyOffTable()
  const opposition = scene.opposition.flatMap((row): SceneItem[] => {
    const item = findItem(game, row.ref)
    if (!item) return []
    if (row.ref.kind === 'group' && row.source.kind !== 'aside') {
      const id = clock.newId()
      copies.groups.push({ ...(item as NpcGroup), id, members: (item as NpcGroup).members.map((m) => ({ ...m, id: clock.newId() })) })
      return [{ ...row, ref: { kind: 'group', id } }]
    }
    if (row.ref.kind === 'challenge' && row.source.kind !== 'aside') {
      const id = clock.newId()
      copies.challenges.push({ ...(item as Challenge), id })
      return [{ ...row, ref: { kind: 'challenge', id } }]
    }
    return [row]
  })
  const copy: Scene = { ...scene, id: clock.newId(), name: `${sceneName(scene)} (copy)`.slice(0, MAX_NAME), opposition }
  return { ...withCopies(game, copies), scenes: [...game.scenes.slice(0, index + 1), copy, ...game.scenes.slice(index + 1)] }
}

/** Deletes a planned scene. What only it held goes too; what's set aside stays set aside. */
export function deleteScene(game: Game, sceneId: string): Game {
  const scene = game.scenes.find((s) => s.id === sceneId)
  if (!scene || scene.state !== 'planned') return game
  return gcOffTable({ ...game, scenes: game.scenes.filter((s) => s.id !== sceneId) })
}

/** A done scene's summary and notes, the only things about it that still change. */
export function setSceneRecord(game: Game, sceneId: string, record: { summary: string; notes: string }): Game {
  return { ...game, scenes: game.scenes.map((s) => (s.id === sceneId && s.state === 'done' ? { ...s, summary: record.summary, notes: record.notes } : s)) }
}

// ---- Set aside ----

export interface AsideChip {
  ref: OppositionRef
  afterScene?: number
  /** "Ironclad · 41 / 75", "Bank guards · 3". */
  text: string
  name: string
  /** The numbers of the planned scenes already holding it. */
  plannedFor: number[]
}

/** "Planned for scene 3", "Planned for scenes 3 and 4", or nothing. */
export function plannedForText(numbers: readonly number[]): string {
  if (numbers.length === 0) return ''
  if (numbers.length === 1) return `Planned for scene ${numbers[0]}`
  return `Planned for scenes ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`
}

/** What's set aside, each with its Health or count and the planned scenes holding it. */
export function asideChips(game: Game): AsideChip[] {
  const chips = game.aside.flatMap((entry): AsideChip[] => {
    const item = findIn(game.offTable, entry.ref)
    if (!item) return []
    const plannedFor = game.scenes
      .filter((s) => s.state === 'planned' && (s.opposition.some((i) => sameRef(i.ref, entry.ref)) || (entry.ref.kind === 'environment' && s.environmentId === entry.ref.id)))
      .map((s) => sceneNumber(game, s.id))
    const base = { ref: entry.ref, plannedFor, ...(entry.afterScene ? { afterScene: entry.afterScene } : {}) }
    if (entry.ref.kind === 'villain') {
      const copy = item as VillainInGame
      const { name, health, maxHealth } = villainSummary(copy.sheet, copy.play)
      return [{ ...base, name, text: health !== undefined ? `${name} · ${health} / ${maxHealth}` : name }]
    }
    if (entry.ref.kind === 'group') {
      const group = item as NpcGroup
      return [{ ...base, name: group.name, text: `${group.name} · ${group.members.length}` }]
    }
    const named = item as Challenge | EnvironmentOnTable
    return [{ ...base, name: named.name, text: named.name }]
  })
  const numbers = repeatNumbers(chips.map((c) => c.text))
  return chips.map((c, i) => ({ ...c, text: `${c.text}${numbers[i]}`, name: `${c.name}${numbers[i]}` }))
}

/** Adds something set aside to a planned scene (it stays set aside until it reaches the table), or brings it on now, hidden. */
export function addAsideTo(game: Game, ref: OppositionRef, sceneId: string, clock: Clock): Game {
  const entry = game.aside.find((a) => sameRef(a.ref, ref))
  if (!entry) return game
  const source: SceneItemSource = { kind: 'aside', ...(entry.afterScene ? { afterScene: entry.afterScene } : {}) }
  if (sceneId === game.currentSceneId) {
    if (ref.kind === 'environment') {
      const coming = findIn(game.offTable, ref) as EnvironmentOnTable | undefined
      if (!coming) return game
      return placeEnvironment({ ...game, aside: game.aside.filter((a) => a !== entry) }, { ...coming, hidden: true }, clock)
    }
    const moved = moveToTable(game, ref, true, clock)
    return { ...moved, scenes: moved.scenes.map((s) => (s.id === sceneId ? { ...s, opposition: [...s.opposition.filter((i) => !sameRef(i.ref, ref)), { ref, startHidden: true, source }] } : s)) }
  }
  return {
    ...game,
    scenes: game.scenes.map((s) => {
      if (s.id !== sceneId || s.state !== 'planned') return s
      if (ref.kind === 'environment') return { ...s, environmentId: ref.id, environmentHidden: true }
      return s.opposition.some((i) => sameRef(i.ref, ref)) ? s : { ...s, opposition: [...s.opposition, { ref, startHidden: false, source }] }
    }),
  }
}

/** Removes something set aside from the game, and from any scene planning on it. */
export function removeAside(game: Game, ref: OppositionRef, clock: Clock): Game {
  const item = findIn(game.offTable, ref)
  if (!item) return game
  const scenes = game.scenes.map((s) => {
    if (s.state !== 'planned') return s
    const opposition = s.opposition.filter((i) => !sameRef(i.ref, ref))
    if (ref.kind === 'environment' && s.environmentId === ref.id) {
      const { environmentId: _, environmentHidden: __, ...rest } = s
      return { ...rest, opposition }
    }
    return { ...s, opposition }
  })
  const without = gcOffTable({ ...game, scenes, aside: game.aside.filter((a) => !sameRef(a.ref, ref)) })
  return withLog(without, [logLine(clock, `${ref.kind === 'group' ? (item as NpcGroup).name : itemTitle(item, ref)} left the game.`, true)])
}

// ---- What the Bring in tab says ----

/** Where a library item's copy is waiting: "Planned for scene 3", "Set aside", or nothing. */
export function waitingNote(game: Game, kind: string, sourceId: string): string | undefined {
  const matches = (ref: OppositionRef): boolean => {
    const item = findIn(game.offTable, ref)
    if (!item) return false
    if (kind === 'villain') return ref.kind === 'villain' && (item as VillainInGame).sourceId === sourceId
    if (kind === 'minion' || kind === 'lieutenant') return ref.kind === 'group' && (item as NpcGroup).templateId === sourceId && (item as NpcGroup).kind === (kind === 'minion' ? 'minions' : 'lieutenants')
    if (kind === 'challenge') return ref.kind === 'challenge' && (item as Challenge).templateId === sourceId
    return kind === 'environment' && ref.kind === 'environment' && (item as EnvironmentOnTable).templateId === sourceId
  }
  const scene = game.scenes.find((s) => s.state === 'planned' && (s.opposition.some((i) => matches(i.ref)) || (s.environmentId !== undefined && matches({ kind: 'environment', id: s.environmentId }))))
  if (scene) return `Planned for scene ${sceneNumber(game, scene.id)}`
  return game.aside.some((a) => matches(a.ref)) ? 'Set aside' : undefined
}

// ---- Starting the next scene ----

/** What happens to something leaving the table. */
export type Fate = 'aside' | 'remove' | 'along'

export interface SceneResets {
  /** Round 0, nobody has acted, every reaction ready. */
  round: boolean
  /** Every bonus and penalty on what stays at the table. */
  mods: boolean
  /** Each villain's once-per-scene Overcome that advances the tracker (p. 154). */
  once: boolean
  /** Every environment twist unmarked. */
  twists: boolean
}

export interface StartChoices {
  /** Each leaving item's fate, by refKey. */
  fates: Record<string, Fate>
  /** Each incoming item's Hidden, by refKey. */
  hidden: Record<string, boolean>
  resets: SceneResets
}

export interface LeavingItem {
  ref: OppositionRef
  name: string
  kind: string
  fate: Fate
  /** Hidden now: brought along, it stays that way. */
  hidden: boolean
}

export interface ComingItem {
  ref: OppositionRef
  name: string
  kind: string
  hidden: boolean
  fromAside: boolean
}

export interface StartPlan {
  leaving: LeavingItem[]
  /** The environment being replaced, and by what. It has no choice. */
  replaced?: { name: string; by: string }
  coming: ComingItem[]
}

/** Whether a planned scene other than `except` still names this item. */
function plannedLater(game: Game, ref: OppositionRef, except: string): boolean {
  return game.scenes.some((s) => s.state === 'planned' && s.id !== except && (s.opposition.some((i) => sameRef(i.ref, ref)) || (ref.kind === 'environment' && s.environmentId === ref.id)))
}

/** What starting a scene would do, for its dialog: what's leaving, each with its default fate, and what's coming in as planned. */
export function startPlan(game: Game, nextId: string): StartPlan {
  const next = game.scenes.find((s) => s.id === nextId)
  if (!next) return { leaving: [], coming: [] }
  const envRef = next.environmentId ? ({ kind: 'environment', id: next.environmentId } as const) : undefined
  const nextEnv = envRef && (findItem(game, envRef) as EnvironmentOnTable | undefined)
  const keptEnv = Boolean(nextEnv && game.environment?.id === nextEnv.id)
  const leaving: LeavingItem[] = tableOpposition(game)
    .filter((ref) => !next.opposition.some((i) => sameRef(i.ref, ref)))
    .map((ref) => {
      const item = findItem(game, ref)!
      // A villain keeps; so does what a later scene needs. An environment staying keeps its groups with it.
      const owned = ref.kind === 'group' && (item as NpcGroup).owner.kind === 'environment'
      const fate: Fate = owned && keptEnv ? 'along' : ref.kind === 'villain' || plannedLater(game, ref, nextId) ? 'aside' : 'remove'
      return { ref, name: itemTitle(item, ref), kind: itemKind(item, ref), fate, hidden: (item as { hidden: boolean }).hidden }
    })
  const old = game.environment
  let replaced: StartPlan['replaced']
  if (old && !keptEnv) {
    const ref = { kind: 'environment' as const, id: old.id }
    if (nextEnv) replaced = { name: old.name, by: nextEnv.name }
    else leaving.push({ ref, name: old.name, kind: 'Environment', fate: plannedLater(game, ref, nextId) ? 'aside' : 'remove', hidden: old.hidden })
  }
  const coming: ComingItem[] = next.opposition.flatMap((row) => {
    const item = findItem(game, row.ref)
    if (!item) return []
    return [{ ref: row.ref, name: itemTitle(item, row.ref), kind: itemKind(item, row.ref), hidden: row.startHidden, fromAside: game.aside.some((a) => sameRef(a.ref, row.ref)) }]
  })
  if (nextEnv && envRef) coming.push({ ref: envRef, name: nextEnv.name, kind: 'Environment', hidden: next.environmentHidden ?? true, fromAside: game.aside.some((a) => sameRef(a.ref, envRef)) })
  return { leaving, ...(replaced ? { replaced } : {}), coming }
}

export const ALL_RESETS: SceneResets = { round: true, mods: true, once: true, twists: true }

/** The dialog's starting choices. */
export function defaultChoices(plan: StartPlan): StartChoices {
  return { fates: Object.fromEntries(plan.leaving.map((l) => [refKey(l.ref), l.fate])), hidden: Object.fromEntries(plan.coming.map((c) => [refKey(c.ref), c.hidden])), resets: { ...ALL_RESETS } }
}

function unusedTwists(env: EnvironmentOnTable): EnvironmentOnTable {
  if (!env.twists) return env
  return {
    ...env,
    twists: env.twists.map((t) => {
      const { used: _, ...rest } = t
      return rest
    }),
  }
}

function withoutOverride(villain: VillainInGame): VillainInGame {
  const { statusOverride: _, ...rest } = villain
  return rest
}

/** Applies the checked resets. `arrived` keep their bonuses and penalties: they were prepped, or left with them. */
function applyResets(game: Game, resets: SceneResets, arrived: ReadonlySet<string>): Game {
  const heroes = game.heroes.map((h) => {
    let play = h.play
    if (resets.round) play = { ...clearDefenses(play), reactionUsed: false, ...(play.minions ? { minions: play.minions.map((m) => clearDefenses(m)) } : {}) }
    if (resets.mods) play = { ...play, mods: [], ...(play.minions ? { minions: play.minions.map((m) => ({ ...m, mods: [] })) } : {}) }
    return { ...h, play }
  })
  const villains = game.villains.map((v) => {
    let play = v.play
    if (resets.round) play = { ...clearDefenses(play), reactionUsed: false }
    if (resets.mods && !arrived.has(refKey({ kind: 'villain', id: v.id }))) play = { ...play, mods: [] }
    if (resets.once) {
      const { sceneAdvanced: _, ...rest } = play
      play = rest
    }
    // The new scene's counts start fresh (the villains and challenges spec, section 6).
    return withoutOverride({ ...v, play })
  })
  const groups = game.groups.map((g) => ({
    ...g,
    members: g.members.map((m) => {
      let member = m
      if (resets.round) member = { ...clearDefenses(member), acted: false }
      if (resets.mods && !arrived.has(refKey({ kind: 'group', id: g.id }))) member = { ...member, mods: [] }
      return member
    }),
  }))
  const environment = resets.twists && game.environment ? { environment: unusedTwists(game.environment) } : {}
  const round = resets.round ? { round: 0, turn: { order: [], acted: [] } } : {}
  const offTable = { ...game.offTable, villains: game.offTable.villains.map(withoutOverride) }
  return { ...game, heroes, villains, groups, offTable, ...environment, ...round }
}

/**
 * Starts a planned scene: the current one becomes done, what's leaving goes where it was told to,
 * the new scene's items arrive with their Hidden choices, the checked resets apply, and the
 * tracker sits at its first box. The log gets one line: what became of things is the GM's.
 */
export function startScene(game: Game, nextId: string, choices: StartChoices, clock: Clock): Game {
  const next = game.scenes.find((s) => s.id === nextId)
  if (!next || next.state !== 'planned') return game
  const plan = startPlan(game, nextId)
  const previous = currentScene(game)
  const previousNumber = sceneNumber(game, previous.id)
  const record = draftOfCurrent(game).rows
  const hiddenOf = (ref: OppositionRef, fallback: boolean) => choices.hidden[refKey(ref)] ?? fallback
  let g = game

  // What's leaving.
  for (const item of plan.leaving) {
    const fate = choices.fates[refKey(item.ref)] ?? item.fate
    if (fate === 'along') continue
    if (item.ref.kind === 'environment') {
      const env = g.environment
      if (!env) continue
      const { environment: _, ...rest } = g
      g = fate === 'aside' ? { ...rest, aside: [...g.aside, { ref: item.ref, afterScene: previousNumber }], offTable: { ...g.offTable, environments: [...g.offTable.environments, env] } } : rest
    } else g = fate === 'aside' ? setAside(g, item.ref, previousNumber, clock) : removeFromTable(g, item.ref, clock)
  }

  // What's coming in, and what's staying with its Hidden choice.
  const arrived = new Set<string>()
  for (const row of next.opposition) {
    const hidden = hiddenOf(row.ref, row.startHidden)
    if (isOnTable(g, row.ref)) g = setHidden(g, row.ref, hidden, clock)
    else if (findItem(g, row.ref)) {
      arrived.add(refKey(row.ref))
      g = moveToTable(g, row.ref, hidden, clock)
    }
  }
  if (next.environmentId) {
    const ref = { kind: 'environment' as const, id: next.environmentId }
    const hidden = hiddenOf(ref, next.environmentHidden ?? true)
    if (isOnTable(g, ref)) g = setHidden(g, ref, hidden, clock)
    else {
      const coming = g.offTable.environments.find((e) => e.id === ref.id)
      // A replaced environment stays off the table only if a scene after this one names it.
      if (coming) g = placeEnvironment(g, { ...coming, hidden }, clock)
    }
  }
  // An environment gone takes its claim on its groups with it: they're the GM's now.
  if (g.environment?.id !== game.environment?.id) g = { ...g, groups: g.groups.map((x) => (x.owner.kind === 'environment' ? { ...x, owner: { kind: 'gm' as const } } : x)) }
  g = { ...g, aside: g.aside.filter((a) => !isOnTable(g, a.ref)) }

  // The scenes themselves.
  const summary = game.round > 0 ? `Ended after round ${game.round}.` : 'Ended before round 1.'
  const scenes = g.scenes.map((s): Scene => {
    if (s.id === previous.id) return { ...s, state: 'done', summary, opposition: record, ...(game.environment ? { environmentId: game.environment.id, environmentHidden: game.environment.hidden } : {}) }
    if (s.id === nextId) return { ...s, state: 'now', position: 0, opposition: next.opposition.map((row) => ({ ...row, startHidden: hiddenOf(row.ref, row.startHidden) })) }
    return s
  })
  g = syncTurnOrder(applyResets({ ...g, scenes, currentSceneId: nextId }, choices.resets, arrived))
  const name = next.name.trim()
  const text = `Scene ${sceneNumber(g, nextId)} began${name ? `: ${name}` : ''}.`
  return gcOffTable(withLog({ ...g, feed: game.feed }, [logLine(clock, text, false)]))
}

/** What players will see of the new scene, for the dialog's preview. */
export function playersWillSee(plan: StartPlan, choices: StartChoices): { seen: string[]; hidden: number } {
  const along = plan.leaving.filter((l) => (choices.fates[refKey(l.ref)] ?? l.fate) === 'along')
  const hiddenOf = (c: ComingItem) => choices.hidden[refKey(c.ref)] ?? c.hidden
  const shown = <T extends { ref: OppositionRef; name: string }>(items: readonly T[], hidden: (item: T) => boolean) => items.filter((i) => i.ref.kind !== 'environment' && !hidden(i)).map((i) => i.name)
  return { seen: [...shown(along, (l) => l.hidden), ...shown(plan.coming, hiddenOf)], hidden: along.filter((l) => l.hidden).length + plan.coming.filter(hiddenOf).length }
}

// ---- Duplicating a game ----

/**
 * A fresh copy of the setup to save as a new game (the Games page's Duplicate): a new id, "(copy)"
 * after the name, the same tags, round 0, every scene back to planned with the first one current,
 * no players (their heroes leave), everything at fresh play state, no requests and no log. The
 * GM's own heroes, the opposition and the notes stay, so a prepared game can be reused.
 */
export function duplicateGame(game: Game, options: { id?: string; now?: Date } = {}): Game {
  const timestamp = (options.now ?? new Date()).toISOString()
  const copy = structuredClone(game)
  const noClock: Clock = { now: options.now ?? new Date(), newId: () => newId() }
  // A copy is a new game: it gets its own code when it's first hosted.
  const { solo: _solo, code: _code, environment, ...rest } = copy
  // An environment's group only stays its own if the copy opens on the scene that has that environment.
  const opensOnCurrent = copy.scenes[0]?.id === copy.currentSceneId
  const freshGroup = (x: NpcGroup): NpcGroup => ({ ...x, ...(opensOnCurrent ? {} : { owner: { kind: 'gm' as const } }), members: x.members.map((m) => ({ ...clearDefenses(m), mods: [], acted: false })) })
  const freshChallenge = (x: Challenge): Challenge => ({ ...x, steps: x.steps.map(() => false) })
  const freshVillain = (x: VillainInGame): VillainInGame => ({ ...withoutOverride(x), play: emptyVillainPlay() })
  // Everything starts off the table, then the first scene brings its own on.
  const offTable: OffTable = {
    villains: [...copy.villains, ...copy.offTable.villains].map(freshVillain),
    groups: [...copy.groups, ...copy.offTable.groups].map(freshGroup),
    challenges: [...copy.challenges, ...copy.offTable.challenges].map(freshChallenge),
    environments: [...(environment ? [environment] : []), ...copy.offTable.environments].map(unusedTwists),
  }
  const tableRows = (): SceneItem[] => {
    const hiddenRow = (ref: OppositionRef, hidden: boolean): SceneItem => ({ ref, startHidden: hidden, source: copy.scenes.find((s) => s.id === copy.currentSceneId)?.opposition.find((i) => sameRef(i.ref, ref))?.source ?? { kind: 'library' } })
    return [...copy.villains.map((v) => hiddenRow({ kind: 'villain', id: v.id }, v.hidden)), ...copy.groups.map((x) => hiddenRow({ kind: 'group', id: x.id }, x.hidden)), ...copy.challenges.map((c) => hiddenRow({ kind: 'challenge', id: c.id }, c.hidden))]
  }
  const scenes = copy.scenes.map((s, i): Scene => {
    const { summary: _summary, ...scene } = s
    // The current scene's items are what's on the table now.
    const now = s.id === copy.currentSceneId
    const base: Scene = now ? { ...scene, opposition: tableRows(), ...(environment ? { environmentId: environment.id, environmentHidden: environment.hidden } : {}) } : scene
    return { ...base, position: 0, state: i === 0 ? 'now' : 'planned' }
  })
  const first = scenes[0]!
  let g: Game = {
    ...rest,
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: `${gameDisplayName(copy)} (copy)`,
    scenes,
    currentSceneId: first.id,
    round: 0,
    turn: { order: [], acted: [] },
    heroes: copy.heroes.filter((h) => !h.player).map((h) => ({ ...h, play: emptyPlay() })),
    villains: [],
    groups: [],
    challenges: [],
    offTable,
    pendingSyncs: [],
    feed: [],
  }
  delete g.pendingHits
  for (const row of first.opposition) g = moveToTable(g, row.ref, row.startHidden, noClock)
  const env = first.environmentId ? g.offTable.environments.find((e) => e.id === first.environmentId) : undefined
  if (env) g = placeEnvironment(g, { ...env, hidden: first.environmentHidden ?? true }, noClock)
  return gcOffTable(syncTurnOrder({ ...g, aside: g.aside.filter((a) => !isOnTable(g, a.ref)), feed: [] }))
}
