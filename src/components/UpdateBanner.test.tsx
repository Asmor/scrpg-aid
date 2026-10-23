import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UpdateBanner } from './UpdateBanner'

describe('UpdateBanner', () => {
  it('announces the update and wires up both buttons', async () => {
    const onReload = vi.fn()
    const onDismiss = vi.fn()
    render(<UpdateBanner onReload={onReload} onDismiss={onDismiss} />)

    expect(screen.getByRole('status')).toHaveTextContent('A new version is available.')
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
