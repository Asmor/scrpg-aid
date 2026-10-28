import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconSource } from './icon-source'
import { AbilityText, ActionIcon, DiceList, DiceText, DieIcon } from './icons'
import { readable } from '../test/readable'

describe('icons', () => {
  it('shows a die as its icon alone, named by its size', () => {
    const { container } = render(<DieIcon die="d8" />)
    expect(container).toHaveTextContent('')
    expect(screen.getByRole('img', { name: 'd8' })).toHaveAttribute('src', '/icons/die/d8.png')
  })

  it('sizes dice: normal by default, inline in sentences, compact on request', () => {
    const { container } = render(
      <>
        <DieIcon die="d8" />
        <DieIcon die="d8" size="compact" />
        <DiceList dice={['d6']} />
        <DiceText text="a d4" />
      </>,
    )
    expect([...container.querySelectorAll('img')].map((i) => i.className)).toEqual(['die-icon', 'die-icon die-icon--compact', 'die-icon die-icon--inline', 'die-icon die-icon--inline'])
  })

  it('lists dice with their icons', () => {
    const { container } = render(<DiceList dice={['d10', 'd10', 'd6']} />)
    expect(readable(container)).toBe('d10, d10 and d6')
    expect(container.querySelectorAll('img')).toHaveLength(3)
  })

  it('shows each die size in text as its icon', () => {
    const { container } = render(<DiceText text="Choose d8 (your Fitness is d10); not d7 or add6." />)
    expect(readable(container)).toBe('Choose d8 (your Fitness is d10); not d7 or add6.')
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('alt'))).toEqual(['d8', 'd10'])
    expect(container.textContent).not.toMatch(/\bd(8|10)\b/)
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

  it('shows die sizes in ability text as icons too', () => {
    const { container } = render(<AbilityText text="Gain a d8 minion. Then roll a d6 and Boost using your Min die." />)
    expect(readable(container)).toBe('Gain a d8 minion. Then roll a d6 and Boost using your Min die.')
    expect(screen.getByRole('img', { name: 'd8' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'd6' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bd(6|8)\b/)
  })

  it('takes its icons from the IconSource context', () => {
    const { container } = render(
      <IconSource.Provider value={(name) => `data:${name}`}>
        <DieIcon die="d4" />
      </IconSource.Provider>,
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'data:die/d4')
  })
})
