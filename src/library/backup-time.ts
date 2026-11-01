/**
 * When the user last backed up everything (docs/design/library/spec.md, "Last backup"), kept in
 * localStorage and guarded like the session store (../session/storage.ts): if storage is
 * unavailable, the app just doesn't remember. "Changed since" is counted, not stored.
 */
import { formatAgoInline } from './when'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const KEY = 'scrpg.library.lastBackupAt'

export interface BackupTimeStore {
  load(): string | undefined
  save(at: string): void
}

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** The store over localStorage (or any Storage-like object, for tests; null for none). */
export function localBackupTime(storage: StorageLike | null | undefined = defaultStorage()): BackupTimeStore {
  return {
    load() {
      try {
        const raw = storage?.getItem(KEY)
        return raw && !Number.isNaN(new Date(raw).getTime()) ? raw : undefined
      } catch {
        return undefined
      }
    },
    save(at) {
      try {
        storage?.setItem(KEY, at)
      } catch {
        // Unavailable or full: the reminder just won't know about this backup.
      }
    },
  }
}

/** How many days without a backup before the Data button reminds. */
export const REMIND_AFTER_DAYS = 14

export interface BackupStatus {
  /** Items changed since the last backup (every item, when there's never been one). */
  changedSince: number
  /** Whether the Data button shows its reminder dot. */
  remind: boolean
  /** The line at the top of the Data menu. */
  text: string
}

export function backupStatus(items: readonly { updatedAt: string }[], lastBackupAt: string | undefined, now: Date): BackupStatus {
  const changedSince = lastBackupAt === undefined ? items.length : items.filter((i) => i.updatedAt > lastBackupAt).length
  const old = lastBackupAt === undefined || now.getTime() - new Date(lastBackupAt).getTime() > REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000
  const remind = items.length > 0 && old && changedSince > 0
  const changed = changedSince === 1 ? '1 item changed since' : `${changedSince} items changed since`
  const text = lastBackupAt === undefined ? 'Saved in this browser only. Never backed up.' : `Saved in this browser only. Last backup ${formatAgoInline(lastBackupAt, now, { daysOnly: true })}; ${changed}.`
  return { changedSince, remind, text }
}
