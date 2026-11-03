import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChooseDefense } from './ChooseDefense'

describe('choosing a defense', () => {
  it('starts on the default, says what each blocks, and sends the choice', async () => {
    const onChoose = vi.fn()
    render(
      <ChooseDefense
        hit={{ id: 'h', by: 'Gravelord', amount: 5 }}
        heroName="Maya Reyes"
        defenses={[
          { id: 'two', value: 2, from: 'Jo' },
          { id: 'six', value: 6, from: 'Jo' },
        ]}
        onChoose={onChoose}
      />,
    )
    const group = screen.getByRole('group', { name: 'Gravelord hits Maya Reyes for 5. Choose a defense:' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Defend 2 from Jo: blocks 2, 3 taken' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Defend 6 from Jo: blocks 5, 0 taken' }))
    await userEvent.click(screen.getByRole('button', { name: 'Use this defense' }))
    expect(onChoose).toHaveBeenCalledWith('six')
  })
})
