import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { completeHero } from '../test/heroes'
import { formDice } from './forms'
import { RollDialog } from './RollDialog'
import { emptyPlay } from './state'

function open(attackTargets?: { id: string; name: string }[]) {
  const hero = completeHero()
  const onConfirm = vi.fn()
  render(
    <RollDialog
      subject={{ kind: 'basic', action: 'attack' }}
      dice={formDice(hero, buildSheet(hero), emptyPlay())}
      zone="green"
      mods={[]}
      onConfirm={onConfirm}
      onClose={() => {}}
      {...(attackTargets ? { attackTargets } : {})}
      random={() => 0.5}
    />,
  )
  return { onConfirm, dialog: within(screen.getByRole('dialog', { name: 'Basic action' })) }
}

async function toResolve(dialog: ReturnType<typeof open>['dialog']) {
  await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
}

describe('an Attack at a table', () => {
  it('picks a target for the Attack, sent with the roll', async () => {
    const { onConfirm, dialog } = open([
      { id: 'villain:v1', name: 'Gravelord' },
      { id: 'member:g:m', name: 'Drones 1' },
    ])
    await toResolve(dialog)
    const target = dialog.getByLabelText('Target')
    expect([...target.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['No target', 'Gravelord', 'Drones 1'])
    await userEvent.selectOptions(target, 'Drones 1')
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(onConfirm.mock.calls[0]![4]).toEqual([{ result: 0, to: 'member:g:m' }])
  })

  it('sends no target when none is picked', async () => {
    const { onConfirm, dialog } = open([{ id: 'villain:v1', name: 'Gravelord' }])
    await toResolve(dialog)
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(onConfirm.mock.calls[0]![4]).toEqual([])
  })

  it('has no Target away from a table', async () => {
    const { dialog } = open()
    await toResolve(dialog)
    expect(dialog.queryByLabelText('Target')).not.toBeInTheDocument()
  })
})
