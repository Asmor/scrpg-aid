/** Watches a table for alerts: compares each state to the last, so the first one seen never alerts. */
import { useEffect, useRef } from 'react'
import { browserChannels, deliverAlerts, type AlertChannels, type AlertKind } from './alerts'
import { useSettings } from './context'

export function useAlerts<W>(watch: W | undefined, alertsFor: (before: W, after: W) => AlertKind[], game: string, channels: AlertChannels = browserChannels): void {
  const { alerts } = useSettings().settings
  const key = watch === undefined ? undefined : JSON.stringify(watch)
  const seen = useRef<W | undefined>(undefined)
  const latest = useRef({ watch, alertsFor, alerts, game, channels })
  useEffect(() => {
    latest.current = { watch, alertsFor, alerts, game, channels }
  })
  useEffect(() => {
    const now = latest.current
    if (now.watch === undefined) {
      seen.current = undefined
      return
    }
    if (seen.current !== undefined) deliverAlerts(now.alertsFor(seen.current, now.watch), now.alerts, now.game, now.channels)
    seen.current = now.watch
  }, [key])
}
