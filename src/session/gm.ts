/**
 * The GM's side of a game session (Phase 4). Pure: each function takes the session state
 * and returns the new state, which the GM's browser then sends to everyone (./controller.ts).
 */
import type { PlayMod } from '../hero/model'
import type { Clock } from '../play/state'
import { sceneByGmText } from '../play/state'
import type { Zone } from '../rules/types'
import { FEED_LIMIT, INBOX_LIMIT, MEMBER_LIMIT, type FeedEntry, type Member, type PlayerMessage, type SessionState } from './types'

export const GM_NAME = 'GM'

export function newSession(room: string): SessionState {
  return { room, scene: 'green', members: [], feed: [], inbox: [] }
}

const withFeed = (state: SessionState, entries: FeedEntry[]): SessionState => (entries.length ? { ...state, feed: [...state.feed, ...entries].slice(-FEED_LIMIT) } : state)

const gmEntry = (clock: Clock, text: string): FeedEntry => ({ id: clock.newId(), at: clock.now.toISOString(), by: GM_NAME, text })

/** A member's name at the table: their hero's, or a placeholder until they've chosen one. */
export function memberName(member: Pick<Member, 'hero'> | undefined): string {
  return member?.hero?.name.trim() || 'A player'
}

const updateMember = (state: SessionState, clientId: string, change: (m: Member) => Member): SessionState => ({
  ...state,
  members: state.members.map((m) => (m.clientId === clientId ? change(m) : m)),
})

/** Handles a player's message. `clientId` is the sender's, from their hello. */
export function gmReceive(state: SessionState, clientId: string, msg: PlayerMessage, clock: Clock): SessionState {
  const member = state.members.find((m) => m.clientId === clientId)
  switch (msg.type) {
    case 'hello': {
      const joined: Member = { clientId, connected: true, ...(msg.hero ? { hero: msg.hero } : member?.hero ? { hero: member.hero } : {}) }
      if (member) return JSON.stringify(member) === JSON.stringify(joined) ? state : updateMember(state, clientId, () => joined)
      // Within the limit players accept (./types.ts).
      if (state.members.length >= MEMBER_LIMIT) return state
      return withFeed({ ...state, members: [...state.members, joined] }, [gmEntry(clock, `${memberName(joined)} joined the game.`)])
    }
    case 'hero':
      return member ? updateMember(state, clientId, (m) => ({ ...m, hero: msg.hero })) : state
    case 'feed': {
      if (!member) return state
      // Skip entries already in the feed (a player's browser may send one twice).
      const known = new Set(state.feed.map((e) => e.id))
      const fresh = msg.entries
        .map((e) => ({ id: `${clientId}:${e.id}`, at: e.at, by: memberName(member), text: e.text, ...(e.details?.length ? { details: e.details } : {}) }))
        .filter((e) => !known.has(e.id))
      return withFeed(state, fresh)
    }
    case 'giveMod': {
      const id = `${clientId}:${msg.id}`
      if (!member || !state.members.some((m) => m.clientId === msg.to) || state.inbox.some((i) => i.id === id) || state.inbox.length >= INBOX_LIMIT) return state
      return { ...state, inbox: [...state.inbox, { id, to: msg.to, from: memberName(member), mod: msg.mod }] }
    }
    case 'ack': {
      const inbox = state.inbox.filter((i) => !(i.to === clientId && msg.ids.includes(i.id)))
      return inbox.length === state.inbox.length ? state : { ...state, inbox }
    }
  }
}

export function gmSetScene(state: SessionState, scene: Zone, clock: Clock): SessionState {
  if (scene === state.scene) return state
  return withFeed({ ...state, scene }, [gmEntry(clock, sceneByGmText(scene))])
}

/** The GM gives a player a bonus or penalty (a villain's Hinder, say). */
export function gmGiveMod(state: SessionState, to: string, mod: Omit<PlayMod, 'id'>, clock: Clock): SessionState {
  if (!state.members.some((m) => m.clientId === to) || !Number.isInteger(mod.value) || mod.value === 0 || state.inbox.length >= INBOX_LIMIT) return state
  return { ...state, inbox: [...state.inbox, { id: `gm:${clock.newId()}`, to, from: GM_NAME, mod }] }
}

export function gmSetConnected(state: SessionState, clientId: string, connected: boolean): SessionState {
  const member = state.members.find((m) => m.clientId === clientId)
  return member && member.connected !== connected ? updateMember(state, clientId, (m) => ({ ...m, connected })) : state
}

/** Removes a player (one who has left for good), with anything still waiting for them. */
export function gmRemoveMember(state: SessionState, clientId: string, clock: Clock): SessionState {
  const member = state.members.find((m) => m.clientId === clientId)
  if (!member) return state
  return withFeed(
    { ...state, members: state.members.filter((m) => m.clientId !== clientId), inbox: state.inbox.filter((i) => i.to !== clientId) },
    [gmEntry(clock, `${memberName(member)} was removed from the game.`)],
  )
}
