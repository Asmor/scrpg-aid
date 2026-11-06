import { cleanup, renderHook, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGame, heroCopy } from '../game/model'
import { addChallenge, addVillain } from '../game/table'
import { completeHero } from '../test/heroes'
import { PlayProviders } from '../test/play'
import { playStores } from '../test/play-stores'
import { adaptiveBruiser } from '../test/villains'
import { deliverAlerts, gmAlerts, gmWatch, needsHomeScreen, playerAlerts, type AlertChannels, type PlayerWatch } from './alerts'
import { SettingsContext } from './context'
import { DEFAULT_SETTINGS, type Settings } from './model'
import { SettingsPage } from './SettingsPage'
import { SettingsProvider } from './SettingsProvider'
import { MemorySettingsStore } from './store'
import { useAlerts } from './useAlerts'

const quiet: PlayerWatch = { myTurn: false, requests: 0, syncAnswers: 0, reminder: false, choices: 0 }
const clock = { now: new Date('2026-11-05T12:00:00Z'), newId: () => crypto.randomUUID() }
const channels = (background = false) => ({ sound: vi.fn(), vibrate: vi.fn(), notify: vi.fn(), background: () => background }) satisfies AlertChannels
const on = (change: Partial<Settings['alerts']>): Settings['alerts'] => ({ ...DEFAULT_SETTINGS.alerts, turn: true, answer: true, ...change })

afterEach(() => vi.unstubAllGlobals())

describe('what alerts a player', () => {
  it('their turn coming up, unless their own action did it', () => {
    expect(playerAlerts(quiet, { ...quiet, myTurn: true }, false)).toEqual(['turn'])
    expect(playerAlerts(quiet, { ...quiet, myTurn: true }, true)).toEqual([])
    expect(playerAlerts({ ...quiet, myTurn: true }, { ...quiet, myTurn: true }, false)).toEqual([])
    expect(playerAlerts({ ...quiet, myTurn: true }, quiet, false)).toEqual([])
  })

  it('the GM answering, or anything waiting on them', () => {
    expect(playerAlerts({ ...quiet, requests: 2 }, { ...quiet, requests: 1 }, false)).toEqual(['answer'])
    expect(playerAlerts(quiet, { ...quiet, requests: 1 }, false)).toEqual([])
    expect(playerAlerts(quiet, { ...quiet, syncAnswers: 1 }, false)).toEqual(['answer'])
    expect(playerAlerts(quiet, { ...quiet, reminder: true }, false)).toEqual(['answer'])
    expect(playerAlerts(quiet, { ...quiet, prompt: 'i1' }, false)).toEqual(['answer'])
    expect(playerAlerts({ ...quiet, prompt: 'i1' }, { ...quiet, prompt: 'i1' }, false)).toEqual([])
    expect(playerAlerts(quiet, { ...quiet, choices: 1 }, false)).toEqual(['answer'])
    expect(playerAlerts({ ...quiet, choices: 1 }, quiet, false)).toEqual([])
  })
})

describe('what alerts the GM', () => {
  const game = () => {
    const g = addVillain(createGame({ id: 'g' }), adaptiveBruiser(), clock, false)
    g.heroes.push(heroCopy(completeHero(), 'h1', { clientId: 'c1', name: 'Alex' }), heroCopy({ ...completeHero(), id: 'own' }, 'h2'))
    return g
  }

  it('any actor of theirs coming up, not a player\'s hero', () => {
    const g = game()
    const villain = g.villains[0]!.id
    const on = (kind: 'hero' | 'villain', id: string) => gmWatch({ ...g, turn: { ...g.turn, current: { kind, id } } })
    expect(on('villain', villain).acting).toBe(`villain:${villain}`)
    expect(on('hero', 'h2').acting).toBe('hero:h2')
    expect(on('hero', 'h1').acting).toBeUndefined()
    expect(gmAlerts(on('hero', 'h1'), on('villain', villain))).toEqual(['turn'])
    expect(gmAlerts(on('villain', villain), on('hero', 'h2'))).toEqual(['turn'])
    expect(gmAlerts(on('villain', villain), on('villain', villain))).toEqual([])
    expect(gmAlerts(on('villain', villain), on('hero', 'h1'))).toEqual([])
    // Nobody acts between issues.
    const { currentIssueId: _, ...between } = { ...g, turn: { ...g.turn, current: { kind: 'villain' as const, id: villain } } }
    expect(gmWatch(between).acting).toBeUndefined()
  })

  it('a new request or sheet update', () => {
    const g = game()
    const challenged = addChallenge(g, { name: 'Furnace', steps: 2, hidden: false }, clock)
    const asked = { ...challenged, challenges: [{ ...challenged.challenges[0]!, requests: [{ id: 'r', heroId: 'h1', total: 5, at: 'x' }] }] }
    expect(gmAlerts(gmWatch(challenged), gmWatch(asked))).toEqual(['answer'])
    expect(gmAlerts(gmWatch(asked), gmWatch(challenged))).toEqual([])
    expect(gmAlerts(gmWatch(g), gmWatch({ ...g, pendingSyncs: [{ heroId: 'h1', sheet: g.heroes[0]!.sheet, at: 'x' }] }))).toEqual(['answer'])
  })
})

describe('sending alerts', () => {
  it('only what was asked for', () => {
    const c = channels()
    deliverAlerts(['turn'], on({ turn: false, sound: true }), 'G', c)
    expect(c.sound).not.toHaveBeenCalled()
    deliverAlerts(['answer'], on({ sound: true }), 'G', c)
    expect(c.sound).toHaveBeenCalledWith('answer')
    expect(c.vibrate).not.toHaveBeenCalled()
    deliverAlerts(['turn'], on({ vibrate: true }), 'G', c)
    expect(c.vibrate).toHaveBeenCalledWith('turn')
  })

  it('notifications only in the background; sound and vibration in the foreground too', () => {
    const front = channels(false)
    deliverAlerts(['turn'], on({ notify: true, sound: true }), 'G', front)
    expect(front.notify).not.toHaveBeenCalled()
    expect(front.sound).toHaveBeenCalled()
    const back = channels(true)
    deliverAlerts(['turn', 'answer'], on({ notify: true }), 'Thursday game', back)
    expect(back.notify.mock.calls.flat()).toEqual(["It's your turn in Thursday game.", 'Something needs your answer in Thursday game.'])
  })
})

describe('watching for alerts', () => {
  const settings = { ...DEFAULT_SETTINGS, alerts: on({ sound: true }) }
  const wrapper = ({ children }: { children: ReactNode }) => <SettingsContext.Provider value={{ settings, update: () => {} }}>{children}</SettingsContext.Provider>

  it('never for the first state seen, and once for each change', () => {
    const c = channels()
    const { rerender } = renderHook(({ w }: { w: PlayerWatch | undefined }) => useAlerts(w, (a, b) => playerAlerts(a, b, false), 'G', c), { wrapper, initialProps: { w: undefined as PlayerWatch | undefined } })
    rerender({ w: { ...quiet, myTurn: true } })
    expect(c.sound).not.toHaveBeenCalled()
    rerender({ w: { ...quiet, myTurn: true } })
    rerender({ w: quiet })
    rerender({ w: { ...quiet, myTurn: true } })
    expect(c.sound).toHaveBeenCalledOnce()
  })
})

describe('the Alerts section', () => {
  const page = (store = new MemorySettingsStore()) => {
    render(
      <SettingsProvider store={store}>
        <PlayProviders stores={playStores()}>
          <SettingsPage />
        </PlayProviders>
      </SettingsProvider>,
    )
    return store
  }

  it('starts all off, and saves each', async () => {
    const store = page()
    for (const name of [/It's my turn/, /needs my answer/, 'Sound', /in the background/]) expect(screen.getByRole('checkbox', { name })).not.toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: /It's my turn/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sound' }))
    await waitFor(async () => expect((await store.load()).alerts).toMatchObject({ turn: true, sound: true, answer: false }))
  })

  it('shows Vibrate only where the device can', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    page()
    expect(screen.queryByRole('checkbox', { name: 'Vibrate' })).not.toBeInTheDocument()
    cleanup()
    Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true })
    page()
    expect(screen.getByRole('checkbox', { name: 'Vibrate' })).toBeInTheDocument()
  })

  it('asks before notifying, and unchecks if refused', async () => {
    const requestPermission = vi.fn(async () => 'denied')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    const store = page()
    const box = screen.getByRole('checkbox', { name: /in the background/ })
    await userEvent.click(box)
    expect(requestPermission).toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications are blocked in this browser.')
    expect(box).not.toBeChecked()
    expect((await store.load()).alerts.notify).toBe(false)
  })

  it('turns notifying on when allowed', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    const store = page()
    await userEvent.click(screen.getByRole('checkbox', { name: /in the background/ }))
    await waitFor(async () => expect((await store.load()).alerts.notify).toBe(true))
  })

  it('says when iOS needs the app on the home screen', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone' })
    expect(needsHomeScreen()).toBe(true)
    vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true })
    expect(needsHomeScreen()).toBe(false)
    vi.stubGlobal('navigator', { userAgent: 'Android' })
    expect(needsHomeScreen()).toBe(false)
  })
})
