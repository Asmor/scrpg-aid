/**
 * A game session in a browser (Phase 4): the GM's or a player's end, wiring the pure session
 * logic (./gm.ts, ./player.ts) to a transport. Each keeps a snapshot for the UI and tells
 * subscribers when it changes, and reports what needs saving so a reload can resume.
 */
import type { PlayMod, PlayHistoryEntry, PlayState } from '../hero/model'
import type { Clock } from '../play/state'
import type { Zone } from '../rules/types'
import { gmGiveMod, gmReceive, gmRemoveMember, gmSetConnected, gmSetScene, newSession } from './gm'
import { applySession, entriesToShare } from './player'
import type { Connect, Transport } from './transport'
import { FEED_BATCH, INBOX_LIMIT, readGmMessage, readPlayerMessage, SAVED_VERSION, SESSION_VERSION, type GmMessage, type GmSaved, type HeroSummary, type PlayerMessage, type PlayerSaved, type SessionState } from './types'

type Listener = () => void

class Subscribable<T> {
  private listeners = new Set<Listener>()
  protected snapshot: T
  constructor(snapshot: T) {
    this.snapshot = snapshot
  }
  /** For useSyncExternalStore. */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot = (): T => this.snapshot
  protected publish(snapshot: T): void {
    this.snapshot = snapshot
    for (const l of this.listeners) l()
  }
}

export class GmSession extends Subscribable<SessionState> {
  readonly room: string
  readonly password?: string
  private transport: Transport
  /** Which player each connected peer is (peer ids change when a browser reloads; client ids don't). */
  private peers = new Map<string, string>()
  private clock: () => Clock
  private save: (saved: GmSaved) => void

  constructor(connect: Connect, saved: Omit<GmSaved, 'state' | 'v'> & { state?: SessionState }, clock: () => Clock, save: (saved: GmSaved) => void = () => {}) {
    // After a reload nobody is connected until they say hello again.
    super(saved.state ? { ...saved.state, members: saved.state.members.map((m) => ({ ...m, connected: false })) } : newSession(saved.room))
    this.clock = clock
    this.save = save
    this.room = saved.room
    if (saved.password) this.password = saved.password
    this.transport = connect(saved.room, saved.password)
    this.transport.onPeerJoin((peer) => this.sendState(peer))
    this.transport.onPeerLeave((peer) => {
      const clientId = this.peers.get(peer)
      this.peers.delete(peer)
      if (clientId) this.markGone(clientId)
    })
    this.transport.onMessage((raw, peer) => {
      const msg = readPlayerMessage(raw)
      if (!msg) return
      if (msg.type === 'hello') {
        const before = this.peers.get(peer)
        this.peers.set(peer, msg.clientId)
        // A browser that changed who it is leaves its old self behind.
        if (before && before !== msg.clientId) this.markGone(before)
      }
      const clientId = this.peers.get(peer)
      if (!clientId) return
      this.apply(gmReceive(this.snapshot, clientId, msg, this.clock()))
      // A player saying hello needs the state even if nothing changed.
      if (msg.type === 'hello') this.sendState(peer)
    })
    this.saveNow()
  }

  get state(): SessionState {
    return this.snapshot
  }

  setScene(scene: Zone): void {
    this.apply(gmSetScene(this.snapshot, scene, this.clock()))
  }

  giveMod(to: string, mod: Omit<PlayMod, 'id'>): void {
    this.apply(gmGiveMod(this.snapshot, to, mod, this.clock()))
  }

  removeMember(clientId: string): void {
    this.apply(gmRemoveMember(this.snapshot, clientId, this.clock()))
  }

  leave(): void {
    this.transport.leave()
  }

  /** Marks a player away, unless another of their connections is still here. */
  private markGone(clientId: string): void {
    if (![...this.peers.values()].includes(clientId)) this.apply(gmSetConnected(this.snapshot, clientId, false))
  }

  private sendState(peer?: string): void {
    const msg: GmMessage = { v: SESSION_VERSION, type: 'state', state: this.snapshot }
    this.transport.send(msg, peer)
  }

  private apply(next: SessionState): void {
    if (next === this.snapshot) return
    this.publish(next)
    this.sendState()
    this.saveNow()
  }

  private saveNow(): void {
    this.save({ v: SAVED_VERSION, room: this.room, ...(this.password ? { password: this.password } : {}), state: this.snapshot })
  }
}

export type PlayerStatus = 'connecting' | 'connected' | 'disconnected'

export interface PlayerSnapshot {
  status: PlayerStatus
  /** The session as the GM last sent it. */
  state?: SessionState
}

/** How many applied mod ids to remember (as many as the GM can hold for one player); the GM forgets them once acknowledged anyway. */
const APPLIED_LIMIT = INBOX_LIMIT

export class PlayerSession extends Subscribable<PlayerSnapshot> {
  private transport: Transport
  private gmPeer?: string
  private hero?: HeroSummary
  private info: PlayerSaved
  private clock: () => Clock
  private save: (saved: PlayerSaved) => void

  constructor(connect: Connect, saved: PlayerSaved, clock: () => Clock, save: (saved: PlayerSaved) => void = () => {}) {
    super({ status: 'connecting' })
    this.clock = clock
    this.save = save
    this.info = saved
    this.transport = connect(saved.room, saved.password)
    // Anyone could be the GM, so say hello to each peer; only the GM answers.
    this.transport.onPeerJoin((peer) => this.hello(peer))
    this.transport.onPeerLeave((peer) => {
      if (peer !== this.gmPeer) return
      delete this.gmPeer
      this.publish({ ...this.snapshot, status: 'disconnected' })
      // A reloaded GM may have joined before the old connection was noticed gone: ask everyone again.
      this.hello()
    })
    this.transport.onMessage((raw, peer) => {
      const msg = readGmMessage(raw)
      // The first peer to send this room's state is the GM; anyone else claiming to be is ignored.
      if (!msg || msg.state.room !== this.info.room || (this.gmPeer && peer !== this.gmPeer)) return
      const first = !this.gmPeer
      this.gmPeer = peer
      this.publish({ status: 'connected', state: msg.state })
      // The hello may have gone out before the hero was known.
      if (first && this.hero) this.toGm({ v: SESSION_VERSION, type: 'hero', hero: this.hero })
    })
    this.save(this.info)
  }

  get room(): string {
    return this.info.room
  }

  get heroId(): string {
    return this.info.heroId
  }

  get clientId(): string {
    return this.info.clientId
  }

  /** Tells the table about the hero when it changes. */
  updateHero(hero: HeroSummary): void {
    if (this.hero && JSON.stringify(this.hero) === JSON.stringify(hero)) return
    this.hero = hero
    this.toGm({ v: SESSION_VERSION, type: 'hero', hero })
  }

  /** Shares history entries the table hasn't had yet (once connected; they wait until then). */
  share(history: readonly PlayHistoryEntry[]): void {
    if (!this.gmPeer || !history.length || history.at(-1)!.id === this.info.sharedUpTo) return
    const entries = entriesToShare(history, this.info.sharedUpTo)
    for (let i = 0; i < entries.length; i += FEED_BATCH) this.toGm({ v: SESSION_VERSION, type: 'feed', entries: entries.slice(i, i + FEED_BATCH) })
    this.updateInfo({ sharedUpTo: history.at(-1)!.id })
  }

  /**
   * The session's changes to the hero's play state (the GM's scene, mods given to this
   * player), or undefined when there are none. Acknowledges the mods it finds.
   */
  sync(play: PlayState): PlayState | undefined {
    const state = this.snapshot.state
    if (!state) return undefined
    const result = applySession(play, state, this.info.clientId, new Set(this.info.applied), this.clock())
    if (result.added.length) this.updateInfo({ applied: [...this.info.applied, ...result.added].slice(-APPLIED_LIMIT) })
    if (result.ack.length) this.toGm({ v: SESSION_VERSION, type: 'ack', ids: result.ack })
    return result.play === play ? undefined : result.play
  }

  /** Gives another player a bonus or penalty. False when the GM can't be reached. */
  giveMod(to: string, mod: Omit<PlayMod, 'id'>): boolean {
    if (!this.gmPeer) return false
    this.toGm({ v: SESSION_VERSION, type: 'giveMod', id: this.clock().newId(), to, mod })
    return true
  }

  leave(): void {
    this.transport.leave()
  }

  private hello(peer?: string): void {
    const msg: PlayerMessage = { v: SESSION_VERSION, type: 'hello', clientId: this.info.clientId, ...(this.hero ? { hero: this.hero } : {}) }
    this.transport.send(msg, peer)
  }

  private toGm(msg: PlayerMessage): void {
    if (this.gmPeer) this.transport.send(msg, this.gmPeer)
  }

  private updateInfo(change: Partial<PlayerSaved>): void {
    this.info = { ...this.info, ...change }
    this.save(this.info)
  }
}
