import { describe, expect, it } from 'vitest'
import { appearanceOf, appearanceText, CHAR_COLORS, cleanAppearance, colorText, contrast, fillCss, fillStyle, GRADIENTS, PALETTE, sameAppearance, side, type Appearance } from './palette'

describe('the palette', () => {
  it('has the 13 colors in order', () => {
    expect(PALETTE.map((c) => c.id)).toEqual([...CHAR_COLORS])
  })

  it('has every ink at 4.5:1 or better on its fill, in both themes', () => {
    for (const c of PALETTE) for (const theme of ['light', 'dark'] as const) expect(contrast(c[theme].fill, c[theme].ink), `${c.name} ${theme}`).toBeGreaterThanOrEqual(4.5)
  })
})

describe('sides', () => {
  it('follow who it belongs to', () => {
    expect(side({ kind: 'hero' })).toBe('heroes')
    expect(side({ kind: 'heroMinion', heroPrimary: 'pink' })).toBe('heroes')
    expect(side({ kind: 'villain' })).toBe('gm')
    expect(side({ kind: 'group' })).toBe('gm')
    expect(side({ kind: 'challenge' })).toBe('gm')
    expect(side({ kind: 'group', environment: true })).toBe('environment')
    expect(side({ kind: 'challenge', environment: true })).toBe('environment')
    expect(side({ kind: 'environment' })).toBe('environment')
  })
})

describe('appearanceOf', () => {
  it('resolves the defaults', () => {
    expect(appearanceOf({ kind: 'hero' })).toEqual({ primary: 'blue' })
    expect(appearanceOf({ kind: 'villain' })).toEqual({ primary: 'red' })
    expect(appearanceOf({ kind: 'group' })).toEqual({ primary: 'red' })
    expect(appearanceOf({ kind: 'challenge', environment: true })).toEqual({ primary: 'green' })
    expect(appearanceOf({ kind: 'environment' })).toEqual({ primary: 'green' })
    expect(appearanceOf({ kind: 'heroMinion', heroPrimary: 'pink' })).toEqual({ primary: 'pink' })
  })

  it('keeps what was chosen', () => {
    const a: Appearance = { primary: 'cyan', secondary: 'pink', gradient: 'radial' }
    expect(appearanceOf({ kind: 'hero', appearance: a })).toBe(a)
    expect(appearanceOf({ kind: 'group', color: 'brown' })).toEqual({ primary: 'brown' })
    expect(appearanceOf({ kind: 'heroMinion', color: 'grey', heroPrimary: 'pink' })).toEqual({ primary: 'grey' })
  })
})

describe('fills', () => {
  const two = (gradient?: Appearance['gradient'], invert = false): Appearance => ({ primary: 'red', secondary: 'blue', ...(gradient ? { gradient } : {}), ...(invert ? { invert } : {}) })

  it('are one color, or a gradient in each style', () => {
    expect(fillCss({ primary: 'red' })).toBe('var(--char-red)')
    expect(fillCss(two())).toBe('linear-gradient(to bottom, var(--char-red), var(--char-blue))')
    expect(fillCss(two('horizontal'))).toBe('linear-gradient(to right, var(--char-red), var(--char-blue))')
    expect(fillCss(two('diagonalRight'))).toBe('linear-gradient(to bottom right, var(--char-red), var(--char-blue))')
    expect(fillCss(two('diagonalLeft'))).toBe('linear-gradient(to bottom left, var(--char-red), var(--char-blue))')
    expect(fillCss(two('radial'))).toBe('radial-gradient(circle at center, var(--char-red), var(--char-blue))')
    expect(GRADIENTS).toHaveLength(5)
  })

  it('swap ends when inverted, and a secondary the same as the primary reads as solid', () => {
    expect(fillCss(two(undefined, true))).toBe('linear-gradient(to bottom, var(--char-blue), var(--char-red))')
    expect(fillCss({ primary: 'red', secondary: 'red' })).toBe('linear-gradient(to bottom, var(--char-red), var(--char-red))')
  })

  it('carry both themes\' text for the stylesheet', () => {
    expect(fillStyle({ primary: 'red' })).toMatchObject({ background: 'var(--char-red)', '--char-text-light': '#FFFFFF', '--char-line-light': '#1A1D2B', '--char-text-dark': '#1A1D2B', '--char-line-dark': '#FFFFFF' })
  })
})

describe('colorText', () => {
  it('uses the better ink, with the other as its outline', () => {
    expect(colorText({ primary: 'offblack' }, 'light')).toEqual({ ink: '#FFFFFF', outline: '#1A1D2B' })
    expect(colorText({ primary: 'offwhite' }, 'light')).toEqual({ ink: '#1A1D2B', outline: '#FFFFFF' })
    expect(colorText({ primary: 'red' }, 'dark').ink).toBe('#1A1D2B')
  })

  it('takes the worst case across a gradient', () => {
    // White on Off-black is fine, but on Off-white hopeless; dark on Off-black is hopeless but on Off-white fine. Whichever: the choice is the better minimum.
    const { ink } = colorText({ primary: 'offblack', secondary: 'yellow' }, 'light')
    const worst = (i: string) => Math.min(contrast(i, '#2A2A30'), contrast(i, '#F2C318'))
    expect(worst(ink)).toBeGreaterThanOrEqual(worst(ink === '#FFFFFF' ? '#1A1D2B' : '#FFFFFF'))
  })
})

describe('saving', () => {
  it('keeps a gradient only with a secondary, and skips the default', () => {
    expect(cleanAppearance({ primary: 'red', gradient: 'radial', invert: true })).toEqual({ primary: 'red' })
    expect(cleanAppearance({ primary: 'red', secondary: 'blue', gradient: 'vertical' })).toEqual({ primary: 'red', secondary: 'blue' })
    expect(cleanAppearance({ primary: 'red', secondary: 'blue', gradient: 'radial', invert: true })).toEqual({ primary: 'red', secondary: 'blue', gradient: 'radial', invert: true })
    expect(sameAppearance({ primary: 'red', gradient: 'radial' }, { primary: 'red' })).toBe(true)
  })

  it('says it in words', () => {
    expect(appearanceText({ primary: 'blue' })).toBe('Blue.')
    expect(appearanceText({ primary: 'blue', secondary: 'cyan', gradient: 'diagonalRight' })).toBe('Blue and Cyan, diagonal right.')
    expect(appearanceText({ primary: 'blue', secondary: 'cyan', invert: true })).toBe('Cyan and Blue, vertical.')
  })
})
