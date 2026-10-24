import { describe, expect, it } from 'vitest'
import { editPath, heroPath, parseRoute } from './route'

describe('routes', () => {
  it('parses the list, a hero, and anything else', () => {
    expect(parseRoute('')).toEqual({ name: 'list' })
    expect(parseRoute('#/')).toEqual({ name: 'list' })
    expect(parseRoute('#/hero/abc-123')).toEqual({ name: 'hero', id: 'abc-123' })
    expect(parseRoute('#/hero/')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/villains')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/hero/%E0%A4%A')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/hero/abc/edit')).toEqual({ name: 'edit', id: 'abc' })
    expect(parseRoute('#/hero/abc/edit/background')).toEqual({ name: 'edit', id: 'abc', step: 'background' })
    expect(parseRoute('#/hero/abc/editor')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/hero/abc/edit/a/b')).toEqual({ name: 'notFound' })
  })

  it('round-trips ids that need escaping', () => {
    const id = 'a/b c?#'
    expect(parseRoute(heroPath(id))).toEqual({ name: 'hero', id })
    expect(parseRoute(editPath(id, 'details'))).toEqual({ name: 'edit', id, step: 'details' })
    expect(parseRoute(editPath('edit'))).toEqual({ name: 'edit', id: 'edit' })
    expect(parseRoute(heroPath('edit'))).toEqual({ name: 'hero', id: 'edit' })
  })
})
