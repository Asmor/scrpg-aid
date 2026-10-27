/**
 * Joining a game as a player (Phase 4): the room code (from the GM's link, or typed in), the
 * password if the game has one, and which hero to play. Then on to that hero's game aid.
 */
import { useEffect, useId, useState } from 'react'
import { listPath, navigate, playPath } from '../app/route'
import { useStore } from '../app/store-context'
import { heroDisplayName, type Hero } from '../hero/model'
import { normalizeRoomCode } from './code'
import { useSession } from './context'

export function JoinPage({ room: given }: { room?: string }) {
  const store = useStore()
  const session = useSession()
  const formId = useId()
  const [heroes, setHeroes] = useState<Hero[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // The last game joined fills in the code, and its password unless the link is for another room.
  const last = session.lastGame
  const [room, setRoom] = useState(given ?? last?.room ?? '')
  const [password, setPassword] = useState(() => (last && normalizeRoomCode(given ?? last.room) === last.room ? (last.password ?? '') : ''))
  const [heroId, setHeroId] = useState('')

  useEffect(() => {
    let live = true
    store.list().then(
      (list) => {
        if (!live) return
        setHeroes(list.heroes)
        setHeroId((id) => id || list.heroes[0]?.id || '')
      },
      (e: unknown) => live && setLoadError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [store])

  const code = normalizeRoomCode(room)
  const hero = heroes?.find((h) => h.id === heroId)
  return (
    <div className="play-page">
      <p>
        <a href={listPath}>← All heroes</a>
      </p>
      <h2>Join a game</h2>
      <p>Your GM gives you the room code (or a link with it). Everyone needs to be online.</p>
      {session.gm && <p className="hint">You’re hosting a game. Joining one ends it.</p>}
      {loadError && (
        <p role="alert" className="error">
          Couldn’t load your heroes: {loadError}
        </p>
      )}
      {heroes?.length === 0 && (
        <p>
          You have no heroes yet. <a href={listPath}>Make one first</a>.
        </p>
      )}
      <form
        className="play-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (!code || !hero) return
          session.join({ room: code, password: password.trim() || undefined, heroId: hero.id, sharedUpTo: hero.play?.history.at(-1)?.id })
          navigate(playPath(hero.id))
        }}
      >
        <label className="field" htmlFor={`${formId}-room`}>
          <span>Room code</span>
          <input id={`${formId}-room`} type="text" autoComplete="off" autoCapitalize="characters" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="ABCD-EFGH" />
        </label>
        <label className="field" htmlFor={`${formId}-password`}>
          <span>Password (if the game has one)</span>
          <input id={`${formId}-password`} type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field" htmlFor={`${formId}-hero`}>
          <span>Hero</span>
          <select id={`${formId}-hero`} value={heroId} onChange={(e) => setHeroId(e.target.value)} disabled={!heroes?.length}>
            {heroes?.map((h) => (
              <option key={h.id} value={h.id}>
                {heroDisplayName(h)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button button--primary" disabled={!code || !hero}>
          Join
        </button>
      </form>
      {room.trim() && !code && <p className="hint">A room code is eight letters and numbers, like ABCD-EFGH.</p>}
    </div>
  )
}
