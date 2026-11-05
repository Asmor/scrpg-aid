import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ColorPicker, SingleColorPicker } from './ColorPicker'
import type { Appearance } from './palette'

function Hero({ start, onChange }: { start?: Appearance; onChange?: (a: Appearance) => void }) {
  const [a, setA] = useState(start)
  return (
    <ColorPicker
      kind="hero"
      appearance={a}
      name="Afterimage"
      onChange={(next) => {
        setA(next)
        onChange?.(next)
      }}
    />
  )
}

const row = (legend: RegExp | string) => within(screen.getByRole('group', { name: legend }))

describe('the color picker', () => {
  it('offers 13 colors and None, starting on the default', () => {
    render(<Hero />)
    expect(row('Primary').getAllByRole('radio')).toHaveLength(13)
    expect(row('Primary').getByRole('radio', { name: 'Blue' })).toBeChecked()
    expect(row(/Secondary/).getAllByRole('radio')).toHaveLength(14)
    expect(row(/Secondary/).getByRole('radio', { name: 'None' })).toBeChecked()
    expect(screen.queryByRole('group', { name: 'Gradient' })).not.toBeInTheDocument()
  })

  it('shows gradients only with a secondary, with Invert, and tidies what it saves', async () => {
    const onChange = vi.fn()
    render(<Hero onChange={onChange} />)
    await userEvent.click(row(/Secondary/).getByRole('radio', { name: 'Cyan' }))
    expect(onChange).toHaveBeenLastCalledWith({ primary: 'blue', secondary: 'cyan' })
    await userEvent.click(row('Gradient').getByRole('radio', { name: 'Diagonal right' }))
    await userEvent.click(row('Gradient').getByRole('checkbox', { name: 'Invert' }))
    expect(onChange).toHaveBeenLastCalledWith({ primary: 'blue', secondary: 'cyan', gradient: 'diagonalRight', invert: true })
    await userEvent.click(row(/Secondary/).getByRole('radio', { name: 'None' }))
    expect(onChange).toHaveBeenLastCalledWith({ primary: 'blue' })
    expect(screen.queryByRole('group', { name: 'Gradient' })).not.toBeInTheDocument()
  })

  it('lets the secondary match the primary', async () => {
    const onChange = vi.fn()
    render(<Hero onChange={onChange} />)
    await userEvent.click(row(/Secondary/).getByRole('radio', { name: 'Blue' }))
    expect(onChange).toHaveBeenLastCalledWith({ primary: 'blue', secondary: 'blue' })
  })

  it('previews the chip and band in both themes', () => {
    render(<Hero start={{ primary: 'red' }} />)
    const preview = row('Preview')
    expect(preview.getByText('Light')).toBeInTheDocument()
    expect(preview.getByText('Dark')).toBeInTheDocument()
    expect(preview.getAllByText('Afterimage')).toHaveLength(4)
  })

  it('never names a color in the chip', () => {
    render(<Hero start={{ primary: 'red' }} />)
    expect(row('Preview').queryByText(/Red/)).not.toBeInTheDocument()
  })
})

describe('the one-color picker', () => {
  it('has By side first, then the 13', async () => {
    const onChange = vi.fn()
    render(<SingleColorPicker item={{ kind: 'group' }} name="Burglars" onChange={onChange} />)
    expect(row('Color').getAllByRole('radio')).toHaveLength(14)
    expect(row('Color').getByRole('radio', { name: 'By side' })).toBeChecked()
    await userEvent.click(row('Color').getByRole('radio', { name: 'Pink' }))
    expect(onChange).toHaveBeenCalledWith('pink')
  })
})
