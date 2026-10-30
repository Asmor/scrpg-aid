import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { archetypeParts } from '../hero/archetype-parts'
import type { Hero } from '../hero/model'
import { stepStates } from '../hero/wizard-steps'
import { completeHero } from '../test/heroes'
import { EditSummary } from './EditSummary'

function renderSummary(hero: Hero) {
  const warnings = buildSheet(hero).warnings
  return render(
    <EditSummary hero={hero} steps={stepStates(hero, warnings)} parts={archetypeParts(hero, warnings)} href={(s) => `#${s}`} partHref={(p) => `#part/${p}`} advancementHref="#adv" changed={false} onRevert={() => {}} />,
  )
}

/** The text of a step's row, found by its heading. */
const row = (name: RegExp) => screen.getByRole('heading', { level: 4, name }).closest('li')!

describe('EditSummary', () => {
  it('says what each step chose, in one line each', () => {
    const hero = completeHero()
    hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
    Object.assign(hero.details, { name: 'Maya', alias: 'Afterimage', player: 'Sam', age: '24', build: 'Lean', eyes: 'brown' })
    renderSummary(hero)
    expect(row(/^Start/)).toHaveTextContent('Constructed')
    const background = row(/Background/)
    expect(background).toHaveTextContent(/Upper Class.*Fitness.*Alertness.*Principle of Business/)
    // A principle shows its Green ability's action icons before its name, as every listed ability does.
    expect(within(background).getByText('Principle of Business').closest('li')!.querySelector('img[alt="Overcome"]')).not.toBeNull()
    expect(within(background).getAllByRole('img', { name: /^d\d+$/ })).toHaveLength(2)
    // Each step lists only its own abilities.
    const power = row(/Power source/)
    expect(power).toHaveTextContent(/Accident.*Agility.*Awareness.*Fire.*Immunity.*Inflict.*Area Alteration/)
    expect(power).not.toHaveTextContent('Always on the Move')
    const archetype = row(/Archetype/)
    expect(archetype).toHaveTextContent(/Speedster.*Speed.*Flight.*Always on the Move.*Non-stop Assault.*Speedy Analysis.*Principle of the Gearhead/)
    expect(archetype).not.toHaveTextContent('Inflict')
    const personality = row(/Personality/)
    expect(personality).toHaveTextContent(/Lone Wolf.*Old Money/)
    expect(within(personality).getByRole('list', { name: 'Status dice' })).toBeInTheDocument()
    expect(personality).toHaveTextContent('Out: Fitness')
    const red = row(/Red abilities/)
    expect(red).toHaveTextContent(/Paragon Feat.*Push Your Limits/)
    expect(red).not.toHaveTextContent('Inflict')
    expect(row(/Retcon/)).toHaveTextContent('Raise your Red status die by one size (maximum d12).')
    const sheet = buildSheet(hero)
    const health = row(/Health/)
    expect(health).toHaveTextContent(`Max ${sheet.maxHealth}`)
    expect(health).toHaveTextContent(`${sheet.healthRanges!.green[0]}–${sheet.healthRanges!.green[1]}`)
    const details = row(/Details/)
    expect(details).toHaveTextContent(/Played by Sam.*Age 24.*Lean.*Eyes brown/)
    // The header already names the hero.
    expect(details).not.toHaveTextContent('Maya')
  })

  it('says when a step has no choice, flagged when that leaves an issue', () => {
    const hero = completeHero()
    hero.redAbilities = []
    renderSummary(hero)
    const retcon = within(row(/Retcon/)).getByText('Nothing chosen yet.')
    expect(retcon).not.toHaveClass('summary-row__empty--issue')
    const red = within(row(/Red abilities/)).getByText('Nothing chosen yet.')
    expect(red).toHaveClass('summary-row__empty--issue')
    expect(within(row(/Details/)).getByText('Nothing chosen yet.')).toBeInTheDocument()
  })

  it('says how a Guided hero is rolled', () => {
    const hero = completeHero()
    hero.method = 'guided'
    renderSummary(hero)
    expect(row(/^Start/)).toHaveTextContent('Guided, rolled in the app')
    hero.rollMode = 'manual'
    renderSummary(hero)
    expect(screen.getAllByRole('heading', { level: 4, name: /^Start/ })[1]!.closest('li')).toHaveTextContent('Guided, rolling your own dice')
  })
})
