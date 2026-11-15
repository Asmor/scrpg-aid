/**
 * When a page's code fails to load (vite:preloadError, usually an old tab after an update),
 * reload once to get the current version (review 2026-11-15, item 7). A second failure soon
 * after is left to the page's error boundary (./PageErrorBoundary.tsx), so it never loops; so
 * is any failure when there's no storage to remember the reload in.
 */

/** How soon after a reload another failure counts as the same one. */
export const RELOAD_GAP_MS = 10_000
const KEY = 'scrpg.preloadReloadAt'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Handles one preload failure: true if it reloads (and stops the error from being thrown). */
export function onPreloadError(event: Pick<Event, 'preventDefault'>, storage: StorageLike | undefined, now: number, reload: () => void): boolean {
  if (!storage) return false
  try {
    const last = Number(storage.getItem(KEY)) || 0
    if (now - last < RELOAD_GAP_MS) return false
    storage.setItem(KEY, String(now))
  } catch {
    return false
  }
  event.preventDefault()
  reload()
  return true
}

/** Listens for preload failures on this window. */
export function reloadOnPreloadError(): void {
  let storage: StorageLike | undefined
  try {
    storage = window.sessionStorage
  } catch {
    storage = undefined
  }
  window.addEventListener('vite:preloadError', (event) => onPreloadError(event, storage, Date.now(), () => window.location.reload()))
}
