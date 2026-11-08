import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createChallengeTemplate, createEnvironmentTemplate, createMinionTemplate, type ChallengeTemplate, type MinionTemplate } from '../template/model'
import type { LibrarySheetItem, SheetSource } from './contents'
import { ReferenceSheetDialog } from './ReferenceSheetDialog'

const now = new Date('2026-11-08T12:00:00Z')

function source(): SheetSource {
  const thugs: MinionTemplate = { ...createMinionTemplate({ id: 'thugs', now }), name: 'Foundry Thugs', groupSize: 3 }
  const gate: ChallengeTemplate = { ...createChallengeTemplate({ id: 'gate', now }), name: 'Gate Lock', steps: [{ label: 'Find the panel' }, { label: '' }] }
  const env = { ...createEnvironmentTemplate({ id: 'env', now }), name: 'Molten Foundry', attached: [{ kind: 'minion' as const, templateId: 'thugs' }, { kind: 'challenge' as const, templateId: 'gate' }] }
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
})

describe('ReferenceSheetDialog', () => {
  it('lists the full pages and cards, and leaves things out and puts them back', async () => {
    render(<ReferenceSheetDialog source={source()} onClose={() => {}} now={() => now} />)
    const dialog = within(screen.getByRole('dialog', { name: 'Reference sheet' }))
    expect(dialog.getByText(/^6 items · about \d+ pages$/)).toBeInTheDocument()
    expect(dialog.getByText('Step 1 of 1, Contents')).toBeInTheDocument()
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
    expect(dialog.getByRole('img', { name: /^Preview of the first card page: 3 columns, 4 cards$/ })).toBeInTheDocument()
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
    await userEvent.click(dialog.getByRole('button', { name: 'Export' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    // Drones 4, thugs 3.
    await waitFor(() => expect(boxes).toBe(7))
    window.dispatchEvent(new Event('afterprint'))
  })

  it('says so when a scene has gone', () => {
    render(<ReferenceSheetDialog source={{ kind: 'library', items: [], lookup: () => undefined }} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })
})
