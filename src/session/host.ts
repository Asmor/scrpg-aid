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
import type { Game, HeroInGame } from '../game/model'
import { project, type Audience, type TableView } from '../game/project'
import type { GameStore } from '../game/store'
import { addHero, findHero, removeFromTable, updateSheet, withLog, GM } from '../game/table'
import { heroDisplayName, type Hero } from '../hero/model'
import type { Clock } from '../play/state'
import { Subscribable } from './subscribable'
import { fitView, messageVersion, OBSERVER_LIMIT, PLAYER_LIMIT, PROTOCOL_VERSION, readClientMessage, type ClientMessage, type HostMessage, type RefusedReason } from './protocol'
import { quietAfterLeave, type Connect, type Transport } from './transport'
import { arrayOf, nonEmptyString, object, oneOf, string } from '../shape'

/** How many action results to remember, for answering an action sent again. */
const RESULTS_KEPT = 500

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
  readonly room: string
  readonly gameId: string
  private gmName: string
  private transport: Transport
  private store: GameStore
  private clock: () => Clock
  private save: (saved: HostSaved) => void
  private peers = new Map<string, Peer>()
  private removed: Set<string>
  private versions: FieldVersions = {}
  /** Recent results by "<client id>:<action id>": an action sent again (Try again) is answered, never applied twice. */
  private results = new Map<string, { ok: true } | { ok: false; reason: string }>()
  private waiting: Waiting[] | undefined = []
  /** Saves happen one after another, in order. */
  private saving: Promise<void> = Promise.resolve()

  constructor(connect: Connect, saved: Omit<HostSaved, 'v'>, store: GameStore, clock: () => Clock, save: (saved: HostSaved) => void = () => {}) {
    super({ version: 0, connected: new Set(), observers: [] })
    this.room = saved.room
    this.gameId = saved.gameId
    this.gmName = saved.gm
    this.removed = new Set(saved.removed)
    this.store = store
    this.clock = clock
    this.save = save
    this.transport = quietAfterLeave(connect(saved.room))
    this.transport.onPeerJoin((peer) => this.sendState(peer))
    this.transport.onPeerLeave((peer) => {
      this.peers.delete(peer)
      this.publishConnected()
    })
    this.transport.onMessage((raw, peer) => {
      if (this.waiting) this.waiting.push({ raw, peer })
      else this.receive(raw, peer)
    })
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
    const next = fn(game)
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
        this.send({ v: PROTOCOL_VERSION, type: 'refused', reason: 'removed' }, peer)
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
      this.refuse(peer, 'removed')
      this.peers.delete(peer)
    }
    this.publishConnected()
  }

  /** Stops hosting. The game stays as it is. */
  leave(): void {
    this.transport.leave()
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
    const reply = (result: { ok: true } | { ok: false; reason: string }) => this.send({ v: PROTOCOL_VERSION, type: 'result', id: msg.id, ...result } as HostMessage, peer)
    const key = `${from.clientId}:${msg.id}`
    const known = this.results.get(key)
    if (known) {
      this.sendState(peer)
      return reply(known)
    }
    const remember = (r: { ok: true } | { ok: false; reason: string }) => {
      this.results.set(key, r)
      if (this.results.size > RESULTS_KEPT) this.results.delete(this.results.keys().next().value!)
      reply(r)
    }
    if (!this.owns(from, msg.heroId)) return remember({ ok: false, reason: "that hero isn't yours" })
    const result = applyHeroAction(game, msg.heroId, msg.action, { basedOn: msg.basedOn, versions: this.versions }, this.clock())
    if (!result.ok) return remember({ ok: false, reason: result.reason })
    // The new state first, so the result arrives with the value already updated.
    this.apply(() => result.game)
    remember({ ok: true })
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
    const views = new Map<Audience, TableView>()
    for (const [peer, p] of this.peers) {
      const audience: Audience = p.role
      let view = views.get(audience)
      if (!view) views.set(audience, (view = fitView(project(game, audience))))
      this.sendState(peer, view)
    }
  }

  private sendState(peer: string, table?: TableView): void {
    const game = this.snapshot.game
    const p = this.peers.get(peer)
    if (!game || !p) return
    const hero: HeroInGame | undefined = p.role === 'player' ? findHero(game, p.heroId) : undefined
    const you = hero?.player ? { heroId: hero.id, since: hero.player.since ?? game.createdAt } : undefined
    this.send({ v: PROTOCOL_VERSION, type: 'state', room: this.room, version: this.snapshot.version, table: table ?? fitView(project(game, p.role)), gm: this.gm, ...(you ? { you } : {}) }, peer)
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
