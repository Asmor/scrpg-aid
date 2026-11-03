/**
 * Hash-based routes, so the app works from any URL prefix on GitHub Pages and offline
 * without server rewrites: "#/" is the library ("#/?<query>" a view of it, ../library/query.ts), "#/hero/<id>" one hero's sheet,
 * "#/hero/<id>/edit" its edit summary (a draft continues at its furthest step),
 * "#/hero/<id>/edit/<step>" a step of its editor ("#/hero/<id>/edit/archetype/<part>" one part of
 * a complex archetype's step), "#/hero/<id>/advancement" its advancement,
 * "#/hero/<id>/play" the game aid, "#/gm"
 * the GM's page for hosting a game, "#/join" (or "#/join/<room code>") joining one, and
 * "#/villain/<id>" a villain's sheet ("#/villain/<id>/edit/<step>" its editor), "#/games" the Games
 * page, and "#/game/<id>" a game's table.
 */
import { useEffect, useState } from 'react'

export type Route =
  /** `search` is the library view's query string, without the "?". */
  | { name: 'list'; search: string }
  | { name: 'villain'; id: string }
  | { name: 'villainEdit'; id: string; step?: string }
  | { name: 'villainPlay'; id: string }
  | { name: 'game'; id: string }
  | { name: 'games' }
  | { name: 'table'; room: string }
  | { name: 'join'; room?: string } | { name: 'hero'; id: string } | { name: 'edit'; id: string; step?: string; part?: string } | { name: 'play'; id: string } | { name: 'advancement'; id: string } | { name: 'notFound' }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  if (path === '/') return { name: 'list', search: '' }
  if (path.startsWith('/?')) return { name: 'list', search: path.slice(2) }
  // The old GM page's link: games are run from the Games page now.
  if (path === '/gm') return { name: 'games' }
  if (path === '/games') return { name: 'games' }
  const game = /^\/game\/([^/]+)$/.exec(path)
  if (game) {
    try {
      return { name: 'game', id: decodeURIComponent(game[1]!) }
    } catch {
      return { name: 'notFound' }
    }
  }
  const villain = /^\/villain\/([^/]+)(\/edit(?:\/([^/]+))?|\/play)?$/.exec(path)
  if (villain) {
    let id: string
    try {
      id = decodeURIComponent(villain[1]!)
    } catch {
      return { name: 'notFound' }
    }
    if (!villain[2]) return { name: 'villain', id }
    if (villain[2] === '/play') return { name: 'villainPlay', id }
    return villain[3] ? { name: 'villainEdit', id, step: villain[3] } : { name: 'villainEdit', id }
  }
  const table = /^\/table\/([^/]+)$/.exec(path)
  if (table) {
    try {
      return { name: 'table', room: decodeURIComponent(table[1]!) }
    } catch {
      return { name: 'notFound' }
    }
  }
  const join = /^\/join(?:\/([^/]+))?$/.exec(path)
  if (join) {
    if (!join[1]) return { name: 'join' }
    try {
      return { name: 'join', room: decodeURIComponent(join[1]) }
    } catch {
      return { name: 'notFound' }
    }
  }
  const match = /^\/hero\/([^/]+)(\/edit(?:\/([^/]+)(?:\/([^/]+))?)?|\/play|\/advancement)?$/.exec(path)
  if (!match) return { name: 'notFound' }
  let id: string
  try {
    id = decodeURIComponent(match[1]!)
  } catch {
    return { name: 'notFound' }
  }
  if (!match[2]) return { name: 'hero', id }
  if (match[2] === '/play') return { name: 'play', id }
  if (match[2] === '/advancement') return { name: 'advancement', id }
  if (!match[3]) return { name: 'edit', id }
  if (!match[4]) return { name: 'edit', id, step: match[3] }
  // Only the Archetype step has parts.
  if (match[3] !== 'archetype') return { name: 'notFound' }
  try {
    return { name: 'edit', id, step: match[3], part: decodeURIComponent(match[4]) }
  } catch {
    return { name: 'notFound' }
  }
}

export const listPath = '#/'

export function heroPath(id: string): string {
  return `#/hero/${encodeURIComponent(id)}`
}

export function editPath(id: string, step?: string): string {
  return `${heroPath(id)}/edit${step ? `/${step}` : ''}`
}

/** One part of a complex archetype's step (../hero/archetype-parts.ts). */
export function partPath(id: string, part: string): string {
  return `${editPath(id, 'archetype')}/${encodeURIComponent(part)}`
}

export function advancementPath(id: string): string {
  return `${heroPath(id)}/advancement`
}

export function playPath(id: string): string {
  return `${heroPath(id)}/play`
}

export function villainPath(id: string): string {
  return `#/villain/${encodeURIComponent(id)}`
}

export function villainPlayPath(id: string): string {
  return `${villainPath(id)}/play`
}

export function villainEditPath(id: string, step?: string): string {
  return `${villainPath(id)}/edit${step ? `/${step}` : ''}`
}

/** The Games page (docs/design/game-table/spec.md, section 3). */
export const gamesPath = '#/games'

export function gamePath(id: string): string {
  return `#/game/${encodeURIComponent(id)}`
}

/** A hosted game a player is in (docs/design/game-table/spec.md, section 14). */
export function tablePath(room: string): string {
  return `#/table/${encodeURIComponent(room)}`
}

export function joinPath(room?: string): string {
  return room ? `#/join/${encodeURIComponent(room)}` : '#/join'
}

/** The full link players open to join a game, on this same copy of the app. */
export function joinUrl(room: string): string {
  return `${window.location.origin}${window.location.pathname}${joinPath(room)}`
}

export function navigate(path: string): void {
  window.location.hash = path
}

/** The current route, updated when the hash changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return route
}
