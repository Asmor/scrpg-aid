/**
 * The browser's game session (Phase 4): at most one at a time, either the GM's or a player's.
 * It resumes after a reload from what ./storage.ts saved. Not tied to React: ./context.ts
 * shares it with the pages.
 */
import type { Clock } from '../play/state'
import { newRoomCode } from './code'
import { GmSession, PlayerSession } from './controller'
import { HostSession } from './host'
import type { GameStore } from '../game/store'
import type { SessionStore } from './storage'
import type { Connect } from './transport'
import { SAVED_VERSION, type LastGame, type PlayerSaved } from './types'
import type { HostSaved } from './host'

export interface CurrentSession {
  gm?: GmSession
  player?: PlayerSession
  /** The game this device is hosting (the game table, Phase 2). */
  hosting?: HostSession
}

export class SessionManager {
  private current: CurrentSession = {}
  private listeners = new Set<() => void>()
  private connect: Connect
  private store: SessionStore
  private clock: () => Clock
  private games: GameStore | undefined

  constructor(connect: Connect, store: SessionStore, clock: () => Clock, games?: GameStore) {
    this.connect = connect
    this.store = store
    this.clock = clock
    this.games = games
  }

  /** The name this device's user goes by at the table. */
  name(): string {
    return this.store.loadName()
  }

  /** Starts hosting a game as `gm`, leaving any session first. */
  hostGame(gameId: string, gm: string): void {
    if (!this.games) return
    if (this.current.hosting?.gameId === gameId) return
    this.disconnect()
    this.store.saveGm(undefined)
    this.store.savePlayer(undefined)
    this.store.saveName(gm)
    this.set({ hosting: this.newHost({ room: newRoomCode(), gameId, gm: gm.trim() || 'GM', removed: [] }) })
  }

  /** Stops hosting; the game stays as it is. */
  stopHosting(): Promise<void> {
    const host = this.current.hosting
    if (!host) return Promise.resolve()
    host.leave()
    this.store.saveHost(undefined)
    // Once the last change is saved, so the table loads the game as it ended.
    return host.settled.then(() => {
      if (this.current.hosting === host) this.set({})
    })
  }

  private newHost(saved: Omit<HostSaved, 'v'>): HostSession {
    return new HostSession(this.connect, saved, this.games!, this.clock, (s) => this.store.saveHost(s))
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): CurrentSession => this.current

  /** The last game joined (kept after leaving), to join again without typing. */
  lastGame(): Omit<LastGame, 'v'> | undefined {
    const game = this.store.loadLastGame()
    return game && { room: game.room, ...(game.password ? { password: game.password } : {}), ...(game.at ? { at: game.at } : {}) }
  }

  /** Reconnects to the saved session, if there is one and nothing's connected. */
  resume(): void {
    if (this.current.gm || this.current.player || this.current.hosting) return
    const gm = this.store.loadGm()
    const player = this.store.loadPlayer()
    const host = this.games ? this.store.loadHost() : undefined
    try {
      if (host) this.set({ hosting: this.newHost(host) })
      else if (gm) this.set({ gm: new GmSession(this.connect, gm, this.clock, (s) => this.store.saveGm(s)) })
      else if (player) this.set({ player: new PlayerSession(this.connect, player, this.clock, (s) => this.store.savePlayer(s)) })
    } catch {
      // A saved session that can't even start would fail on every load: forget it.
      this.store.saveGm(undefined)
      this.store.savePlayer(undefined)
      this.store.saveHost(undefined)
    }
  }

  /** Disconnects without forgetting the session, so resume() can pick it up again. */
  suspend(): void {
    this.disconnect()
    this.set({})
  }

  /** Starts hosting a new game, leaving any session first. */
  host(password?: string): void {
    this.disconnect()
    this.store.savePlayer(undefined)
    this.store.saveHost(undefined)
    this.set({ gm: new GmSession(this.connect, { room: newRoomCode(), ...(password ? { password } : {}) }, this.clock, (s) => this.store.saveGm(s)) })
  }

  /** Joins a game as a player with one hero, leaving any session first. */
  join({ room, password, heroId, sharedUpTo }: { room: string; password?: string; heroId: string; sharedUpTo?: string }): void {
    // Already in this game with this hero: carry on, keeping what's been shared and added.
    const current = this.current.player
    if (current && current.room === room && current.heroId === heroId && current.password === password) return
    this.disconnect()
    this.store.saveGm(undefined)
    this.store.saveHost(undefined)
    this.store.saveLastGame({ v: SAVED_VERSION, room, ...(password ? { password } : {}), at: this.clock().now.toISOString() })
    const saved: PlayerSaved = { v: SAVED_VERSION, room, ...(password ? { password } : {}), clientId: this.store.clientId(), heroId, ...(sharedUpTo ? { sharedUpTo } : {}), applied: [] }
    this.set({ player: new PlayerSession(this.connect, saved, this.clock, (s) => this.store.savePlayer(s)) })
  }

  /** Leaves (or, for the GM, ends) the session, forgetting it. */
  leave(): void {
    this.disconnect()
    this.store.saveGm(undefined)
    this.store.savePlayer(undefined)
    this.store.saveHost(undefined)
    this.set({})
  }

  private disconnect(): void {
    this.current.gm?.leave()
    this.current.player?.leave()
    this.current.hosting?.leave()
  }

  private set(next: CurrentSession): void {
    this.current = next
    for (const l of this.listeners) l()
  }
}
