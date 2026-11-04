import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GameStoreContext } from '../app/game-store-context'
import { readDisplayMessage } from './display-channel'
import { GameDisplayPage } from './GameDisplayPage'
import { createGame, type Game } from './model'
import { project } from './project'
import { MemoryGameStore } from './store'
import { addGroup, setNotes } from './table'
import { useDisplayBroadcast } from './useDisplayBroadcast'

let n = 0
const clock = () => ({ now: new Date('2026-11-03T21:00:00Z'), newId: () => `id${++n}` })

function game(sceneName = 'The Foundry'): Game {
  let g = createGame({ id: 'g1', name: 'Thursday game' })
  g = { ...g, scenes: g.scenes.map((s) => ({ ...s, name: sceneName })) }
  g = addGroup(g, { kind: 'minions', name: 'Secret drones', die: 'd6', count: 2, hidden: true }, clock())
  return setNotes(g, 'The crucible is a trap.')
}

/** The GM's table's side, as GamePage uses it. */
function Table({ game: g, room }: { game: Game; room?: string }) {
  useDisplayBroadcast(g.id, project(g, 'observer'), room)
  return null
}

const opened: { unmount: () => void }[] = []
afterEach(() => {
  for (const o of opened.splice(0)) o.unmount()
})

async function display(store: MemoryGameStore) {
  const r = render(
    <GameStoreContext.Provider value={store}>
      <GameDisplayPage id="g1" />
    </GameStoreContext.Provider>,
  )
  opened.push(r)
  return r
}

describe('Open display view on the GM’s device', () => {
  it('shows the saved game, projected for observers, when the table isn’t open', async () => {
    const store = new MemoryGameStore()
    await store.save(game())
    await display(store)
    expect(await screen.findByRole('heading', { name: 'The Foundry' })).toBeInTheDocument()
    expect(screen.getByText("The GM's table isn't open. Showing the game as last saved.")).toBeInTheDocument()
    expect(screen.queryByText('Secret drones')).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('crucible')
  })

  it('follows the open table live, with the code while hosting, and says when it closes', async () => {
    const store = new MemoryGameStore()
    await store.save(game('Saved scene'))
    const table = render(<Table game={game('Live scene')} room="ABCD-EFGH" />)
    opened.push(table)
    await display(store)
    expect(await screen.findByRole('heading', { name: 'Live scene' })).toBeInTheDocument()
    expect(screen.getByText('Watching Thursday game · ABCD-EFGH')).toBeInTheDocument()
    expect(screen.queryByText(/isn't open/)).not.toBeInTheDocument()
    table.rerender(<Table game={game('Next scene')} room="ABCD-EFGH" />)
    expect(await screen.findByRole('heading', { name: 'Next scene' })).toBeInTheDocument()
    act(() => table.unmount())
    opened.splice(opened.indexOf(table), 1)
    expect(await screen.findByText("The GM's table isn't open. Showing the game as last saved.")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Next scene' })).toBeInTheDocument()
  })

  it('says so when the game is gone', async () => {
    await display(new MemoryGameStore())
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no saved game with that link.")
  })

  it('reads only well-formed display messages', () => {
    const table = project(game(), 'observer')
    expect(readDisplayMessage({ type: 'ask' })).toEqual({ type: 'ask' })
    expect(readDisplayMessage({ type: 'closed', extra: 1 })).toEqual({ type: 'closed' })
    expect(readDisplayMessage({ type: 'state', table, room: 'ABCD-EFGH' })).toEqual({ type: 'state', table, room: 'ABCD-EFGH' })
    expect(readDisplayMessage({ type: 'state', table: { ...table, scene: null } })).toBeUndefined()
    expect(readDisplayMessage({ type: 'state', table, room: 5 })).toBeUndefined()
    expect(readDisplayMessage('state')).toBeUndefined()
  })
})
