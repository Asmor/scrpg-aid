import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { exampleHero } from '../hero/example'
import { createHero } from '../hero/model'
import { dividedHero, formChangerHero, minionMakerHero, modularHero } from '../test/heroes'
import { HeroSheetView } from './HeroSheetView'
import { readable } from '../test/readable'

describe('HeroSheetView', () => {
  it('shows a complete hero’s sheet', () => {
    render(<HeroSheetView hero={exampleHero()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Maya Reyes' })).toBeInTheDocument()
    expect(screen.getByText('Afterimage')).toBeInTheDocument()
    const characteristics = screen.getByRole('region', { name: 'Characteristics' })
    expect(within(characteristics).getByText('Upper Class')).toBeInTheDocument()
    expect(within(characteristics).getByText('Speedster')).toBeInTheDocument()

    // Powers (biggest die first), qualities, and status dice in one six-column table.
    const table = within(screen.getByRole('region', { name: 'Powers, qualities, and status' }))
    expect(table.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Power', 'Quality', 'Status'])
    const powers = table.getAllByRole('row').slice(1)
    expect(powers.map((r) => [...r.querySelectorAll('td')].map(readable))).toEqual([
      ['Speed', 'd12', 'Fitness', 'd10', 'Green', 'd8'],
      ['Agility', 'd10', 'Alertness', 'd8', 'Yellow', 'd8'],
      ['Awareness', 'd8', 'Old Money', 'd8', 'Red', 'd8'],
      ['Fire', 'd8', '', '', '', ''],
      ['Flight', 'd6', '', '', '', ''],
    ])
    // Dice show as icons alone, named by their size.
    expect(within(powers[0]!).queryByText('d12')).not.toBeInTheDocument()
    expect(within(powers[0]!).getByRole('img', { name: 'd12' })).toHaveAttribute('src', '/icons/die/d12.png')

    // Health and its ranges.
    const health = screen.getByRole('region', { name: 'Health' })
    expect(within(health).getByText('30')).toBeInTheDocument()

    // Abilities sit in their zone bands; principle abilities end the Green band.
    const green = within(screen.getByRole('region', { name: 'Green abilities' })).getAllByRole('listitem')
    expect(green[0]).toHaveTextContent('Immunity')
    expect(green.at(-1)).toHaveTextContent(/Principle of/)
    expect(within(screen.getByRole('region', { name: 'Yellow abilities' })).getByText('Speedy Analysis')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Red abilities' })).getByText('Paragon Feat')).toBeInTheDocument()
    const out = screen.getByRole('region', { name: 'Out ability' })
    expect(within(out).getByText(/Fitness/)).toBeInTheDocument()
    // Its effect's icon sits inline before the effect word only.
    expect(out.querySelectorAll('img[src="/icons/action/boost.png"]')).toHaveLength(1)

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
    // The dice table still shows its three status rows, with no dice yet.
    const table = within(screen.getByRole('region', { name: 'Powers, qualities, and status' }))
    expect(table.getAllByRole('row').slice(1).map((r) => [...r.querySelectorAll('td')].map(readable).join(' ').trim())).toEqual(['Green —', 'Yellow —', 'Red —'])
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
