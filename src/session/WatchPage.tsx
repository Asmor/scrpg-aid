/**
 * Watch a game (docs/design/game-table/spec.md, sections 10 and 13): the game code and "Name this
 * screen" (remembered on the device), then Start watching. While this device watches the game,
 * the page is the display view: the table as players see it, read-only, filling the screen.
 */
import { useId, useState } from 'react'
import { gamesPath, navigate, watchPath } from '../app/route'
import { DisplayView } from '../game/DisplayView'
import { gameDisplayName } from '../game/model'
import { OBSERVER_LIMIT, type RefusedReason } from './protocol'
import { normalizeRoomCode } from './code'
import { useSession, useWatchingSnapshot } from './context'

const REFUSED: Record<RefusedReason | 'oldHost', string> = {
  version: "The GM's device is on a newer version of the app. Reload this page to update it, then try again.",
  oldHost: "The GM's device is on an older version of the app. Ask the GM to reload their page, then try again.",
  full: `This game already has ${OBSERVER_LIMIT} screens watching, the most it takes.`,
  taken: "The GM's device turned this screen away.",
  removed: 'The GM removed this screen from the game.',
  wrongGame: 'That code now belongs to a different game. Check the code with your GM.',
}

/** "9:42 PM": when the table on screen was last updated. */
const timeOf = (at: string) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function WatchPage({ room: given }: { room?: string }) {
  const session = useSession()
  const code = given ? normalizeRoomCode(given) : undefined
  const watching = session.watching && code && session.watching.room === code ? session.watching : undefined
  const snapshot = useWatchingSnapshot(watching)

  if (watching && snapshot) {
    const received = snapshot.received
    if (snapshot.status === 'refused') {
      return (
        <main className="app-main watch-page">
          <h2>Can't watch {code}</h2>
          <p role="alert">{REFUSED[snapshot.refused ?? 'removed']}</p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => {
                session.stopWatching()
                navigate(watchPath())
              }}
            >
              Watch another game
            </button>
            <a className="button" href={gamesPath}>
              Games
            </a>
          </div>
        </main>
      )
    }
    if (!received) {
      return (
        <main className="app-main watch-page">
          <p role="status">
            {snapshot.status === 'offline' ? `The GM of ${code} isn't connected. This screen keeps trying every 30 seconds.` : `Connecting to ${code}…`}
          </p>
          <p>
            <a href={gamesPath}>← Games</a>
          </p>
        </main>
      )
    }
    const status = snapshot.status === 'reconnecting' ? 'Reconnecting to the GM…' : snapshot.status === 'offline' ? `The GM isn't connected. As of ${timeOf(received.at)}.` : undefined
    return <DisplayView table={received.table} watching={`Watching ${gameDisplayName(received.table)} · ${code}`} {...(status ? { status } : {})} />
  }
  return <WatchForm key={code ?? ''} room={given} />
}

function WatchForm({ room: given }: { room?: string }) {
  const session = useSession()
  const id = useId()
  const [room, setRoom] = useState(given ?? '')
  const [name, setName] = useState(session.screenName)
  const code = normalizeRoomCode(room)
  return (
    <main className="app-main watch-page">
      <p>
        <a href={gamesPath}>← Games</a>
      </p>
      <h2>Watch a game</h2>
      <p>Shows the table full screen, the way players see it. Nothing on this screen changes the game.</p>
      {(session.hosting || session.playing) && <p className="hint">{session.hosting ? "You're hosting a game. Watching one stops hosting it." : "You're playing in a game. Watching one leaves it."}</p>}
      <form
        className="play-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (!code || !name.trim()) return
          session.watchGame({ room: code, screenName: name.trim() })
          navigate(watchPath(code))
        }}
      >
        <label className="field" htmlFor={`${id}-room`}>
          <span>Game code</span>
          <input id={`${id}-room`} type="text" autoComplete="off" autoCapitalize="characters" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="ABCD-EFGH" />
        </label>
        {room.trim() && !code && <p className="hint">A game code is eight letters and numbers, like ABCD-EFGH.</p>}
        <label className="field" htmlFor={`${id}-name`}>
          <span>Name this screen (the GM sees it)</span>
          <input id={`${id}-name`} type="text" autoComplete="off" maxLength={200} placeholder="Living room TV" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="button button--primary" disabled={!code || !name.trim()}>
          Start watching
        </button>
      </form>
    </main>
  )
}
