/**
 * A game's scenes (docs/design/scenes/spec.md): reading them for the Scenes tab, and the scene
 * editor's draft and what saving it does. Pure: each change takes the game and returns the new
 * one. What's on the table stays in ./table.ts; this moves things on and off it.
 *
 * The editor works on a draft, so Cancel leaves the game as it was. Library items are copied into
 * the draft's `copies` as they're added, and reach the game on Save.
 */
import { countsText, trackerName, type TrackerCounts } from '../rules/trackers'
import type { Clock } from '../play/state'
import { villainDisplayName } from '../villain/model'
import { currentScene, emptyOffTable, sceneName, sceneNumber, trackerFromCounts, type Challenge, type EnvironmentOnTable, type Game, type NpcGroup, type OffTable, type OppositionRef, type Scene, type SceneItem, type SceneItemSource, type VillainInGame } from './model'
import { boxLabel, placeEnvironment, removeFromTable, setHidden, setupScene, syncTurnOrder, withLog } from './table'

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

/** The scene's opposition as chips. A done scene has none: it's what happened, in its summary. */
export function sceneChips(game: Game, scene: Scene): SceneChip[] {
  if (scene.state === 'done') return []
  if (scene.state === 'now') {
    return tableOpposition(game).flatMap((ref) => {
      const item = findItem(game, ref)
      return item ? [{ key: refKey(ref), text: itemTitle(item, ref), hidden: (item as { hidden: boolean }).hidden }] : []
    })
  }
  return scene.opposition.flatMap((i) => {
    const item = findItem(game, i.ref)
    if (!item) return []
    const aside = i.source.kind === 'aside' && !isOnTable(game, i.ref)
    return [{ key: refKey(i.ref), text: `${itemTitle(item, i.ref)}${aside ? ' (set aside)' : ''}`, hidden: i.startHidden }]
  })
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
