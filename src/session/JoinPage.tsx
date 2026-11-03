/**
 * Join as a player (docs/design/game-table/spec.md, section 7): the game code (from the GM's link,
 * or typed in), the player's name (remembered on the device), and Bring a hero, a list of the
 * player's finished heroes. A hero already in this game rejoins as the game's copy; any other is
 * copied in when the GM's device takes the hello.
 *
 * Joining waits here until the GM's device answers, then opens the table. A code no game answers
 * on (changed by the GM, or not hosted yet) gets an error under the code field instead
 * (docs/design/game-table/game-table-spec-addendum-game-codes.md).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { gamesPath, listPath, navigate, tablePath } from '../app/route'
import { useStore } from '../app/store-context'
import { heroDisplayName, isDraft, type Hero } from '../hero/model'
import { normalizeRoomCode } from './code'
import { JOIN_WAIT } from './client'
import { NO_GAME, refusedText } from './refused'
import { usePlayingSnapshot, useSession } from './context'
import { useOptionalJoinedStore } from '../app/joined-store-context'
import type { JoinedGame } from '../game/joined-store'

/** "Oct 30": the day a hero joined a game. */
const sinceDate = (at: string) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function JoinPage({ room: given }: { room?: string }) {
  const store = useStore()
  const session = useSession()
  const playing = usePlayingSnapshot(session.playing)
  const formId = useId()
  const [heroes, setHeroes] = useState<Hero[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [room, setRoom] = useState(given ?? session.lastGame?.room ?? '')
  const [name, setName] = useState(session.name)
  const [heroId, setHeroId] = useState('')
  // Games this device has joined, to say which heroes are already in this one.
  const joinedStore = useOptionalJoinedStore()
  const [joined, setJoined] = useState<JoinedGame[]>([])
  useEffect(() => {
    let live = true
    joinedStore?.list().then(
      (list) => live && setJoined(list),
      () => {},
    )
    return () => {
      live = false
    }
  }, [joinedStore])

  useEffect(() => {
    let live = true
    store.list().then(
      (list) => {
        if (!live) return
        // Drafts can't be played until they're finished.
        const playable = list.heroes.filter((h) => !isDraft(h))
        setHeroes(playable)
        setHeroId((id) => id || playable[0]?.id || '')
      },
      (e: unknown) => live && setLoadError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [store])

  // Joining: waiting for the GM's device to answer, and why it didn't.
  const [joining, setJoining] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = playing?.status
  const leaveGame = useRef(session.leaveGame)
  useEffect(() => {
    leaveGame.current = session.leaveGame
  })
  useEffect(() => {
    if (!joining) return
    if (status === 'live') return navigate(tablePath(joining))
    const fail = (why: string) => {
      leaveGame.current()
      setJoining(null)
      setError(why)
    }
    if (status === 'refused') return fail(refusedText(playing?.refused ?? 'removed', 'this game'))
    if (status === 'offline') return fail(NO_GAME)
    const timer = setTimeout(() => fail(NO_GAME), JOIN_WAIT)
    return () => clearTimeout(timer)
  }, [joining, status, playing?.refused])

  const code = normalizeRoomCode(room)
  const hero = heroes?.find((h) => h.id === heroId)
  /** When a hero joined this game, if this device knows it's in it. */
  const since = (h: Hero): string | undefined => {
    const client = session.playing
    if (client && client.info.room === code && client.info.heroSourceId === h.id) return playing?.received?.you?.since ?? playing?.received?.at
    return joined.find((j) => j.room === code && j.heroSourceId === h.id)?.since
  }
  const heroSince = hero && since(hero)

  return (
    <div className="play-page join-page">
      <p>
        <a href={gamesPath}>← Games</a>
      </p>
      <h2>Join a game</h2>
      <p>Your GM gives you the game code, or a link with it. Everyone needs to be online.</p>
      {session.hosting && <p className="hint">You're hosting a game. Joining one stops hosting it.</p>}
      {loadError && (
        <p role="alert" className="error">
          Couldn't load your heroes: {loadError}
        </p>
      )}
      <form
        className="play-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (!code || !hero || !name.trim() || joining) return
          setError(null)
          session.joinGame({ room: code, name: name.trim(), hero })
          setJoining(code)
        }}
      >
        <label className="field" htmlFor={`${formId}-room`}>
          <span>Game code</span>
          <input
            id={`${formId}-room`}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={room}
            onChange={(e) => {
              setRoom(e.target.value)
              setError(null)
            }}
            placeholder="ABCD-EFGH"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${formId}-error` : undefined}
          />
        </label>
        {error && (
          <p id={`${formId}-error`} role="alert" className="error">
            {error}
          </p>
        )}
        {room.trim() && !code && <p className="hint">A game code is eight letters and numbers, like ABCD-EFGH.</p>}
        <label className="field" htmlFor={`${formId}-name`}>
          <span>Your name (everyone at the table sees it)</span>
          <input id={`${formId}-name`} type="text" autoComplete="nickname" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="join-heroes">
          <legend>Bring a hero</legend>
          {heroes?.length === 0 && (
            <p>
              You have no finished heroes yet. <a href={listPath}>Make one first</a>.
            </p>
          )}
          {heroes?.map((h) => {
            const at = since(h)
            return (
              <label key={h.id} className="join-hero">
                <input type="radio" name={`${formId}-hero`} checked={h.id === heroId} onChange={() => setHeroId(h.id)} />
                <span>
                  <strong>{heroDisplayName(h)}</strong>
                  {at && <span className="gt-sub"> · in this game since {sinceDate(at)}</span>}
                </span>
              </label>
            )
          })}
        </fieldset>
        <button type="submit" className="button button--primary" disabled={!code || !hero || !name.trim() || Boolean(joining)}>
          {joining ? `Looking for game ${joining}…` : hero ? `${heroSince ? 'Rejoin' : 'Join'} with ${heroDisplayName(hero)}` : 'Join'}
        </button>
      </form>
    </div>
  )
}
