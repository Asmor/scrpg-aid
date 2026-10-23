import { afterEach, describe, expect, it, vi } from 'vitest'
import html from '../../index.html?raw'
import {
  applyTheme,
  DEFAULT_PREFERENCE,
  isThemePreference,
  readPreference,
  resolveTheme,
  STORAGE_KEY,
  systemScheme,
  THEME_COLORS,
  writePreference,
  type SystemScheme,
} from './theme'

/** A matchMedia stub reporting the given prefers-color-scheme. */
const media = (scheme: SystemScheme) => ({
  matchMedia: (query: string) => ({ matches: scheme !== 'none' && query.includes(scheme) }) as MediaQueryList,
})

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial }
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data }
}

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

afterEach(() => {
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ''
  vi.unstubAllGlobals()
})

describe('theme', () => {
  it('follows the system preference, falling back to dark when there is none', () => {
    expect(resolveTheme('system', 'light')).toBe('light')
    expect(resolveTheme('system', 'dark')).toBe('dark')
    expect(resolveTheme('system', 'none')).toBe('dark')
  })

  it('uses an explicit choice regardless of the system', () => {
    for (const system of ['light', 'dark', 'none'] as const) {
      expect(resolveTheme('light', system)).toBe('light')
      expect(resolveTheme('dark', system)).toBe('dark')
    }
  })

  it('reads the browser’s color scheme', () => {
    expect(systemScheme(media('dark'))).toBe('dark')
    expect(systemScheme(media('light'))).toBe('light')
    expect(systemScheme(media('none'))).toBe('none')
    expect(systemScheme({} as Window)).toBe('none')
    expect(systemScheme(undefined)).toBe('none')
  })

  it('defaults to System, and remembers a choice', () => {
    const storage = memoryStorage()
    expect(readPreference(storage)).toBe('system')
    expect(DEFAULT_PREFERENCE).toBe('system')
    writePreference('light', storage)
    expect(storage.data[STORAGE_KEY]).toBe('light')
    expect(readPreference(storage)).toBe('light')
  })

  it('ignores stored junk and survives unavailable storage', () => {
    expect(readPreference(memoryStorage({ [STORAGE_KEY]: 'purple' }))).toBe('system')
    expect(readPreference(throwingStorage)).toBe('system')
    expect(() => writePreference('dark', throwingStorage)).not.toThrow()
    expect(readPreference(undefined)).toBe('system')
    vi.stubGlobal('localStorage', undefined)
    expect(readPreference()).toBe('system')
    vi.unstubAllGlobals()
    // Some browsers throw just from touching localStorage when site data is blocked.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      expect(readPreference()).toBe('system')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', original)
    }
  })

  it('recognizes preferences', () => {
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('blue')).toBe(false)
    expect(isThemePreference(undefined)).toBe(false)
  })

  it('applies the theme to the document, including the browser chrome color', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
    try {
      applyTheme('light')
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(document.documentElement.style.colorScheme).toBe('light')
      expect(meta.content).toBe(THEME_COLORS.light)
      applyTheme('dark')
      expect(meta.content).toBe(THEME_COLORS.dark)
    } finally {
      meta.remove()
    }
    // Without the meta tag it still applies the rest.
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  describe('index.html’s pre-paint script', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!

    it('matches resolveTheme (and the chrome color) for every preference and system scheme', () => {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.append(meta)
      for (const pref of [undefined, 'system', 'light', 'dark', 'junk'] as const) {
        for (const system of ['light', 'dark', 'none'] as const) {
          const storage = memoryStorage(pref ? { [STORAGE_KEY]: pref } : {})
          vi.stubGlobal('localStorage', storage)
          vi.stubGlobal('matchMedia', media(system).matchMedia)
          new Function(script)()
          const expected = resolveTheme(readPreference(storage), system as SystemScheme)
          expect(document.documentElement.dataset.theme, `${pref}/${system}`).toBe(expected)
          expect(meta.content, `${pref}/${system}`).toBe(THEME_COLORS[expected])
          vi.unstubAllGlobals()
        }
      }
      meta.remove()
    })

    it('falls back to dark when storage and matchMedia are unavailable', () => {
      vi.stubGlobal('localStorage', throwingStorage)
      vi.stubGlobal('matchMedia', undefined)
      new Function(script)()
      expect(document.documentElement.dataset.theme).toBe('dark')
    })
  })

})
