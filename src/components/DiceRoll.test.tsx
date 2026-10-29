import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DiceRoll } from './DiceRoll'

describe('DiceRoll', () => {
  it('offers a roll in the app or the player’s own roll', async () => {
    const onRoll = vi.fn()
    const onManual = vi.fn()
    render(<DiceRoll dice={['d10', 'd10']} roll={undefined} canReroll onRoll={onRoll} onManual={onManual} />)
    await userEvent.click(screen.getByRole('button', { name: 'Roll d10 and d10' }))
    expect(onRoll).toHaveBeenCalledWith(false)
    await userEvent.click(screen.getByRole('button', { name: 'Enter my own roll' }))
    // Each field is checked against its die.
    await userEvent.type(screen.getByRole('spinbutton', { name: 'd10 #1' }), '11')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'd10 #2' }), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onManual).not.toHaveBeenCalled()
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'd10 #1' }))
    await userEvent.type(screen.getByRole('spinbutton', { name: 'd10 #1' }), '7')
    await userEvent.click(screen.getByRole('button', { name: 'Use these results' }))
    expect(onManual).toHaveBeenCalledWith([7, 3], false)
  })

  it('shows own-dice fields first for a player rolling their own dice', async () => {
    const onRoll = vi.fn()
    render(<DiceRoll dice={['d8']} roll={undefined} canReroll manualFirst onRoll={onRoll} onManual={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: 'd8 #1' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Roll in the app instead' }))
    expect(onRoll).toHaveBeenCalledWith(false)
  })

  it('shows each rolled number large with its die, and what re-roll is left', async () => {
    const onRoll = vi.fn()
    const { container, rerender } = render(<DiceRoll dice={['d10', 'd10']} roll={{ dice: ['d10', 'd10'], results: [7, 3] }} canReroll onRoll={onRoll} onManual={() => {}}>Pick one.</DiceRoll>)
    expect([...container.querySelectorAll('.rolled-die b')].map((b) => b.textContent)).toEqual(['7', '3'])
    expect(container.querySelectorAll('.rolled-die img')).toHaveLength(2)
    expect(screen.getByText(/You rolled/)).toHaveTextContent('You rolled 7 and 3 on')
    expect(screen.getByText(/You rolled/)).toHaveTextContent('Pick one.')
    await userEvent.click(screen.getByRole('button', { name: 'Re-roll (1 left)' }))
    expect(onRoll).toHaveBeenCalledWith(true)
    rerender(<DiceRoll dice={['d10', 'd10']} roll={{ dice: ['d10', 'd10'], results: [2, 9], rerolled: true }} canReroll={false} onRoll={onRoll} onManual={() => {}} />)
    expect(screen.getByRole('button', { name: 'Re-roll used' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Enter my own re-roll' })).not.toBeInTheDocument()
  })
})
