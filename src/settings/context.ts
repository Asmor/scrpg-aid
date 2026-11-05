/**
 * Gives components this device's settings. They're read once at start, and a change applies at once
 * and is saved. Without a provider (the HTML export, many tests) components see the defaults.
 */
import { createContext, useContext } from 'react'
import { DEFAULT_SETTINGS, type Settings } from './model'

export interface SettingsValue {
  settings: Settings
  update: (change: (settings: Settings) => Settings) => void
  /** Why the last change couldn't be saved. */
  saveError?: string
}

export const SettingsContext = createContext<SettingsValue>({ settings: DEFAULT_SETTINGS, update: () => {} })

export const useSettings = () => useContext(SettingsContext)

/** Puts text size and motion on the root, where the styles read them (src/index.css). */
export function applyToRoot(root: HTMLElement, settings: Pick<Settings, 'textSize' | 'motion'>): void {
  root.dataset.textSize = settings.textSize
  root.classList.toggle('motion-reduce', settings.motion === 'reduce')
  root.classList.toggle('motion-allow', settings.motion === 'allow')
}
