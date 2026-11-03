import { describe, expect, it } from 'vitest'
import { stageScale } from './display'

describe('the display view’s stage', () => {
  it('fits 1920×1080 into the window by its tighter side', () => {
    expect(stageScale(1920, 1080, 1080)).toBe(1)
    expect(stageScale(3840, 2160, 1080)).toBe(2)
    expect(stageScale(1280, 1080, 1080)).toBeCloseTo(2 / 3)
    expect(stageScale(1920, 540, 900)).toBe(0.5)
  })

  it('scales down a table taller than the stage instead of scrolling', () => {
    expect(stageScale(1920, 1080, 1350)).toBeCloseTo(0.8)
  })

  it('falls back to 1 for a window with no size', () => {
    expect(stageScale(0, 0, 1080)).toBe(1)
  })
})
