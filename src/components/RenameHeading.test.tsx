import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RenameHeading } from './RenameHeading'

function Harness({ initial = 'Maya Reyes', onRename = () => {} }: { initial?: string; onRename?: (name: string) => void }) {
  const [name, setName] = useState(initial)
  return (
    <>
      <RenameHeading
        shown={name || 'Unnamed hero'}
        name={name}
        placeholder={!name}
        noun="hero"
        onRename={(n) => {
          onRename(n)
          setName(n)
        }}
      />
      <button type="button">Elsewhere</button>
    </>
  )
}

describe('RenameHeading', () => {
  it('swaps in a text field with the name selected, and Enter saves', async () => {
    const onRename = vi.fn()
    render(<Harness onRename={onRename} />)
    await userEvent.click(screen.getByRole('button', { name: 'Rename hero: Maya Reyes' }))
    const field = screen.getByRole('textbox', { name: 'Rename hero' }) as HTMLInputElement
    expect(field).toHaveFocus()
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Maya Reyes'.length])
    await userEvent.keyboard('Velocity{Enter}')
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Velocity')
    expect(screen.getByRole('button', { name: 'Rename hero: Velocity' })).toHaveFocus()
  })

  it('opens from the keyboard and cancels on Escape', async () => {
    const onRename = vi.fn()
    render(<Harness onRename={onRename} />)
    screen.getByRole('button', { name: /Rename hero/ }).focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('Nope{Escape}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Rename hero: Maya Reyes' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Rename hero' })).toHaveValue('Maya Reyes')
  })

  it('saves when focus leaves the field, and keeps the old name when emptied', async () => {
    const onRename = vi.fn()
    render(<Harness onRename={onRename} />)
    await userEvent.click(screen.getByRole('button', { name: /Rename hero/ }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Rename hero' }))
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Rename hero: Maya Reyes' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Rename hero/ }))
    await userEvent.keyboard('  Dawn  ')
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Dawn')
    // Leaving by clicking elsewhere leaves focus where the player clicked.
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus()
  })

  it('shows an unnamed hero in muted italics', () => {
    render(<Harness initial="" />)
    const button = screen.getByRole('button', { name: 'Rename hero: Unnamed hero' })
    expect(button.closest('h2')).toHaveClass('placeholder')
  })
})
