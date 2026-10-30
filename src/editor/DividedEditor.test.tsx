import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Split } from '../creation/divided'
import { deriveTraits } from '../creation/traits'
import { dividedSplitHero, P, Q } from '../test/heroes'
import { SplitFormEditor } from './DividedEditor'

/** The editor over the Divided test hero, keeping its split in state. */
function Harness({ start }: { start: Split }) {
  const hero = dividedSplitHero()
  const [split, setSplit] = useState(start)
  return <SplitFormEditor hero={hero} traits={deriveTraits(hero).traits} split={split} onChange={setSplit} />
}

const group = (name: string) => within(screen.getByRole('group', { name: `${name} form` }))

describe('the form split', () => {
  it('unsets a trait by pressing its chosen place again, with live tallies for both kinds', async () => {
    render(<Harness start={{ always: [P('speed'), P('strength'), Q('fitness'), Q('persuasion')], civilian: [Q('acrobatics')], heroic: [P('vitality'), P('agility')] }} />)
    const table = screen.getByRole('group', { name: 'Split Form' })
    expect(table).toHaveTextContent('Both forms, powers: 2 of 2')
    expect(table).toHaveTextContent('Both forms, qualities: 2 of 2')
    await userEvent.click(group('Persuasion').getByRole('button', { name: 'Both' }))
    expect(group('Persuasion').getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'false')
    expect(table).toHaveTextContent('Both forms, qualities: 1 of 2')
  })

  it('shows the roleplaying quality as always in both forms, and lets one put in the split come out', async () => {
    render(<Harness start={{ always: [Q('roleplaying-quality')], civilian: [], heroic: [] }} />)
    const row = screen.getByRole('rowheader', { name: /Night Shift Nurse/ }).closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: 'Remove from the split' }))
    expect(row).toHaveTextContent('Both, always')
  })

  it('lets a trait that no longer fits be removed from the split', async () => {
    render(<Harness start={{ always: [P('flight')], civilian: [], heroic: [] }} />)
    const row = screen.getByRole('rowheader', { name: /doesn't fit/ }).closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: 'Remove from the split' }))
    expect(screen.queryByRole('rowheader', { name: /doesn't fit/ })).not.toBeInTheDocument()
  })
})
