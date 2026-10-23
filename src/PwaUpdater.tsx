import { useRegisterSW } from 'virtual:pwa-register/react'
import { UpdateBanner } from './components/UpdateBanner'

/**
 * Registers the service worker and shows a banner when a new version is waiting.
 * Kept separate from App because the virtual module only exists in Vite builds.
 */
export default function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return <UpdateBanner onReload={() => void updateServiceWorker(true)} onDismiss={() => setNeedRefresh(false)} />
}
