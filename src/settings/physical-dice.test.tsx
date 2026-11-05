import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PlayPage } from '../components/HeroPage'
import { completeHero } from '../test/heroes'
import { PlayProviders } from '../test/play'
import { playStores, savedHero, seedHero } from '../test/play-stores'
import { SettingsContext } from './context'
import { MinionUse } from '../play/MinionList'
import { applyGroupRoll } from '../game/resolve'
import { rollMembers, membersWhoSave } from '../game/npc'
import { logEnvironmentRoll, rollAspects } from '../game/environment'
import { createGame } from '../game/model'
import { addGroup } from '../game/table'
import { recordMinionRoll } from '../play/minions'
import { emptyPlay } from '../play/state'
import { confirmRoll } from '../play/roll'
import { DEFAULT_SETTINGS } from './model'
import { SettingsProvider } from './SettingsProvider'
import { MemorySettingsStore } from './store'

const clock = () => ({ now: new Date('2026-11-05T12:00:00Z'), newId: () => crypto.randomUUID() })

async function setup() {
  const settings = new MemorySettingsStore()
  await settings.save({ ...DEFAULT_SETTINGS, rolling: 'physical' })
  const stores = playStores()
  await seedHero(stores, { ...completeHero(), id: 'h1' })
  render(
    <SettingsProvider store={settings}>
      <PlayProviders stores={stores}>
        <PlayPage id="h1" clock={clock} random={() => 0.5} />
      </PlayProviders>
    </SettingsProvider>,
  )
  const actions = await screen.findByRole('region', { name: 'Actions' })
  return { stores, use: within(actions) }
}

describe('with physical dice', () => {
  it('opens the pad for a roll, with Roll for me, and takes the numbers', async () => {
    const { stores, use } = await setup()
    await userEvent.click(use.getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Always on the Move' }))
    await waitFor(() => expect(dialog.getByRole('group', { name: 'Number pad' })).toBeInTheDocument())
    expect(dialog.queryByRole('button', { name: 'Roll' })).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Roll for me' })).toBeInTheDocument()
    await userEvent.keyboard('3')
    await userEvent.keyboard('5')
    await userEvent.keyboard('2')
    await userEvent.keyboard('{Enter}')
    expect(dialog.getByRole('group', { name: 'Attack (Mid)' })).toHaveTextContent('Uses Mid (3)')
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await savedHero(stores, 'h1')).play?.history.find((h) => h.details)?.details?.[0]).toBe('Rolled 5, 3, 2 (physical dice).'))
  })

  it('Roll for me rolls once, as the app would', async () => {
    const { use } = await setup()
    await userEvent.click(use.getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Always on the Move' }))
    await userEvent.click(await dialog.findByRole('button', { name: 'Roll for me' }))
    expect(dialog.getByRole('group', { name: 'Attack (Mid)' })).toBeInTheDocument()
    expect(dialog.queryByText('Entered')).not.toBeInTheDocument()
  })

  it('Cancel leaves the roll, with nothing changed', async () => {
    const { stores, use } = await setup()
    await userEvent.click(use.getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Always on the Move' }))
    await dialog.findByRole('group', { name: 'Number pad' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await savedHero(stores, 'h1')).play).toBeUndefined()
  })
})

describe('a minion of a hero, with physical dice', () => {
  it('takes one number, or rolls for me', async () => {
    const minion = { id: 'm', name: 'Bolt', die: 'd6' as const, action: 'attack' as const, mods: [] }
    const done: unknown[] = []
    render(
      <SettingsContext.Provider value={{ settings: { ...DEFAULT_SETTINGS, rolling: 'physical' }, update: () => {} }}>
        <MinionUse minion={minion} random={() => 0.5} onDone={(r) => done.push(r)} onCancel={() => {}} />
      </SettingsContext.Provider>,
    )
    const pad = within(screen.getByRole('group', { name: 'Number pad' }))
    expect(pad.getByRole('button', { name: '7' })).toBeDisabled()
    await userEvent.click(pad.getByRole('button', { name: '4' }))
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(done).toMatchObject([{ value: 4, entered: true }])
  })
})

describe('what the log says about physical dice', () => {
  const tick = { now: new Date('2026-11-05T12:00:00Z'), newId: () => crypto.randomUUID() }

  it('in a roll, a minion\'s roll and the environment\'s', () => {
    const record = { title: 'X', manual: true, results: [], rolled: [{ label: 'Entered', die: 'd8', value: 2 }, { label: 'Entered', die: 'd10', value: 9 }, { label: 'Entered', die: 'd8', value: 6 }] } as never
    expect(confirmRoll(emptyPlay(), record, tick).history[0]!.details?.[0]).toBe('Rolled 9, 6, 2 (physical dice).')
    const play = { ...emptyPlay(), minions: [{ id: 'm', name: 'Bolt', die: 'd6' as const, action: 'attack' as const, mods: [] }] }
    expect(recordMinionRoll(play, 'm', { action: 'attack', value: 4, mods: [], entered: true }, tick).history[0]!.details?.[0]).toBe('Rolled 4 (physical dice).')
    const aspects = [{ name: 'A', die: 'd6' as const }, { name: 'B', die: 'd8' as const }, { name: 'C', die: 'd10' as const }]
    const roll = rollAspects(aspects, () => 0.5, [9, 2, 7])!
    expect(roll).toMatchObject({ min: { value: 2, die: 'd6', aspect: 'Entered' }, mid: { value: 7, die: 'd8' }, max: { value: 9, die: 'd10' }, entered: true })
    expect(logEnvironmentRoll(createGame(), roll, tick).feed.at(-1)?.text).toBe('Rolled the environment dice: 9, 7, 2 (physical dice).')
  })

  it("in a group's roll, and only members who need one are asked for a save", () => {
    const game = addGroup(createGame(), { kind: 'minions', name: 'Burglars', die: 'd8', count: 2, hidden: false }, tick)
    const group = game.groups[0]!
    const ids = group.members.map((m) => m.id)
    const rows = rollMembers(group, ids, () => 0.5, { [ids[0]!]: 3, [ids[1]!]: 7 })
    expect(rows.map((r) => r.roll)).toMatchObject([{ value: 3, entered: true }, { value: 7, entered: true }])
    expect(applyGroupRoll(game, group.id, 'overcome', rows, () => 0.5, tick).feed.map((e) => e.text)).toContain('Rolled 7, 3 (physical dice).')
    expect(membersWhoSave(group, ids, 4)).toEqual(ids)
    expect(membersWhoSave(group, ids, 0)).toEqual([])
  })
})
