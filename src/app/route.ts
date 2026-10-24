/**
 * Hash-based routes, so the app works from any URL prefix on GitHub Pages and offline
 * without server rewrites: "#/" is the hero list and "#/hero/<id>" one hero's sheet.
 */
import { useEffect, useState } from 'react'

export type Route = { name: 'list' } | { name: 'hero'; id: string } | { name: 'notFound' }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  if (path === '/') return { name: 'list' }
  const hero = /^\/hero\/([^/]+)$/.exec(path)
  if (hero) {
    try {
      return { name: 'hero', id: decodeURIComponent(hero[1]!) }
    } catch {
      return { name: 'notFound' }
    }
  }
  return { name: 'notFound' }
}

export const listPath = '#/'

export function heroPath(id: string): string {
  return `#/hero/${encodeURIComponent(id)}`
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
