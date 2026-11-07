/**
 * A device's connection to the GM's device in a hosted game (scrpg-aid-designs/game-table/spec.md,
 * sections 10 and 11), shared by players (./client.ts) and observers (./watch.ts). It says hello
 * to every peer (only the GM answers), keeps the latest projection the GM's device sent, and
 * tracks whether the GM is reachable:
 *
 * - connecting: not reached the GM yet
 * - live: the GM is connected
 * - reconnecting: the GM went away moments ago
 * - offline: the GM has been away a while (or never answered); still retrying every 30 seconds
 * - refused: the GM's device won't take this device (see `refused`)
 */
import type { TableView } from '../game/project'
import { Subscribable } from './subscribable'
import { messageVersion, PROTOCOL_VERSION, readHostMessage, type HostMessage, type RefusedReason, type YouAre } from './protocol'
import { quietAfterLeave, type Connect, type Transport } from './transport'

/** How long the GM can be away before the offline view, and how often to try again after that. */
export const OFFLINE_AFTER = 30_000
export const RETRY_EVERY = 30_000

export type ClientStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'refused'

/** What the GM last sent: the table as this device sees it. */
export interface Received {
  room: string
  version: number
  table: TableView
  gm: string
  /** A player's own hero (never sent to observers). */
  you?: YouAre
  /** When it arrived (ISO 8601): "as of 9:42 PM". */
  at: string
}

export interface LinkSnapshot {
  status: ClientStatus
  refused?: RefusedReason | 'oldHost'
  received?: Received
}

/** The GM's other messages, for a subclass to handle (results, sync answers). */
export type OtherHostMessage = Exclude<HostMessage, { type: 'state' } | { type: 'refused' } | { type: 'codeChanged' } | { type: 'removed' }>

export abstract class HostLink<S extends LinkSnapshot> extends Subscribable<S> {
  private code: string
  /** Codes this game had before the GM changed it, oldest first: pages on an old code's link follow the game. */
  readonly formerRooms: string[] = []
  private connect: Connect
  protected transport!: Transport
  protected gmPeer: string | undefined
  private offlineTimer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setInterval> | undefined
  private left = false
  private readonly clockNow: (() => Date) | undefined

  constructor(connect: Connect, room: string, initial: S, now?: () => Date) {
    super(initial)
    this.connect = connect
    this.code = room
    this.clockNow = now
  }

  /** Connects. Subclasses call this at the end of their constructors, once their own fields are set. */
  protected start(): void {
    this.open()
    // Not reached within 30 seconds: offline (still trying).
    this.offlineTimer = setTimeout(() => this.goOffline(), OFFLINE_AFTER)
  }

  /** The game's code: the room this device joins. */
  get room(): string {
    return this.code
  }

  /** Whether the GM is connected now. */
  get live(): boolean {
    return this.snapshot.status === 'live'
  }

  /** Connects again from scratch (Try to reconnect). */
  reconnect(): void {
    if (this.left) return
    this.transport.leave()
    delete this.gmPeer
    this.open()
  }

  leave(): void {
    this.left = true
    this.transport.leave()
    clearTimeout(this.offlineTimer)
    clearInterval(this.retryTimer)
    this.onLeave()
  }

  /** Says hello to a peer (or everyone): only the GM's device answers. */
  protected abstract hello(peer?: string): void
  /** A message from the GM other than a state or a refusal. */
  protected onOther(_msg: OtherHostMessage): void {}
  /** A state arrived and was published. */
  protected onState(_received: Received): void {}
  /** The changes to make to the snapshot when the GM goes away (a player's pending actions are dropped). */
  protected gmGoneChanges(): Partial<S> {
    return {}
  }
  protected onLeave(): void {}

  protected now(): Date {
    return this.clockNow?.() ?? new Date()
  }

  protected toGm(msg: unknown): void {
    if (this.gmPeer) this.transport.send(msg, this.gmPeer)
  }

  private open(): void {
    this.transport = quietAfterLeave(this.connect(this.room))
    // Anyone could be the GM, so say hello to each peer; only the GM answers.
    this.transport.onPeerJoin((peer) => this.hello(peer))
    this.transport.onPeerLeave((peer) => {
      if (peer !== this.gmPeer) return
      delete this.gmPeer
      this.gmGone()
    })
    this.transport.onMessage((raw, peer) => this.receive(raw, peer))
  }

  private receive(raw: unknown, peer: string): void {
    const msg = readHostMessage(raw)
    if (!msg) {
      // A GM's device on the older version of the app sends version 1 states.
      const v = messageVersion(raw)
      if (v !== undefined && v < PROTOCOL_VERSION && (raw as { type?: unknown }).type === 'state') this.refuse('oldHost')
      return
    }
    // The first peer to send this room's state is the GM; anyone else claiming to be is ignored.
    if (this.gmPeer && peer !== this.gmPeer) return
    switch (msg.type) {
      case 'state': {
        if (msg.room !== this.room) return
        this.gmPeer = peer
        clearTimeout(this.offlineTimer)
        clearInterval(this.retryTimer)
        this.retryTimer = undefined
        const received: Received = { room: msg.room, version: msg.version, table: msg.table, gm: msg.gm, ...(msg.you ? { you: msg.you } : {}), at: this.now().toISOString() }
        const { refused: _, ...rest } = this.snapshot
        this.publish({ ...rest, status: 'live', received } as S)
        this.onState(received)
        return
      }
      case 'refused':
        this.gmPeer = peer
        this.refuse(msg.reason)
        return
      case 'removed':
        if (peer !== this.gmPeer) return
        this.refuse('removed')
        return
      case 'codeChanged':
        if (peer !== this.gmPeer) return
        this.moveTo(msg.code)
        return
      default:
        this.onOther(msg)
    }
  }

  /** The GM moved the game to a new code: follow it there (the GM's device takes us back as before). */
  private moveTo(code: string): void {
    if (code === this.code) return
    this.formerRooms.push(this.code)
    this.code = code
    delete this.gmPeer
    this.publish({ ...this.snapshot, ...this.gmGoneChanges(), status: 'reconnecting' })
    clearTimeout(this.offlineTimer)
    this.offlineTimer = setTimeout(() => this.goOffline(), OFFLINE_AFTER)
    this.transport.leave()
    this.open()
    this.onCodeChanged(code)
  }

  /** The game's code changed (after this device moved to it). */
  protected onCodeChanged(_code: string): void {}

  /** The GM went away: the page shows reconnecting, and after a while goes offline. */
  private gmGone(): void {
    if (this.snapshot.status === 'refused') return
    this.publish({ ...this.snapshot, ...this.gmGoneChanges(), status: 'reconnecting' })
    clearTimeout(this.offlineTimer)
    this.offlineTimer = setTimeout(() => this.goOffline(), OFFLINE_AFTER)
    // A reloaded GM may have joined before the old connection was noticed gone: ask everyone again.
    this.hello()
  }

  private goOffline(): void {
    if (this.snapshot.status === 'live' || this.snapshot.status === 'refused' || this.left) return
    this.publish({ ...this.snapshot, status: 'offline' })
    if (!this.retryTimer) this.retryTimer = setInterval(() => this.reconnect(), RETRY_EVERY)
  }

  /** The GM's device won't take this one. */
  protected refuse(reason: RefusedReason | 'oldHost'): void {
    clearTimeout(this.offlineTimer)
    clearInterval(this.retryTimer)
    this.publish({ ...this.snapshot, ...this.gmGoneChanges(), status: 'refused', refused: reason })
  }
}
