/**
 * Hash-based routes, so the app works from any URL prefix on GitHub Pages and offline
 * without server rewrites: "#/" is the hero list, "#/hero/<id>" one hero's sheet,
 * "#/hero/<id>/edit/<step>" a step of its editor, "#/hero/<id>/play" the game aid, "#/gm"
 * the GM's page for hosting a game, and "#/join" (or "#/join/<room code>") joining one.
 */
import { useEffect, useState } from 'react'

export type Route = { name: 'list' } | { name: 'gm' } | { name: 'join'; room?: string } | { name: 'hero'; id: string } | { name: 'edit'; id: string; step?: string } | { name: 'play'; id: string } | { name: 'notFound' }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  if (path === '/') return { name: 'list' }
  if (path === '/gm') return { name: 'gm' }
  const join = /^\/join(?:\/([^/]+))?$/.exec(path)
  if (join) {
    if (!join[1]) return { name: 'join' }
    try {
      return { name: 'join', room: decodeURIComponent(join[1]) }
    } catch {
      return { name: 'notFound' }
    }
  }
  const match = /^\/hero\/([^/]+)(\/edit(?:\/([^/]+))?|\/play)?$/.exec(path)
  if (!match) return { name: 'notFound' }
  let id: string
  try {
    id = decodeURIComponent(match[1]!)
  } catch {
    return { name: 'notFound' }
  }
  if (!match[2]) return { name: 'hero', id }
  if (match[2] === '/play') return { name: 'play', id }
  return match[3] ? { name: 'edit', id, step: match[3] } : { name: 'edit', id }
}

export const listPath = '#/'

export function heroPath(id: string): string {
  return `#/hero/${encodeURIComponent(id)}`
}

export function editPath(id: string, step?: string): string {
  return `${heroPath(id)}/edit${step ? `/${step}` : ''}`
}

export function playPath(id: string): string {
  return `${heroPath(id)}/play`
}

export const gmPath = '#/gm'

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
