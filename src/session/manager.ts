/**
 * The browser's game session (Phase 4): at most one at a time, either the GM's or a player's.
 * It resumes after a reload from what ./storage.ts saved. Not tied to React: ./context.ts
 * shares it with the pages.
 */
import type { Clock } from '../play/state'
import { newRoomCode } from './code'
import { GmSession, PlayerSession } from './controller'
import type { SessionStore } from './storage'
import type { Connect } from './transport'
import { SAVED_VERSION, type LastGame, type PlayerSaved } from './types'

export interface CurrentSession {
  gm?: GmSession
  player?: PlayerSession
}

export class SessionManager {
  private current: CurrentSession = {}
  private listeners = new Set<() => void>()
  private connect: Connect
  private store: SessionStore
  private clock: () => Clock

  constructor(connect: Connect, store: SessionStore, clock: () => Clock) {
    this.connect = connect
    this.store = store
    this.clock = clock
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): CurrentSession => this.current

  /** The last game joined (kept after leaving), to join again without typing. */
  lastGame(): Omit<LastGame, 'v'> | undefined {
    const game = this.store.loadLastGame()
    return game && { room: game.room, ...(game.password ? { password: game.password } : {}) }
  }

  /** Reconnects to the saved session, if there is one and nothing's connected. */
  resume(): void {
    if (this.current.gm || this.current.player) return
    const gm = this.store.loadGm()
    const player = this.store.loadPlayer()
    try {
      if (gm) this.set({ gm: new GmSession(this.connect, gm, this.clock, (s) => this.store.saveGm(s)) })
      else if (player) this.set({ player: new PlayerSession(this.connect, player, this.clock, (s) => this.store.savePlayer(s)) })
    } catch {
      // A saved session that can't even start would fail on every load: forget it.
      this.store.saveGm(undefined)
      this.store.savePlayer(undefined)
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
    this.set({ gm: new GmSession(this.connect, { room: newRoomCode(), ...(password ? { password } : {}) }, this.clock, (s) => this.store.saveGm(s)) })
  }

  /** Joins a game as a player with one hero, leaving any session first. */
  join({ room, password, heroId, sharedUpTo }: { room: string; password?: string; heroId: string; sharedUpTo?: string }): void {
    // Already in this game with this hero: carry on, keeping what's been shared and added.
    const current = this.current.player
    if (current && current.room === room && current.heroId === heroId && current.password === password) return
    this.disconnect()
    this.store.saveGm(undefined)
    this.store.saveLastGame({ v: SAVED_VERSION, room, ...(password ? { password } : {}) })
    const saved: PlayerSaved = { v: SAVED_VERSION, room, ...(password ? { password } : {}), clientId: this.store.clientId(), heroId, ...(sharedUpTo ? { sharedUpTo } : {}), applied: [] }
    this.set({ player: new PlayerSession(this.connect, saved, this.clock, (s) => this.store.savePlayer(s)) })
  }

  /** Leaves (or, for the GM, ends) the session, forgetting it. */
  leave(): void {
    this.disconnect()
    this.store.saveGm(undefined)
    this.store.savePlayer(undefined)
    this.set({})
  }

  private disconnect(): void {
    this.current.gm?.leave()
    this.current.player?.leave()
  }

  private set(next: CurrentSession): void {
    this.current = next
    for (const l of this.listeners) l()
  }
}
