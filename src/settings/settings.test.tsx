import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { DieIcon } from '../components/icons'
import { createGame, villainCopy } from '../game/model'
import { draftOfNew } from '../game/scenes'
import { addVillain } from '../game/table'
import { presetCounts } from '../rules/trackers'
import { adaptiveBruiser } from '../test/villains'
import { AddGroupDialog } from '../game/dialogs'
import { applyToRoot, useSettings } from './context'
import { SettingsProvider } from './SettingsProvider'
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_FORMAT, settingsToSaved } from './model'
import { SettingsPage } from './SettingsPage'
import { MemorySettingsStore } from './store'

const page = (store = new MemorySettingsStore()) => {
  render(
    <SettingsProvider store={store}>
      <SettingsPage />
    </SettingsProvider>,
  )
  return store
}

afterEach(() => {
  const root = document.documentElement
  root.removeAttribute('data-text-size')
  root.classList.remove('motion-reduce', 'motion-allow')
})

describe('reading settings', () => {
  it('round-trips, and missing or unusable fields read as their defaults', () => {
    const changed = { ...DEFAULT_SETTINGS, diceDisplay: 'text' as const, newGame: { ...DEFAULT_SETTINGS.newGame, startHidden: false } }
    expect(parseSettings(settingsToSaved(changed))).toEqual(changed)
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ format: 'other', settings: { diceDisplay: 'text' } })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ format: SETTINGS_FORMAT, version: 1, settings: { diceDisplay: 'nope', motion: 'reduce', alerts: { turn: 'x', sound: true }, newGame: 3 } })).toEqual({ ...DEFAULT_SETTINGS, motion: 'reduce', alerts: { ...DEFAULT_SETTINGS.alerts, sound: true } })
  })
})

describe('the Settings page', () => {
  it('saves each change at once, says so, and it survives a reload', async () => {
    const store = page()
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }))
    expect(within(screen.getByRole('group', { name: 'Show dice as' })).getByRole('status')).toHaveTextContent('Saved')
    await waitFor(async () => expect((await store.load()).diceDisplay).toBe('text'))
    // The preview follows, under the same names.
    expect(screen.getByRole('img', { name: 'd8' })).toHaveTextContent('d8')
    await userEvent.click(screen.getByRole('radio', { name: 'Epic · 1 / 3 / 4' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Starts hidden' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Name only' }))
    await waitFor(async () => expect((await store.load()).newGame).toEqual({ trackerPreset: 'epic', startHidden: false, playersSee: 'name' }))
  })

  it('chooses how dice are rolled', async () => {
    const store = page()
    expect(screen.getByRole('radio', { name: /The app rolls/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /I roll physical dice/ }))
    await waitFor(async () => expect((await store.load()).rolling).toBe('physical'))
  })

  it('applies text size and motion to the root at once', async () => {
    page()
    await userEvent.click(screen.getByRole('radio', { name: 'Larger' }))
    expect(document.documentElement.dataset.textSize).toBe('larger')
    await userEvent.click(screen.getByRole('radio', { name: 'Reduce motion' }))
    expect(document.documentElement).toHaveClass('motion-reduce')
    await userEvent.click(screen.getByRole('radio', { name: 'Allow motion' }))
    expect(document.documentElement).not.toHaveClass('motion-reduce')
    expect(document.documentElement).toHaveClass('motion-allow')
  })

  it('loads what was saved', async () => {
    const store = new MemorySettingsStore()
    await store.save({ ...DEFAULT_SETTINGS, textSize: 'large' })
    page(store)
    expect(await screen.findByRole('radio', { name: 'Large' })).toBeChecked()
    await waitFor(() => expect(document.documentElement.dataset.textSize).toBe('large'))
  })

  it('leaves the display view at its own size', async () => {
    const store = new MemorySettingsStore()
    await store.save({ ...DEFAULT_SETTINGS, textSize: 'larger', motion: 'reduce' })
    render(
      <SettingsProvider store={store} roomScale>
        <p>Display</p>
      </SettingsProvider>,
    )
    await waitFor(() => expect(document.documentElement).toHaveClass('motion-reduce'))
    expect(document.documentElement.dataset.textSize).toBe('normal')
  })
})

describe('a die', () => {
  it('is an icon by default and text by setting, with the same name', async () => {
    const { unmount } = render(<DieIcon die="d10" />)
    expect(screen.getByRole('img', { name: 'd10' }).tagName).toBe('IMG')
    unmount()
    const store = new MemorySettingsStore()
    await store.save({ ...DEFAULT_SETTINGS, diceDisplay: 'text' })
    render(
      <SettingsProvider store={store}>
        <DieIcon die="d10" />
      </SettingsProvider>,
    )
    await waitFor(() => expect(screen.getByRole('img', { name: 'd10' }).tagName).toBe('SPAN'))
    expect(screen.getByRole('img', { name: 'd10' })).toHaveTextContent('d10')
  })
})

describe('new game defaults', () => {
  const clock = { now: new Date('2026-11-05T12:00:00Z'), newId: () => 'x' }

  it('start the first scene and new planned scenes on the chosen tracker', () => {
    const tracker = presetCounts('epic')
    const game = createGame({ tracker })
    expect(game.scenes[0]!.tracker).toEqual(tracker)
    expect(createGame().scenes[0]!.tracker).toEqual(presetCounts('standard'))
    expect(draftOfNew(game, tracker).tracker).toEqual(tracker)
    expect(presetCounts('nope')).toEqual(presetCounts('standard'))
  })

  it('start quick add hidden or not', async () => {
    const store = new MemorySettingsStore()
    await store.save({ ...DEFAULT_SETTINGS, newGame: { ...DEFAULT_SETTINGS.newGame, startHidden: false } })
    const Dialog = () => (useSettings().settings === DEFAULT_SETTINGS ? null : <AddGroupDialog kind="minions" onAdd={() => {}} onClose={() => {}} />)
    render(
      <SettingsProvider store={store}>
        <Dialog />
      </SettingsProvider>,
    )
    expect(await screen.findByRole('checkbox', { name: /hidden/i })).not.toBeChecked()
  })

  it('set what players see of a villain brought in', () => {
    expect(villainCopy(adaptiveBruiser(), 'v').playersSee).toBe('status')
    const game = addVillain(createGame(), adaptiveBruiser(), clock, false, 1, 'health')
    expect(game.villains[0]).toMatchObject({ hidden: false, playersSee: 'health' })
  })
})

describe('useSettings', () => {
  it('reads the defaults with no provider', () => {
    const Show = () => <p>{useSettings().settings.rolling}</p>
    render(<Show />)
    expect(screen.getByText('app')).toBeInTheDocument()
    expect(() => applyToRoot(document.documentElement, DEFAULT_SETTINGS)).not.toThrow()
  })
})
