/** What Send… sends (docs/design/game-table/spec.md, section 15). */
import type { Hero } from '../hero/model'
import { backupJson } from '../transfer/files'
import type { Villain } from '../villain/model'
import type { LibraryItem } from './registry'

/** The items as a backup file's text: only sheets travel. */
export function sendText(items: readonly LibraryItem[]): string {
  const of = (key: LibraryItem['type']['backupKey']) => items.filter((i) => i.type.backupKey === key).map((i) => i.doc)
  return backupJson({ heroes: of('heroes') as unknown as Hero[], villains: of('villains') as unknown as Villain[], games: [], savedSearches: [] })
}
