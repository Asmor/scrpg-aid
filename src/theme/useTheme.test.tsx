import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { STORAGE_KEY } from './theme'

/** A controllable prefers-color-scheme: change `scheme` and call notify() to fire change events. */
function fakeMedia(initial: 'light' | 'dark' | 'none') {
  let scheme = initial
  const listeners = new Set<() => void>()
  return {
    set(next: typeof scheme) {
      scheme = next
      listeners.forEach((l) => l())
    },
    matchMedia: (query: string) =>
      ({
        get matches() {
          return scheme !== 'none' && query.includes(scheme)
        },
        addEventListener: (_: string, l: () => void) => listeners.add(l),
        removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      }) as unknown as MediaQueryList,
    listeners,
  }
}

const theme = () => document.documentElement.dataset.theme

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('useTheme (through the app header)', () => {
  it('defaults to System, which follows the browser and falls back to light', () => {
    const media = fakeMedia('none')
    vi.stubGlobal('matchMedia', media.matchMedia)
    render(<App />)
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(theme()).toBe('light')
    act(() => media.set('dark'))
    expect(theme()).toBe('dark')
  })

  it('applies and remembers an explicit choice', async () => {
    vi.stubGlobal('matchMedia', fakeMedia('light').matchMedia)
    render(<App />)
    expect(theme()).toBe('light')
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(theme()).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('starts from a stored choice, and stops listening when unmounted', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    const media = fakeMedia('dark')
    vi.stubGlobal('matchMedia', media.matchMedia)
    const { unmount } = render(<App />)
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
    expect(theme()).toBe('light')
    expect(media.listeners.size).toBeGreaterThan(0)
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('shows the display view dark when the choice is System, but keeps an explicit Light', () => {
    vi.stubGlobal('matchMedia', fakeMedia('light').matchMedia)
    window.location.hash = '#/watch'
    try {
      const { unmount } = render(<App />)
      expect(theme()).toBe('dark')
      unmount()
      localStorage.setItem(STORAGE_KEY, 'light')
      render(<App />)
      expect(theme()).toBe('light')
    } finally {
      window.location.hash = ''
    }
  })

  it('works without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    render(<App />)
    expect(theme()).toBe('light')
  })
})
