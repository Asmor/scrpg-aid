import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayPage } from '../components/HeroPage'
import { completeHero } from '../test/heroes'
import { PlayProviders } from '../test/play'
import { playStores, seedHero } from '../test/play-stores'

let n = 0
const clock = () => ({ now: new Date(), newId: () => `id${++n}` })

/** A screen `width` px wide, as far as min-width media queries go; `resize` changes it and tells the listeners. */
let width = 390
const listeners = new Set<() => void>()
function phone() {
  width = 390
  listeners.clear()
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return {
      get matches() {
        return min ? width >= Number(min[1]) : false
      },
      media: query,
      addEventListener: (_: string, f: () => void) => listeners.add(f),
      removeEventListener: (_: string, f: () => void) => listeners.delete(f),
    }
  })
}
const resize = (to: number) =>
  act(() => {
    width = to
    listeners.forEach((f) => f())
  })

afterEach(() => vi.unstubAllGlobals())

async function setup() {
  phone()
  const store = playStores()
  await seedHero(store, { ...completeHero(), id: 'h1', play: { health: 17, heroPoints: 2, reactionUsed: false, mods: [], twists: [], history: [] } })
  render(
    <PlayProviders stores={store}>
      <PlayPage id="h1" clock={clock} />
    </PlayProviders>,
  )
  return within(await screen.findByRole('region', { name: 'At a glance' }))
}

describe('Play on a phone', () => {
  it('has a top bar with Health, the zone, the status die and hero points, and −1/+1', async () => {
    const bar = await setup()
    expect(bar.getByText('17')).toBeInTheDocument()
    expect(bar.getByText('Yellow')).toHaveClass('zone-chip')
    expect(bar.getByRole('img', { name: 'd8' })).toBeInTheDocument()
    expect(bar.getByText('2')).toBeInTheDocument()
    expect(bar.getByText('Scene Green · you Yellow')).toBeInTheDocument()
    await userEvent.click(bar.getByRole('button', { name: 'Lose 1 Health' }))
    expect(bar.getByText('16')).toBeInTheDocument()
  })

  it('splits Play into Actions, Status and History tabs', async () => {
    await setup()
    const tabs = within(screen.getByRole('tablist', { name: 'Play' }))
    expect(tabs.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Actions' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Bonuses and penalties' })).not.toBeInTheDocument()

    await userEvent.click(tabs.getByRole('tab', { name: 'Status' }))
    expect(screen.getByRole('region', { name: 'Bonuses and penalties' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Twists' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Actions' })).not.toBeInTheDocument()

    await userEvent.click(tabs.getByRole('tab', { name: 'History' }))
    expect(screen.getByRole('region', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs.getByRole('tab', { name: 'History' }).id)
  })

  it('moves between tabs with the arrow keys, one tab in the Tab order', async () => {
    await setup()
    const tabs = within(screen.getByRole('tablist', { name: 'Play' }))
    const actions = tabs.getByRole('tab', { name: 'Actions' })
    expect(actions).toHaveAttribute('tabindex', '0')
    expect(tabs.getByRole('tab', { name: 'Status' })).toHaveAttribute('tabindex', '-1')
    actions.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tabs.getByRole('tab', { name: 'Status' })).toHaveFocus()
    expect(tabs.getByRole('tab', { name: 'Status' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{End}')
    expect(tabs.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowRight}')
    expect(tabs.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps an open roll when the phone turns past 760px', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Use Always on the Move' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Roll' }))
    expect(dialog.getByRole('listitem', { current: 'step' })).toHaveTextContent('Results')
    resize(844)
    expect(screen.queryByRole('region', { name: 'At a glance' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('listitem', { current: 'step' })).toHaveTextContent('Results')
  })

  it('shows abilities as compact rows, tapping a name for its text', async () => {
    await setup()
    const actions = within(screen.getByRole('region', { name: 'Actions' }))
    const name = actions.getByRole('button', { name: 'Always on the Move' })
    expect(name).toHaveAttribute('aria-expanded', 'false')
    const text = document.getElementById(name.getAttribute('aria-controls')!)!
    expect(text).not.toBeVisible()
    await userEvent.click(name)
    expect(name).toHaveAttribute('aria-expanded', 'true')
    expect(text).toBeVisible()
    expect(text).toHaveTextContent(/Defend yourself using your Min die/)
    expect(actions.getByRole('button', { name: 'Use Always on the Move' })).toBeInTheDocument()
  })
})
