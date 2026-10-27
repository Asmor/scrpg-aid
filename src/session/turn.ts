/**
 * TURN relay servers for game sessions (Phase 4). Some networks (phones on mobile data,
 * strict routers, two devices behind the same router) can't connect directly; a TURN server
 * relays for them. Credentials are fetched fresh for each session from a URL set at build
 * time (VITE_TURN_CREDENTIALS_URL), e.g. Metered's credentials endpoint. Anything going
 * wrong just means no relay: direct connections still work.
 */
import { arrayOf, either, nonEmptyString, object, string } from '../shape'

export interface TurnServer {
  urls: string | string[]
  username?: string
  credential?: string
}

const servers = arrayOf(object({ urls: either(nonEmptyString, arrayOf(nonEmptyString)), 'username?': string, 'credential?': string }))

/** The relay servers from `url`, or none if it can't be reached in time or sends something unexpected. */
export async function fetchTurnServers(url: string | undefined, fetchFn: typeof fetch = fetch, timeoutMs = 5000): Promise<TurnServer[]> {
  if (!url) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, { signal: controller.signal })
    if (!response.ok) return []
    const body: unknown = await response.json()
    if (servers(body, 'servers')) return []
    // Only the fields Trystero uses, whatever else the service sends.
    return (body as TurnServer[]).map(({ urls, username, credential }) => ({ urls, ...(username !== undefined ? { username } : {}), ...(credential !== undefined ? { credential } : {}) }))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
