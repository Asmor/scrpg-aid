/**
 * The GM hosting a game (docs/design/game-table/spec.md, section 10). While hosting, this owns
 * the game: it applies the GM's own changes and players' actions, saves each change, and sends
 * every connected peer its projection (../game/project.ts). Players never change the game
 * themselves; they send actions, which are checked here (../game/actions.ts) and answered.
 *
 * A player is known by their device's client id, which stays the same across reloads; a peer id
 * changes whenever a browser reconnects. Joining copies the player's hero in with fresh play
 * state; joining again with the same hero picks the game's copy back up. Observers (watching on a
 * TV, say) get the observer projection and can't send anything but hello.
 */
import { applyHeroAction, trackChanges, type FieldVersions } from '../game/actions'
import { logStatusChanges } from '../game/villain-status'
import type { Game, HeroInGame } from '../game/model'
import { project, type TableView } from '../game/project'
import type { GameStore } from '../game/store'
import { addHero, findHero, removeFromTable, setGameCode, updateSheet, withLog, GM } from '../game/table'
import { heroDisplayName, type Hero } from '../hero/model'
import type { Clock } from '../play/state'
import { Subscribable } from './subscribable'
import { fitView, messageVersion, OBSERVER_LIMIT, PLAYER_LIMIT, PROTOCOL_VERSION, readClientMessage, type ClientMessage, type HostMessage, type RefusedReason } from './protocol'
import { quietAfterLeave, type Connect, type Transport } from './transport'
import { arrayOf, nonEmptyString, object, oneOf, string } from '../shape'

/** How many action results to remember, for answering an action sent again. */
const RESULTS_KEPT = 500
/** How long the old room stays open after a new code, so its last messages (the new code) get out. */
export const CODE_HANDOFF_MS = 2000

/** What the GM's device saves to pick hosting back up after a reload. */
export interface HostSaved {
  v: 1
  room: string
  gameId: string
  /** The GM's name, as players see it. */
  gm: string
  /** Client ids the GM removed (players and observers): they can't come back. */
  removed: string[]
}

const hostSaved = object({ v: oneOf(1), room: nonEmptyString, gameId: nonEmptyString, gm: string, removed: arrayOf(nonEmptyString) })

/** A stored hosting session, or undefined if it's malformed or from another version. */
export function readHostSaved(value: unknown): HostSaved | undefined {
  return hostSaved(value, 'saved') ? undefined : (value as HostSaved)
}

export interface HostSnapshot {
  /** The game, once loaded. */
  game?: Game
  /** Why the game couldn't be loaded or saved. */
  error?: string
  /** The state version: one more after every change. */
  version: number
  /** The client ids of players connected now. */
  connected: ReadonlySet<string>
  /** Observers connected now, by screen name. */
  observers: readonly Watcher[]
  /** Players who were away when the code last changed, until they come back: they need the new code from the GM. */
  needsNewCode: ReadonlySet<string>
}

/** What a new code did: the old code, and who came along, was removed, or needs the new code. Names as the GM knows them. */
export interface CodeChange {
  from: string
  code: string
  kept: string[]
  removed: string[]
  needsCode: string[]
}

/** An observer's screen. */
export interface Watcher {
  clientId: string
  screenName: string
}

type Peer = { clientId: string; role: 'player'; heroId: string } | { clientId: string; role: 'observer'; screenName: string }

/** A message from a peer before the game has loaded, handled once it has. */
type Waiting = { raw: unknown; peer: string }

export class HostSession extends Subscribable<HostSnapshot> {
  private code: string
  readonly gameId: string
  private gmName: string
  private connect: Connect
  private transport!: Transport
  /** Rooms of earlier codes, open a moment longer (see CODE_HANDOFF_MS). */
  private closing = new Set<Transport>()
  private store: GameStore
  private clock: () => Clock
  /** The GM's dice, for saves against a player's Attack. */
  private random: () => number
  private save: (saved: HostSaved) => void
  private peers = new Map<string, Peer>()
  private removed: Set<string>
  private versions: FieldVersions = {}
  /** Recent results by "<client id>:<action id>": an action sent again (Try again) is answered, never applied twice. */
  private results = new Map<string, { ok: true; notes?: string[] } | { ok: false; reason: string }>()
  private waiting: Waiting[] | undefined = []
  /** Saves happen one after another, in order. */
  private saving: Promise<void> = Promise.resolve()

  constructor(connect: Connect, saved: Omit<HostSaved, 'v'>, store: GameStore, clock: () => Clock, save: (saved: HostSaved) => void = () => {}, random: () => number = Math.random) {
    super({ version: 0, connected: new Set(), observers: [], needsNewCode: new Set() })
    this.code = saved.room
    this.connect = connect
    this.gameId = saved.gameId
    this.gmName = saved.gm
    this.removed = new Set(saved.removed)
    this.store = store
    this.clock = clock
    this.random = random
    this.save = save
    this.open()
    this.saveInfo()
    // A game that can't be loaded can't be hosted: messages are dropped from then on.
    const fail = (error: string) => {
      this.waiting = undefined
      this.publish({ ...this.snapshot, error })
    }
    store.get(saved.gameId).then(
      (r) => {
        if (r.status !== 'found') return fail(r.status === 'missing' ? 'The game was deleted.' : `The game couldn't be read: ${r.error}`)
        this.publish({ ...this.snapshot, game: r.game })
        const queued = this.waiting ?? []
        this.waiting = undefined
        for (const w of queued) this.receive(w.raw, w.peer)
      },
      (e: unknown) => fail(`The game couldn't be read: ${e instanceof Error ? e.message : String(e)}`),
    )
  }

  /** The game's code: the room players join. */
  get room(): string {
    return this.code
  }

  /** Joins the room for the current code. Events from an earlier room (a code since changed) are ignored. */
  private open(): void {
    const t = quietAfterLeave(this.connect(this.code))
    this.transport = t
    t.onPeerJoin((peer) => t === this.transport && this.sendState(peer))
    t.onPeerLeave((peer) => {
      if (t !== this.transport) return
      this.peers.delete(peer)
      this.publishConnected()
    })
    t.onMessage((raw, peer) => {
      if (t !== this.transport) return
      if (this.waiting) this.waiting.push({ raw, peer })
      else this.receive(raw, peer)
    })
  }

  /**
   * Moves the game to a new code (docs/design/game-table/game-table-spec-addendum-game-codes.md).
   * Connected players and observers whose client ids are in `keep` are told the new code and
   * follow it; the others are removed, the same as Remove. Players who are away keep their place
   * but need the new code from the GM. The old room closes, so the old code finds no game.
   */
  changeCode(code: string, keep: ReadonlySet<string>): CodeChange | undefined {
    const game = this.snapshot.game
    if (!game || code === this.code) return undefined
    const from = this.code
    const kept = new Map<string, string>()
    const removed = new Map<string, string>()
    const removedHeroes: string[] = []
    for (const [peer, p] of this.peers) {
      const name = p.role === 'observer' ? p.screenName : (findHero(game, p.heroId)?.player?.name ?? 'A player')
      if (keep.has(p.clientId)) {
        kept.set(p.clientId, name)
        this.send({ v: PROTOCOL_VERSION, type: 'codeChanged', code }, peer)
      } else {
        removed.set(p.clientId, name)
        this.removed.add(p.clientId)
        this.send({ v: PROTOCOL_VERSION, type: 'removed' }, peer)
        if (p.role === 'player') removedHeroes.push(p.heroId)
      }
    }
    const connected = new Set([...this.peers.values()].map((p) => p.clientId))
    const away = game.heroes.filter((h) => h.player && !connected.has(h.player.clientId) && !this.removed.has(h.player.clientId))
    this.peers.clear()
    // The old room stays open a moment so the messages above get out, then closes.
    const old = this.transport
    this.closing.add(old)
    setTimeout(() => {
      old.leave()
      this.closing.delete(old)
    }, CODE_HANDOFF_MS)
    this.code = code
    this.open()
    this.saveInfo()
    this.apply((g) =>
      setGameCode(
        removedHeroes.reduce((acc, heroId) => removeFromTable(acc, { kind: 'hero', id: heroId }, this.clock()), g),
        code,
        this.clock(),
        { kept: [...kept.values()], removed: [...removed.values()] },
      ),
    )
    this.publish({ ...this.snapshot, connected: new Set(), observers: [], needsNewCode: new Set(away.map((h) => h.player!.clientId)) })
    return { from, code, kept: [...kept.values()], removed: [...removed.values()], needsCode: away.map((h) => h.player!.name || 'A player') }
  }

  /** Resolves once every change so far has been saved (or failed to). */
  get settled(): Promise<void> {
    return this.saving
  }

  /** The GM's name, as players see it. */
  get gm(): string {
    return this.gmName
  }

  renameGm(name: string): void {
    if (!name || name === this.gmName) return
    this.gmName = name
    this.saveInfo()
    this.publish({ ...this.snapshot })
    this.broadcast()
  }

  get game(): Game | undefined {
    return this.snapshot.game
  }

  /** Applies a change (a pure function of the latest game), saves it and sends it to everyone. */
  apply(fn: (game: Game) => Game): void {
    const game = this.snapshot.game
    if (!game) return
    const next = logStatusChanges(game, fn(game), this.clock())
    if (next === game) return
    const version = this.snapshot.version + 1
    this.versions = trackChanges(game, next, version, this.versions)
    const saved = { ...next, updatedAt: this.clock().now.toISOString() }
    this.publish({ ...this.snapshot, game: saved, version })
    this.saving = this.saving
      .then(() => this.store.save(saved))
      .catch((e: unknown) => this.publish({ ...this.snapshot, error: `Couldn't save the game: ${e instanceof Error ? e.message : String(e)}` }))
    this.broadcast()
  }

  /** Approves a player's sheet update: the game's copy gets the new sheet, adjusted to fit. */
  approveSync(heroId: string): void {
    const request = this.snapshot.game?.pendingSyncs.find((r) => r.heroId === heroId)
    if (!request) return
    const before = this.snapshot.game!
    this.apply((g) => updateSheet(g, { kind: 'hero', id: heroId, sheet: request.sheet }, this.clock(), "at the player's request"))
    const after = this.snapshot.game!
    const hero = findHero(after, heroId)
    // The adjustments are in the sheet update's history entry.
    const entry = hero?.play.history.at(-1)
    const adjustments = hero && after !== before ? (entry?.details ?? []) : []
    this.sendToHero(heroId, { v: PROTOCOL_VERSION, type: 'syncResult', heroId, approved: true, adjustments })
  }

  /** Declines a player's sheet update: nothing changes. */
  declineSync(heroId: string): void {
    if (!this.snapshot.game?.pendingSyncs.some((r) => r.heroId === heroId)) return
    const name = this.heroName(heroId)
    this.apply((g) => withLog({ ...g, pendingSyncs: g.pendingSyncs.filter((r) => r.heroId !== heroId) }, [this.gmLine(`The GM kept the game's copy of ${name}.`)]))
    this.sendToHero(heroId, { v: PROTOCOL_VERSION, type: 'syncResult', heroId, approved: false, adjustments: [] })
  }

  /** Removes a player and their hero from the game. They can't come back to it. */
  removePlayer(heroId: string): void {
    const hero = this.snapshot.game && findHero(this.snapshot.game, heroId)
    if (!hero) return
    const clientId = hero.player?.clientId
    if (clientId) {
      this.removed.add(clientId)
      this.saveInfo()
      for (const [peer, p] of this.peers) {
        if (p.clientId !== clientId) continue
        this.send({ v: PROTOCOL_VERSION, type: 'removed' }, peer)
        this.peers.delete(peer)
      }
    }
    this.apply((g) => removeFromTable(g, { kind: 'hero', id: heroId }, this.clock()))
    this.publishConnected()
  }

  /** Removes an observer's screen. It can't come back to this game. */
  removeObserver(clientId: string): void {
    this.removed.add(clientId)
    this.saveInfo()
    for (const [peer, p] of this.peers) {
      if (p.clientId !== clientId) continue
      this.send({ v: PROTOCOL_VERSION, type: 'removed' }, peer)
      this.peers.delete(peer)
    }
    this.publishConnected()
  }

  /** Stops hosting. The game stays as it is. */
  leave(): void {
    this.transport.leave()
    for (const t of this.closing) t.leave()
    this.closing.clear()
  }

  private receive(raw: unknown, peer: string): void {
    if (!this.snapshot.game) return
    const msg = readClientMessage(raw)
    if (!msg) {
      // A peer on another version of the app is told to update.
      const v = messageVersion(raw)
      if (v !== undefined && v !== PROTOCOL_VERSION) this.refuse(peer, 'version')
      return
    }
    if (msg.type === 'hello') return this.hello(msg, peer)
    const from = this.peers.get(peer)
    // Observers send only hello.
    if (!from || from.role !== 'player' || this.removed.has(from.clientId)) return
    switch (msg.type) {
      case 'action':
        return this.action(msg, from, peer)
      case 'syncRequest':
        return this.syncRequest(msg, from)
      case 'syncCancel':
        return this.syncCancel(msg, from)
    }
  }

  private hello(msg: Extract<ClientMessage, { type: 'hello' }>, peer: string): void {
    if (this.removed.has(msg.clientId)) return this.refuse(peer, 'removed')
    if (msg.role === 'observer') return this.watcherHello(msg, peer)
    // A saved game reconnecting with a code that now belongs to another game.
    if (msg.gameId !== undefined && msg.gameId !== this.gameId) return this.refuse(peer, 'wrongGame')
    const game = this.snapshot.game!
    const name = msg.name.trim() || 'A player'
    const existing = game.heroes.find((h) => h.sourceId === msg.heroSourceId)
    let heroId: string
    if (existing) {
      // The same hero again: the same player, or (when that player isn't here) the same person on another device.
      const owner = existing.player?.clientId
      if (owner && owner !== msg.clientId && this.isConnected(owner)) return this.refuse(peer, 'taken')
      heroId = existing.id
      const since = existing.player?.since ?? this.clock().now.toISOString()
      if (existing.player?.clientId !== msg.clientId || existing.player.name !== name) {
        this.apply((g) => ({ ...g, heroes: g.heroes.map((h) => (h.id === heroId ? { ...h, player: { clientId: msg.clientId, name, since } } : h)) }))
      }
    } else {
      if (game.heroes.filter((h) => h.player).length >= PLAYER_LIMIT) return this.refuse(peer, 'full')
      const since = this.clock().now.toISOString()
      this.apply((g) => addHero(g, msg.sheet, this.clock(), { clientId: msg.clientId, name, since }))
      heroId = this.snapshot.game!.heroes.find((h) => h.sourceId === msg.heroSourceId)!.id
    }
    this.peers.set(peer, { clientId: msg.clientId, role: 'player', heroId })
    if (this.snapshot.needsNewCode.has(msg.clientId)) {
      const needsNewCode = new Set(this.snapshot.needsNewCode)
      needsNewCode.delete(msg.clientId)
      this.publish({ ...this.snapshot, needsNewCode })
    }
    this.publishConnected()
    this.sendState(peer)
  }

  private watcherHello(msg: Extract<ClientMessage, { type: 'hello'; role: 'observer' }>, peer: string): void {
    // The same screen coming back doesn't count against the limit.
    const others = new Set([...this.peers].filter(([id, p]) => p.role === 'observer' && id !== peer && p.clientId !== msg.clientId).map(([, p]) => p.clientId))
    if (others.size >= OBSERVER_LIMIT) return this.refuse(peer, 'full')
    this.peers.set(peer, { clientId: msg.clientId, role: 'observer', screenName: msg.screenName.trim() || 'A screen' })
    this.publishConnected()
    this.sendState(peer)
  }

  private action(msg: Extract<ClientMessage, { type: 'action' }>, from: Peer & { role: 'player' }, peer: string): void {
    const game = this.snapshot.game!
    const reply = (result: { ok: true; notes?: string[] } | { ok: false; reason: string }) => this.send({ v: PROTOCOL_VERSION, type: 'result', id: msg.id, ...result } as HostMessage, peer)
    const key = `${from.clientId}:${msg.id}`
    const known = this.results.get(key)
    if (known) {
      this.sendState(peer)
      return reply(known)
    }
    const remember = (r: { ok: true; notes?: string[] } | { ok: false; reason: string }) => {
      this.results.set(key, r)
      if (this.results.size > RESULTS_KEPT) this.results.delete(this.results.keys().next().value!)
      reply(r)
    }
    if (!this.owns(from, msg.heroId)) return remember({ ok: false, reason: "that hero isn't yours" })
    const result = applyHeroAction(game, msg.heroId, msg.action, { basedOn: msg.basedOn, versions: this.versions, random: this.random }, this.clock())
    if (!result.ok) return remember({ ok: false, reason: result.reason })
    // The new state first, so the result arrives with the value already updated.
    this.apply(() => result.game)
    remember({ ok: true, ...(result.notes ? { notes: result.notes } : {}) })
  }

  private syncRequest(msg: Extract<ClientMessage, { type: 'syncRequest' }>, from: Peer & { role: 'player' }): void {
    if (!this.owns(from, msg.heroId)) return
    const hero = findHero(this.snapshot.game!, msg.heroId)!
    const at = this.clock().now.toISOString()
    // One request per hero: a newer one replaces the older.
    this.apply((g) =>
      withLog({ ...g, pendingSyncs: [...g.pendingSyncs.filter((r) => r.heroId !== msg.heroId), { heroId: msg.heroId, sheet: msg.sheet, at }] }, [
        this.gmLine(`${hero.player?.name ?? 'A player'} asked to update ${heroDisplayName(hero.sheet)} to match their sheet.`),
      ]),
    )
  }

  private syncCancel(msg: Extract<ClientMessage, { type: 'syncCancel' }>, from: Peer & { role: 'player' }): void {
    if (!this.owns(from, msg.heroId) || !this.snapshot.game!.pendingSyncs.some((r) => r.heroId === msg.heroId)) return
    const name = this.heroName(msg.heroId)
    this.apply((g) => withLog({ ...g, pendingSyncs: g.pendingSyncs.filter((r) => r.heroId !== msg.heroId) }, [this.gmLine(`The request to update ${name} was cancelled.`)]))
  }

  /** Whether the peer plays this hero. */
  private owns(from: Peer, heroId: string): boolean {
    const hero = findHero(this.snapshot.game!, heroId)
    return Boolean(hero?.player && hero.player.clientId === from.clientId)
  }

  private heroName(heroId: string): string {
    const hero = this.snapshot.game && findHero(this.snapshot.game, heroId)
    return hero ? heroDisplayName(hero.sheet) : 'a hero'
  }

  private gmLine(text: string) {
    const c = this.clock()
    return { id: c.newId(), at: c.now.toISOString(), by: GM, text, gmOnly: true as const }
  }

  private isConnected(clientId: string): boolean {
    return [...this.peers.values()].some((p) => p.role === 'player' && p.clientId === clientId)
  }

  private publishConnected(): void {
    const peers = [...this.peers.values()]
    const connected = new Set(peers.filter((p) => p.role === 'player').map((p) => p.clientId))
    // One entry per screen, even with two connections from it for a moment.
    const observers = [...new Map(peers.flatMap((p) => (p.role === 'observer' ? [[p.clientId, { clientId: p.clientId, screenName: p.screenName }] as const] : []))).values()]
    const before = this.snapshot
    const sameConnected = connected.size === before.connected.size && [...connected].every((c) => before.connected.has(c))
    const sameObservers = observers.length === before.observers.length && observers.every((o, i) => o.clientId === before.observers[i]!.clientId && o.screenName === before.observers[i]!.screenName)
    if (sameConnected && sameObservers) return
    this.publish({ ...this.snapshot, connected, observers })
  }

  private refuse(peer: string, reason: RefusedReason): void {
    this.send({ v: PROTOCOL_VERSION, type: 'refused', reason }, peer)
  }

  private sendToHero(heroId: string, msg: HostMessage): void {
    for (const [peer, p] of this.peers) if (p.role === 'player' && p.heroId === heroId) this.send(msg, peer)
  }

  /** Sends each peer their audience's projection (one per audience; only a player's "you" differs). */
  private broadcast(): void {
    const game = this.snapshot.game
    if (!game || !this.peers.size) return
    // Observers all see the same; each player's view has their own requests and lines.
    const views = new Map<string, TableView>()
    for (const [peer, p] of this.peers) {
      const heroId = p.role === 'player' ? p.heroId : undefined
      const key = heroId ?? p.role
      let view = views.get(key)
      if (!view) views.set(key, (view = fitView(project(game, p.role, heroId))))
      this.sendState(peer, view)
    }
  }

  private sendState(peer: string, table?: TableView): void {
    const game = this.snapshot.game
    const p = this.peers.get(peer)
    if (!game || !p) return
    const hero: HeroInGame | undefined = p.role === 'player' ? findHero(game, p.heroId) : undefined
    const you = hero?.player ? { heroId: hero.id, since: hero.player.since ?? game.createdAt } : undefined
    this.send({ v: PROTOCOL_VERSION, type: 'state', room: this.room, version: this.snapshot.version, table: table ?? fitView(project(game, p.role, p.role === 'player' ? p.heroId : undefined)), gm: this.gm, ...(you ? { you } : {}) }, peer)
  }

  private send(msg: HostMessage, peer: string): void {
    this.transport.send(msg, peer)
  }

  private saveInfo(): void {
    this.save({ v: 1, room: this.room, gameId: this.gameId, gm: this.gm, removed: [...this.removed] })
  }
}

/** A hero to show for a sync request: the one in the game, and the sheet the player wants. */
export function syncRequestFor(game: Game, heroId: string): { hero: HeroInGame; sheet: Hero; at: string } | undefined {
  const request = game.pendingSyncs.find((r) => r.heroId === heroId)
  const hero = findHero(game, heroId)
  return request && hero ? { hero, sheet: request.sheet, at: request.at } : undefined
}
