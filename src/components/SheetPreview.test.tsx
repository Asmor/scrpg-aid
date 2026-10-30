import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { createHero } from '../hero/model'
import { completeHero, dividedSplitHero } from '../test/heroes'
import { SheetPreview } from './SheetPreview'

/** A part of the preview (not a landmark, so it doesn't clash with the step's own regions). */
const part = (name: string) => document.querySelector<HTMLElement>(`[data-part="${name}"]`)!

describe('SheetPreview', () => {
  it('shows what the Sheet’s Mechanics does: status dice, Health and its ranges, and every band including Out', () => {
    const hero = completeHero()
    const sheet = buildSheet(hero)
    render(<SheetPreview hero={hero} />)
    const tiles = screen.getByRole('list', { name: 'Status dice' })
    expect(
      within(tiles)
        .getAllByRole('img')
        .map((img) => img.getAttribute('alt')),
    ).toEqual([sheet.statusDice!.green, sheet.statusDice!.yellow, sheet.statusDice!.red])
    expect(tiles.querySelector('.zone-green')).toHaveTextContent('GREEN')
    const health = part('health')
    expect(health).toHaveTextContent(`${sheet.maxHealth} max`)
    const ranges = within(health).getByRole('list', { name: 'Health ranges' })
    expect(
      within(ranges)
        .getAllByRole('listitem')
        .map((li) => li.className),
    ).toEqual(['zone-green', 'zone-yellow', 'zone-red'])
    expect(ranges).toHaveTextContent(`Green ${sheet.healthRanges!.green[0]}–${sheet.healthRanges!.green[1]}`)
    for (const band of ['Green abilities', 'Yellow abilities', 'Red abilities', 'Out ability']) expect(screen.getByRole('region', { name: band })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Out ability' })).toHaveTextContent(sheet.outAbility!)
  })

  it('shows both personalities’ status dice for a Divided hero', () => {
    render(<SheetPreview hero={dividedSplitHero()} />)
    expect(screen.getByRole('list', { name: 'Civilian form status dice' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Heroic form status dice' })).toBeInTheDocument()
  })

  it('says which step fills each part that isn’t chosen yet', () => {
    render(<SheetPreview hero={createHero('guided', { id: 'h1' })} />)
    expect(part('status')).toHaveTextContent('Step 4')
    expect(part('health')).toHaveTextContent('Step 7')
    expect(screen.getByRole('region', { name: 'Out ability' })).toHaveTextContent('Step 4')
  })
})
