/**
 * Color theme: the player chooses System, Light, or Dark (default System). System follows
 * the browser's prefers-color-scheme, and falls back to light when the browser reports no
 * preference.
 *
 * The preference is a per-device convenience, so it lives in localStorage. Every access is
 * guarded, because storage can be unavailable (private windows, blocked site data).
 *
 * index.html has a small inline copy of resolveTheme/readPreference that runs before the
 * app loads, so the page never flashes the wrong theme. Keep the two in sync.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']
export const STORAGE_KEY = 'scrpg-theme'
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

/** What the browser reports for prefers-color-scheme, if anything. */
export type SystemScheme = Theme | 'none'

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

/** The theme to show. System with no browser preference falls back to light. */
export function resolveTheme(preference: ThemePreference, system: SystemScheme): Theme {
  if (preference !== 'system') return preference
  return system === 'dark' ? 'dark' : 'light'
}

/** Reads the browser's color scheme preference. */
export function systemScheme(win: Pick<Window, 'matchMedia'> | undefined = globalThis.window): SystemScheme {
  if (typeof win?.matchMedia !== 'function') return 'none'
  if (win.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  if (win.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'none'
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readPreference(storage: StorageLike | undefined = defaultStorage()): ThemePreference {
  try {
    const value = storage?.getItem(STORAGE_KEY)
    return isThemePreference(value) ? value : DEFAULT_PREFERENCE
  } catch {
    return DEFAULT_PREFERENCE
  }
}

export function writePreference(preference: ThemePreference, storage: StorageLike | undefined = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, preference)
  } catch {
    // Storage unavailable: the choice still applies for this visit.
  }
}

/**
 * The browser/app chrome color for each theme: the header's --ui-surface from ./tokens.css,
 * repeated here because the meta tag can't read CSS. index.html uses the same values.
 */
export const THEME_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#1b1e2a' }

/**
 * Applies a theme to the document: the data-theme attribute that the CSS keys off,
 * color-scheme for built-in controls, and the theme-color meta for the browser chrome.
 */
export function applyTheme(theme: Theme, doc: Document = document): void {
  doc.documentElement.dataset.theme = theme
  doc.documentElement.style.colorScheme = theme
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}
