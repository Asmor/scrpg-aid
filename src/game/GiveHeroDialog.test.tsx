import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GiveHeroDialog } from './GiveHeroDialog'

describe('Give to…', () => {
  it('lists players without a hero and the GM, and gives to the one picked', async () => {
    const onGive = vi.fn()
    const onClose = vi.fn()
    render(<GiveHeroDialog hero="Maya Reyes" players={[{ clientId: 'c1', name: 'Alex' }]} toGm onGive={onGive} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Give Maya Reyes to…' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Alex' }))
    expect(onGive).toHaveBeenCalledWith('c1')
    expect(onClose).toHaveBeenCalled()
  })

  it('offers the GM, and says when there is no one to give to', async () => {
    const onGive = vi.fn()
    const { rerender } = render(<GiveHeroDialog hero="Maya Reyes" players={[]} toGm onGive={onGive} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'The GM' }))
    expect(onGive).toHaveBeenCalledWith(undefined)
    rerender(<GiveHeroDialog hero="Maya Reyes" players={[]} toGm={false} onGive={onGive} onClose={() => {}} />)
    expect(screen.getByText('No one to give Maya Reyes to: every connected player has a hero.')).toBeInTheDocument()
  })
})
