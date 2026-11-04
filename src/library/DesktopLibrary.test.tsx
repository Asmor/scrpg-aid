import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InGamesLine } from './DesktopLibrary'

const game = (id: string, name: string) => ({ id, name, href: `#/game/${id}` })

describe('the In games line', () => {
  it('shows nothing when the item is in no game', () => {
    const { container } = render(<InGamesLine games={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists up to two games as links, then "+N more"', () => {
    const { container, rerender } = render(<InGamesLine games={[game('a', 'Thursday game'), game('b', 'One-shot')]} />)
    expect(container).toHaveTextContent(/^In Thursday game, One-shot$/)
    expect(screen.getByRole('link', { name: 'One-shot' })).toHaveAttribute('href', '#/game/b')

    rerender(<InGamesLine games={[game('a', 'Thursday game'), game('b', 'One-shot'), game('c', 'Con game'), game('d', 'Finale')]} />)
    expect(container).toHaveTextContent(/^In Thursday game, One-shot \+2 more$/)
    expect(screen.queryByRole('link', { name: 'Con game' })).not.toBeInTheDocument()
  })
})
