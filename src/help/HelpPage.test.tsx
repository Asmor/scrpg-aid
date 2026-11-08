import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HelpPage } from './HelpPage'
import { HelpProvider } from './HelpProvider'

/** Pretends the screen is phone width. */
function phoneWidth() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
}

const page = (props: { topic?: string; section?: string } = {}) =>
  render(
    <HelpProvider>
      <HelpPage {...props} />
    </HelpProvider>,
  )

afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

describe('the Help page', () => {
  it('opens on the first topic, with the topics in a nav and the open one marked', () => {
    page()
    const nav = within(screen.getByRole('navigation', { name: 'Help topics' }))
    expect(nav.getAllByRole('link').map((l) => l.textContent)).toEqual(['Getting started', 'Building heroes', 'Villains and NPCs', 'Running a game', 'Playing a hero', 'Between issues', 'Settings and data', 'Glossary'])
    expect(nav.getByRole('link', { name: 'Getting started' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Glossary' })).toHaveAttribute('href', '#/help/glossary')
    expect(screen.getByRole('heading', { level: 1, name: 'Getting started' })).toBeInTheDocument()
    expect(screen.getByText('Help', { selector: 'a' })).toHaveAttribute('href', '#/help')
  })

  it('shows a topic with its sections as h2s, and focuses a section it was opened at', () => {
    page({ topic: 'running-a-game', section: 'status-die' })
    expect(screen.getByRole('heading', { level: 1, name: 'Running a game' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toContain('Scene tracker')
    expect(screen.getByRole('heading', { level: 2, name: 'Status die' })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Open Games' })).toHaveAttribute('href', '#/games')
  })

  it('says when a topic doesn’t exist', () => {
    page({ topic: 'nope' })
    expect(screen.getByRole('alert')).toHaveTextContent('There\'s no help topic called "nope". See every topic.')
  })

  it('searches: results replace the topic, with the count and highlights, and Enter opens the first', async () => {
    page()
    const search = screen.getByRole('searchbox', { name: 'Search help' })
    await userEvent.type(search, 'set aside')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/^\d+ results? for "set aside"$/)
    const first = screen.getAllByRole('link').find((l) => l.classList.contains('help-result'))!
    expect(first).toHaveTextContent('Set aside')
    expect(first.querySelector('mark')).toHaveTextContent(/set aside/i)
    await userEvent.keyboard('{Enter}')
    expect(window.location.hash).toBe(first.getAttribute('href'))
    expect(search).toHaveValue('')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('says when nothing matches, and an empty search brings the topic back', async () => {
    page()
    const search = screen.getByRole('searchbox', { name: 'Search help' })
    await userEvent.type(search, 'foozle')
    expect(screen.getByText('Nothing matches "foozle". Try a shorter word.')).toBeInTheDocument()
    await userEvent.clear(search)
    expect(screen.getByRole('heading', { level: 1, name: 'Getting started' })).toBeInTheDocument()
  })

  it('focuses search with /, and opens Keyboard shortcuts from the nav', async () => {
    page()
    await userEvent.keyboard('/')
    expect(screen.getByRole('searchbox', { name: 'Search help' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: /^Keyboard shortcuts/ }))
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('on phones: the search and the topic list, then a topic with a way back', () => {
    phoneWidth()
    const { unmount } = page()
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search help' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Help topics' })).getByRole('link', { name: 'Between issues' })).toHaveAttribute('href', '#/help/between-issues')
    unmount()
    page({ topic: 'between-issues' })
    expect(screen.getByRole('link', { name: 'Back to Help' })).toHaveAttribute('href', '#/help')
    expect(screen.getByRole('heading', { level: 1, name: 'Between issues' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('moves focus to a new topic’s title', () => {
    const { rerender } = page({ topic: 'glossary' })
    act(() =>
      rerender(
        <HelpProvider>
          <HelpPage topic="between-issues" />
        </HelpProvider>,
      ),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Between issues' })).toHaveFocus()
  })
})
