import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HelpMenu } from './HelpMenu'
import { HelpProvider } from './HelpProvider'

const menu = (props: { newTab?: boolean; compact?: boolean } = {}) =>
  render(
    <HelpProvider>
      <HelpMenu {...props} />
      <input aria-label="Notes" />
    </HelpProvider>,
  )

describe('the Help menu', () => {
  it('has Help topics, Keyboard shortcuts (with its key) and About', async () => {
    menu()
    const help = screen.getByRole('button', { name: 'Help' })
    expect(help).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    const items = within(screen.getByRole('menu', { name: 'Help' })).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Help topics', 'Keyboard shortcuts?', 'About SCRPG Aid'])
    expect(items[0]).toHaveAttribute('href', '#/help')
    expect(items[0]).not.toHaveAttribute('target')
  })

  it('opens Help topics in a new tab on the game table', async () => {
    menu({ newTab: true, compact: true })
    await userEvent.click(screen.getByRole('button', { name: 'Help' }))
    const topics = within(screen.getByRole('menu', { name: 'Help' })).getByRole('menuitem', { name: 'Help topics (opens in a new tab)' })
    expect(topics).toHaveAttribute('href', `${window.location.origin}${window.location.pathname}#/help`)
    expect(topics).toHaveAttribute('target', '_blank')
    expect(topics).toHaveAttribute('rel', 'noopener')
  })

  it('opens About and Keyboard shortcuts as dialogs, with focus back on the button after', async () => {
    menu()
    const help = screen.getByRole('button', { name: 'Help' })
    await userEvent.click(help)
    await userEvent.click(screen.getByRole('menuitem', { name: 'About SCRPG Aid' }))
    expect(screen.getByRole('heading', { name: 'About SCRPG Aid' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(help).toHaveFocus()
    await userEvent.click(help)
    await userEvent.click(screen.getByRole('menuitem', { name: /^Keyboard shortcuts/ }))
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(help).toHaveFocus()
  })

  it("gives focus back even when clicking doesn't focus the button (Safari, Firefox on a Mac)", async () => {
    menu()
    const help = screen.getByRole('button', { name: 'Help' })
    // fireEvent, unlike userEvent, clicks without focusing.
    fireEvent.click(help)
    await userEvent.click(screen.getByRole('menuitem', { name: 'About SCRPG Aid' }))
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(help).toHaveFocus()
  })
})

describe('the ? key', () => {
  it('opens Keyboard shortcuts, but not while typing or inside a dialog', async () => {
    menu()
    await userEvent.click(screen.getByRole('textbox', { name: 'Notes' }))
    await userEvent.keyboard('?')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Help' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'About SCRPG Aid' }))
    await userEvent.keyboard('?')
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('?')
    const dialog = within(screen.getByRole('dialog', { name: 'Keyboard shortcuts' }))
    // Built from the shortcuts table: the dice pad's range reads as words.
    expect(dialog.getByText('1 to 9')).toBeInTheDocument()
    expect(dialog.getByText('Enter 10, 11, 12')).toBeInTheDocument()
  })
})
