/**
 * The GM's side of a game session (Phase 4). Pure: each function takes the session state
 * and returns the new state, which the GM's browser then sends to everyone (./controller.ts).
 */
import type { PlayMod } from '../hero/model'
import type { Clock } from '../play/state'
import { sceneByGmText } from '../play/state'
import type { Zone } from '../rules/types'
import { FEED_LIMIT, INBOX_LIMIT, MAX_DETAILS, MAX_ID, MAX_LIST, MAX_NAME, MAX_TEXT, MEMBER_LIMIT, villainTarget, type FeedEntry, type Member, type PlayerMessage, type InboxMod, type SceneVillain, type SessionState, type SharedEntry } from './types'

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

const joinedEntry = (clock: Clock, member: Pick<Member, 'hero'>) => gmEntry(clock, `${memberName(member)} joined the game.`)

const updateMember = (state: SessionState, clientId: string, change: (m: Member) => Member): SessionState => ({
  ...state,
  members: state.members.map((m) => (m.clientId === clientId ? change(m) : m)),
})

/** Handles a player's message. `clientId` is the sender's, from their hello. */
export function gmReceive(state: SessionState, clientId: string, msg: PlayerMessage, clock: Clock): SessionState {
  const member = state.members.find((m) => m.clientId === clientId)
  switch (msg.type) {
    case 'hello': {
      // "villain:<id>" names a villain in the game, never a player.
      if (msg.clientId.startsWith('villain:')) return state
      const joined: Member = { clientId, connected: true, ...(msg.hero ? { hero: msg.hero } : member?.hero ? { hero: member.hero } : {}) }
      if (member) return JSON.stringify(member) === JSON.stringify(joined) ? state : updateMember(state, clientId, () => joined)
      // Within the limit players accept (./types.ts).
      if (state.members.length >= MEMBER_LIMIT) return state
      const added = { ...state, members: [...state.members, joined] }
      return joined.hero ? withFeed(added, [joinedEntry(clock, joined)]) : added
    }
    case 'hero': {
      if (!member) return state
      const updated = updateMember(state, clientId, (m) => ({ ...m, hero: msg.hero }))
      // A player's browser may say hello before it knows the hero: they join the feed once it does.
      return member.hero ? updated : withFeed(updated, [joinedEntry(clock, { hero: msg.hero })])
    }
    case 'feed': {
      if (!member) return state
      // Skip entries already in the feed (a player's browser may send one twice).
      const known = new Set(state.feed.map((e) => e.id))
      // Stamped with the GM's clock, so the feed's times agree whatever the players' clocks say.
      const at = clock.now.toISOString()
      const fresh = msg.entries
        // Ids made from the player's must stay within what players accept.
        .filter((e) => `${clientId}:${e.id}`.length <= MAX_ID)
        .map((e) => ({ id: `${clientId}:${e.id}`, at, by: memberName(member), text: e.text, ...(e.details?.length ? { details: e.details } : {}) }))
        .filter((e) => !known.has(e.id))
      return withFeed(state, fresh)
    }
    case 'giveMod': {
      const id = `${clientId}:${msg.id}`
      if (id.length > MAX_ID || !member || !hasRecipient(state, msg.to) || state.inbox.some((i) => i.id === id) || state.inbox.length >= INBOX_LIMIT) return state
      return { ...state, inbox: [...state.inbox, { id, to: msg.to, from: memberName(member), mod: msg.mod }] }
    }
    case 'ack': {
      const inbox = state.inbox.filter((i) => !(i.to === clientId && msg.ids.includes(i.id)))
      return inbox.length === state.inbox.length ? state : { ...state, inbox }
    }
  }
}

/** Whether a mod can go to `to`: a player in the game, or a villain in it ("villain:<id>"). */
function hasRecipient(state: SessionState, to: string): boolean {
  return state.members.some((m) => m.clientId === to) || (state.villains ?? []).some((v) => villainTarget(v.id) === to)
}

export function gmSetScene(state: SessionState, scene: Zone, clock: Clock): SessionState {
  if (scene === state.scene) return state
  return withFeed({ ...state, scene }, [gmEntry(clock, sceneByGmText(scene))])
}

/** The GM gives a player a bonus or penalty (a villain's Hinder, say). */
export function gmGiveMod(state: SessionState, to: string, mod: Omit<PlayMod, 'id'>, clock: Clock): SessionState {
  if (!state.members.some((m) => m.clientId === to) || !Number.isInteger(mod.value) || mod.value === 0 || state.inbox.length >= INBOX_LIMIT) return state
  return { ...state, inbox: [...state.inbox, { id: `gm:${clock.newId()}`, to, from: GM_NAME, mod: { ...mod, label: mod.label.slice(0, MAX_NAME) } }] }
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

// ---- Villains in the game (Phase 5) ----

/**
 * A villain's summary cut to what players accept (./types.ts): the GM's own data isn't checked
 * on the way in like a player's message, and one over-long name or label would make every
 * player ignore every state from then on.
 */
function fitVillain<V extends Omit<SceneVillain, 'sharedUpTo'>>(v: V): V {
  return {
    ...v,
    name: v.name.slice(0, MAX_NAME),
    mods: v.mods.slice(-MAX_LIST).map((m) => ({ ...m, label: m.label.slice(0, MAX_NAME) })),
    twists: v.twists.slice(-MAX_LIST).map((t) => ({ ...t, text: t.text.slice(0, MAX_TEXT) })),
  }
}

/** Adds a villain (its summary, from the GM's store); `sharedUpTo` keeps its earlier history out of the feed. */
export function gmAddVillain(state: SessionState, villain: SceneVillain, clock: Clock): SessionState {
  const villains = state.villains ?? []
  if (villains.some((v) => v.id === villain.id) || villains.length >= MEMBER_LIMIT) return state
  const fitted = fitVillain(villain)
  return withFeed({ ...state, villains: [...villains, fitted] }, [gmEntry(clock, `${fitted.name} joined the scene.`)])
}

/** Removes a villain, with any mods still waiting for it. */
export function gmRemoveVillain(state: SessionState, id: string, clock: Clock): SessionState {
  const villain = state.villains?.find((v) => v.id === id)
  if (!villain) return state
  return withFeed(
    { ...state, villains: state.villains!.filter((v) => v.id !== id), inbox: state.inbox.filter((i) => i.to !== villainTarget(id)) },
    [gmEntry(clock, `${villain.name} left the scene.`)],
  )
}

/** Updates what the table sees of a villain in the game (its Play page sends this as it changes). */
export function gmUpdateVillain(state: SessionState, summary: Omit<SceneVillain, 'sharedUpTo'>): SessionState {
  const current = state.villains?.find((v) => v.id === summary.id)
  if (!current) return state
  const next = { ...fitVillain(summary), ...(current.sharedUpTo ? { sharedUpTo: current.sharedUpTo } : {}) }
  if (JSON.stringify(next) === JSON.stringify(current)) return state
  return { ...state, villains: state.villains!.map((v) => (v.id === summary.id ? next : v)) }
}

/** Adds a villain's new history entries to the feed under its name, remembering the last one shared. */
export function gmShareVillain(state: SessionState, id: string, entries: readonly SharedEntry[], lastId: string, clock: Clock): SessionState {
  const villain = state.villains?.find((v) => v.id === id)
  if (!villain || villain.sharedUpTo === lastId) return state
  const at = clock.now.toISOString()
  const marked = { ...state, villains: state.villains!.map((v) => (v.id === id ? { ...v, sharedUpTo: lastId } : v)) }
  const fit = (text: string) => text.slice(0, MAX_TEXT)
  return withFeed(
    marked,
    entries.map((e) => ({ id: `villain:${id}:${e.id}`, at, by: villain.name, text: fit(e.text), ...(e.details?.length ? { details: e.details.slice(0, MAX_DETAILS).map(fit) } : {}) })),
  )
}

/** Takes the mods waiting for a villain, for its Play page to add (the GM's own browser, so no acknowledgement is needed). */
export function gmTakeVillainMods(state: SessionState, id: string): { state: SessionState; mods: InboxMod[] } {
  const mods = state.inbox.filter((i) => i.to === villainTarget(id))
  return mods.length ? { state: { ...state, inbox: state.inbox.filter((i) => i.to !== villainTarget(id)) }, mods } : { state, mods }
}

