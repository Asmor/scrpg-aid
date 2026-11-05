/**
 * A player's device in a hosted game (docs/design/game-table/spec.md, sections 7, 8, 10 and 11).
 * It says hello with the player's hero, keeps the latest projection the GM's device sent, and
 * sends each action as its own message, waiting for the result. Nothing changes on the player's
 * side until the GM's device says so: there are no optimistic changes.
 *
 * - An action with no result within 5 seconds didn't reach the GM ("Nothing changed").
 * - While the GM is unreachable, actions are blocked, not queued. After 30 seconds the page
 *   switches to the offline view, and the device keeps trying every 30 seconds (./link.ts).
 */
import type { HeroAction } from '../game/actions'
import type { Hero } from '../hero/model'
import { HostLink, type LinkSnapshot, type OtherHostMessage, type Received } from './link'
import type { Appearance } from '../colors/palette'
import { PROTOCOL_VERSION, type ClientMessage } from './protocol'
import type { Connect } from './transport'
import { heroShape } from '../hero/validate'
import { nonEmptyString, object, oneOf, string } from '../shape'

export { OFFLINE_AFTER, RETRY_EVERY, type ClientStatus, type Received } from './link'

/** How long joining waits for the GM's device before saying no game is using the code. */
export const JOIN_WAIT = 15_000

/** How long an action waits for its result. */
export const RESULT_TIMEOUT = 5000

/** An action sent and not answered yet, or one that didn't reach the GM. */
export interface PendingAction {
  id: string
  action: HeroAction
  timedOut?: true
}

/** Something to tell the player once (a toast): a rejected action, the GM's answer to a sync request, a save against their Attack. */
export interface Notice {
  id: string
  kind: 'rejected' | 'unreachable' | 'synced' | 'notSynced' | 'codeChanged' | 'note'
  text: string
  /** A game code to show after the text, kept on one line: the new code. */
  code?: string
  /** The action to try again, for "Didn't reach the GM". */
  retry?: string
  adjustments?: string[]
}

export interface ClientSnapshot extends LinkSnapshot {
  pending: PendingAction[]
  notices: Notice[]
  /** A sheet update request is waiting for the GM. */
  syncWaiting: boolean
  /** The GM asked this player to spend their hero points. */
  spendReminder: boolean
  /** How many times the GM has answered a sheet update here. */
  syncAnswers: number
}

export interface ClientInfo {
  room: string
  clientId: string
  name: string
  heroSourceId: string
  /** The player's library sheet: copied in on first join. */
  sheet: Hero
  /** The game, when reconnecting a saved one: the GM checks the code still belongs to it. */
  gameId?: string
}

export interface ClientOptions {
  /** The game as last seen, when it was cached: shown read-only until the GM answers. */
  cached?: Received
  syncWaiting?: boolean
  /** Called with each state the GM sends, to cache it. */
  onReceive?: (received: Received) => void
  /** Called when the sync request starts or stops waiting, to remember it. */
  onSyncWaiting?: (waiting: boolean) => void
  /** Called when the GM moved the game to a new code and this device followed, to remember the new code. */
  onCodeChanged?: (code: string) => void
  now?: () => Date
  newId?: () => string
}

export class PlayerClient extends HostLink<ClientSnapshot> {
  private base: ClientInfo
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private options: ClientOptions
  private n = 0

  constructor(connect: Connect, info: ClientInfo, options: ClientOptions = {}) {
    super(connect, info.room, { status: 'connecting', pending: [], notices: [], syncAnswers: 0, syncWaiting: options.syncWaiting ?? false, spendReminder: false, ...(options.cached ? { received: options.cached } : {}) }, options.now)
    this.base = info
    this.options = options
    this.start()
  }

  /** Who this device is in the game, and its current code (which changes when the GM gets a new one). */
  get info(): ClientInfo {
    return { ...this.base, room: this.room }
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
    this.toGm({ v: PROTOCOL_VERSION, type: 'syncRequest', heroId, sheet } satisfies ClientMessage)
    this.setSyncWaiting(true)
    return true
  }

  cancelSync(): boolean {
    const heroId = this.heroId
    if (!this.live || !heroId) return false
    this.toGm({ v: PROTOCOL_VERSION, type: 'syncCancel', heroId } satisfies ClientMessage)
    this.setSyncWaiting(false)
    return true
  }

  /** Tells the GM this hero's colors; they apply at once. */
  sendAppearance(appearance: Appearance | undefined): boolean {
    const heroId = this.heroId
    if (!this.live || !heroId) return false
    this.toGm({ v: PROTOCOL_VERSION, type: 'appearance', heroId, ...(appearance ? { appearance } : {}) } satisfies ClientMessage)
    return true
  }

  /** Tells the GM what this player did about a back issue. Nothing comes back. */
  issueAck(issueId: string, status: 'added' | 'later', count?: number): boolean {
    const heroId = this.heroId
    if (!this.live || !heroId) return false
    this.toGm({ v: PROTOCOL_VERSION, type: 'issueAck', issueId, heroId, status, ...(count !== undefined ? { count } : {}) } satisfies ClientMessage)
    return true
  }

  /** The GM's reminder has been answered. */
  dismissReminder(): void {
    if (this.snapshot.spendReminder) this.publish({ ...this.snapshot, spendReminder: false })
  }

  /** Forgets a notice once shown, and a timed-out action with it. */
  dismiss(noticeId: string): void {
    const notice = this.snapshot.notices.find((n) => n.id === noticeId)
    if (!notice) return
    this.publish({ ...this.snapshot, notices: this.snapshot.notices.filter((n) => n.id !== noticeId), pending: notice.retry ? this.snapshot.pending.filter((p) => p.id !== notice.retry) : this.snapshot.pending })
  }

  /** Shows the game as cached on this device until the GM answers (nothing once a state has arrived). */
  showCached(cached: Received): void {
    if (this.snapshot.received || cached.room !== this.room) return
    this.publish({ ...this.snapshot, received: cached })
  }

  protected override hello(peer?: string): void {
    const { clientId, name, heroSourceId, sheet } = this.base
    // A game seen before is named, so a code that now belongs to another game isn't taken for it.
    const gameId = this.snapshot.received?.table.id ?? this.base.gameId
    this.transport.send({ v: PROTOCOL_VERSION, type: 'hello', role: 'player', clientId, name, heroSourceId, sheet, ...(gameId ? { gameId } : {}) } satisfies ClientMessage, peer)
  }

  protected override onCodeChanged(code: string): void {
    this.publish({ ...this.snapshot, notices: [...this.snapshot.notices, { id: this.newId(), kind: 'codeChanged', text: "The GM changed the game code. You're still in. New code:", code }] })
    this.options.onCodeChanged?.(code)
  }

  protected override onState(received: Received): void {
    // The issue has started: a reminder about it is over, answered or not.
    if (this.snapshot.spendReminder && received.table.currentIssueId) this.publish({ ...this.snapshot, spendReminder: false })
    this.options.onReceive?.(received)
  }

  protected override onOther(msg: OtherHostMessage): void {
    switch (msg.type) {
      case 'result': {
        clearTimeout(this.timers.get(msg.id))
        this.timers.delete(msg.id)
        const pending = this.snapshot.pending.filter((p) => p.id !== msg.id)
        const notices = msg.ok
          ? [...this.snapshot.notices, ...(msg.notes ?? []).map((text) => ({ id: this.newId(), kind: 'note' as const, text }))]
          : [...this.snapshot.notices, { id: this.newId(), kind: 'rejected' as const, text: `Not applied: ${msg.reason}.` }]
        this.publish({ ...this.snapshot, pending, notices })
        return
      }
      case 'spendReminder':
        this.publish({ ...this.snapshot, spendReminder: true })
        return
      case 'syncResult': {
        if (msg.heroId !== this.heroId) return
        this.setSyncWaiting(false)
        const name = this.heroName()
        const notice: Notice = msg.approved
          ? { id: this.newId(), kind: 'synced', text: `Updated. The GM approved: ${name} now matches your sheet.`, adjustments: msg.adjustments }
          : { id: this.newId(), kind: 'notSynced', text: "Not updated. The GM kept the game's copy. You can ask again from My hero ⋯." }
        this.publish({ ...this.snapshot, notices: [...this.snapshot.notices, notice], syncAnswers: this.snapshot.syncAnswers + 1 })
        return
      }
    }
  }

  /** The GM went away or refused: unanswered actions won't be answered. */
  protected override gmGoneChanges(): Partial<ClientSnapshot> {
    this.clearTimers()
    return { pending: [] }
  }

  protected override onLeave(): void {
    this.clearTimers()
  }

  private clearTimers(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  private heroName(): string {
    const hero = this.snapshot.received?.table.heroes.find((h) => h.id === this.heroId)
    return hero?.sheet.details.name.trim() || 'your hero'
  }

  private sendAction(id: string, heroId: string, action: HeroAction): void {
    this.toGm({ v: PROTOCOL_VERSION, type: 'action', id, heroId, action, basedOn: this.snapshot.received?.version ?? 0 } satisfies ClientMessage)
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

  private setSyncWaiting(waiting: boolean): void {
    if (this.snapshot.syncWaiting === waiting) return
    this.publish({ ...this.snapshot, syncWaiting: waiting })
    this.options.onSyncWaiting?.(waiting)
  }

  private newId(): string {
    return this.options.newId?.() ?? `${this.base.clientId}-${Date.now().toString(36)}-${++this.n}`
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
  /** The game, once known: sent on rejoin so a code that now belongs to another game isn't taken for it. */
  gameId?: string
  syncWaiting?: true
}

const playingSaved = object({ v: oneOf(1), room: nonEmptyString, name: string, heroSourceId: nonEmptyString, sheet: heroShape, 'gameId?': nonEmptyString, 'syncWaiting?': oneOf(true) })

/** A stored game this device is playing in, or undefined if it's malformed or from another version. */
export function readPlayingSaved(value: unknown): PlayingSaved | undefined {
  return playingSaved(value, 'saved') ? undefined : (value as PlayingSaved)
}
