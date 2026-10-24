import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { exampleHero } from '../hero/example'
import { createHero } from '../hero/model'
import { dividedHero, formChangerHero, minionMakerHero, modularHero } from '../test/heroes'
import { HeroSheetView } from './HeroSheetView'

describe('HeroSheetView', () => {
  it('shows a complete hero’s sheet', () => {
    render(<HeroSheetView hero={exampleHero()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Maya Reyes' })).toBeInTheDocument()
    expect(screen.getByText('Afterimage')).toBeInTheDocument()
    const characteristics = screen.getByRole('region', { name: 'Characteristics' })
    expect(within(characteristics).getByText('Upper Class')).toBeInTheDocument()
    expect(within(characteristics).getByText('Speedster')).toBeInTheDocument()

    // Powers, biggest die first.
    const powers = within(screen.getByRole('region', { name: 'Powers' })).getAllByRole('row').slice(1)
    expect(powers.map((r) => r.textContent)).toEqual(['Speedd12', 'Agilityd10', 'Awarenessd8', 'Fired8', 'Flightd6'])

    // Health and its ranges.
    const health = screen.getByRole('region', { name: 'Health' })
    expect(within(health).getByText('30')).toBeInTheDocument()

    // Abilities sit in their zone bands; principle abilities end the Green band.
    const green = within(screen.getByRole('region', { name: 'Green abilities' })).getAllByRole('listitem')
    expect(green[0]).toHaveTextContent('Immunity')
    expect(green.at(-1)).toHaveTextContent(/Principle of/)
    expect(within(screen.getByRole('region', { name: 'Yellow abilities' })).getByText('Speedy Analysis')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Red abilities' })).getByText('Paragon Feat')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Out ability' })).getByText(/Fitness/)).toBeInTheDocument()

    // Filled-in blanks, and action types spelled out for screen readers.
    expect(green[0]).not.toHaveTextContent('[')
    expect(screen.getAllByText('Action').length).toBeGreaterThan(0)

    // No rule problems, and no auxiliary sheet for a plain archetype.
    expect(screen.queryByText(/rule issue/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Auxiliary sheet' })).not.toBeInTheDocument()
  })

  it('shows what’s missing on a new hero, with rule issues grouped by step', async () => {
    const hero = createHero('guided')
    hero.archetype = { id: 'speedster', traits: [], abilities: [], bonus: [] }
    render(<HeroSheetView hero={hero} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Unnamed hero' })).toBeInTheDocument()
    expect(screen.getByText('No powers yet.')).toBeInTheDocument()
    expect(screen.getByText('Choose a personality.', { selector: '.sheet-empty' })).toBeInTheDocument()
    expect(screen.getByText('Not worked out yet.')).toBeInTheDocument()
    const summary = screen.getByText(/rule issues? to look at/)
    await userEvent.click(summary)
    expect(screen.getByRole('region', { name: 'Archetype' })).toBeInTheDocument()
  })

  it('shows Form-Changer forms, Minion-Maker minion forms, Divided, and Modular modes', () => {
    const aux = () => screen.getByRole('region', { name: 'Auxiliary sheet' })
    const view = render(<HeroSheetView hero={formChangerHero()} />)
    expect(within(aux()).getByText('Brute')).toBeInTheDocument()
    expect(within(aux()).getByText('Strong Form')).toBeInTheDocument()

    view.rerender(<HeroSheetView hero={minionMakerHero()} />)
    expect(within(aux()).getByText(/Autonomous/)).toBeInTheDocument()

    view.rerender(<HeroSheetView hero={dividedHero()} />)
    expect(within(aux()).getByText('Divided')).toBeInTheDocument()

    view.rerender(<HeroSheetView hero={modularHero()} />)
    expect(within(aux()).getByText('Patch Job')).toBeInTheDocument()
    expect(within(aux()).getByText("Can't Defend or Overcome.")).toBeInTheDocument()
    expect(within(aux()).getByText('Powerless mode')).toBeInTheDocument()
  })
})
