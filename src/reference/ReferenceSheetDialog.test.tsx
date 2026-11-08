import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createChallengeTemplate, createEnvironmentTemplate, createMinionTemplate, type ChallengeTemplate, type MinionTemplate } from '../template/model'
import type { LibrarySheetItem, SheetSource } from './contents'
import { ReferenceSheetDialog } from './ReferenceSheetDialog'
import { downloadFile } from '../transfer/download'

vi.mock('../transfer/download', () => ({ downloadFile: vi.fn() }))

const now = new Date('2026-11-08T12:00:00Z')

function source(): SheetSource {
  const thugs: MinionTemplate = { ...createMinionTemplate({ id: 'thugs', now }), name: 'Foundry Thugs', groupSize: 3 }
  const gate: ChallengeTemplate = { ...createChallengeTemplate({ id: 'gate', now }), name: 'Gate Lock', steps: [{ label: 'Find the panel' }, { label: '' }] }
  const env = {
    ...createEnvironmentTemplate({ id: 'env', now }),
    name: 'Molten Foundry',
    attached: [
      { kind: 'minion' as const, templateId: 'thugs' },
      { kind: 'challenge' as const, templateId: 'gate' },
    ],
  }
  env.twists = [{ id: 't1', zone: 'yellow', kind: 'major', text: 'A catwalk gives way.' }]
  const drones: MinionTemplate = { ...createMinionTemplate({ id: 'drones', now }), name: 'Ember Drones', actions: ['attack', 'hinder'], notes: 'They swarm.' }
  const villain = adaptiveBruiser()
  const hero = completeHero()
  hero.details.name = 'Paradigm'
  const items: LibrarySheetItem[] = [
    { kind: 'villain', doc: villain },
    { kind: 'environment', doc: env },
    { kind: 'minion', doc: drones },
    { kind: 'hero', doc: hero },
  ]
  const all = [thugs, gate]
  return { kind: 'library', items, lookup: (_k, id) => all.find((d) => d.id === id) }
}

afterEach(() => {
  document.documentElement.classList.remove('printing-reference')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ReferenceSheetDialog', () => {
  it('lists the full pages and cards, and leaves things out and puts them back', async () => {
    render(<ReferenceSheetDialog source={source()} onClose={() => {}} now={() => now} />)
    const dialog = within(screen.getByRole('dialog', { name: 'Reference sheet' }))
    expect(dialog.getByText(/^6 items · about \d+ pages$/)).toBeInTheDocument()
    expect(dialog.getByText('Step 1 of 2, Contents')).toBeInTheDocument()
    const pages = within(dialog.getByRole('list', { name: 'Full pages' }))
    expect(pages.getAllByRole('listitem').map((li) => li.querySelector('strong')!.textContent)).toEqual(['Paradigm', 'Ironclad'])
    expect(pages.getAllByText('2 pages')).toHaveLength(2)
    const cards = within(dialog.getByRole('list', { name: 'Cards' }))
    expect(cards.getAllByRole('listitem').map((li) => li.querySelector('strong')!.textContent)).toEqual(['Molten Foundry', 'Gate Lock', 'Ember Drones', 'Foundry Thugs'])
    expect(cards.getAllByText('From Molten Foundry')).toHaveLength(2)
    expect(dialog.getByText('Cards · Environments 1 · Challenges 1 · Minions 2')).toBeInTheDocument()
    expect(dialog.getByText('Adds Foundry Thugs and Gate Lock')).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('checkbox', { name: /Add what environments bring/ }))
    expect(cards.getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(dialog.getByRole('checkbox', { name: /Add what environments bring/ }))
    expect(cards.getAllByRole('listitem')).toHaveLength(4)

    await userEvent.click(cards.getByRole('button', { name: 'Leave out Ember Drones' }))
    expect(dialog.getByText('Left out (1)')).toBeInTheDocument()
    await userEvent.click(pages.getByRole('button', { name: 'More actions for Ironclad' }))
    expect(screen.queryByRole('menuitem', { name: 'Move down' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(pages.getAllByRole('listitem')[0]).toHaveTextContent('Ironclad')
    await userEvent.click(pages.getByRole('button', { name: 'More actions for Ironclad' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave out' }))
    expect(dialog.getByText('Left out (2)')).toBeInTheDocument()
    expect(dialog.getByText(/^4 items/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Put back Ember Drones' }))
    expect(cards.getAllByRole('listitem').map((li) => li.querySelector('strong')!.textContent)).toContain('Ember Drones')
    expect(dialog.getByText('Left out (1)')).toBeInTheDocument()
  })

  it('has the options, a preview and the file name', async () => {
    render(<ReferenceSheetDialog source={source()} onClose={() => {}} now={() => now} />)
    const dialog = within(screen.getByRole('dialog', { name: 'Reference sheet' }))
    const columns = within(dialog.getByRole('group', { name: 'Card columns' }))
    expect(columns.getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(columns.getByRole('button', { name: '3' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Preview the pages. The first card page: 3 columns, 4 cards' }))
    // Every card page full size, numbered in the whole file: the two sheets' four pages come first.
    const preview = within(screen.getByRole('dialog', { name: 'Preview' }))
    expect(preview.getByRole('img', { name: 'Page 5, 3 columns' })).toBeInTheDocument()
    await userEvent.click(preview.getByRole('button', { name: 'Close' }))
    await userEvent.click(within(dialog.getByRole('group', { name: 'Paper' })).getByRole('button', { name: 'A4' }))
    expect(within(dialog.getByRole('group', { name: 'Paper' })).getByRole('button', { name: 'A4' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog.getByRole('group', { name: 'Where cards go' })).getByRole('button', { name: 'After the full pages' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog.getByRole('checkbox', { name: /Write-in spaces/ })).toBeChecked()
    expect(dialog.getByText('Saved as SCRPG Aid reference sheet - 2026-11-08.pdf')).toBeInTheDocument()
  })

  it('prints the sheets and cards, then closes', async () => {
    const onClose = vi.fn()
    let printed: HTMLElement | null = null
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      printed = document.querySelector<HTMLElement>('.ref-print')
      expect(document.title).toBe('SCRPG Aid reference sheet - 2026-11-08')
    })
    render(<ReferenceSheetDialog source={source()} onClose={onClose} now={() => now} />)
    const dialog = within(screen.getByRole('dialog', { name: 'Reference sheet' }))
    await userEvent.click(within(dialog.getByRole('group', { name: 'Where cards go' })).getByRole('button', { name: 'Before the full pages' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: /Write-in spaces/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Next: Arrange' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await waitFor(() => expect(print).toHaveBeenCalled())
    const sheet = printed!
    // Not inside the app: straight under <body>, so the print can hide everything else.
    expect(sheet.parentElement).toBe(document.body)
    expect(sheet).toHaveClass('ref-print--no-write-ins')
    const blocks = [...sheet.children].map((c) => c.className)
    expect(blocks).toEqual(['ref-print__cards', 'ref-print__full', 'ref-print__full'])
    expect((sheet.children[1] as HTMLElement).style.getPropertyValue('page')).toBe('ref-page-0')
    const cards = within(sheet.children[0] as HTMLElement)
    expect(cards.getByRole('heading', { level: 1, name: 'Reference sheet' })).toBeInTheDocument()
    expect(cards.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Molten Foundry', 'Gate Lock', 'Ember Drones', 'Foundry Thugs'])
    expect(cards.getByText('MINION · FROM MOLTEN FOUNDRY')).toBeInTheDocument()
    expect(cards.getByLabelText('Attack or Hinder')).toBeInTheDocument()
    expect(cards.getByText('Brings: Foundry Thugs, Gate Lock')).toBeInTheDocument()
    // Write-in spaces off: no die boxes, and only checked step boxes.
    expect(sheet.querySelectorAll('.ref-diebox')).toHaveLength(0)
    expect(sheet.querySelectorAll('.ref-box')).toHaveLength(0)
    expect(within(sheet.children[2] as HTMLElement).getByRole('heading', { level: 2, name: 'Ironclad' })).toHaveClass('char-band')

    window.dispatchEvent(new Event('afterprint'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(document.head.querySelector('style[data-print]')).toBeNull()
  })

  it('prints write-in boxes when they are on', async () => {
    let boxes = 0
    vi.spyOn(window, 'print').mockImplementation(() => {
      boxes = document.querySelectorAll('.ref-print .ref-diebox').length
    })
    render(<ReferenceSheetDialog source={source()} onClose={() => {}} now={() => now} />)
    await userEvent.click(screen.getByRole('button', { name: 'Export now' }))
    // Drones 4, thugs 3.
    await waitFor(() => expect(boxes).toBe(7))
    window.dispatchEvent(new Event('afterprint'))
  })

  it('saves Markdown instead of printing', async () => {
    const onClose = vi.fn()
    const print = vi.spyOn(window, 'print')
    render(<ReferenceSheetDialog source={source()} onClose={onClose} now={() => now} />)
    const dialog = within(screen.getByRole('dialog', { name: 'Reference sheet' }))
    await userEvent.click(within(dialog.getByRole('group', { name: 'Format' })).getByRole('button', { name: 'Markdown' }))
    expect(dialog.getByText('Saved as SCRPG Aid reference sheet - 2026-11-08.md')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Next: Arrange' }))
    expect(dialog.getByText('Markdown · write-in spaces on')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Export' }))
    const [name, text, type] = vi.mocked(downloadFile).mock.calls.at(-1)!
    expect(name).toBe('SCRPG Aid reference sheet - 2026-11-08.md')
    expect(type).toBe('text/markdown')
    expect(text).toContain('# Reference sheet')
    expect(text).toContain('## Ember Drones')
    expect(text).not.toContain('<!--')
    expect(print).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('offers Export alone when there are no cards to arrange', () => {
    render(<ReferenceSheetDialog source={{ kind: 'library', items: [], lookup: () => undefined }} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })
})

describe('Arrange', () => {
  const cardNames = () => [...document.querySelectorAll('.ref-arrange__board .ref-card')].map((c) => c.getAttribute('aria-label'))

  async function arrange() {
    render(<ReferenceSheetDialog source={source()} onClose={() => {}} now={() => now} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next: Arrange' }))
    return within(screen.getByRole('dialog', { name: 'Reference sheet' }))
  }

  it('shows the card pages with file page numbers, and goes Back', async () => {
    const dialog = await arrange()
    expect(dialog.getByText('Step 2 of 2, Arrange')).toBeInTheDocument()
    expect(cardNames()).toEqual(['Molten Foundry', 'Gate Lock', 'Ember Drones', 'Foundry Thugs'])
    // Two sheets of two pages each come first.
    expect(dialog.getByRole('group', { name: 'Page 5 of 5, 2 columns, 4 cards' })).toBeInTheDocument()
    expect(dialog.getByText('4 cards on 1 page')).toBeInTheDocument()
    expect(within(dialog.getByRole('complementary', { name: 'Print order' })).getByRole('list', { name: 'Full pages' })).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }))
    expect(dialog.getByText('Step 1 of 2, Contents')).toBeInTheDocument()
  })

  it('moves cards from their menus, with Undo and Redo', async () => {
    const dialog = await arrange()
    expect(dialog.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('button', { name: 'More actions for Foundry Thugs' }))
    expect(screen.queryByRole('menuitem', { name: 'Move to bottom' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to top' }))
    expect(cardNames()).toEqual(['Foundry Thugs', 'Molten Foundry', 'Gate Lock', 'Ember Drones'])
    await waitFor(() => expect(dialog.getByRole('status')).toHaveTextContent('Foundry Thugs, page 1, column 1, position 1 of'))
    await userEvent.click(dialog.getByRole('button', { name: 'Undo' }))
    expect(cardNames()).toEqual(['Molten Foundry', 'Gate Lock', 'Ember Drones', 'Foundry Thugs'])
    await userEvent.click(dialog.getByRole('button', { name: 'Redo' }))
    expect(cardNames()[0]).toBe('Foundry Thugs')
    expect(dialog.getByRole('button', { name: 'Redo' })).toBeDisabled()

    await userEvent.click(dialog.getByRole('button', { name: 'More actions for Gate Lock' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave out' }))
    expect(cardNames()).not.toContain('Gate Lock')
    await userEvent.click(dialog.getByRole('button', { name: 'Undo' }))
    expect(cardNames()).toContain('Gate Lock')
  })

  it('adds and removes column and page breaks', async () => {
    const dialog = await arrange()
    expect(dialog.getByText(/Select a card \(after the first\)/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Move Gate Lock' }))
    expect(dialog.getByRole('button', { name: 'Move Gate Lock' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(dialog.getByRole('button', { name: '+ Page break' }))
    expect(dialog.getByText('Page break')).toBeInTheDocument()
    expect(dialog.getByText('4 cards on 2 pages')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Remove the page break before Gate Lock' }))
    expect(dialog.getByText('4 cards on 1 page')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'More actions for Ember Drones' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Start a new column here' }))
    expect(dialog.getByText('Column break')).toBeInTheDocument()

    // Sort by type asks first, since something changed.
    await userEvent.click(dialog.getByRole('button', { name: 'Sort by type' }))
    const ask = within(screen.getByRole('dialog', { name: 'Sort by type?' }))
    await userEvent.click(ask.getByRole('button', { name: 'Keep my order' }))
    expect(dialog.getByText('Column break')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Sort by type' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Sort by type?' })).getByRole('button', { name: 'Sort by type' }))
    expect(dialog.queryByText('Column break')).not.toBeInTheDocument()
  })

  it('moves a card by keyboard: Space picks it up, arrows move it, Space drops and Escape cancels', async () => {
    const dialog = await arrange()
    const handle = () => dialog.getByRole('button', { name: 'Move Ember Drones' })
    handle().focus()
    await userEvent.keyboard(' ')
    expect(dialog.getByRole('status')).toHaveTextContent('Ember Drones picked up.')
    await userEvent.keyboard('{ArrowUp}')
    expect(cardNames()).toEqual(['Molten Foundry', 'Ember Drones', 'Gate Lock', 'Foundry Thugs'])
    await waitFor(() => expect(handle()).toHaveFocus())
    await userEvent.keyboard('{ArrowUp}')
    expect(cardNames()[0]).toBe('Ember Drones')
    await userEvent.keyboard('{Escape}')
    expect(cardNames()).toEqual(['Molten Foundry', 'Gate Lock', 'Ember Drones', 'Foundry Thugs'])
    expect(screen.getByRole('dialog', { name: 'Reference sheet' })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Undo' })).toBeDisabled()
    // Picked up and dropped without moving: nothing to undo.
    handle().focus()
    await userEvent.keyboard('  ')
    expect(dialog.getByRole('button', { name: 'Undo' })).toBeDisabled()

    handle().focus()
    await userEvent.keyboard(' {ArrowDown} ')
    expect(cardNames()).toEqual(['Molten Foundry', 'Gate Lock', 'Foundry Thugs', 'Ember Drones'])
    expect(dialog.getByRole('status')).toHaveTextContent(/Ember Drones, page 1, column \d, position \d of \d\. Dropped\./)
    // One drop is one step to undo.
    await userEvent.click(dialog.getByRole('button', { name: 'Undo' }))
    expect(cardNames()).toEqual(['Molten Foundry', 'Gate Lock', 'Ember Drones', 'Foundry Thugs'])

    // Leaving the handle while a card is picked up drops it there.
    handle().focus()
    await userEvent.keyboard(' {ArrowUp}')
    await userEvent.click(dialog.getByRole('button', { name: 'Sort by type' }))
    // The move was kept, as one step Undo can take back.
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Sort by type?' })).getByRole('button', { name: 'Keep my order' }))
    expect(cardNames()[1]).toBe('Ember Drones')
    expect(dialog.getByRole('button', { name: 'Undo' })).toBeEnabled()
  })

  it('moves a card by dragging it onto another', async () => {
    const dialog = await arrange()
    const card = (name: string) => dialog.getByRole('button', { name: `Move ${name}` }).closest('.ref-arrange-card')!
    const data = { effectAllowed: '', dropEffect: '', setData: () => {} }
    fireEvent.dragStart(card('Foundry Thugs'), { dataTransfer: data })
    // jsdom has no pointer position here, so this is the lower half of the card: it drops after it.
    fireEvent.dragOver(card('Gate Lock'), { dataTransfer: data })
    expect(card('Gate Lock')).toHaveClass('ref-arrange-card--drop-after')
    fireEvent.drop(card('Gate Lock'), { dataTransfer: data })
    expect(cardNames()).toEqual(['Molten Foundry', 'Gate Lock', 'Foundry Thugs', 'Ember Drones'])
  })

  it('prints the arrangement, breaks and all', async () => {
    let columns = 0
    vi.spyOn(window, 'print').mockImplementation(() => {
      columns = document.querySelectorAll('.ref-print .ref-columns').length
    })
    const dialog = await arrange()
    await userEvent.click(dialog.getByRole('button', { name: 'More actions for Ember Drones' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Start a new page here' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Export' }))
    await waitFor(() => expect(columns).toBe(2))
    window.dispatchEvent(new Event('afterprint'))
  })
})

describe('Arrange on a phone', () => {
  it('is a list under Page and Column headings, with moves and breaks in each row\'s menu, and a full-screen preview', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<ReferenceSheetDialog source={source()} onClose={() => {}} now={() => now} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next: Arrange' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Reference sheet' }))
    const column = within(dialog.getByRole('region', { name: 'Page 5, column 1' }))
    expect(column.getByRole('heading', { name: 'Page 5 · Column 1' })).toBeInTheDocument()
    const rowNames = () => [...document.querySelectorAll('.ref-arrange-row strong')].map((n) => n.textContent)
    expect(rowNames()).toEqual(['Molten Foundry', 'Gate Lock', 'Ember Drones', 'Foundry Thugs'])
    // No printed cards on the board, and no toolbar break buttons: breaks are in the menus.
    expect(document.querySelector('.ref-arrange__board')).toBeNull()
    expect(dialog.queryByRole('button', { name: '+ Page break' })).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'More actions for Gate Lock' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Move up', 'Move down', 'Move to top', 'Move to bottom', 'Start a new column here', 'Start a new page here', 'Leave out'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(rowNames()).toEqual(['Molten Foundry', 'Ember Drones', 'Gate Lock', 'Foundry Thugs'])
    await userEvent.click(dialog.getByRole('button', { name: 'More actions for Foundry Thugs' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Start a new page here' }))
    expect(dialog.getByRole('heading', { name: 'Page 6 · Column 1' })).toBeInTheDocument()
    expect(dialog.getByText('Page break')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Preview' }))
    const preview = within(screen.getByRole('dialog', { name: 'Preview' }))
    expect(preview.getAllByRole('img').map((i) => i.getAttribute('aria-label'))).toEqual(['Page 5 of 6, 2 columns', 'Page 6 of 6, 2 columns'])
  })
})
