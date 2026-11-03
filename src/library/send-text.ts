/** What Send… sends (docs/design/game-table/spec.md, section 15), and the templates in a backup. */
import type { Hero } from '../hero/model'
import { backupJson } from '../transfer/files'
import type { Villain } from '../villain/model'
import type { LibraryItem } from './registry'
import { TEMPLATE_LIST_KEYS, type TemplateLists } from '../template/lists'

/** The templates among some library documents, by their backup lists. */
export function templateListsOf(of: (key: LibraryItem['type']['backupKey']) => unknown[]): TemplateLists {
  return Object.fromEntries(TEMPLATE_LIST_KEYS.map((k) => [k, of(k)])) as unknown as TemplateLists
}

/** The items as a backup file's text: library documents only (sheets and templates), no games or saved searches. */
export function sendText(items: readonly LibraryItem[]): string {
  const of = (key: LibraryItem['type']['backupKey']) => items.filter((i) => i.type.backupKey === key).map((i) => i.doc)
  return backupJson({ heroes: of('heroes') as unknown as Hero[], villains: of('villains') as unknown as Villain[], games: [], savedSearches: [], templates: templateListsOf(of) })
}
