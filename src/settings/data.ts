/**
 * Settings' Data section (scrpg-aid-designs/settings/spec.md, section 7): one backup of everything on this
 * device, and restoring one, added to what's here or in place of it.
 */
import { heroDisplayName, type Hero } from '../hero/model'
import type { JoinedStore, JoinedGame } from '../game/joined-store'
import { gameDisplayName, type Game } from '../game/model'
import { nameList } from '../game/names'
import { isSoloGameId } from '../game/solo'
import type { GameStore } from '../game/store'
import type { HeroStore } from '../hero/store'
import type { SavedSearch, SavedSearchStore } from '../library/saved-searches'
import { emptyTemplateLists, TEMPLATE_LIST_KEYS, type TemplateLists } from '../template/lists'
import type { TemplateStores } from '../template/store'
import { backupJson, readImport, BACKUP_FORMAT } from '../transfer/files'
import { villainDisplayName, type Villain } from '../villain/model'
import type { VillainStore } from '../villain/store'
import type { Settings } from './model'

export interface DataStores {
  heroes: HeroStore
  villains: VillainStore
  games: GameStore
  templates?: TemplateStores | null
  searches?: SavedSearchStore | null
  joined?: JoinedStore | null
}

/** Everything a backup holds. */
export interface Contents {
  heroes: Hero[]
  villains: Villain[]
  games: Game[]
  savedSearches: SavedSearch[]
  templates: TemplateLists
  joined: JoinedGame[]
  settings?: Settings
}

const TEMPLATE_STORE: Record<(typeof TEMPLATE_LIST_KEYS)[number], keyof TemplateStores> = { minionTemplates: 'minions', lieutenantTemplates: 'lieutenants', challengeTemplates: 'challenges', environmentTemplates: 'environments' }

/** A kind of thing in a backup: how to list what's stored, name one, and save or remove it. */
interface Kind {
  label: string
  docs: (c: Contents) => readonly { id: string }[]
  name: (doc: never) => string
  /** The ids stored now, the unreadable among them, so nothing overwrites something it can't see. */
  ids: (s: DataStores) => Promise<string[]>
  save: (s: DataStores, doc: never) => Promise<void>
  remove: (s: DataStores, id: string) => Promise<void>
}

const templateKinds: Kind[] = TEMPLATE_LIST_KEYS.map((key) => {
  const store = (s: DataStores) => s.templates?.[TEMPLATE_STORE[key]]
  return {
    label: { minionTemplates: 'minion templates', lieutenantTemplates: 'lieutenant templates', challengeTemplates: 'challenge templates', environmentTemplates: 'environment templates' }[key],
    docs: (c: Contents) => c.templates[key] as readonly { id: string }[],
    name: (doc: { name: string }) => doc.name || 'Unnamed',
    ids: async (s: DataStores) => {
      const list = await store(s)?.list()
      return list ? [...list.docs.map((d) => d.id), ...list.unreadable.map((u) => u.id)] : []
    },
    save: async (s: DataStores, doc: never) => {
      await (store(s) as { save: (d: unknown) => Promise<void> } | undefined)?.save(doc)
    },
    remove: async (s: DataStores, id: string) => {
      await store(s)?.remove(id)
    },
  } as Kind
})

const KINDS: readonly Kind[] = [
  {
    label: 'heroes',
    docs: (c) => c.heroes,
    name: (h: Hero) => heroDisplayName(h),
    ids: async (s) => {
      const l = await s.heroes.list()
      return [...l.heroes.map((h) => h.id), ...l.unreadable.map((u) => u.id)]
    },
    save: (s, h: Hero) => s.heroes.save(h),
    remove: (s, id) => s.heroes.remove(id),
  } as Kind,
  {
    label: 'villains',
    docs: (c) => c.villains,
    name: (v: Villain) => villainDisplayName(v),
    ids: async (s) => {
      const l = await s.villains.list()
      return [...l.villains.map((v) => v.id), ...l.unreadable.map((u) => u.id)]
    },
    save: (s, v: Villain) => s.villains.save(v),
    remove: (s, id) => s.villains.remove(id),
  } as Kind,
  ...templateKinds,
  {
    label: 'games',
    docs: (c) => c.games,
    name: (g: Game) => (g.solo ? `Solo play · ${gameDisplayName(g)}` : gameDisplayName(g)),
    ids: async (s) => {
      const l = await s.games.list()
      return [...l.games.map((g) => g.id), ...l.unreadable.map((u) => u.id)]
    },
    save: (s, g: Game) => s.games.save(g),
    remove: (s, id) => s.games.remove(id),
  } as Kind,
  {
    label: 'joined games',
    docs: (c) => c.joined,
    name: (j: JoinedGame) => gameDisplayName(j.table),
    ids: async (s) => (await s.joined?.list())?.map((j) => j.id) ?? [],
    save: async (s, j: JoinedGame) => {
      await s.joined?.save(j)
    },
    remove: async (s, id) => {
      await s.joined?.remove(id)
    },
  } as Kind,
  {
    label: 'saved searches',
    docs: (c) => c.savedSearches,
    name: (x: SavedSearch) => x.name,
    ids: async (s) => {
      const l = await s.searches?.list()
      return l ? [...l.searches.map((x) => x.id), ...l.unreadable.map((u) => u.id)] : []
    },
    save: async (s, x: SavedSearch) => {
      await s.searches?.save(x)
    },
    remove: async (s, id) => {
      await s.searches?.remove(id)
    },
  } as Kind,
]

/** Reads everything on this device. */
export async function readEverything(stores: DataStores, settings: Settings): Promise<Contents> {
  const [heroes, villains, games, searches, joined] = await Promise.all([stores.heroes.list(), stores.villains.list(), stores.games.list(), stores.searches?.list(), stores.joined?.list()])
  const templates = emptyTemplateLists()
  for (const key of TEMPLATE_LIST_KEYS) {
    const list = await stores.templates?.[TEMPLATE_STORE[key]].list()
    ;(templates[key] as unknown[]) = list ? [...list.docs] : []
  }
  return { heroes: heroes.heroes, villains: villains.villains, games: games.games, savedSearches: searches?.searches ?? [], templates, joined: joined ?? [], settings }
}

/** How much of each there is, for a file's list and for the storage line. */
export function contentCounts(c: Contents): { label: string; count: number }[] {
  return KINDS.map((k) => ({ label: k.label, count: k.docs(c).length })).filter((k) => k.count > 0)
}

/** "1 hero", "2 games". */
export function countText({ label, count }: { label: string; count: number }): string {
  if (count !== 1) return `${count} ${label}`
  const one = label === 'heroes' ? 'hero' : label === 'saved searches' ? 'saved search' : label.replace(/s$/, '')
  return `${count} ${one}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "1.2 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`
}

/** "This device holds 42 library items, 6 games and 3 joined games (1.2 MB)." Solo games belong to their characters. */
export function storageLine(c: Contents, bytes: number): string {
  const library = c.heroes.length + c.villains.length + TEMPLATE_LIST_KEYS.reduce((n, key) => n + c.templates[key].length, 0)
  const games = c.games.filter((g) => !isSoloGameId(g.id)).length
  return `This device holds ${plural(library, 'library item')}, ${plural(games, 'game')} and ${plural(c.joined.length, 'joined game')} (${sizeText(bytes)}).`
}

export const backupText = (c: Contents, now?: Date) => backupJson(c, now)
export const byteLength = (text: string) => new TextEncoder().encode(text).length

export type RestoreFile = { ok: true; contents: Contents; skipped: number; /** When the backup was made, if it says. */ exportedAt?: string } | { ok: false; error: string }

/** Reads a chosen file: only a backup restores. */
export function readRestoreFile(text: string): RestoreFile {
  let format: unknown
  try {
    format = (JSON.parse(text) as { format?: unknown } | null)?.format
  } catch {
    return { ok: false, error: "This file isn't a backup the app can read." }
  }
  if (format !== BACKUP_FORMAT) return { ok: false, error: "This file isn't a backup the app can read." }
  const result = readImport(text)
  if (!result.ok) return result
  const { heroes, villains, games, savedSearches, templates, joined = [], settings, skipped } = result
  const exportedAt = (JSON.parse(text) as { exportedAt?: unknown }).exportedAt
  return { ok: true, skipped: skipped.length, ...(typeof exportedAt === 'string' ? { exportedAt } : {}), contents: { heroes, villains, games, savedSearches, templates, joined, ...(settings ? { settings } : {}) } }
}

/** What adding would skip because its id is already here: each by kind and name. */
export async function alreadyHere(c: Contents, stores: DataStores): Promise<{ label: string; name: string }[]> {
  const out: { label: string; name: string }[] = []
  for (const kind of KINDS) {
    const here = new Set(await kind.ids(stores))
    for (const doc of kind.docs(c)) if (here.has(doc.id)) out.push({ label: kind.label, name: kind.name(doc as never) })
  }
  return out
}

/** Adds what's in the backup, skipping ids already here. Settings are the caller's choice. */
export async function restoreAdd(c: Contents, stores: DataStores): Promise<number> {
  let added = 0
  for (const kind of KINDS) {
    const here = new Set(await kind.ids(stores))
    for (const doc of kind.docs(c)) {
      if (here.has(doc.id)) continue
      await kind.save(stores, doc as never)
      added++
    }
  }
  return added
}

/** Everything here goes, the unreadable too, and the backup takes its place. */
export async function restoreReplace(c: Contents, stores: DataStores): Promise<void> {
  for (const kind of KINDS) for (const id of await kind.ids(stores)) await kind.remove(stores, id)
  for (const kind of KINDS) for (const doc of kind.docs(c)) await kind.save(stores, doc as never)
}

/** A row of the Restore dialog's table (scrpg-aid-designs/settings/spec.md, section 7): one kind, in the backup and already here. */
export interface RestoreRow {
  label: string
  inBackup: number
  /** In the backup with an id that's already on this device. */
  here: number
}

const TEMPLATE_LABELS = ['minion templates', 'lieutenant templates', 'challenge templates', 'environment templates']
const ROW_GROUPS: readonly { label: string; kinds: readonly string[] }[] = [
  { label: 'Heroes', kinds: ['heroes'] },
  { label: 'Villains', kinds: ['villains'] },
  { label: 'Minion, lieutenant, challenge and environment templates', kinds: TEMPLATE_LABELS },
  { label: 'Games', kinds: ['games'] },
  { label: 'Joined games', kinds: ['joined games'] },
  { label: 'Saved searches', kinds: ['saved searches'] },
]

/** The table's rows, from the backup and what `alreadyHere` found. Kinds the backup doesn't have are left out. */
export function restoreRows(c: Contents, here: readonly { label: string }[]): RestoreRow[] {
  return ROW_GROUPS.map((g) => ({
    label: g.label,
    inBackup: KINDS.filter((k) => g.kinds.includes(k.label)).reduce((n, k) => n + k.docs(c).length, 0),
    here: here.filter((h) => g.kinds.includes(h.label)).length,
  })).filter((r) => r.inBackup > 0)
}

/**
 * What Replace everything deletes, said before it does: "This deletes 42 library items, 6 games and 3
 * joined games on this device, including 2 heroes and 1 game that aren't in the backup: Redline, Moth,
 * Saturday game. It can't be undone." `device` is what's readable here now.
 */
export function replaceWarning(backup: Contents, device: Contents): string {
  const library = device.heroes.length + device.villains.length + TEMPLATE_LIST_KEYS.reduce((n, key) => n + device.templates[key].length, 0)
  const parts = [
    ...(library ? [plural(library, 'library item')] : []),
    ...(device.games.length ? [plural(device.games.length, 'game')] : []),
    ...(device.joined.length ? [plural(device.joined.length, 'joined game')] : []),
    ...(device.savedSearches.length ? [plural(device.savedSearches.length, 'saved search', 'saved searches')] : []),
  ]
  if (!parts.length) return "There's nothing on this device to delete. The backup is restored as it is."
  // What's here and not in the backup, kind by kind: those are lost for good.
  const missing = KINDS.map((k) => {
    const kept = new Set(k.docs(backup).map((d) => d.id))
    return { label: k.label, names: k.docs(device).filter((d) => !kept.has(d.id)).map((d) => k.name(d as never)) }
  }).filter((m) => m.names.length)
  const lost = missing.length ? `, including ${nameList(missing.map((m) => countText({ label: m.label, count: m.names.length })))} that ${missing.reduce((n, m) => n + m.names.length, 0) === 1 ? "isn't" : "aren't"} in the backup: ${missing.flatMap((m) => m.names).join(', ')}` : ''
  return `This deletes ${nameList(parts)} on this device${lost}. It can't be undone.`
}
