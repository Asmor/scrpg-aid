import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { expandRefs } from '../rules/catalog'
import type { PrincipleChoice, TraitAssignment } from '../hero/model'
import { deriveTraits } from '../creation/traits'
import { A, P, Q, validHero } from '../test/heroes'
import { describeOptions } from '../components/format'
import { DiceAssigner } from './DiceAssigner'
import { PrinciplePicker } from './PrinciplePicker'

function Assigner({ initial, earlierHero = false }: { initial: TraitAssignment[]; earlierHero?: boolean }) {
  const [assignments, setAssignments] = useState(initial)
  const hero = validHero()
  return (
    <>
      <DiceAssigner
        hero={hero}
        legend="Archetype powers"
        dice={['d12', 'd6']}
        assignments={assignments}
        options={expandRefs([{ power: 'speed' }, { powerCategory: 'mobility' }])}
        earlier={earlierHero ? deriveTraits(hero).traits.filter((t) => t.step !== 'archetype') : []}
        onChange={setAssignments}
      />
      <output>{JSON.stringify(assignments)}</output>
    </>
  )
}

describe('DiceAssigner', () => {
  it('assigns one trait per die, grouped by category', async () => {
    render(<Assigner initial={[]} />)
    expect(screen.getByRole('group', { name: 'Archetype powers' })).toBeInTheDocument()
    const d12 = screen.getByRole('combobox', { name: 'd12' })
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('label')).filter(Boolean)).toContain('Mobility powers')
    await userEvent.selectOptions(d12, 'Speed')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd6' }), 'Flight')
    expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual([A(P('speed'), 'd12'), A(P('flight'), 'd6')])
    await userEvent.selectOptions(d12, '')
    expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual([A(P('flight'), 'd6')])
  })

  it('keeps an off-list choice visible, and offers upgrading a trait from an earlier step', async () => {
    render(<Assigner initial={[A(Q('fitness'), 'd12'), A(P('agility'), 'd6')]} earlierHero />)
    expect(screen.getByRole('option', { name: 'Fitness (not on this list)' })).toBeInTheDocument()
    // Agility d10 came from the power source; this d6 could upgrade it (and the checks will say a d6 isn't bigger).
    const upgrade = screen.getByRole('checkbox', { name: 'Upgrade my Agility (d10)' })
    await userEvent.click(upgrade)
    expect(JSON.parse(screen.getByRole('status').textContent!)).toContainEqual({ trait: P('agility'), die: 'd6', upgrades: true })
  })
})

function Principle({ category = 'esoteric' as const, initial }: { category?: 'esoteric'; initial?: PrincipleChoice }) {
  const [choice, setChoice] = useState(initial)
  return (
    <>
      <PrinciplePicker category={category} choice={choice} onChange={setChoice} />
      <output>{JSON.stringify(choice ?? null)}</output>
    </>
  )
}

describe('PrinciplePicker', () => {
  it('chooses a principle from the category and fills in its blank', async () => {
    render(<Principle />)
    const select = screen.getByRole('combobox', { name: 'Principle of Esoteric' })
    const custom = screen.getAllByRole('option').find((o) => o.textContent?.includes('['))!
    await userEvent.selectOptions(select, custom)
    await userEvent.type(screen.getByRole('textbox'), 'Fire')
    expect(JSON.parse(screen.getByRole('status').textContent!)).toMatchObject({ customization: 'Fire' })
    expect(screen.getByText(/Core Rules, p\./)).toBeInTheDocument()
    await userEvent.selectOptions(select, '')
    expect(screen.getByRole('status')).toHaveTextContent('null')
  })

  it('shows a principle from another category as not fitting', () => {
    render(<Principle initial={{ id: 'business' }} />)
    expect(screen.getByRole('option', { name: 'Principle of Business (not Esoteric)' })).toBeInTheDocument()
  })
})

describe('describeOptions', () => {
  it('names traits and categories', () => {
    expect(describeOptions([{ quality: 'fitness' }])).toBe('Fitness')
    expect(describeOptions([{ quality: 'fitness' }, { quality: 'persuasion' }, { qualityCategory: 'mental' }])).toBe('Fitness, Persuasion, or any Mental quality')
  })
})
