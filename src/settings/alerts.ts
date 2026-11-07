/**
 * Alerts (scrpg-aid-designs/settings/spec.md, section 4): working out from one state of the table to the
 * next what the person should be alerted to, and how. Every alert also shows in the page (the Your
 * turn bar, the Requests badge, the prompt), so sound is never the only sign.
 */
import type { Game } from '../game/model'
import type { Settings } from './model'

export type AlertKind = 'turn' | 'answer'

/** What a player's alerts watch. */
export interface PlayerWatch {
  myTurn: boolean
  /** This hero's Overcomes waiting on the GM: one going means the GM answered. */
  requests: number
  /** The GM's answers to sheet updates so far. */
  syncAnswers: number
  reminder: boolean
  /** The back issue being asked about. */
  prompt?: string | undefined
  /** Things only this player can settle: a hit waiting for a defense, a minion that needs a new form. */
  choices: number
}

/** What should alert a player. `acting`: an action of theirs is on its way, so a new turn is their own doing. */
export function playerAlerts(before: PlayerWatch, after: PlayerWatch, acting: boolean): AlertKind[] {
  const turn = !before.myTurn && after.myTurn && !acting
  const answer = after.requests < before.requests || after.syncAnswers > before.syncAnswers || (after.reminder && !before.reminder) || (Boolean(after.prompt) && after.prompt !== before.prompt) || after.choices > before.choices
  return [...(turn ? (['turn'] as const) : []), ...(answer ? (['answer'] as const) : [])]
}

/** What the GM's alerts watch. */
export interface GmWatch {
  /** The GM's actor who is acting ("villain:v1"), if it's one of theirs. */
  acting?: string | undefined
  /** Overcomes waiting on challenges. */
  requests: number
  /** Sheet updates waiting, a rejoining player's with a changed sheet among them. */
  syncs: number
}

export function gmWatch(game: Game): GmWatch {
  const current = game.currentIssueId ? game.turn.current : undefined
  const players = current?.kind === 'hero' && game.heroes.find((h) => h.id === current.id)?.player
  return {
    ...(current && !players ? { acting: `${current.kind}:${current.id}` } : {}),
    requests: game.challenges.reduce((n, c) => n + c.requests.length, 0),
    syncs: game.pendingSyncs.length,
  }
}

export function gmAlerts(before: GmWatch, after: GmWatch): AlertKind[] {
  const turn = Boolean(after.acting) && after.acting !== before.acting
  const answer = after.requests > before.requests || after.syncs > before.syncs
  return [...(turn ? (['turn'] as const) : []), ...(answer ? (['answer'] as const) : [])]
}

/** The ways of alerting: the browser's, or a test's. */
export interface AlertChannels {
  sound: (kind: AlertKind) => void
  vibrate: (kind: AlertKind) => void
  notify: (text: string) => void
  /** Whether the page is out of sight. */
  background: () => boolean
}

const TEXT: Record<AlertKind, (game: string) => string> = {
  turn: (game) => `It's your turn in ${game}.`,
  answer: (game) => `Something needs your answer in ${game}.`,
}

/** Sends alerts as chosen. Sound and vibration play in the foreground too; notifications only appear in the background. */
export function deliverAlerts(kinds: readonly AlertKind[], alerts: Settings['alerts'], game: string, channels: AlertChannels): void {
  for (const kind of kinds) {
    if (!alerts[kind]) continue
    if (alerts.sound) channels.sound(kind)
    if (alerts.vibrate) channels.vibrate(kind)
    if (alerts.notify && channels.background()) channels.notify(TEXT[kind](game))
  }
}

// ---- The browser's ----

/** Two rising notes for your turn; three quick ones for an answer. */
const CHIMES: Record<AlertKind, readonly { hz: number; at: number }[]> = {
  turn: [
    { hz: 660, at: 0 },
    { hz: 880, at: 0.16 },
  ],
  answer: [
    { hz: 880, at: 0 },
    { hz: 880, at: 0.12 },
    { hz: 660, at: 0.24 },
  ],
}

/** One context for every chime: a phone only lets one started by a tap make sound, so the preview buttons unlock it. */
let audio: AudioContext | undefined

export function playChime(kind: AlertKind): void {
  try {
    audio ??= new AudioContext()
    const context = audio
    void context.resume()
    const start = context.currentTime
    for (const note of CHIMES[kind]) {
      const tone = context.createOscillator()
      const gain = context.createGain()
      tone.frequency.value = note.hz
      gain.gain.setValueAtTime(0.15, start + note.at)
      gain.gain.exponentialRampToValueAtTime(0.001, start + note.at + 0.14)
      tone.connect(gain).connect(context.destination)
      tone.start(start + note.at)
      tone.stop(start + note.at + 0.15)
    }
  } catch {
    // No sound here: every alert also shows in the page.
  }
}

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
export const canNotify = () => typeof Notification !== 'undefined'

/** iOS only lets an app on the home screen notify in the background. */
export function needsHomeScreen(): boolean {
  if (typeof navigator === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !installed
}

/** Asks for the browser's permission to notify. */
export async function askToNotify(): Promise<boolean> {
  if (!canNotify()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

/** A newer alert replaces an older one, rather than stacking. */
const NOTIFICATION_TAG = 'scrpg-alert'

function showNotification(text: string): void {
  if (!canNotify() || Notification.permission !== 'granted') return
  // Some phones only take notifications through the service worker.
  const title = 'SCRPG Aid'
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    void navigator.serviceWorker.ready.then((worker) => worker.showNotification(title, { body: text, tag: NOTIFICATION_TAG }))
    return
  }
  try {
    new Notification(title, { body: text, tag: NOTIFICATION_TAG })
  } catch {
    // Not allowed here: every alert also shows in the page.
  }
}

export const browserChannels: AlertChannels = {
  sound: playChime,
  vibrate: (kind) => {
    if (canVibrate()) navigator.vibrate(kind === 'turn' ? [120, 80, 120] : [80])
  },
  notify: showNotification,
  background: () => typeof document !== 'undefined' && document.visibilityState !== 'visible',
}
