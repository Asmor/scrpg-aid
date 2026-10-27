import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlayerSession } from './controller'
import { PlayerPanel } from './PlayerPanel'

const leave = () => {}

describe('the Game section', () => {
  it('offers to join when not in a game, unless hosting one', () => {
    const { rerender } = render(<PlayerPanel heroId="h1" hosting={false} onLeave={leave} />)
    expect(screen.getByRole('link', { name: 'Join a game' })).toHaveAttribute('href', '#/join')
    rerender(<PlayerPanel heroId="h1" hosting onLeave={leave} />)
    expect(screen.getByText(/You’re hosting one as the GM/)).toBeInTheDocument()
  })

  it('points to the hero who is in the game', () => {
    const player = { heroId: 'h2', room: 'ABCD-EFGH' } as PlayerSession
    render(<PlayerPanel heroId="h1" player={player} hosting={false} onLeave={leave} />)
    expect(screen.getByText(/in game ABCD-EFGH/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'another hero' })).toHaveAttribute('href', '#/hero/h2/play')
  })

  it('says when it’s still connecting, or the GM is away', () => {
    const player = { heroId: 'h1', room: 'ABCD-EFGH', clientId: 'c1' } as PlayerSession
    const { rerender } = render(<PlayerPanel heroId="h1" player={player} snapshot={{ status: 'connecting' }} hosting={false} onLeave={leave} />)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to game ABCD-EFGH…')
    expect(screen.getByText(/check the room code and password/)).toBeInTheDocument()
    rerender(<PlayerPanel heroId="h1" player={player} snapshot={{ status: 'disconnected' }} hosting={false} onLeave={leave} />)
    expect(screen.getByRole('status')).toHaveTextContent('The GM is away. Reconnecting…')
  })

  it('says when the browser is offline, and stops once it’s back', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const player = { heroId: 'h1', room: 'ABCD-EFGH', clientId: 'c1' } as PlayerSession
      render(<PlayerPanel heroId="h1" player={player} snapshot={{ status: 'disconnected' }} hosting={false} onLeave={leave} />)
      expect(screen.getByText(/You’re offline/)).toBeInTheDocument()
      online.mockReturnValue(true)
      act(() => void window.dispatchEvent(new Event('online')))
      expect(screen.queryByText(/You’re offline/)).not.toBeInTheDocument()
    } finally {
      online.mockRestore()
    }
  })
})
