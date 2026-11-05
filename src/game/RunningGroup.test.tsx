import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Hero } from '../hero/model'
import { SettingsContext } from '../settings/context'
import { DEFAULT_SETTINGS } from '../settings/model'
import type { Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { createGame, heroCopy, type Game } from './model'
import { RunningGroup, type GroupActions } from './RunningGroup'
import { addGroup, addMemberMod, setMemberActed, syncTurnOrder } from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

function setup(change: (g: Game, c: Clock) => Game = (g) => g) {
  const c = clock()
  const hero = (id: string, name: string): Hero => ({ ...completeHero(), id, details: { ...completeHero().details, name } })
  let game = syncTurnOrder({ ...createGame({ id: 'g' }), heroes: [heroCopy(hero('a', 'Maya Reyes'), 'h1'), heroCopy(hero('b', 'Paradigm'), 'h2')] })
  game = addGroup(game, { kind: 'minions', name: 'Burglars', die: 'd8', count: 3, hidden: false }, c)
  game = { ...game, groups: [{ ...game.groups[0]!, actions: ['attack', 'hinder'] }] }
  game = change(game, c)
  const actions: GroupActions = { shrink: vi.fn(), remove: vi.fn(), addMod: vi.fn(), removeMod: vi.fn(), setActed: vi.fn(), applyRoll: vi.fn(), applySaves: vi.fn() }
  // 0.5 rolls the middle of each die: 5 on a d8.
  render(<RunningGroup game={game} group={game.groups[0]!} actions={actions} random={() => 0.5} />)
  return { game, actions, ids: game.groups[0]!.members.map((m) => m.id) }
}

describe('running a group', () => {
  it('shows what it can do and who has acted', () => {
    setup((g, c) => setMemberActed(g, g.groups[0]!.id, g.groups[0]!.members[0]!.id, true, c))
    expect(screen.getByText('Minions · Attack or Hinder')).toBeInTheDocument()
    expect(screen.getByText('1 of 3 acted')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Action' }).querySelectorAll('option')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Roll all ready (2)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Roll Burglars 1' })).toBeDisabled()
    const members = within(screen.getByRole('list', { name: 'Members of Burglars' }))
    // Each row is named for its member, not "Minion 1".
    expect(members.getByText('Burglars 1', { selector: 'strong' })).toBeInTheDocument()
    expect(members.getAllByText('Acted')).toHaveLength(1)
    expect(members.getAllByText('Ready')).toHaveLength(2)
  })

  it('says so once everyone has acted', () => {
    setup((g, c) => g.groups[0]!.members.reduce((x, m) => setMemberActed(x, g.groups[0]!.id, m.id, true, c), g))
    expect(screen.getByText('Everyone has acted. Hand off when ready.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All have acted' })).toBeDisabled()
  })

  it('rolls every ready member, then takes targets: one for all, or each its own', async () => {
    const { actions, ids } = setup((g, c) => addMemberMod(g, g.groups[0]!.id, g.groups[0]!.members[2]!.id, { label: 'Dazed', value: -1 }, c))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'Hinder')
    await userEvent.click(screen.getByRole('button', { name: 'Roll all ready (3)' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Burglars ×3 roll Hinder' }))
    expect(dialog.getByRole('combobox', { name: 'Same target for all' })).toHaveFocus()
    expect(dialog.getByRole('combobox', { name: 'Same target for all' })).toHaveAttribute('aria-label', 'Same target for all')
    expect(dialog.getByRole('row', { name: /Burglars 3/ })).toHaveTextContent('4 5 − 1 Dazed')
    expect(dialog.getByRole('columnheader', { name: 'Target' })).toBeInTheDocument()
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Same target for all' }), 'Maya Reyes')
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Target for Burglars 2' }), 'Paradigm')
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Target for Burglars 3' }), 'No target')
    await userEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    expect(actions.applyRoll).toHaveBeenCalledOnce()
    const [action, rows] = vi.mocked(actions.applyRoll).mock.calls[0]!
    expect(action).toBe('hinder')
    expect(rows.map((r) => [r.memberId, r.roll.total, r.target])).toEqual([
      [ids[0], 5, { kind: 'hero', id: 'h1' }],
      [ids[1], 5, { kind: 'hero', id: 'h2' }],
      [ids[2], 4, undefined],
    ])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it("lists everyone for the environment's group, with no toggle: it has no side", async () => {
    setup((g) => ({ ...g, environment: { id: 'e', name: 'Rooftop Heist', hidden: false }, groups: [{ ...g.groups[0]!, owner: { kind: 'environment' } }] }))
    await userEvent.click(screen.getByRole('button', { name: 'Roll Burglars 2' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Burglars 2 rolls Attack' }))
    const row = dialog.getByRole('combobox', { name: 'Target for Burglars 2' })
    expect([...row.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.textContent)])).toEqual([
      ['Heroes', ['Maya Reyes', 'Paradigm']],
      ['Rooftop Heist', ['Burglars 1 (same group)', 'Burglars 2 (you)', 'Burglars 3 (same group)']],
    ])
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('lists opponents first, and its allies (itself and its group too) with "Show allies too"', async () => {
    const { actions, ids } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Roll Burglars 2' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Burglars 2 rolls Attack' }))
    const row = dialog.getByRole('combobox', { name: 'Target for Burglars 2' })
    const texts = (select: HTMLElement) => [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(texts(row)).toEqual(['Choose…', 'Maya Reyes', 'Paradigm', 'No target'])
    const toggle = dialog.getByRole('checkbox', { name: 'Show allies too' })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(texts(row)).toEqual(['Choose…', 'Maya Reyes', 'Paradigm', 'Burglars 1 (same group)', 'Burglars 2 (you)', 'Burglars 3 (same group)', 'No target'])
    expect(row.querySelector('optgroup')).toHaveAttribute('label', 'Allies')
    expect(texts(dialog.getByRole('combobox', { name: 'Same target for all' }))).toContain('Burglars 2 (same group)')
    await userEvent.selectOptions(row, 'Burglars 1 (same group)')
    // Unchecked again: the chosen ally stays chosen and listed.
    await userEvent.click(toggle)
    expect(texts(row)).toEqual(['Choose…', 'Maya Reyes', 'Paradigm', 'Burglars 1 (same group)', 'No target'])
    await userEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    expect(vi.mocked(actions.applyRoll).mock.calls[0]![1].map((r) => r.target)).toEqual([{ kind: 'member', groupId: expect.any(String), memberId: ids[0] }])
  })

  it('cancels a roll without marking anyone', async () => {
    const { actions } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Roll Burglars 2' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Burglars 2 rolls Attack' })).getByRole('button', { name: 'Cancel' }))
    expect(actions.applyRoll).not.toHaveBeenCalled()
  })

  it("has + Mod, Shrink, Remove and Mark as acted in a member's ⋯", async () => {
    const { actions, ids } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Burglars 1' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['+ Mod', 'Shrink', 'Remove', 'Mark as acted'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark as acted' }))
    expect(actions.setActed).toHaveBeenCalledWith(ids[0], true)
  })
  it('rolls saves against damage for the checked members, shows the verdicts, and applies them', async () => {
    const { actions, ids } = setup((g, c) => addMemberMod(g, g.groups[0]!.id, g.groups[0]!.members[1]!.id, { label: 'Dazed', value: -1 }, c))
    await userEvent.click(screen.getByRole('button', { name: 'Damage…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Damage to Burglars' }))
    expect(dialog.getAllByRole('checkbox').map((b) => (b as HTMLInputElement).checked)).toEqual([true, true, true])
    expect(dialog.getByRole('button', { name: 'Roll saves' })).toBeDisabled()
    await userEvent.type(dialog.getByLabelText('Damage to each'), '5')
    await userEvent.click(dialog.getByRole('checkbox', { name: /Burglars 3/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll saves' }))
    // Each rolls a 5 on its d8: Burglars 1 saves (5 against 5), Burglars 2 fails (4 with Dazed).
    expect(dialog.getByRole('row', { name: /Burglars 1/ })).toHaveTextContent('5 against 5Saved · Drops to d6')
    expect(dialog.getByRole('row', { name: /Burglars 2/ })).toHaveTextContent("4 5 − 1 Dazed against 5Failed · KO'd")
    expect(dialog.queryByRole('row', { name: /Burglars 3/ })).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    const [saves] = vi.mocked(actions.applySaves).mock.calls[0]!
    expect(saves.map((s) => [s.memberId, s.result.outcome])).toEqual([
      [ids[0], 'shrink'],
      [ids[1], 'ko'],
    ])
  })

  it('lists a lieutenant’s abilities, and adds a save bonus like Sturdy’s to its saves', async () => {
    const c = clock()
    let game = createGame({ id: 'g' })
    const abilities = [
      { name: 'Distance Attack', type: 'I' as const, text: 'To attack this vehicle, the hero must make an Overcome action.' },
      { name: 'Sturdy', type: 'I' as const, text: 'When rolling a damage save, add 2 to the result.', saveBonus: 2 },
    ]
    game = addGroup(game, { kind: 'lieutenants', name: 'Siege Crawler', die: 'd10', count: 1, hidden: false, abilities }, c)
    const actions: GroupActions = { shrink: vi.fn(), remove: vi.fn(), addMod: vi.fn(), removeMod: vi.fn(), setActed: vi.fn(), applyRoll: vi.fn(), applySaves: vi.fn() }
    render(<RunningGroup game={game} group={game.groups[0]!} actions={actions} random={() => 0.5} />)
    const list = within(screen.getByRole('list', { name: "Siege Crawler's abilities" }))
    expect(list.getAllByRole('listitem').map((li) => li.querySelector('strong')?.textContent)).toEqual(['Distance Attack', 'Sturdy'])
    expect(list.getByText('When rolling a damage save, add 2 to the result.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Damage…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Damage to Siege Crawler 1' }))
    await userEvent.type(dialog.getByLabelText('Damage'), '7')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll saves' }))
    // A 6 on its d10, plus 2 for Sturdy: 8 against 7.
    expect(dialog.getByRole('row', { name: /Siege Crawler/ })).toHaveTextContent('8 6 + 2 Sturdy against 7Saved')
  })

  it("damages one member from its row, and Cancel discards the rolls", async () => {
    const { actions } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Damage Burglars 2' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Damage to Burglars 2' }))
    // One member: just "Damage".
    expect(dialog.queryByLabelText('Damage to each')).not.toBeInTheDocument()
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument()
    await userEvent.type(dialog.getByLabelText('Damage'), '3')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll saves' }))
    expect(dialog.getAllByRole('row')).toHaveLength(2)
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(actions.applySaves).not.toHaveBeenCalled()
  })

  it("picks which defense a member uses against the damage, starting on the default", async () => {
    const { actions } = setup((g) => {
      const id = g.groups[0]!.members[0]!.id
      return { ...g, groups: [{ ...g.groups[0]!, members: g.groups[0]!.members.map((m) => (m.id === id ? { ...m, defenses: [{ id: 'small', value: 2, from: 'x' }, { id: 'big', value: 6, from: 'x' }] } : m)) }] }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Damage Burglars 1' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Damage to Burglars 1' }))
    await userEvent.type(dialog.getByLabelText('Damage'), '5')
    const pick = dialog.getByLabelText('Defense for Burglars 1')
    expect(pick).toHaveDisplayValue('Defend 2 from x')
    await userEvent.selectOptions(pick, 'Defend 6 from x')
    await userEvent.click(dialog.getByRole('button', { name: 'Roll saves' }))
    expect(dialog.getByRole('row', { name: /Burglars 1/ })).toHaveTextContent('Blocked · No damage, so no save')
    await userEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    expect(vi.mocked(actions.applySaves).mock.calls[0]![0][0]).toMatchObject({ incoming: 5, damage: 0, defense: { id: 'big' }, noDamage: true })
  })
})

describe('with physical dice', () => {
  const physical = { settings: { ...DEFAULT_SETTINGS, rolling: 'physical' as const }, update: () => {} }
  const pad = () => within(screen.getByRole('group', { name: 'Number pad' }))
  function setupPhysical(actions: Partial<GroupActions> = {}) {
    const c = clock()
    const game = addGroup(createGame({ id: 'g' }), { kind: 'minions', name: 'Burglars', die: 'd8', count: 2, hidden: false }, c)
    const all = { shrink: vi.fn(), remove: vi.fn(), addMod: vi.fn(), removeMod: vi.fn(), setActed: vi.fn(), applyRoll: vi.fn(), applySaves: vi.fn(), ...actions } as unknown as GroupActions
    render(
      <SettingsContext.Provider value={physical}>
        <RunningGroup game={game} group={game.groups[0]!} actions={all} random={() => 0.5} />
      </SettingsContext.Provider>,
    )
    return all
  }

  it('asks each member for a number in turn, then goes on as if rolled', async () => {
    setupPhysical()
    await userEvent.click(screen.getByRole('button', { name: 'Roll all ready (2)' }))
    expect(screen.getByRole('heading', { name: 'Burglars 1 1 of 2 · d8' })).toBeInTheDocument()
    expect(pad().getByRole('button', { name: '9' })).toBeDisabled()
    await userEvent.click(pad().getByRole('button', { name: '3' }))
    await userEvent.click(pad().getByRole('button', { name: '7' }))
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    const dialog = within(await screen.findByRole('dialog', { name: /roll Attack/ }))
    expect(dialog.getByRole('row', { name: /Burglars 1/ })).toHaveTextContent('3')
    expect(dialog.getByRole('row', { name: /Burglars 2/ })).toHaveTextContent('7')
  })

  it('Roll for me rolls instead, and Cancel changes nothing', async () => {
    setupPhysical()
    await userEvent.click(screen.getByRole('button', { name: 'Roll Burglars 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Number pad' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Roll Burglars 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Roll for me' }))
    expect(await screen.findByRole('dialog', { name: /rolls Attack/ })).toHaveTextContent('5')
  })

  it('asks for the saves of a Damage', async () => {
    setupPhysical()
    await userEvent.click(screen.getByRole('button', { name: 'Damage Burglars 1' }))
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Damage' }), '4')
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: 'Burglars 1 1 of 1 · d8' })).toBeInTheDocument()
    await userEvent.click(pad().getByRole('button', { name: '8' }))
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(screen.getByText(/Burglars 1:/)).toBeInTheDocument()
  })
})
