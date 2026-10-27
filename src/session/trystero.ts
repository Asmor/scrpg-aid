/**
 * The real transport for game sessions (Phase 4): Trystero, which finds peers through public
 * Nostr relays and then connects them directly over WebRTC. There's no server of our own.
 * Checked by hand (tests use ./transport.ts's in-memory network).
 */
import { joinRoom, type JsonValue } from 'trystero'
import type { Connect } from './transport'

/** Keeps this app's rooms apart from other Trystero apps'. */
export const APP_ID = 'scrpg-vibe-coded'

export const connectTrystero: Connect = (room, password) => {
  const joined = joinRoom({ appId: APP_ID, ...(password ? { password } : {}) }, room)
  const action = joined.makeAction<JsonValue>('session')
  return {
    send: (message, to) => void action.send(message as JsonValue, to ? { target: to } : undefined),
    onMessage: (handler) => {
      action.onMessage = (data, context) => handler(data, context.peerId)
    },
    onPeerJoin: (handler) => {
      joined.onPeerJoin = handler
    },
    onPeerLeave: (handler) => {
      joined.onPeerLeave = handler
    },
    leave: () => void joined.leave(),
  }
}
