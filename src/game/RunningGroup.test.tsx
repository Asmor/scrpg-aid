import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Hero } from '../hero/model'
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
  const actions: GroupActions = { shrink: vi.fn(), remove: vi.fn(), addMod: vi.fn(), removeMod: vi.fn(), setActed: vi.fn(), applyRoll: vi.fn() }
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
    const dialog = within(screen.getByRole('dialog', { name: '3 Burglars roll Hinder' }))
    expect(dialog.getByRole('combobox', { name: 'Same target for all' })).toHaveFocus()
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
})
