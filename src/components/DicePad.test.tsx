import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DicePad, MemberPad } from './DicePad'

const three = [
  { die: 'd4' as const, label: 'Speed' },
  { die: 'd6' as const, label: 'Alertness' },
  { die: 'd8' as const, label: 'Yellow status' },
]

function pad(dice: Parameters<typeof DicePad>[0]['dice'] = three) {
  const props = { onAccept: vi.fn(), onCancel: vi.fn(), onRollForMe: vi.fn() }
  render(<DicePad dice={dice} {...props} />)
  return props
}
const key = (n: number) => within(screen.getByRole('group', { name: 'Number pad' })).getByRole('button', { name: String(n) })
const tap = async (...ns: number[]) => {
  for (const n of ns) await userEvent.click(key(n))
}
const accept = () => screen.getByRole('button', { name: 'Accept' })

describe('the dice pad', () => {
  it('disables numbers no die can show, saying why', () => {
    pad()
    expect(key(8)).toBeEnabled()
    expect(key(9)).toBeDisabled()
    expect(key(9)).toHaveAccessibleDescription('No d10 in this roll')
    expect(key(12)).toHaveAccessibleDescription('No d12 in this roll')
  })

  it('takes the numbers, drops the oldest past full, and accepts them', async () => {
    const { onAccept } = pad()
    expect(accept()).toBeDisabled()
    await tap(1, 2)
    expect(screen.getByRole('list', { name: 'Entered numbers, 2 of 3' })).toBeInTheDocument()
    expect(screen.getByText('2 of 3 entered')).toBeInTheDocument()
    await tap(3, 4)
    expect(screen.getByRole('button', { name: 'Remove 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove 1' })).not.toBeInTheDocument()
    await userEvent.click(accept())
    expect(onAccept).toHaveBeenCalledWith([2, 3, 4])
  })

  it("won't accept numbers that can't come from these dice, and says why", async () => {
    pad()
    await tap(8, 7, 2)
    expect(accept()).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Two numbers above 6, but only one die (d8) goes that high.')
    await userEvent.click(screen.getByRole('button', { name: 'Remove 7' }))
    expect(screen.getByRole('list', { name: 'Entered numbers, 2 of 3' })).toBeInTheDocument()
    await tap(3)
    expect(accept()).toBeEnabled()
  })

  it('clears, cancels, and rolls for me', async () => {
    const { onCancel, onRollForMe, onAccept } = pad()
    await tap(1, 2, 3)
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('list', { name: 'Entered numbers, 0 of 3' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Roll for me' }))
    expect(onRollForMe).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onAccept).not.toHaveBeenCalled()
  })

  it('works by keyboard', async () => {
    const { onAccept, onCancel } = pad([
      { die: 'd12', label: 'A' },
      { die: 'd12', label: 'B' },
      { die: 'd10', label: 'C' },
    ])
    await userEvent.keyboard('5')
    await userEvent.keyboard('0')
    await userEvent.keyboard('-')
    expect(screen.getByRole('button', { name: 'Remove 11' })).toBeInTheDocument()
    await userEvent.keyboard('{Backspace}')
    expect(screen.queryByRole('button', { name: 'Remove 11' })).not.toBeInTheDocument()
    await userEvent.keyboard('=')
    await userEvent.keyboard('{Enter}')
    expect(onAccept).toHaveBeenCalledWith([5, 10, 12])
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('ignores a number key for a number no die can show', async () => {
    pad()
    await userEvent.keyboard('9')
    expect(screen.getByRole('list', { name: 'Entered numbers, 0 of 3' })).toBeInTheDocument()
  })

  it('moves between keys with the arrows, one stop in the tab order', async () => {
    pad()
    const tabStops = within(screen.getByRole('group', { name: 'Number pad' }))
      .getAllByRole('button')
      .filter((b) => b.tabIndex === 0)
    expect(tabStops).toEqual([key(1)])
    key(1).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(key(2)).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(key(6)).toHaveFocus()
    // Past the last number any die can show, it stays.
    await userEvent.keyboard('{ArrowDown}')
    expect(key(6)).toHaveFocus()
  })

  it('takes one number for a one-die roll', async () => {
    const { onAccept } = pad([{ die: 'd6', label: 'Drone' }])
    await tap(2, 5)
    await userEvent.click(accept())
    expect(onAccept).toHaveBeenCalledWith([5])
  })
})

describe('focus', () => {
  it('stays on the dialog unless asked for, and goes to the first key when asked', () => {
    const props = { onAccept: () => {}, onCancel: () => {}, onRollForMe: () => {} }
    const { unmount } = render(<DicePad dice={three} {...props} />)
    expect(document.body).toHaveFocus()
    unmount()
    render(<DicePad dice={three} autoFocus {...props} />)
    expect(key(1)).toHaveFocus()
  })
})

describe('the pad for a group', () => {
  const members = [
    { id: 'a', name: 'Burglar 1', die: 'd6' as const },
    { id: 'b', name: 'Burglar 2', die: 'd8' as const },
  ]

  it('takes one number per member in turn, each to their own die, and Back returns', async () => {
    const onAccept = vi.fn()
    render(<MemberPad members={members} onAccept={onAccept} onCancel={() => {}} onRollForMe={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Burglar 1 1 of 2 · d6' })).toBeInTheDocument()
    expect(key(7)).toBeDisabled()
    await tap(4)
    expect(screen.getByRole('heading', { name: 'Burglar 2 2 of 2 · d8' })).toBeInTheDocument()
    expect(key(7)).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Burglar 1 1 of 2 · d6' })).toBeInTheDocument()
    await tap(3, 7)
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledWith({ a: 3, b: 7 })
  })

  it('keeps focus on a key that is on, and goes on to Accept', async () => {
    render(<MemberPad members={[members[1]!, members[0]!]} onAccept={() => {}} onCancel={() => {}} onRollForMe={() => {}} />)
    key(7).focus()
    await userEvent.keyboard(' ')
    expect(screen.getByRole('heading', { name: 'Burglar 1 2 of 2 · d6' })).toBeInTheDocument()
    expect(key(7)).toBeDisabled()
    expect(key(1)).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Accept' })).toHaveFocus()
  })
})
