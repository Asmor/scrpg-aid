/**
 * A device watching a hosted game (scrpg-aid-designs/game-table/spec.md, sections 10 and 13): it says
 * hello as an observer with the screen's name, and shows the latest projection the GM's device
 * sent. Observers send nothing else and keep no cache; when the GM goes away, the last table
 * stays on screen while the device keeps trying (./link.ts).
 */
import { HostLink, type LinkSnapshot } from './link'
import { PROTOCOL_VERSION, type ClientMessage } from './protocol'
import type { Connect } from './transport'
import { nonEmptyString, object, oneOf, string } from '../shape'

export interface ObserverInfo {
  room: string
  clientId: string
  /** "Living room TV": how the GM's Invite dialog lists this screen. */
  screenName: string
}

export class ObserverClient extends HostLink<LinkSnapshot> {
  private base: ObserverInfo
  private changed: ((code: string) => void) | undefined

  /** `onCodeChanged` is told when the GM moved the game to a new code and this screen followed. */
  constructor(connect: Connect, info: ObserverInfo, now?: () => Date, onCodeChanged?: (code: string) => void) {
    super(connect, info.room, { status: 'connecting' }, now)
    this.base = info
    this.changed = onCodeChanged
    this.start()
  }

  /** The screen and its current code. */
  get info(): ObserverInfo {
    return { ...this.base, room: this.room }
  }

  protected override onCodeChanged(code: string): void {
    this.changed?.(code)
  }

  protected override hello(peer?: string): void {
    const { clientId, screenName } = this.base
    this.transport.send({ v: PROTOCOL_VERSION, type: 'hello', role: 'observer', clientId, screenName } satisfies ClientMessage, peer)
  }
}

/** What a watching device saves to watch again after a reload. */
export interface WatchingSaved {
  v: 1
  room: string
  screenName: string
}

const watchingSaved = object({ v: oneOf(1), room: nonEmptyString, screenName: string })

/** A stored game this device is watching, or undefined if it's malformed or from another version. */
export function readWatchingSaved(value: unknown): WatchingSaved | undefined {
  return watchingSaved(value, 'saved') ? undefined : (value as WatchingSaved)
}
