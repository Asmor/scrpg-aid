/**
 * Whether the wizard's docked sheet preview is shown, remembered per device. Storage can be
 * unavailable (private windows, blocked site data), so every access is guarded.
 */
export const PREVIEW_KEY = 'scrpg-wizard-preview'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** Shown unless the player hid it. */
export function readPreviewShown(storage: StorageLike | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(PREVIEW_KEY) !== 'hidden'
  } catch {
    return true
  }
}

export function writePreviewShown(shown: boolean, storage: StorageLike | undefined = defaultStorage()): void {
  try {
    storage?.setItem(PREVIEW_KEY, shown ? 'shown' : 'hidden')
  } catch {
    // Storage unavailable: the choice still applies for this visit.
  }
}
