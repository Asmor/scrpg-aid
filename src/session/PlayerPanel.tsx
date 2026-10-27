/**
 * The game session on a hero's Play page (Phase 4): whether they're in a game, its party and
 * feed, and leaving it.
 */
import { joinPath, playPath } from '../app/route'
import { useTick } from '../play/useTick'
import { useOnline } from './useOnline'
import type { PlayerSession, PlayerSnapshot } from './controller'
import { Feed, Party } from './TableViews'

interface Props {
  heroId: string
  /** The browser's player session, if any (it may be another hero's). */
  player?: PlayerSession
  snapshot?: PlayerSnapshot
  hosting: boolean
  onLeave: () => void
}

export function PlayerPanel({ heroId, player, snapshot, hosting, onLeave }: Props) {
  const now = useTick()
  const online = useOnline()
  if (!player) {
    return (
      <p>
        Not in a game. {hosting ? 'You’re hosting one as the GM.' : <a href={joinPath()}>Join a game</a>}
      </p>
    )
  }
  if (player.heroId !== heroId) {
    return (
      <p>
        You’re in game {player.room} with <a href={playPath(player.heroId)}>another hero</a>.
      </p>
    )
  }
  const status = snapshot?.status ?? 'connecting'
  return (
    <>
      <p className="session-status" role="status">
        {status === 'connecting' ? `Connecting to game ${player.room}…` : status === 'connected' ? `In game ${player.room}.` : 'The GM is away. Reconnecting…'}
      </p>
      {!online && <p className="hint">You’re offline. The game picks up again when you’re back online.</p>}
      {status !== 'connected' && snapshot?.error && <p className="hint">Connection problem: {snapshot.error}</p>}
      {status === 'connecting' && <p className="hint">If this takes more than a few seconds, check the room code and password with your GM, and that they’re online.</p>}
      {snapshot?.state && (
        <>
          <h4>Party</h4>
          <Party members={snapshot.state.members} me={player.clientId} />
          <h4>Feed</h4>
          <Feed entries={snapshot.state.feed} now={now} />
        </>
      )}
      <div className="button-row">
        <button type="button" className="button" onClick={onLeave}>
          Leave the game
        </button>
      </div>
    </>
  )
}
