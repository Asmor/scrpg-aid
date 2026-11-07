/**
 * Settings (scrpg-aid-designs/settings/spec.md): preferences that belong to this device and whoever is
 * holding it. Nothing here is per game or per character, and nothing syncs between devices.
 */
import type { PlayersSee } from '../game/model'
import { isRecord } from '../shape'

export interface Settings {
  diceDisplay: 'icon' | 'text'
  rolling: 'app' | 'physical'
  alerts: { turn: boolean; answer: boolean; sound: boolean; vibrate: boolean; notify: boolean }
  textSize: 'normal' | 'large' | 'larger'
  motion: 'system' | 'reduce' | 'allow'
  newGame: { trackerPreset: 'standard' | 'prolonged' | 'epic'; startHidden: boolean; playersSee: PlayersSee }
}

export const DEFAULT_SETTINGS: Settings = {
  diceDisplay: 'icon',
  rolling: 'app',
  alerts: { turn: false, answer: false, sound: false, vibrate: false, notify: false },
  textSize: 'normal',
  motion: 'system',
  newGame: { trackerPreset: 'standard', startHidden: true, playersSee: 'status' },
}

export const SETTINGS_FORMAT = 'scrpg-settings'
export const SETTINGS_VERSION = 1

export interface SavedSettings {
  format: typeof SETTINGS_FORMAT
  version: number
  settings: Settings
}

export const settingsToSaved = (settings: Settings): SavedSettings => ({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION, settings })

const choice = <T extends string | boolean>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback)
const flag = (value: unknown, fallback: boolean) => choice(value, [true, false], fallback)

/**
 * Reads saved settings (from storage or a backup, so untrusted). Missing or unusable fields read as
 * their defaults, and anything that isn't settings at all reads as the defaults: a preference is
 * never worth an error.
 */
export function parseSettings(value: unknown): Settings {
  const d = DEFAULT_SETTINGS
  const saved = isRecord(value) && value.format === SETTINGS_FORMAT && isRecord(value.settings) ? value.settings : {}
  const alerts = isRecord(saved.alerts) ? saved.alerts : {}
  const newGame = isRecord(saved.newGame) ? saved.newGame : {}
  return {
    diceDisplay: choice(saved.diceDisplay, ['icon', 'text'], d.diceDisplay),
    rolling: choice(saved.rolling, ['app', 'physical'], d.rolling),
    alerts: {
      turn: flag(alerts.turn, d.alerts.turn),
      answer: flag(alerts.answer, d.alerts.answer),
      sound: flag(alerts.sound, d.alerts.sound),
      vibrate: flag(alerts.vibrate, d.alerts.vibrate),
      notify: flag(alerts.notify, d.alerts.notify),
    },
    textSize: choice(saved.textSize, ['normal', 'large', 'larger'], d.textSize),
    motion: choice(saved.motion, ['system', 'reduce', 'allow'], d.motion),
    newGame: {
      trackerPreset: choice(newGame.trackerPreset, ['standard', 'prolonged', 'epic'], d.newGame.trackerPreset),
      startHidden: flag(newGame.startHidden, d.newGame.startHidden),
      playersSee: choice(newGame.playersSee, ['name', 'status', 'health'], d.newGame.playersSee),
    },
  }
}
