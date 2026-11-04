import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { targetOptions, type TargetTable } from '../game/target-options'
import { completeHero } from '../test/heroes'
import { formDice } from './forms'
import { RollDialog } from './RollDialog'
import { emptyPlay } from './state'

/** Maya (the roller), Jo with a Rat; Gravelord and two Drones. */
const TABLE: TargetTable = {
  heroes: [
    { id: 'h1', name: 'Maya', minions: [] },
    { id: 'h2', name: 'Jo', minions: [{ id: 'r', name: 'Rat' }] },
  ],
  villains: [{ id: 'v1', name: 'Gravelord' }],
  groups: [{ id: 'g', name: 'Drones', members: [{ id: 'm', n: 1 }] }],
}

function open(atTable: boolean, action: 'attack' | 'defend' | 'hinder' | 'boost' = 'attack') {
  const hero = completeHero()
  const onConfirm = vi.fn()
  render(
    <RollDialog
      subject={{ kind: 'basic', action }}
      dice={formDice(hero, buildSheet(hero), emptyPlay())}
      zone="green"
      mods={[]}
      onConfirm={onConfirm}
      onClose={() => {}}
      {...(atTable ? { targetsFor: (effect, opts) => targetOptions({ kind: 'hero', id: 'h1' }, effect, TABLE, opts), selfId: 'hero:h1' } : {})}
      random={() => 0.5}
    />,
  )
  return { onConfirm, dialog: within(screen.getByRole('dialog', { name: 'Basic action' })) }
}

async function toResolve(dialog: ReturnType<typeof open>['dialog']) {
  await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
}

const optionTexts = (select: HTMLElement) => [...select.querySelectorAll('option')].map((o) => (o.parentElement?.tagName === 'OPTGROUP' ? `${(o.parentElement as HTMLOptGroupElement).label}: ${o.textContent}` : o.textContent))

describe('targets at a table', () => {
  it('picks a target for the Attack from the opponents, sent with the roll', async () => {
    const { onConfirm, dialog } = open(true)
    await toResolve(dialog)
    const target = dialog.getByLabelText('Target')
    expect(optionTexts(target)).toEqual(['Gravelord', 'Drones 1', 'No target'])
    expect(target).toHaveValue('')
    await userEvent.selectOptions(target, 'Drones 1')
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(onConfirm.mock.calls[0]![4]).toEqual([{ result: 0, to: 'member:g:m' }])
  })

  it('adds the allies with "Show allies too", and keeps one chosen when it is unchecked', async () => {
    const { onConfirm, dialog } = open(true)
    await toResolve(dialog)
    const toggle = dialog.getByRole('checkbox', { name: 'Show allies too' })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    const target = dialog.getByLabelText('Target')
    expect(optionTexts(target)).toEqual(['Gravelord', 'Drones 1', 'Allies: Maya (you)', 'Allies: Jo', "Allies: Rat (Jo's minion)", 'No target'])
    await userEvent.selectOptions(target, "Rat (Jo's minion)")
    await userEvent.click(toggle)
    expect(optionTexts(target)).toEqual(['Gravelord', 'Drones 1', "Allies: Rat (Jo's minion)", 'No target'])
    expect(target).toHaveValue('heroMinion:h2:r')
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(onConfirm.mock.calls[0]![4]).toEqual([{ result: 0, to: 'heroMinion:h2:r' }])
  })

  it('sends no target when none is picked', async () => {
    const { onConfirm, dialog } = open(true)
    await toResolve(dialog)
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(onConfirm.mock.calls[0]![4]).toEqual([])
  })

  it('has no Target away from a table', async () => {
    const { dialog } = open(false)
    await toResolve(dialog)
    expect(dialog.queryByLabelText('Target')).not.toBeInTheDocument()
    expect(dialog.queryByRole('checkbox', { name: /Show/ })).not.toBeInTheDocument()
  })

  it('protects the roller with a Defend by default, someone they pick, or no one', async () => {
    const first = open(true, 'defend')
    await toResolve(first.dialog)
    const protect = first.dialog.getByLabelText('Protect')
    expect(optionTexts(protect)).toEqual(['Maya (you)', 'Jo', "Rat (Jo's minion)", 'No target'])
    expect(first.dialog.getByRole('checkbox', { name: 'Show opponents too' })).toBeInTheDocument()
    await userEvent.click(first.dialog.getByRole('button', { name: 'Done' }))
    expect(first.onConfirm.mock.calls[0]![4]).toEqual([{ result: 0, to: '' }])
  })

  it('sends no Defend for No target', async () => {
    const { onConfirm, dialog } = open(true, 'defend')
    await toResolve(dialog)
    await userEvent.selectOptions(dialog.getByLabelText('Protect'), 'No target')
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(onConfirm.mock.calls[0]![4]).toEqual([])
  })

  it("gives a Hinder's penalty to the first opponent by default, and anyone with the toggle", async () => {
    const { onConfirm, dialog } = open(true, 'hinder')
    await toResolve(dialog)
    const offer = within(dialog.getByRole('group', { name: /Add the −?-?\d penalty to the mods list\?/ }))
    const forWho = offer.getByLabelText('For')
    expect(optionTexts(forWho)).toEqual(['Gravelord', 'Drones 1'])
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Show allies too' }))
    await userEvent.selectOptions(forWho, 'Jo')
    await userEvent.click(offer.getByRole('button', { name: /Give .* penalty to Jo/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(onConfirm.mock.calls[0]![1]).toMatchObject([{ to: 'hero:h2' }])
  })

  it("adds a Boost's bonus to the roller by default", async () => {
    const { onConfirm, dialog } = open(true, 'boost')
    await toResolve(dialog)
    expect(dialog.getByLabelText('For')).toHaveValue('hero:h1')
    await userEvent.click(dialog.getByRole('button', { name: /^Add \+\d bonus$/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(onConfirm.mock.calls[0]![1]).toEqual([{ mod: expect.objectContaining({ value: expect.any(Number) }) }])
  })
})
