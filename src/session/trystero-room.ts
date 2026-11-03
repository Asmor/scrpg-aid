/**
 * The real transport for game sessions (Phase 4): Trystero, which finds peers through public
 * Nostr relays and then connects them directly over WebRTC. There's no server of our own.
 * Checked by hand (tests use ./transport.ts's in-memory network). Loaded only when a session
 * starts (./trystero.ts), so solo play doesn't pay for it.
 */
import { joinRoom, type JsonValue } from 'trystero'
import type { Connect } from './transport'
import type { TurnServer } from './turn'

/** Keeps this app's rooms apart from other Trystero apps'. */
export const APP_ID = 'scrpg-aid'

/** Trystero, with TURN relay servers for peers who can't connect directly (./turn.ts). */
export const trysteroConnect =
  (turn: readonly TurnServer[] = []): Connect =>
  (room) => {
    let reportError: ((message: string) => void) | undefined
    // The game code is also the password that encrypts the connection setup on the public relays,
    // so only someone with the code can read it.
    const joined = joinRoom({ appId: APP_ID, password: room, ...(turn.length ? { turnConfig: [...turn] } : {}) }, room, {
      onJoinError: ({ error }) => reportError?.(error),
    })
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
      onError: (handler) => {
        reportError = handler
      },
      leave: () => void joined.leave(),
    }
  }
