/**
 * How session peers talk (Phase 4). The app uses Trystero (./trystero.ts); tests use the
 * in-memory network below. Every peer in a room hears every other peer join and leave.
 */

export interface Transport {
  /** Sends to one peer, or to every peer when `to` is left out. */
  send(message: unknown, to?: string): void
  onMessage(handler: (message: unknown, peerId: string) => void): void
  onPeerJoin(handler: (peerId: string) => void): void
  onPeerLeave(handler: (peerId: string) => void): void
  /** Connection problems worth showing (a peer found but not reachable, say). Optional. */
  onError?(handler: (message: string) => void): void
  leave(): void
}

/** Joins a room. The password, when there is one, encrypts the connection setup. */
export type Connect = (room: string, password?: string) => Transport

/**
 * A transport that goes quiet once left: no more messages, peer events, or sends. Trystero
 * still delivers for a moment after leaving, and a session that's over mustn't act on it
 * (it would save itself again after being forgotten).
 */
export function quietAfterLeave(transport: Transport): Transport {
  let left = false
  return {
    send: (message, to) => {
      if (!left) transport.send(message, to)
    },
    onMessage: (handler) => transport.onMessage((message, peer) => !left && handler(message, peer)),
    onPeerJoin: (handler) => transport.onPeerJoin((peer) => !left && handler(peer)),
    onPeerLeave: (handler) => transport.onPeerLeave((peer) => !left && handler(peer)),
    onError: (handler) => transport.onError?.((message) => !left && handler(message)),
    leave: () => {
      if (left) return
      left = true
      transport.leave()
    },
  }
}

/**
 * A transport whose real one loads in the background (a dynamically imported module). Until
 * it has, nothing is sent; handlers are passed on once it's there. If it never loads (offline
 * before it was cached), the session just stays unconnected.
 */
export function lazyConnect(load: () => Promise<Connect>): Connect {
  return (room, password) => {
    let real: Transport | undefined
    let left = false
    const handlers: {
      message?: (message: unknown, peerId: string) => void
      join?: (peerId: string) => void
      leave?: (peerId: string) => void
      error?: (message: string) => void
    } = {}
    load().then(
      (connect) => {
        if (left) return
        real = connect(room, password)
        if (handlers.message) real.onMessage(handlers.message)
        if (handlers.join) real.onPeerJoin(handlers.join)
        if (handlers.leave) real.onPeerLeave(handlers.leave)
        if (handlers.error) real.onError?.(handlers.error)
      },
      () => {},
    )
    return {
      send: (message, to) => real?.send(message, to),
      onMessage: (handler) => {
        handlers.message = handler
        real?.onMessage(handler)
      },
      onPeerJoin: (handler) => {
        handlers.join = handler
        real?.onPeerJoin(handler)
      },
      onPeerLeave: (handler) => {
        handlers.leave = handler
        real?.onPeerLeave(handler)
      },
      onError: (handler) => {
        handlers.error = handler
        real?.onError?.(handler)
      },
      leave: () => {
        left = true
        real?.leave()
      },
    }
  }
}

interface FakePeer {
  id: string
  room: string
  password?: string
  message?: (message: unknown, peerId: string) => void
  join?: (peerId: string) => void
  leave?: (peerId: string) => void
}

/**
 * An in-memory network for tests. Peers in the same room with the same password see each
 * other. Delivery is asynchronous (like a real network); `settle()` waits for it, and
 * `disconnect(peerId)` drops a peer as if their connection died.
 */
export function fakeNetwork() {
  const peers: FakePeer[] = []
  let next = 0
  let pending: Promise<void> = Promise.resolve()
  const later = (fn: () => void) => {
    pending = pending.then(() => fn())
  }
  const sameRoom = (a: FakePeer, b: FakePeer) => a !== b && a.room === b.room && a.password === b.password && peers.includes(b)

  const drop = (peer: FakePeer) => {
    const others = peers.filter((p) => sameRoom(peer, p))
    peers.splice(peers.indexOf(peer), 1)
    for (const other of others) later(() => other.leave?.(peer.id))
  }

  const connect: Connect = (room, password) => {
    const peer: FakePeer = { id: `peer${++next}`, room, ...(password ? { password } : {}) }
    peers.push(peer)
    // Everyone already there and the newcomer hear about each other.
    for (const other of peers.filter((p) => sameRoom(peer, p))) {
      later(() => other.join?.(peer.id))
      later(() => peer.join?.(other.id))
    }
    return {
      send(message, to) {
        if (!peers.includes(peer)) return
        // Copied, as a real network would, so no peer shares objects with another.
        const copy = JSON.parse(JSON.stringify(message)) as unknown
        for (const other of peers.filter((p) => sameRoom(peer, p) && (to === undefined || p.id === to))) later(() => other.message?.(copy, peer.id))
      },
      onMessage: (handler) => void (peer.message = handler),
      onPeerJoin: (handler) => void (peer.join = handler),
      onPeerLeave: (handler) => void (peer.leave = handler),
      leave: () => {
        if (peers.includes(peer)) drop(peer)
      },
    }
  }

  return {
    connect,
    /** Waits until every message sent so far, and every message those caused, has arrived. */
    async settle() {
      for (let i = 0; i < 50; i++) {
        const current = pending
        await current
        if (current === pending) return
      }
    },
    disconnect(peerId: string) {
      const peer = peers.find((p) => p.id === peerId)
      if (peer) drop(peer)
    },
    peerIds: () => peers.map((p) => p.id),
  }
}
