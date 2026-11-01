/** Small text helpers for the library. */
import { backupFileName } from '../transfer/files'

/** "scrpg-aid-export-2026-10-31.json", for a multi-item export. */
export function exportFileName(now: Date = new Date()): string {
  return backupFileName(now).replace('backup', 'export')
}

/** Up to five names, then "and N more". */
export function nameList(names: readonly string[]): string {
  const shown = names.slice(0, 5).join(', ')
  return names.length > 5 ? `${shown}, and ${names.length - 5} more` : shown
}
