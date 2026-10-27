import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModForm } from './ModForm'

const bolt = { id: 'c2', name: 'Bolt' }
const cass = { id: 'c3', name: 'Cass' }

describe('the mod form', () => {
  it('adds to the hero by default, then clears', async () => {
    const onSubmit = vi.fn()
    render(<ModForm onSubmit={onSubmit} />)
    expect(screen.queryByLabelText('For')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('What it is'), 'tied up')
    await userEvent.click(screen.getByLabelText('Persistent'))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSubmit).toHaveBeenCalledWith({ label: 'tied up', value: -1, persistent: true }, undefined)
    expect(screen.getByLabelText('What it is')).toHaveValue('')
    expect(screen.getByLabelText('Persistent')).not.toBeChecked()
  })

  it('gives to another hero, and keeps the form filled in when it couldn’t go', async () => {
    const onSubmit = vi.fn(() => false)
    render(<ModForm targets={[bolt]} onSubmit={onSubmit} />)
    await userEvent.selectOptions(screen.getByLabelText('For'), 'Bolt')
    await userEvent.type(screen.getByLabelText('What it is'), 'rallied')
    await userEvent.click(screen.getByRole('button', { name: 'Give' }))
    expect(onSubmit).toHaveBeenCalledWith({ label: 'rallied', value: -1 }, 'c2')
    expect(screen.getByLabelText('What it is')).toHaveValue('rallied')
  })

  it('won’t swap a hero who has left for someone else', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(<ModForm targets={[bolt, cass]} onSubmit={onSubmit} />)
    await userEvent.selectOptions(screen.getByLabelText('For'), 'Bolt')
    rerender(<ModForm targets={[cass]} onSubmit={onSubmit} />)
    expect(screen.getByText('Bolt has left the game. Choose who it’s for.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('For'), 'Me')
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })

  it('can go back to the hero themself when the last other hero leaves', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(<ModForm targets={[bolt]} onSubmit={onSubmit} />)
    await userEvent.selectOptions(screen.getByLabelText('For'), 'Bolt')
    rerender(<ModForm targets={[]} onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('For'), 'Me')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSubmit).toHaveBeenCalledWith({ label: '', value: -1 }, undefined)
  })

  it('for the GM, needs a hero to give it to', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(<ModForm self={false} submitLabel="Give" onSubmit={onSubmit} />)
    expect(screen.getByLabelText('For')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Give' })).toBeDisabled()
    rerender(<ModForm self={false} submitLabel="Give" targets={[bolt]} onSubmit={onSubmit} />)
    expect(screen.getByLabelText('For')).toHaveDisplayValue('Bolt')
    await userEvent.click(screen.getByRole('button', { name: 'Give' }))
    expect(onSubmit).toHaveBeenCalledWith({ label: '', value: -1 }, 'c2')
  })
})
