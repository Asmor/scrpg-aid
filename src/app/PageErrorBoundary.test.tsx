import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PageErrorBoundary } from './PageErrorBoundary'

function Broken(): never {
  throw new Error('Failed to fetch dynamically imported module')
}

describe('a page that fails to load', () => {
  it('shows Reload instead of a blank screen, and tries again on another page', async () => {
    const reload = vi.fn()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <PageErrorBoundary resetKey="#/settings" reload={reload}>
        <Broken />
      </PageErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("This page couldn't load.")
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
    // The same page still fails; another one loads.
    rerender(
      <PageErrorBoundary resetKey="#/settings" reload={reload}>
        <p>Settings</p>
      </PageErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(
      <PageErrorBoundary resetKey="#/help" reload={reload}>
        <p>Help</p>
      </PageErrorBoundary>,
    )
    expect(await screen.findByText('Help')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    quiet.mockRestore()
  })
})
