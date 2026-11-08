import { describe, expect, it } from 'vitest'
import { stripScrollLeft } from './turn-scroll'

describe('scrolling the turn order sideways', () => {
  const size = { scrollWidth: 800, clientWidth: 360 }
  it('puts the divider just inside the left edge, so the acting chip sits right of it', () => {
    expect(stripScrollLeft({ dividerLeft: 300, chipLeft: 320, ...size })).toBe(292)
  })

  it('goes to the acting chip when no one has acted yet', () => {
    expect(stripScrollLeft({ chipLeft: 200, ...size })).toBe(192)
  })

  it('never scrolls past either end', () => {
    expect(stripScrollLeft({ chipLeft: 4, ...size })).toBe(0)
    expect(stripScrollLeft({ dividerLeft: 700, chipLeft: 720, ...size })).toBe(440)
  })
})
