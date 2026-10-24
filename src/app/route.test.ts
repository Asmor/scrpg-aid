import { describe, expect, it } from 'vitest'
import { heroPath, parseRoute } from './route'

describe('routes', () => {
  it('parses the list, a hero, and anything else', () => {
    expect(parseRoute('')).toEqual({ name: 'list' })
    expect(parseRoute('#/')).toEqual({ name: 'list' })
    expect(parseRoute('#/hero/abc-123')).toEqual({ name: 'hero', id: 'abc-123' })
    expect(parseRoute('#/hero/')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/villains')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/hero/%E0%A4%A')).toEqual({ name: 'notFound' })
  })

  it('round-trips ids that need escaping', () => {
    const id = 'a/b c?#'
    expect(parseRoute(heroPath(id))).toEqual({ name: 'hero', id })
  })
})
