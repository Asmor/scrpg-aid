import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconSource } from './icon-source'
import { AbilityText, ActionIcon, DiceList, DieLabel } from './icons'

describe('icons', () => {
  it('shows a die’s icon beside its size, read as just the size', () => {
    const { container } = render(<DieLabel die="d8" />)
    expect(container).toHaveTextContent('d8')
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/die/d8.png')
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('lists dice with their icons', () => {
    const { container } = render(<DiceList dice={['d10', 'd10', 'd6']} />)
    expect(container).toHaveTextContent('d10, d10 and d6')
    expect(container.querySelectorAll('img')).toHaveLength(3)
  })

  it('names an action icon that stands on its own', () => {
    render(<ActionIcon action="overcome" />)
    expect(screen.getByRole('img', { name: 'Overcome' })).toHaveAttribute('src', '/icons/action/overcome.png')
  })

  it('puts an icon before each effect word in ability text', () => {
    const { container } = render(<AbilityText text="Attack using Fire. Hinder that same target using your Min die. When hit with an Attack, nothing." />)
    expect(container).toHaveTextContent('Attack using Fire. Hinder that same target using your Min die. When hit with an Attack, nothing.')
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['/icons/action/attack.png', '/icons/action/hinder.png'])
  })

  it('takes its icons from the IconSource context', () => {
    const { container } = render(
      <IconSource.Provider value={(name) => `data:${name}`}>
        <DieLabel die="d4" />
      </IconSource.Provider>,
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'data:die/d4')
  })
})
