import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { exampleHero } from '../hero/example'
import type { Hero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { memoryStorage } from '../session/storage'
import { adaptiveBruiser } from '../test/villains'
import { MemoryVillainStore } from '../villain/store'
import { localBackupTime } from './backup-time'
import { HOLD_MS } from './PhoneLibrary'
import { createSavedSearch, MemorySavedSearchStore } from './saved-searches'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

/** Pretends the screen is phone width. */
function phoneWidth() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function hero(id: string, name: string, tags: string[], daysAgo: number): Hero {
  const h = exampleHero({ id })
  h.details.name = name
  h.tags = tags
  h.updatedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString()
  return h
}

async function setup() {
  const heroes = new MemoryHeroStore()
  const villains = new MemoryVillainStore()
  const searches = new MemorySavedSearchStore()
  await heroes.save(hero('maya', 'Maya Reyes', ['thursday-game'], 1))
  await heroes.save(hero('para', 'Paradigm', [], 2))
  await villains.save({ ...adaptiveBruiser(), tags: ['scene-3', 'thursday-game'], updatedAt: new Date().toISOString() })
  await searches.save(createSavedSearch('Scene 3', { text: '', types: [], tags: ['scene-3'] }, { id: 's1' }))
  window.location.hash = '#/'
  render(<App store={heroes} villainStore={villains} searchStore={searches} backupTime={localBackupTime(memoryStorage())} />)
  await screen.findByRole('list', { name: 'Library' })
  return { heroes, villains }
}

const rows = () => within(screen.getByRole('list', { name: 'Library' })).getAllByRole('listitem')
const rowFor = (name: string) => within(rows().find((r) => within(r).queryByRole('link', { name }))!)

beforeEach(phoneWidth)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('the library on a phone', () => {
  it('lists rows with type, kind, details, status and tag X’s, but no tag filter shortcut', async () => {
    await setup()
    expect(rows()).toHaveLength(3)
    const maya = rowFor('Maya Reyes')
    expect(maya.getByText('Hero · Speedster · Accident')).toBeInTheDocument()
    // A villain's Major or Minor follows its type at every size.
    expect(rowFor('Ironclad').getByText('Villain (Minor) · Adaptive Bruiser')).toBeInTheDocument()
    expect(maya.getByRole('button', { name: 'Remove thursday-game from Maya Reyes' })).toBeInTheDocument()
    expect(maya.queryByRole('button', { name: 'Filter by thursday-game' })).not.toBeInTheDocument()
    expect(maya.getByRole('link', { name: 'Play Maya Reyes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play together' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Menu: color scheme/ })).toBeInTheDocument()
  })

  it('opens About from the header menu, with Settings, and focus back on the menu afterwards', async () => {
    await setup()
    const menu = screen.getByRole('button', { name: /^Menu: color scheme, settings, about/ })
    await userEvent.click(menu)
    const sheet = within(screen.getByRole('dialog', { name: 'Menu' }))
    expect(sheet.queryByRole('menuitem', { name: 'Back up everything' })).not.toBeInTheDocument()
    expect(sheet.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '#/settings')
    await userEvent.click(sheet.getByRole('menuitem', { name: 'About' }))
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'About SCRPG Aid' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(menu).toHaveFocus()
  })

  it('picks a view from the view sheet', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Views' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Scene 3 1' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scene 3' })).toBeInTheDocument()
    expect(rows()).toHaveLength(1)
  })

  it('filters in the Filters sheet, showing the count, with removable tag chips after', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Filters' }))
    expect(sheet.getByText('Tags · items must have every tag you pick')).toBeInTheDocument()
    await userEvent.click(sheet.getByRole('checkbox', { name: /thursday-game/ }))
    expect(sheet.getByRole('button', { name: 'Show 2' })).toBeInTheDocument()
    await userEvent.click(sheet.getByRole('button', { name: 'Heroes' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Show 1' }))
    expect(screen.getByRole('button', { name: 'Filters, 2 on' })).toBeInTheDocument()
    expect(rows()).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag filter thursday-game' }))
    expect(rows()).toHaveLength(2)
  })

  it('cancels the save-search field with Escape without closing the Filters sheet', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Filters' }))
    await userEvent.click(sheet.getByRole('checkbox', { name: /scene-3/ }))
    await userEvent.click(sheet.getByRole('button', { name: 'Save search' }))
    expect(sheet.getByRole('textbox', { name: 'Saved search name' })).toHaveValue('scene-3')
    await userEvent.keyboard('{Escape}')
    expect(sheet.queryByRole('textbox', { name: 'Saved search name' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument()
  })

  it('starts selecting on press and hold, with a bottom bar of bulk actions', async () => {
    const { heroes } = await setup()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const row = rows()[1]!
    fireEvent.pointerDown(row, { button: 0 })
    act(() => vi.advanceTimersByTime(HOLD_MS + 10))
    fireEvent.pointerUp(row)
    vi.useRealTimers()
    const bar = within(screen.getByRole('region', { name: 'Selected items' }))
    expect(bar.getByText('1 selected')).toBeInTheDocument()
    await userEvent.click(rowFor('Paradigm').getByRole('checkbox', { name: 'Select Paradigm' }))
    expect(bar.getByText('2 selected')).toBeInTheDocument()
    await userEvent.click(bar.getByRole('button', { name: 'Add tag' }))
    await userEvent.keyboard('prep{Enter}')
    await waitFor(async () => expect(((await heroes.get('para')) as { hero: Hero }).hero.tags).toEqual(['prep']))
    await userEvent.click(bar.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: 'Selected items' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select Paradigm' })).not.toBeInTheDocument()
  })

  it('offers Select in the ⋯ menu as the way in without the gesture', async () => {
    await setup()
    await userEvent.click(rowFor('Paradigm').getByRole('button', { name: 'More actions for Paradigm' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Select' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(rowFor('Paradigm').getByRole('checkbox', { name: 'Select Paradigm' })).toBeChecked()
  })
})
