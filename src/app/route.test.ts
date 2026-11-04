import { describe, expect, it } from 'vitest'
import { advancementPath, editPath, gamePath, gamesPath, partPath, heroPath, joinPath, joinUrl, parseRoute, receivePath, watchPath, watchUrl, gameDisplayPath, playPath, tablePath, villainEditPath, villainPath, villainPlayPath, newVillainPath } from './route'

describe('the player table route', () => {
  it('reads a room code, and makes the path', () => {
    expect(parseRoute('#/table/ABCD-EFGH')).toEqual({ name: 'table', room: 'ABCD-EFGH' })
    expect(parseRoute('#/table/%E0%A4%A')).toEqual({ name: 'notFound' })
    expect(tablePath('ABCD-EFGH')).toBe('#/table/ABCD-EFGH')
  })
})

describe('routes', () => {
  it('parses the list, a hero, and anything else', () => {
    expect(parseRoute('')).toEqual({ name: 'list', search: '' })
    expect(parseRoute('#/')).toEqual({ name: 'list', search: '' })
    expect(parseRoute('#/?tag=scene-3&q=gr')).toEqual({ name: 'list', search: 'tag=scene-3&q=gr' })
    expect(parseRoute('#/hero/abc-123')).toEqual({ name: 'hero', id: 'abc-123' })
    expect(parseRoute('#/hero/')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/villains')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/hero/%E0%A4%A')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/hero/abc/edit')).toEqual({ name: 'edit', id: 'abc' })
    expect(parseRoute('#/hero/abc/edit/background')).toEqual({ name: 'edit', id: 'abc', step: 'background' })
    expect(parseRoute('#/hero/abc/editor')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/hero/abc/edit/a/b')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/hero/abc/edit/archetype/form%3Agreen%3A1')).toEqual({ name: 'edit', id: 'abc', step: 'archetype', part: 'form:green:1' })
    expect(parseRoute(partPath('abc', 'mode:red:0'))).toEqual({ name: 'edit', id: 'abc', step: 'archetype', part: 'mode:red:0' })
    expect(parseRoute('#/hero/abc/edit/archetype/a/b')).toEqual({ name: 'notFound' })
    expect(parseRoute(advancementPath('abc'))).toEqual({ name: 'advancement', id: 'abc' })
    expect(parseRoute(gamesPath)).toEqual({ name: 'games' })
    expect(parseRoute('#/games/x')).toEqual({ name: 'notFound' })
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

  it('parses a game’s display view', () => {
    expect(gameDisplayPath('g 1')).toBe('#/game/g%201/display')
    expect(parseRoute(gameDisplayPath('g 1'))).toEqual({ name: 'gameDisplay', id: 'g 1' })
    expect(parseRoute('#/game/%E0%A4%A/display')).toEqual({ name: 'notFound' })
  })

  it('parses receiving items, with or without a code', () => {
    expect(parseRoute(receivePath())).toEqual({ name: 'receive' })
    expect(parseRoute(receivePath('ABCD-EFGH'))).toEqual({ name: 'receive', code: 'ABCD-EFGH' })
    expect(parseRoute('#/receive/%E0%A4%A')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/receive/A/B')).toEqual({ name: 'notFound' })
  })

  it('parses watching a game, with or without its code', () => {
    expect(parseRoute(watchPath())).toEqual({ name: 'watch' })
    expect(parseRoute(watchPath('ABCD-EFGH'))).toEqual({ name: 'watch', room: 'ABCD-EFGH' })
    expect(parseRoute('#/watch/%E0%A4%A')).toEqual({ name: 'notFound' })
    expect(watchUrl('ABCD-EFGH')).toMatch(/#\/watch\/ABCD-EFGH$/)
  })

  it('parses the GM page and joining a game', () => {
    expect(parseRoute('#/gm')).toEqual({ name: 'games' })
    expect(parseRoute(joinPath())).toEqual({ name: 'join' })
    expect(parseRoute(joinPath('ABCD-EFGH'))).toEqual({ name: 'join', room: 'ABCD-EFGH' })
    expect(parseRoute('#/join/%E0%A4%A')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/join/a/b')).toEqual({ name: 'notFound' })
    expect(joinUrl('ABCD-EFGH')).toBe(`${window.location.origin}${window.location.pathname}#/join/ABCD-EFGH`)
  })

  it('parses villain sheets and the villain editor', () => {
    expect(parseRoute('#/villain/x')).toEqual({ name: 'villain', id: 'x' })
    expect(parseRoute(newVillainPath)).toEqual({ name: 'villainNew' })
    expect(parseRoute('#/villain/x/edit')).toEqual({ name: 'villainEdit', id: 'x' })
    expect(parseRoute('#/villain/x/edit/health')).toEqual({ name: 'villainEdit', id: 'x', step: 'health' })
    expect(parseRoute(villainPlayPath('x'))).toEqual({ name: 'villainPlay', id: 'x' })
    for (const bad of ['#/villain/x/edit/a/b', '#/villain/x/editor', '#/villain/', '#/villain/%E0%A4%A']) expect(parseRoute(bad)).toEqual({ name: 'notFound' })
    const id = 'a/b c?#'
    expect(parseRoute(villainPath(id))).toEqual({ name: 'villain', id })
    expect(parseRoute(villainEditPath(id, 'approach'))).toEqual({ name: 'villainEdit', id, step: 'approach' })
  })

  it('parses game tables', () => {
    expect(parseRoute('#/game/g1')).toEqual({ name: 'game', id: 'g1' })
    const id = 'a/b c?#'
    expect(parseRoute(gamePath(id))).toEqual({ name: 'game', id })
    for (const bad of ['#/game/', '#/game/x/y', '#/game/%E0%A4%A']) expect(parseRoute(bad)).toEqual({ name: 'notFound' })
  })
})
