import { useSyncExternalStore } from 'react'

const subscribe = (update: () => void) => {
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  return () => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}

/** Whether the browser thinks it's online, kept current. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}
