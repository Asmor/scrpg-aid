/**
 * The device's game session (docs/design/game-table/spec.md, section 10): at most one at a time,
 * hosting a game (./host.ts), playing in one (./client.ts) or watching one (./watch.ts). It resumes after a reload
 * from what ./storage.ts saved. Not tied to React: ./context.ts shares it with the pages.
 */
import type { GameStore } from '../game/store'
import type { Hero } from '../hero/model'
import type { Clock } from '../play/state'
import { PlayerClient, type PlayingSaved, type Received } from './client'
import type { JoinedGame, JoinedStore } from '../game/joined-store'
import { newRoomCode } from './code'
import { HostSession, type HostSaved } from './host'
import type { SessionStore } from './storage'
import type { Connect } from './transport'
import { ObserverClient, type WatchingSaved } from './watch'
import { SAVED_VERSION, type LastGame } from './types'

/** The least time between writes of a joined game's cache. */
export const CACHE_EVERY = 1000

export interface CurrentSession {
  /** The game this device is hosting. */
  hosting?: HostSession
  /** The hosted game this device is playing in. */
  playing?: PlayerClient
  /** The hosted game this device is watching. */
  watching?: ObserverClient
}

export class SessionManager {
  private current: CurrentSession = {}
  private listeners = new Set<() => void>()
  private connect: Connect
  private store: SessionStore
  private clock: () => Clock
  private games: GameStore | undefined
  private joined: JoinedStore | undefined

  constructor(connect: Connect, store: SessionStore, clock: () => Clock, games?: GameStore, joined?: JoinedStore) {
    this.connect = connect
    this.store = store
    this.clock = clock
    this.games = games
    this.joined = joined
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): CurrentSession => this.current

  /** The name this device's user goes by at the table. */
  name(): string {
    return this.store.loadName()
  }

  /** The name this screen goes by when watching. */
  screenName(): string {
    return this.store.loadScreenName()
  }

  /** The last game joined (kept after leaving), to join again without typing. */
  lastGame(): Omit<LastGame, 'v'> | undefined {
    const game = this.store.loadLastGame()
    return game && { room: game.room, ...(game.at ? { at: game.at } : {}) }
  }

  /**
   * Starts hosting a game as `gm`, leaving any session first. The game keeps its code from one
   * hosting to the next (players' links and cached games keep working); it gets one the first time.
   */
  hostGame(gameId: string, gm: string): Promise<string | undefined> {
    // A second click while the first is still starting waits for it (and can't make a second code).
    const starting = this.starting.get(gameId)
    if (starting) return starting
    const start = this.startHosting(gameId, gm).finally(() => this.starting.delete(gameId))
    this.starting.set(gameId, start)
    return start
  }

  private starting = new Map<string, Promise<string | undefined>>()

  /** Resolves with why hosting couldn't start, or undefined once it has. */
  private async startHosting(gameId: string, gm: string): Promise<string | undefined> {
    const games = this.games
    if (!games) return "Games can't be saved here, so they can't be hosted."
    if (this.current.hosting?.gameId === gameId) return undefined
    let code: string
    try {
      const found = await games.get(gameId)
      if (found.status !== 'found') return found.status === 'missing' ? 'The game was deleted.' : `The game couldn't be read: ${found.error}`
      code = found.game.code ?? newRoomCode()
      if (!found.game.code) await games.save({ ...found.game, code })
    } catch (e) {
      return `Couldn't start hosting: ${e instanceof Error ? e.message : String(e)}`
    }
    if (this.current.hosting?.gameId === gameId) return undefined
    this.disconnect()
    this.store.savePlaying(undefined)
    this.store.saveWatching(undefined)
    this.store.saveName(gm)
    this.set({ hosting: this.newHost({ room: code, gameId, gm: gm.trim() || 'GM', removed: [] }) })
    return undefined
  }

  /** Changes the name players see for the GM, and remembers it. */
  renameGm(gm: string): void {
    const name = gm.trim()
    if (!name) return
    this.store.saveName(name)
    this.current.hosting?.renameGm(name)
  }

  /** Stops hosting; the game stays as it is. Resolves once its last change is saved. */
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

  /**
   * Joins a hosted game as a player with one hero, leaving any session first. `cached` is the
   * game as this device last saw it (a joined game opened from the Games page), shown until the
   * GM answers.
   */
  joinGame({ room, name, hero, cached }: { room: string; name: string; hero: Hero; cached?: Received }): void {
    const current = this.current.playing
    if (current && current.info.room === room && current.info.heroSourceId === hero.id && current.getSnapshot().status !== 'refused') return
    this.disconnect()
    this.store.saveHost(undefined)
    this.store.saveWatching(undefined)
    this.store.saveName(name)
    this.store.saveLastGame({ v: SAVED_VERSION, room, at: this.clock().now.toISOString() })
    const saved: PlayingSaved = { v: 1, room, name: name.trim() || 'A player', heroSourceId: hero.id, sheet: hero }
    this.store.savePlaying(saved)
    this.set({ playing: this.newPlaying(saved, cached) })
  }

  /** Leaves the game being played: the hero stays at the table, shown as disconnected. */
  leaveGame(): void {
    if (!this.current.playing) return
    this.disconnect()
    this.store.savePlaying(undefined)
    this.set({})
  }

  /** Watches a hosted game on this screen (section 13), leaving any session first. The screen's name is remembered. */
  watchGame({ room, screenName }: { room: string; screenName: string }): void {
    const name = screenName.trim()
    const current = this.current.watching
    if (current && current.room === room && current.info.screenName === name && current.getSnapshot().status !== 'refused') return
    this.disconnect()
    this.store.saveHost(undefined)
    this.store.savePlaying(undefined)
    this.store.saveScreenName(name)
    const saved: WatchingSaved = { v: 1, room, screenName: name }
    this.store.saveWatching(saved)
    this.set({ watching: this.newWatching(saved) })
  }

  /** Stops watching. */
  stopWatching(): void {
    if (!this.current.watching) return
    this.disconnect()
    this.store.saveWatching(undefined)
    this.set({})
  }

  noteSeen(key: string): boolean {
    return this.store.noteSeen(key)
  }

  markNoteSeen(key: string): void {
    this.store.markNoteSeen(key)
  }

  /** Reconnects to the saved session, if there is one and nothing's connected. */
  resume(): void {
    if (this.current.hosting || this.current.playing || this.current.watching) return
    const host = this.games ? this.store.loadHost() : undefined
    const playing = this.store.loadPlaying()
    const watching = this.store.loadWatching()
    try {
      if (host) this.set({ hosting: this.newHost(host) })
      else if (playing) this.set({ playing: this.newPlaying(playing) })
      else if (watching) this.set({ watching: this.newWatching(watching) })
    } catch {
      // A saved session that can't even start would fail on every load: forget it.
      this.store.saveHost(undefined)
      this.store.savePlaying(undefined)
      this.store.saveWatching(undefined)
    }
  }

  /** Disconnects without forgetting the session, so resume() can pick it up again. */
  suspend(): void {
    this.disconnect()
    this.set({})
  }

  private newHost(saved: Omit<HostSaved, 'v'>): HostSession {
    return new HostSession(this.connect, saved, this.games!, this.clock, (s) => this.store.saveHost(s))
  }

  private newWatching(saved: WatchingSaved): ObserverClient {
    return new ObserverClient(this.connect, { room: saved.room, clientId: this.store.clientId(), screenName: saved.screenName }, () => this.clock().now)
  }

  private newPlaying(saved: PlayingSaved, cached?: Received): PlayerClient {
    return new PlayerClient(
      this.connect,
      { room: saved.room, clientId: this.store.clientId(), name: saved.name, heroSourceId: saved.heroSourceId, sheet: saved.sheet },
      {
        ...(saved.syncWaiting ? { syncWaiting: true } : {}),
        ...(cached ? { cached } : {}),
        // Every state the GM sends is cached, to open the game later without the GM (section 11).
        onReceive: (r) => {
          if (!this.joined || !r.you) return
          const record: JoinedGame = { id: r.table.id, room: r.room, gm: r.gm, heroId: r.you.heroId, heroSourceId: saved.heroSourceId, sheet: saved.sheet, name: saved.name, since: r.you.since, updatedAt: r.at, version: r.version, table: r.table }
          this.cache(record)
        },
        // A sync request waiting for the GM is remembered across reloads.
        onSyncWaiting: (waiting) => {
          const now = this.store.loadPlaying()
          if (now?.room !== saved.room) return
          const { syncWaiting: _, ...rest } = now
          this.store.savePlaying(waiting ? { ...rest, syncWaiting: true } : rest)
        },
      },
    )
  }

  /** The next cache write, and the timer that spaces writes at least CACHE_EVERY apart. */
  private cachePending: JoinedGame | undefined
  private cacheTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * Caches a game a player is in. A busy game sends many states, so writes are spaced: the first
   * goes at once, and later ones within CACHE_EVERY wait and write only the latest.
   */
  private cache(record: JoinedGame): void {
    this.cachePending = record
    if (this.cacheTimer) return
    this.flushCache()
    this.cacheTimer = setTimeout(() => {
      this.cacheTimer = undefined
      if (this.cachePending) this.cache(this.cachePending)
    }, CACHE_EVERY)
  }

  private flushCache(): void {
    const record = this.cachePending
    this.cachePending = undefined
    // A cache that can't be written just isn't there offline.
    if (record) this.joined?.save(record).catch(() => {})
  }

  private disconnect(): void {
    // Whatever was waiting to be cached is written before leaving.
    clearTimeout(this.cacheTimer)
    this.cacheTimer = undefined
    this.flushCache()
    this.current.hosting?.leave()
    this.current.playing?.leave()
    this.current.watching?.leave()
  }

  private set(next: CurrentSession): void {
    this.current = next
    for (const l of this.listeners) l()
  }
}
