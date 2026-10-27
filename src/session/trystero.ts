/**
 * The real transport for game sessions (Phase 4), loaded the first time a session starts:
 * Trystero isn't needed for solo play. Each session fetches fresh TURN relay credentials
 * first, when the build sets where from (./turn.ts). See ./trystero-room.ts.
 */
import { lazyConnect } from './transport'
import { fetchTurnServers } from './turn'

export const connectTrystero = lazyConnect(async () => {
  const [room, turn] = await Promise.all([import('./trystero-room'), fetchTurnServers(import.meta.env.VITE_TURN_CREDENTIALS_URL)])
  return room.trysteroConnect(turn)
})
