import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { exampleHero } from '../hero/example'
import { createHero } from '../hero/model'
import { modularHero } from '../test/heroes'
import { HeroSheetView } from './HeroSheetView'
import { readable } from '../test/readable'

describe('HeroSheetView', () => {
  it('shows Roleplaying, then Mechanics, then the ability bands', () => {
    render(<HeroSheetView hero={exampleHero()} advancement={{ href: '#adv' }} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Roleplaying', 'Mechanics', 'Abilities'])

    // Who they are: the characteristics, then only the details that are filled in.
    const who = screen.getByRole('region', { name: 'Who they are' })
    expect(within(who).getByText('Upper Class')).toBeInTheDocument()
    expect(within(who).getByText('Speedster')).toBeInTheDocument()
    expect(within(who).getByText('Age')).toBeInTheDocument()
    expect(within(who).queryByText('Eyes')).not.toBeInTheDocument()
    expect(within(who).queryByText('Maya Reyes')).not.toBeInTheDocument()

    // A card per principle, with its roleplaying text and twists.
    const business = screen.getByRole('region', { name: 'Principle of Business' })
    expect(within(business).getByText('During roleplaying')).toBeInTheDocument()
    expect(within(business).getByText('Minor twist')).toBeInTheDocument()
    expect(within(business).getByText('Major twist')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Principle of the Gearhead' })).toBeInTheDocument()

    // The record strip.
    const strip = screen.getByText(/Back issues/).closest('p')!
    // Play state isn't on the sheet: hero points are kept in Play.
    expect(strip).toHaveTextContent('Hero points tracked in Play')
    expect(strip).toHaveTextContent('Back issues 0 of 6')
    expect(strip).toHaveTextContent('Collections 0')
    expect(within(strip).getByRole('link', { name: 'Advancement' })).toHaveAttribute('href', '#adv')

    // Powers and qualities, each with its die as an icon alone.
    const powers = within(screen.getByRole('region', { name: 'Powers' })).getAllByRole('listitem')
    expect(powers.map(readable)).toEqual(['Speedd12', 'Agilityd10', 'Awarenessd8', 'Fired8', 'Flightd6'])
    expect(within(powers[0]!).queryByText('d12')).not.toBeInTheDocument()
    expect(within(powers[0]!).getByRole('img', { name: 'd12' })).toHaveAttribute('src', '/icons/die/d12.png')
    expect(within(screen.getByRole('region', { name: 'Qualities' })).getAllByRole('listitem').map(readable)).toEqual(['Fitnessd10', 'Alertnessd8', 'Old Moneyd8'])

    // Status dice as labelled tiles, and Health with its ranges.
    const status = screen.getByRole('region', { name: 'Status dice and Health' })
    expect(within(within(status).getByRole('list', { name: 'Status dice' })).getAllByRole('listitem').map(readable)).toEqual(['GREENd8', 'YELLOWd8', 'REDd8'])
    expect(status).toHaveTextContent('30 max')
    expect(within(within(status).getByRole('list', { name: 'Health ranges' })).getAllByRole('listitem').map(readable)).toEqual(['Green 30–23', 'Yellow 22–12', 'Red 11–1'])

    // Abilities sit in their zone bands; principle abilities end the Green band.
    const green = within(screen.getByRole('region', { name: 'Green abilities' })).getAllByRole('listitem')
    expect(green[0]).toHaveTextContent('Immunity')
    expect(green.at(-1)).toHaveTextContent(/Principle of/)
    // Each row: the action icons, then the name, the type, and the text with icons inline.
    const always = green.find((li) => li.textContent?.includes('Always on the Move'))!
    expect(within(always).getAllByRole('img', { name: 'Attack' })).toHaveLength(1)
    expect(within(always).getByText('Action')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Yellow abilities' })).getByText('Speedy Analysis')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Red abilities' })).getByText('Paragon Feat')).toBeInTheDocument()
    const out = screen.getByRole('region', { name: 'Out ability' })
    expect(out).toHaveTextContent('When your Health reaches 0')
    expect(within(out).getByText(/Fitness/)).toBeInTheDocument()
    expect(green[0]).not.toHaveTextContent('[')

    // No rule issues here (the page shows them), and no forms or modes for a plain archetype.
    expect(screen.queryByText(/rule issue/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Auxiliary sheet' })).not.toBeInTheDocument()
  })

  it('leaves out Roleplaying in Play mode', () => {
    render(<HeroSheetView hero={exampleHero()} mode="play" />)
    expect(screen.queryByRole('heading', { name: 'Roleplaying' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mechanics' })).toBeInTheDocument()
  })

  it('folds the twists behind a button (shown on phones)', async () => {
    render(<HeroSheetView hero={exampleHero()} />)
    const card = screen.getByRole('region', { name: 'Principle of Business' })
    const toggle = within(card).getByRole('button', { name: 'Show twists' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(within(card).getByRole('button', { name: 'Hide twists' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows the twists with no button when it can’t be interacted with (an export)', () => {
    render(<HeroSheetView hero={exampleHero()} interactive={false} />)
    const card = screen.getByRole('region', { name: 'Principle of Business' })
    expect(within(card).queryByRole('button')).not.toBeInTheDocument()
    expect(card.querySelector('.principle-card__twists--folded')).toBeNull()
    expect(within(card).getByText('Major twist')).toBeInTheDocument()
  })

  it('shows what’s missing on a new hero', () => {
    const hero = createHero('guided')
    hero.archetype = { id: 'speedster', traits: [], abilities: [], bonus: [] }
    render(<HeroSheetView hero={hero} />)
    expect(screen.getByText('No powers yet.')).toBeInTheDocument()
    expect(screen.getByText('Not worked out yet.')).toBeInTheDocument()
    expect(screen.getAllByText('Choose a personality.')).toHaveLength(2)
    // Unchosen characteristics show a dash; empty details aren't listed.
    const who = screen.getByRole('region', { name: 'Who they are' })
    expect(within(who).getAllByText('—')).toHaveLength(3)
    expect(within(who).queryByText('Age')).not.toBeInTheDocument()
  })

  it('ends with the forms or modes section for a hero who has them', () => {
    render(<HeroSheetView hero={modularHero()} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Roleplaying', 'Mechanics', 'Abilities', 'Modes'])
  })
})
