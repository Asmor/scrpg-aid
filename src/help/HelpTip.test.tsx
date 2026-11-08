import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PopoverGroup } from '../library/Popover'
import { HelpTip } from './HelpTip'
import { HELP_TIPS, tipContent, type HelpTipName } from './tips'

afterEach(() => vi.unstubAllGlobals())

describe('the help tips', () => {
  it('each name a help section with something to say', () => {
    for (const name of Object.keys(HELP_TIPS) as HelpTipName[]) {
      const { title, text } = tipContent(name)
      expect(title).not.toBe('')
      // Two to four sentences (spec section 3).
      const sentences = text.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length
      expect(sentences, name).toBeGreaterThanOrEqual(2)
      expect(sentences, name).toBeLessThanOrEqual(4)
    }
  })
})

describe('a "?" popover', () => {
  const page = () =>
    render(
      <PopoverGroup>
        <h2>
          Status die <HelpTip tip="statusDie" />
        </h2>
        <h2>
          Scene tracker <HelpTip tip="sceneTracker" />
        </h2>
        <button type="button">Elsewhere</button>
      </PopoverGroup>,
    )

  it('opens beside its heading with the section’s text and More in Help, and Escape gives focus back', async () => {
    page()
    const button = screen.getByRole('button', { name: 'About the status die' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const pop = screen.getByRole('dialog', { name: 'Status die' })
    expect(button).toHaveAttribute('aria-controls', pop.id)
    expect(pop).toHaveTextContent(tipContent('statusDie').text)
    const more = within(pop).getByRole('link', { name: 'More in Help (opens in a new tab)' })
    expect(more).toHaveAttribute('href', `${window.location.origin}${window.location.pathname}#/help/running-a-game/status-die`)
    expect(more).toHaveAttribute('target', '_blank')
    // Focus moves into it.
    expect(more).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('shows one at a time, and closes on a click outside', async () => {
    page()
    await userEvent.click(screen.getByRole('button', { name: 'About the status die' }))
    await userEvent.click(screen.getByRole('button', { name: 'About the scene tracker' }))
    expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label'))).toEqual(['Scene tracker'])
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a bottom sheet on phones', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    page()
    await userEvent.click(screen.getByRole('button', { name: 'About the status die' }))
    expect(screen.getByRole('dialog', { name: 'Status die' })).toHaveClass('popover--sheet')
  })
})
