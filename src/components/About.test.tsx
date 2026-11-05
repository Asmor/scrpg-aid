import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AboutButton, AboutDialog, issuesUrl, repoUrl } from './About'

describe('the About dialog', () => {
  it('shows the version and build date, credits, disclaimer, links and the data note', () => {
    render(<AboutDialog onClose={() => {}} version="0.9.3" built="2026-11-04T12:00:00" />)
    const dialog = within(screen.getByRole('dialog', { name: 'About SCRPG Aid' }))
    expect(dialog.getByText('Version 0.9.3 · built Nov 4, 2026')).toBeInTheDocument()
    expect(dialog.getByText('A game aid for Sentinel Comics: The Roleplaying Game.')).toBeInTheDocument()
    expect(dialog.getByText('Created by Asmor (Ian Toltz) with assistance from Claude.')).toBeInTheDocument()
    expect(dialog.getByText('Not associated with or endorsed by Greater Than Games.')).toBeInTheDocument()
    expect(dialog.getByText('Mention your version (0.9.3) and what you were doing.')).toBeInTheDocument()
    expect(dialog.getByText(/saved in this browser only\. Use Settings › Data › Back up everything/)).toBeInTheDocument()

    const report = dialog.getByRole('link', { name: 'Report a bug or request a feature (opens in a new tab)' })
    const source = dialog.getByRole('link', { name: 'Source code on GitHub (opens in a new tab)' })
    expect(report).toHaveAttribute('href', issuesUrl)
    expect(source).toHaveAttribute('href', repoUrl)
    for (const link of [report, source]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener')
    }
    // Plain links: nothing from the library goes into a URL.
    expect(issuesUrl).toBe('https://github.com/Asmor/scrpg-aid/issues')
    expect(repoUrl).toBe('https://github.com/Asmor/scrpg-aid')
  })

  it('closes from its Close buttons', async () => {
    const onClose = vi.fn()
    render(<AboutDialog onClose={onClose} />)
    for (const button of screen.getAllByRole('button', { name: 'Close' })) await userEvent.click(button)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('opens from the About button with focus on its heading, and gives focus back on Escape', async () => {
    render(<AboutButton />)
    const about = screen.getByRole('button', { name: 'About' })
    await userEvent.click(about)
    expect(screen.getByRole('heading', { name: 'About SCRPG Aid' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(about).toHaveFocus()
  })

  it("gives focus back even when clicking doesn't focus the button (Safari, Firefox on a Mac)", async () => {
    render(<AboutButton />)
    const about = screen.getByRole('button', { name: 'About' })
    // fireEvent, unlike userEvent, clicks without focusing.
    fireEvent.click(about)
    expect(screen.getByRole('heading', { name: 'About SCRPG Aid' })).toHaveFocus()
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(about).toHaveFocus()
  })
})
