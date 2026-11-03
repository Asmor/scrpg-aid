/**
 * Open display view on the GM's own device (docs/design/game-table/spec.md, section 13): a window
 * showing one game's display view, fed by the GM's table over a `BroadcastChannel`
 * (./display-channel.ts). It needs no network and no hosting. When the table isn't open, it shows
 * the game as last saved, projected for observers, until the table opens again.
 */
import { useEffect, useState } from 'react'
import { useOptionalGameStore } from '../app/game-store-context'
import { gamesPath } from '../app/route'
import { DisplayView } from './DisplayView'
import { openDisplayChannel, readDisplayMessage, type DisplayMessage } from './display-channel'
import { gameDisplayName } from './model'
import { project, type TableView } from './project'

interface Shown {
  table: TableView
  /** The game's code, while it's hosted. */
  room?: string
  /** Where it came from: the open table (live), or the saved game. */
  source: 'table' | 'saved'
  /** The table was closed after sending it. */
  closed?: true
}

export function GameDisplayPage({ id }: { id: string }) {
  const games = useOptionalGameStore()
  const [shown, setShown] = useState<Shown | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const ch = openDisplayChannel(id)
    if (ch) {
      ch.onmessage = (e: MessageEvent) => {
        const msg = readDisplayMessage(e.data)
        if (msg?.type === 'state') setShown({ table: msg.table, ...(msg.room ? { room: msg.room } : {}), source: 'table' })
        else if (msg?.type === 'closed') setShown((s) => (s?.source === 'table' ? { ...s, closed: true } : s))
      }
      ch.postMessage({ type: 'ask' } satisfies DisplayMessage)
    }
    // Until (or unless) the table answers, the saved game.
    games?.get(id).then(
      (r) => {
        if (!live) return
        if (r.status === 'found') setShown((s) => s ?? { table: project(r.game, 'observer'), source: 'saved' })
        else setProblem(r.status === 'missing' ? "There's no saved game with that link. It may have been deleted." : `This game couldn't be read: ${r.error}`)
      },
      (e: unknown) => live && setProblem(`This game couldn't be read: ${e instanceof Error ? e.message : String(e)}`),
    )
    return () => {
      live = false
      ch?.close()
    }
  }, [id, games])

  if (!shown) {
    return (
      <main className="app-main watch-page">
        {problem ? (
          <>
            <p role="alert">{problem}</p>
            <p>
              <a href={gamesPath}>← Games</a>
            </p>
          </>
        ) : (
          <p>Loading…</p>
        )}
      </main>
    )
  }
  const status = shown.source === 'saved' || shown.closed ? "The GM's table isn't open. Showing the game as last saved." : undefined
  return <DisplayView table={shown.table} watching={`Watching ${gameDisplayName(shown.table)}${shown.room ? ` · ${shown.room}` : ''}`} {...(status ? { status } : {})} />
}
