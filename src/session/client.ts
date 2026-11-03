/**
 * A player's device in a hosted game (docs/design/game-table/spec.md, sections 7, 8, 10 and 11).
 * It says hello with the player's hero, keeps the latest projection the GM's device sent, and
 * sends each action as its own message, waiting for the result. Nothing changes on the player's
 * side until the GM's device says so: there are no optimistic changes.
 *
 * - An action with no result within 5 seconds didn't reach the GM ("Nothing changed").
 * - While the GM is unreachable, actions are blocked, not queued. After 30 seconds the page
 *   switches to the offline view, and the device keeps trying every 30 seconds.
 */
import type { HeroAction } from '../game/actions'
import type { TableView } from '../game/project'
import type { Hero } from '../hero/model'
import { Subscribable } from './subscribable'
import { messageVersion, PROTOCOL_VERSION, readHostMessage, type ClientMessage, type RefusedReason, type YouAre } from './protocol'
import { quietAfterLeave, type Connect, type Transport } from './transport'
import { heroShape } from '../hero/validate'
import { nonEmptyString, object, oneOf, string } from '../shape'

/** How long an action waits for its result. */
export const RESULT_TIMEOUT = 5000
/** How long the GM can be away before the offline view, and how often to try again after that. */
export const OFFLINE_AFTER = 30_000
export const RETRY_EVERY = 30_000

/**
 * - connecting: not reached the GM yet (the page shows the cached game, if any, read-only)
 * - live: the GM is connected
 * - reconnecting: the GM went away moments ago; actions are paused
 * - offline: the GM has been away a while (or never answered); read-only, still retrying
 * - refused: the GM's device won't take this device (see `refused`)
 */
export type ClientStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'refused'

/** What the GM last sent: the table as this player sees it. */
export interface Received {
  room: string
  version: number
  table: TableView
  gm: string
  you?: YouAre
  /** When it arrived (ISO 8601): "as of 9:42 PM". */
  at: string
}

/** An action sent and not answered yet, or one that didn't reach the GM. */
export interface PendingAction {
  id: string
  action: HeroAction
  timedOut?: true
}

/** Something to tell the player once (a toast): a rejected action, the GM's answer to a sync request. */
export interface Notice {
  id: string
  kind: 'rejected' | 'unreachable' | 'synced' | 'notSynced'
  text: string
  /** The action to try again, for "Didn't reach the GM". */
  retry?: string
  adjustments?: string[]
}

export interface ClientSnapshot {
  status: ClientStatus
  refused?: RefusedReason | 'oldHost'
  received?: Received
  pending: PendingAction[]
  notices: Notice[]
  /** A sheet update request is waiting for the GM. */
  syncWaiting: boolean
}

export interface ClientInfo {
  room: string
  clientId: string
  name: string
  heroSourceId: string
  /** The player's library sheet: copied in on first join. */
  sheet: Hero
}

export interface ClientOptions {
  /** The game as last seen, when it was cached: shown read-only until the GM answers. */
  cached?: Received
  syncWaiting?: boolean
  /** Called with each state the GM sends, to cache it. */
  onReceive?: (received: Received) => void
  /** Called when the sync request starts or stops waiting, to remember it. */
  onSyncWaiting?: (waiting: boolean) => void
  now?: () => Date
  newId?: () => string
}

export class PlayerClient extends Subscribable<ClientSnapshot> {
  readonly info: ClientInfo
  private connect: Connect
  private transport!: Transport
  private gmPeer: string | undefined
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private offlineTimer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setInterval> | undefined
  private options: ClientOptions
  private left = false
  private n = 0

  constructor(connect: Connect, info: ClientInfo, options: ClientOptions = {}) {
    super({ status: 'connecting', pending: [], notices: [], syncWaiting: options.syncWaiting ?? false, ...(options.cached ? { received: options.cached } : {}) })
    this.connect = connect
    this.info = info
    this.options = options
    this.open()
    // Not reached within 30 seconds: offline (still trying).
    this.offlineTimer = setTimeout(() => this.goOffline(), OFFLINE_AFTER)
  }

  /** Whether actions can be sent now. */
  get live(): boolean {
    return this.snapshot.status === 'live'
  }

  /** The player's hero in the game, once the GM has said which. */
  get heroId(): string | undefined {
    return this.snapshot.received?.you?.heroId
  }

  /** Sends an action for the player's hero. False when it can't be sent (the GM isn't connected). */
  act(action: HeroAction): boolean {
    const heroId = this.heroId
    if (!this.live || !heroId || !this.gmPeer) return false
    const id = this.newId()
    this.publish({ ...this.snapshot, pending: [...this.snapshot.pending, { id, action }] })
    this.sendAction(id, heroId, action)
    return true
  }

  /** Sends an action that didn't reach the GM again, under the same id (the GM applies it at most once). */
  retry(id: string): boolean {
    const pending = this.snapshot.pending.find((p) => p.id === id)
    const heroId = this.heroId
    if (!pending || !this.live || !heroId) return false
    this.publish({ ...this.snapshot, pending: this.snapshot.pending.map((p) => (p.id === id ? { id: p.id, action: p.action } : p)), notices: this.snapshot.notices.filter((n) => n.retry !== id) })
    this.sendAction(id, heroId, pending.action)
    return true
  }

  /** Asks the GM to update the game's copy to this sheet; a newer request replaces an older one. */
  requestSync(sheet: Hero): boolean {
    const heroId = this.heroId
    if (!this.live || !heroId) return false
    this.toGm({ v: PROTOCOL_VERSION, type: 'syncRequest', heroId, sheet })
    this.setSyncWaiting(true)
    return true
  }

  cancelSync(): boolean {
    const heroId = this.heroId
    if (!this.live || !heroId) return false
    this.toGm({ v: PROTOCOL_VERSION, type: 'syncCancel', heroId })
    this.setSyncWaiting(false)
    return true
  }

  /** Forgets a notice once shown, and a timed-out action with it. */
  dismiss(noticeId: string): void {
    const notice = this.snapshot.notices.find((n) => n.id === noticeId)
    if (!notice) return
    this.publish({ ...this.snapshot, notices: this.snapshot.notices.filter((n) => n.id !== noticeId), pending: notice.retry ? this.snapshot.pending.filter((p) => p.id !== notice.retry) : this.snapshot.pending })
  }

  /** Shows the game as cached on this device until the GM answers (nothing once a state has arrived). */
  showCached(cached: Received): void {
    if (this.snapshot.received || cached.room !== this.info.room) return
    this.publish({ ...this.snapshot, received: cached })
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
    for (const t of this.timers.values()) clearTimeout(t)
    clearTimeout(this.offlineTimer)
    clearInterval(this.retryTimer)
  }

  private open(): void {
    this.transport = quietAfterLeave(this.connect(this.info.room))
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
        if (msg.room !== this.info.room) return
        this.gmPeer = peer
        clearTimeout(this.offlineTimer)
        clearInterval(this.retryTimer)
        delete this.retryTimer
        const received: Received = { room: msg.room, version: msg.version, table: msg.table, gm: msg.gm, ...(msg.you ? { you: msg.you } : {}), at: this.now().toISOString() }
        const { refused: _, ...rest } = this.snapshot
        this.publish({ ...rest, status: 'live', received })
        this.options.onReceive?.(received)
        return
      }
      case 'result': {
        clearTimeout(this.timers.get(msg.id))
        this.timers.delete(msg.id)
        const pending = this.snapshot.pending.filter((p) => p.id !== msg.id)
        const notices = msg.ok ? this.snapshot.notices : [...this.snapshot.notices, { id: this.newId(), kind: 'rejected' as const, text: `Not applied: ${msg.reason}.` }]
        this.publish({ ...this.snapshot, pending, notices })
        return
      }
      case 'syncResult': {
        if (msg.heroId !== this.heroId) return
        this.setSyncWaiting(false)
        const name = this.heroName()
        const notice: Notice = msg.approved
          ? { id: this.newId(), kind: 'synced', text: `Updated. The GM approved: ${name} now matches your sheet.`, adjustments: msg.adjustments }
          : { id: this.newId(), kind: 'notSynced', text: "Not updated. The GM kept the game's copy. You can ask again from My hero ⋯." }
        this.publish({ ...this.snapshot, notices: [...this.snapshot.notices, notice] })
        return
      }
      case 'refused':
        this.gmPeer = peer
        this.refuse(msg.reason)
        return
    }
  }

  private heroName(): string {
    const hero = this.snapshot.received?.table.heroes.find((h) => h.id === this.heroId)
    return hero?.sheet.details.name.trim() || 'your hero'
  }

  private sendAction(id: string, heroId: string, action: HeroAction): void {
    this.toGm({ v: PROTOCOL_VERSION, type: 'action', id, heroId, action, basedOn: this.snapshot.received?.version ?? 0 })
    clearTimeout(this.timers.get(id))
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id)
        if (!this.snapshot.pending.some((p) => p.id === id)) return
        this.publish({
          ...this.snapshot,
          pending: this.snapshot.pending.map((p) => (p.id === id ? { ...p, timedOut: true as const } : p)),
          notices: [...this.snapshot.notices, { id: this.newId(), kind: 'unreachable', text: "Didn't reach the GM. Nothing changed.", retry: id }],
        })
      }, RESULT_TIMEOUT),
    )
  }

  private hello(peer?: string): void {
    const { clientId, name, heroSourceId, sheet } = this.info
    this.transport.send({ v: PROTOCOL_VERSION, type: 'hello', role: 'player', clientId, name, heroSourceId, sheet } satisfies ClientMessage, peer)
  }

  private toGm(msg: ClientMessage): void {
    if (this.gmPeer) this.transport.send(msg, this.gmPeer)
  }

  /** The GM went away: actions pause, unanswered ones won't be answered, and after a while the page goes offline. */
  private gmGone(): void {
    if (this.snapshot.status === 'refused') return
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    this.publish({ ...this.snapshot, status: 'reconnecting', pending: [] })
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

  private refuse(reason: RefusedReason | 'oldHost'): void {
    clearTimeout(this.offlineTimer)
    clearInterval(this.retryTimer)
    this.publish({ ...this.snapshot, status: 'refused', refused: reason, pending: [] })
  }

  private setSyncWaiting(waiting: boolean): void {
    if (this.snapshot.syncWaiting === waiting) return
    this.publish({ ...this.snapshot, syncWaiting: waiting })
    this.options.onSyncWaiting?.(waiting)
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private newId(): string {
    return this.options.newId?.() ?? `${this.info.clientId}-${Date.now().toString(36)}-${++this.n}`
  }
}

/** What a player's device saves to rejoin after a reload. */
export interface PlayingSaved {
  v: 1
  room: string
  name: string
  heroSourceId: string
  /** The library sheet joined with (sent again on rejoin; the GM only uses it on a first join). */
  sheet: Hero
  syncWaiting?: true
}

const playingSaved = object({ v: oneOf(1), room: nonEmptyString, name: string, heroSourceId: nonEmptyString, sheet: heroShape, 'syncWaiting?': oneOf(true) })

/** A stored game this device is playing in, or undefined if it's malformed or from another version. */
export function readPlayingSaved(value: unknown): PlayingSaved | undefined {
  return playingSaved(value, 'saved') ? undefined : (value as PlayingSaved)
}
