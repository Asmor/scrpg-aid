import { describe, expect, it } from 'vitest'
import { editPath, gmPath, heroPath, joinPath, joinUrl, parseRoute, playPath } from './route'

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
    expect(parseRoute(playPath(id))).toEqual({ name: 'play', id })
    expect(parseRoute(`${heroPath(id)}/plays`)).toEqual({ name: 'notFound' })
    expect(parseRoute(editPath('edit'))).toEqual({ name: 'edit', id: 'edit' })
    expect(parseRoute(heroPath('edit'))).toEqual({ name: 'hero', id: 'edit' })
  })

  it('parses the GM page and joining a game', () => {
    expect(parseRoute(gmPath)).toEqual({ name: 'gm' })
    expect(parseRoute(joinPath())).toEqual({ name: 'join' })
    expect(parseRoute(joinPath('ABCD-EFGH'))).toEqual({ name: 'join', room: 'ABCD-EFGH' })
    expect(parseRoute('#/join/%E0%A4%A')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/join/a/b')).toEqual({ name: 'notFound' })
    expect(joinUrl('ABCD-EFGH')).toBe(`${window.location.origin}${window.location.pathname}#/join/ABCD-EFGH`)
  })
})
