import { act, render, waitFor } from '@testing-library/react'
import { useContext, useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { GameStoreContext } from '../app/game-store-context'
import { createGame } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { useSettings, type SettingsValue } from '../settings/context'
import { DEFAULT_SETTINGS } from '../settings/model'
import { SettingsProvider } from '../settings/SettingsProvider'
import { MemorySettingsStore } from '../settings/store'
import { SessionContext } from './context'
import type { SessionManager } from './manager'
import { SessionProvider } from './SessionProvider'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'

/** Hands the manager out, with no page open: hosting has to work on any page. */
function Grab({ onGrab }: { onGrab: (manager: SessionManager | null, update: SettingsValue['update']) => void }) {
  const manager = useContext(SessionContext)
  const { update } = useSettings()
  useEffect(() => onGrab(manager, update), [onGrab, manager, update])
  return null
}

describe('the session provider', () => {
  it("resumes hosting once settings are read, holding saves on any page as Settings say, and follows a change", async () => {
    const games = new MemoryGameStore()
    await games.save(createGame({ id: 'g1' }))
    const storage = memoryStorage()
    localSessionStore(storage).saveHost({ v: 1, room: 'ABCD-EFGH', gameId: 'g1', gm: 'Sam', removed: [] })
    const settings = new MemorySettingsStore()
    await settings.save({ ...DEFAULT_SETTINGS, rolling: 'physical', npcSaves: 'physical' })
    const got: { manager?: SessionManager; update?: SettingsValue['update'] } = {}
    render(
      <SettingsProvider store={settings}>
        <GameStoreContext.Provider value={games}>
          <SessionProvider connect={fakeNetwork().connect} store={localSessionStore(storage)}>
            <Grab
              onGrab={(manager, update) => {
                got.manager = manager ?? undefined
                got.update = update
              }}
            />
          </SessionProvider>
        </GameStoreContext.Provider>
      </SettingsProvider>,
    )
    await waitFor(() => expect(got.manager!.getSnapshot().hosting).toBeDefined())
    expect(got.manager!.getSnapshot().hosting!.holdSaves).toBe(true)
    act(() => got.update!((s) => ({ ...s, npcSaves: 'auto' })))
    expect(got.manager!.getSnapshot().hosting!.holdSaves).toBe(false)
  })
})
