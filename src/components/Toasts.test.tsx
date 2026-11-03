import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_ACTION_MS, TOAST_MS } from './toast-timing'
import { Toasts, type ToastData } from './Toasts'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})
afterEach(() => {
  vi.useRealTimers()
})

/** Toasts whose dismissals are recorded (and applied, as a page would). */
function stack(initial: ToastData[]) {
  const gone: string[] = []
  let toasts = initial
  const view = render(<Toasts toasts={toasts} onDismiss={(id) => dismiss(id)} />)
  function dismiss(id: string) {
    gone.push(id)
    toasts = toasts.filter((t) => t.id !== id)
    view.rerender(<Toasts toasts={toasts} onDismiss={(i) => dismiss(i)} />)
  }
  return {
    gone,
    add(t: ToastData) {
      toasts = [...toasts, t]
      view.rerender(<Toasts toasts={toasts} onDismiss={(i) => dismiss(i)} />)
    },
  }
}

describe('toasts', () => {
  it('close themselves after 8 seconds, or 10 with an action, or sooner with Dismiss', () => {
    const undo = vi.fn()
    const { gone } = stack([
      { id: 'a', text: 'Updated.' },
      { id: 'b', text: 'Roll recorded.', action: { label: 'Undo', onClick: undo } },
      { id: 'c', text: 'Not applied: no.', warn: true },
    ])
    expect(screen.getByRole('status')).toHaveTextContent('Updated.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[2]!)
    expect(gone).toEqual(['c'])
    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(gone).toEqual(['c', 'a'])
    act(() => vi.advanceTimersByTime(TOAST_ACTION_MS - TOAST_MS))
    expect(gone).toEqual(['c', 'a', 'b'])
    expect(undo).not.toHaveBeenCalled()
  })

  it('runs an action, then closes', () => {
    const undo = vi.fn()
    const { gone } = stack([{ id: 'b', text: 'Roll recorded.', action: { label: 'Undo', onClick: undo } }])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledOnce()
    expect(gone).toEqual(['b'])
  })

  it('pauses while the pointer is over it or focus is inside it', () => {
    const { gone } = stack([{ id: 'a', text: 'Updated.' }])
    const toast = screen.getByText('Updated.').closest('.toast')!
    act(() => vi.advanceTimersByTime(TOAST_MS - 1000))
    fireEvent.pointerEnter(toast)
    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(gone).toEqual([])
    fireEvent.focus(screen.getByRole('button', { name: 'Dismiss' }))
    fireEvent.pointerLeave(toast)
    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(gone).toEqual([])
    fireEvent.blur(screen.getByRole('button', { name: 'Dismiss' }))
    act(() => vi.advanceTimersByTime(999))
    expect(gone).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(gone).toEqual(['a'])
  })

  it('shows three at most: the oldest closes when a fourth arrives', () => {
    const { gone, add } = stack([
      { id: '1', text: 'One' },
      { id: '2', text: 'Two' },
      { id: '3', text: 'Three' },
    ])
    add({ id: '4', text: 'Four' })
    expect(gone).toEqual(['1'])
    expect(screen.queryByText('One')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(3)
  })

  it('keeps an empty live region on the page, so new toasts are announced', () => {
    stack([])
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
