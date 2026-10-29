import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { exampleHero } from '../hero/example'
import type { Hero } from '../hero/model'
import { readable } from '../test/readable'
import { A, dividedHero, dividedSplitHero, Q, formChangerHero, minionMakerHero, modularBlasterHero } from '../test/heroes'
import { FormsSection } from './FormsSection'

const show = (hero: Hero) => render(<FormsSection hero={hero} sheet={buildSheet(hero)} />)
const card = (name: string) => screen.getByRole('region', { name })
/** An element's text with die names, without spacing (icons sit right against the words). */
const flat = (el: Element) => readable(el).replace(/\s+/g, '')
const squash = (list: string[]) => list.map((t) => t.replace(/\s+/g, ''))

describe('FormsSection', () => {
  it('shows only what each Modular mode changes, with its zone, limits and ability', () => {
    show(modularBlasterHero())
    const section = screen.getByRole('region', { name: 'Modes' })
    expect(section).toHaveTextContent('Modular Blaster · Switch, Quick Switch and Emergency Switch work in every mode')
    // The default mode first, using the base dice.
    const cards = within(section).getAllByRole('region')
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Default mode', 'Debilitator Mode', 'Analysis Mode', 'Bombardment Mode', 'Destroyer Mode'])
    expect(card('Default mode')).toHaveTextContent('Uses your base dice.')
    // Bombardment raises Fire, Agility and Speed, and drops Cold and Cosmic; the qualities it keeps aren't listed.
    const bombardment = card('Bombardment Mode')
    expect(within(bombardment).getAllByRole('listitem').map(flat)).toEqual(squash(['Fire d10 → d12', 'Agility d8 → d12', 'Speed d8 → d12']))
    expect(bombardment).toHaveTextContent('Not in this mode: Cold, Cosmic')
    expect(bombardment).not.toHaveTextContent('Fitness')
    expect(bombardment).toHaveTextContent("Can't Boost, Hinder, or Overcome.")
    expect(within(bombardment).getByText('Yellow')).toHaveClass('zone-chip', 'zone-yellow')
    expect(within(bombardment).getByText('Bombardment')).toBeInTheDocument()
    expect(within(bombardment).getAllByRole('img', { name: 'Defend' }).length).toBeGreaterThan(0)
    expect(within(card('Destroyer Mode')).getByText('Red')).toBeInTheDocument()
    expect(card('Destroyer Mode')).toHaveTextContent("Can't Boost. Can't move.")
  })

  it('tags a form’s added powers, and names Form-Changer’s abilities that work in every form', () => {
    show(formChangerHero())
    const section = screen.getByRole('region', { name: 'Forms' })
    expect(section).toHaveTextContent('Change Forms and Emergency Change work in every form')
    expect(card('Base form')).toHaveTextContent('Uses your base dice.')
    const brute = within(card('Brute')).getAllByRole('listitem').map(flat)
    expect(brute).toContain('Strengthd12Added')
    expect(card('Brute')).toHaveTextContent('Not in this form: Flight')
  })

  it('shows Divided’s traits by form, its two personalities, and abilities only one form can use', () => {
    show(dividedSplitHero())
    const section = screen.getByRole('region', { name: 'Divided forms' })
    expect(section).toHaveTextContent('Divided · Split Form · Controllable Transition')
    const traits = (name: string) => within(card(name)).getAllByRole('listitem').filter((li) => li.closest('.trait-rows')).map(flat)
    expect(traits('Both forms')).toEqual(squash(['Fitness quality d10', 'Night Shift Nurse roleplaying d8', 'Persuasion quality d8', 'Speed power d8', 'Strength power d8']))
    expect(traits('Civilian form')).toEqual(squash(['Acrobatics quality d6']))
    expect(traits('Heroic form')).toEqual(squash(['Vitality power d12', 'Agility power d10']))
    expect(card('Civilian form')).toHaveTextContent('Natural Leader')
    expect(card('Heroic form')).toHaveTextContent('Naive')
    expect(within(within(card('Heroic form')).getByRole('list', { name: 'Status dice' })).getAllByRole('listitem').map(flat)).toEqual(squash(['G Green d6', 'Y Yellow d6', 'R Red d12']))
    expect(within(card('Heroic form')).getByText('Abilities only in this form')).toBeInTheDocument()
    expect(within(card('Heroic form')).getByText('Fast Fingers')).toBeInTheDocument()
    expect(card('Civilian form')).not.toHaveTextContent('Fast Fingers')
    expect(card('Both forms')).not.toHaveTextContent('Natural Leader')
  })

  it('doesn’t call an ability form-only when both forms have its trait, even at different dice', () => {
    const hero = dividedSplitHero()
    // The heroic personality raises Fitness d10 → d12, so the forms have Fitness at different dice.
    hero.archetype!.divided!.heroicPersonality = { id: 'impulsive', bonus: [A(Q('fitness'), 'd12', true)] }
    hero.archetype!.secondary!.abilities.push({ source: 'archetype.green', name: 'Non-stop Assault', uses: [Q('fitness')] })
    show(hero)
    expect(within(card('Civilian form')).getAllByRole('listitem').map(flat)).toContain('Fitnessqualityd10')
    expect(within(card('Heroic form')).getAllByRole('listitem').map(flat)).toContain('Fitnessqualityd12')
    expect(card('Civilian form')).not.toHaveTextContent('Non-stop Assault')
    expect(card('Heroic form')).not.toHaveTextContent('Non-stop Assault')
    expect(within(card('Heroic form')).getByText('Fast Fingers')).toBeInTheDocument()
  })

  it('explains Divided Psyche in a line instead of columns', () => {
    show(dividedHero())
    const section = screen.getByRole('region', { name: 'Divided forms' })
    expect(section).toHaveTextContent('In your civilian form you roll two qualities with your status die; in your heroic form, two powers.')
    expect(within(section).queryByRole('region', { name: 'Heroic form' })).not.toBeInTheDocument()
  })

  it('lists minion forms with the bonus each needs, and how many came from which quality', () => {
    const hero = minionMakerHero()
    show(hero)
    const section = screen.getByRole('region', { name: 'Minion forms' })
    const count = buildSheet(hero).minionForms.length
    expect(section).toHaveTextContent(`${count} forms, from Creativity`)
    expect(card('Autonomous')).toHaveTextContent('Needs a +1 bonus or more')
    expect(card('Autonomous')).toHaveTextContent('The minion can take any of the basic actions')
  })

  it('shows nothing for a hero without forms or modes', () => {
    const { container } = show(exampleHero())
    expect(container).toBeEmptyDOMElement()
  })
})
