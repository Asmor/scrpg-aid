import { describe, expect, it, vi } from 'vitest'
import { onPreloadError, RELOAD_GAP_MS } from './preload-error'

const storage = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('a page whose code fails to load', () => {
  it('reloads once, and not again right after, so it never loops', () => {
    const s = storage()
    const reload = vi.fn()
    const event = { preventDefault: vi.fn() }
    expect(onPreloadError(event, s, 100_000, reload)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledOnce()
    // Failing again just after the reload: left to the error boundary.
    expect(onPreloadError({ preventDefault: vi.fn() }, s, 100_000 + RELOAD_GAP_MS - 1, reload)).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
    // Much later (another update): reload again.
    expect(onPreloadError({ preventDefault: vi.fn() }, s, 100_000 + RELOAD_GAP_MS, reload)).toBe(true)
  })

  it("leaves it to the error boundary without storage, since it couldn't tell a loop", () => {
    const reload = vi.fn()
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(onPreloadError({ preventDefault: () => {} }, broken, 1_000_000, reload)).toBe(false)
    expect(onPreloadError({ preventDefault: () => {} }, undefined, 1_000_000, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
