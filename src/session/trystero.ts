/**
 * The real transport for game sessions (Phase 4), loaded the first time a session starts:
 * Trystero isn't needed for solo play. See ./trystero-room.ts.
 */
import { lazyConnect } from './transport'

export const connectTrystero = lazyConnect(() => import('./trystero-room').then((m) => m.connectTrysteroRoom))
