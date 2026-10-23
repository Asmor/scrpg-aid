import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('shows the three choices as a labelled radio group, with the current one checked', () => {
    render(<ThemeToggle value="system" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Color theme' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['system', 'light', 'dark'])
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
  })

  it('reports the chosen option', async () => {
    const onChange = vi.fn()
    render(<ThemeToggle value="system" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onChange).toHaveBeenCalledWith('dark')
  })
})
