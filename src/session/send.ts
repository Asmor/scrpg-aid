/**
 * Sending library items peer to peer (docs/design/game-table/spec.md, section 15). The sender
 * opens a short code; a device that enters it (Play together, then Receive) says so, gets the
 * items, and says when it has accepted them. Only library documents travel: heroes, villains and
 * NPC templates, with their tags, in the backup file's format (../transfer/files.ts), so the receiver reads them the way
 * an imported file is read.
 *
 * A send uses its own room ("send:<code>"), so a send code never finds a game, or the other way
 * around. Messages come from other people's devices: every reader checks the shape first.
 */
import { newRoomCode } from './code'
import { Subscribable } from './subscribable'
import type { Connect, Transport } from './transport'
import { quietAfterLeave } from './transport'
import { readImport } from '../transfer/files'
import type { Hero } from '../hero/model'
import type { Villain } from '../villain/model'
import { isRecord } from '../shape'
import { templateCount, type TemplateLists } from '../template/lists'

export const SEND_VERSION = 1
/** How long the receiver waits for an offer before saying nothing is being sent with the code. */
export const RECEIVE_WAIT = 15_000
/** How long a device stays in the room after accepting, so the message gets out before it leaves. */
export const ACCEPT_HANDOFF_MS = 2000
/** The largest offer sent or read, as text (a backup of a few hundred sheets). */
export const MAX_OFFER = 10_000_000

/** The room a send uses: apart from game rooms. */
export const sendRoom = (code: string) => `send:${code}`

export type SendMessage =
  /** Receiver to sender: this device has the code open. */
  | { v: 1; type: 'receive' }
  /** Sender to receiver: the items, as a backup file's text. */
  | { v: 1; type: 'offer'; backup: string }
  /** Receiver to sender: the items are in its library. */
  | { v: 1; type: 'accepted' }

/** A send message, or undefined if it's malformed or from another version. */
export function readSendMessage(value: unknown): SendMessage | undefined {
  if (!isRecord(value) || value.v !== SEND_VERSION) return undefined
  if (value.type === 'receive' || value.type === 'accepted') return { v: 1, type: value.type }
  if (value.type === 'offer' && typeof value.backup === 'string' && value.backup.length <= MAX_OFFER) return { v: 1, type: 'offer', backup: value.backup }
  return undefined
}

export interface SenderSnapshot {
  /** Waiting for a device to enter the code; a device has it open; that device accepted. */
  status: 'waiting' | 'opened' | 'accepted'
}

/** The sending device: keeps the code open and offers the items to every device that enters it, until one accepts or the sender cancels. */
export class Sender extends Subscribable<SenderSnapshot> {
  readonly code: string
  private transport: Transport
  /** Devices that have the code open. */
  private receivers = new Set<string>()

  constructor(connect: Connect, backup: string, code: string = newRoomCode()) {
    super({ status: 'waiting' })
    this.code = code
    this.transport = quietAfterLeave(connect(sendRoom(code)))
    this.transport.onMessage((raw, peer) => {
      const message = readSendMessage(raw)
      if (!message || this.snapshot.status === 'accepted') return
      if (message.type === 'receive') {
        this.receivers.add(peer)
        this.transport.send({ v: SEND_VERSION, type: 'offer', backup } satisfies SendMessage, peer)
        this.publish({ status: 'opened' })
      } else if (message.type === 'accepted' && this.receivers.has(peer)) {
        this.publish({ status: 'accepted' })
        this.transport.leave()
      }
    })
    this.transport.onPeerLeave((peer) => {
      if (!this.receivers.delete(peer) || this.snapshot.status === 'accepted') return
      if (this.receivers.size === 0) this.publish({ status: 'waiting' })
    })
  }

  /** Closes the code: nobody can receive the items with it any more. */
  cancel(): void {
    this.transport.leave()
  }
}

/** What was offered: the library documents that could be read (sheets and templates), and how many couldn't. */
export interface Offer {
  heroes: Hero[]
  villains: Villain[]
  templates: TemplateLists
  unreadable: number
}

export type ReceiverSnapshot =
  | { status: 'looking' }
  /** No offer came: nothing is being sent with the code (or the sender's offer couldn't be read). */
  | { status: 'notFound'; unreadable?: boolean }
  | { status: 'offered'; offer: Offer }
  /** The sender closed the code before this device accepted. */
  | { status: 'gone'; offer: Offer }
  | { status: 'accepted'; offer: Offer }

/** Reads an offer's backup text: only library documents travel (heroes, villains and templates), never games or saved searches. */
export function readOffer(backup: string): Offer | undefined {
  const result = readImport(backup)
  if (!result.ok) return undefined
  const unreadable = result.skipped.filter((s) => s.kind !== 'game' && s.kind !== 'savedSearch').length
  if (result.heroes.length + result.villains.length + templateCount(result.templates) === 0) return undefined
  return { heroes: result.heroes, villains: result.villains, templates: result.templates, unreadable }
}

/** The receiving device: enters the code, gets the items, and tells the sender once they're in the library. */
export class Receiver extends Subscribable<ReceiverSnapshot> {
  readonly code: string
  private connect: Connect
  private transport: Transport | undefined
  /** The device whose offer is shown. */
  private sender: string | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private unreadableOffer = false

  constructor(connect: Connect, code: string) {
    super({ status: 'looking' })
    this.connect = connect
    this.code = code
    this.start()
  }

  /** Looks for the code again after nothing was found. */
  retry(): void {
    if (this.snapshot.status !== 'notFound') return
    this.publish({ status: 'looking' })
    this.start()
  }

  /** Tells the sender the items are in this library, then leaves. */
  accept(): void {
    const s = this.snapshot
    if (s.status !== 'offered' || !this.sender) return
    this.transport?.send({ v: SEND_VERSION, type: 'accepted' } satisfies SendMessage, this.sender)
    this.publish({ status: 'accepted', offer: s.offer })
    // Stay a moment, so the message gets out.
    const transport = this.transport
    this.transport = undefined
    setTimeout(() => transport?.leave(), ACCEPT_HANDOFF_MS)
  }

  /** Stops receiving (leaving the page, or Cancel). */
  close(): void {
    clearTimeout(this.timer)
    this.transport?.leave()
    this.transport = undefined
  }

  private start(): void {
    this.sender = undefined
    this.unreadableOffer = false
    const transport = quietAfterLeave(this.connect(sendRoom(this.code)))
    this.transport = transport
    transport.onPeerJoin((peer) => transport.send({ v: SEND_VERSION, type: 'receive' } satisfies SendMessage, peer))
    transport.onMessage((raw, peer) => {
      const message = readSendMessage(raw)
      if (message?.type !== 'offer' || this.snapshot.status !== 'looking') return
      const offer = readOffer(message.backup)
      if (!offer) {
        this.unreadableOffer = true
        return
      }
      clearTimeout(this.timer)
      this.sender = peer
      this.publish({ status: 'offered', offer })
    })
    transport.onPeerLeave((peer) => {
      const s = this.snapshot
      if (peer !== this.sender || s.status !== 'offered') return
      this.publish({ status: 'gone', offer: s.offer })
      this.close()
    })
    this.timer = setTimeout(() => {
      if (this.snapshot.status !== 'looking') return
      this.close()
      this.publish({ status: 'notFound', ...(this.unreadableOffer ? { unreadable: true } : {}) })
    }, RECEIVE_WAIT)
  }
}
