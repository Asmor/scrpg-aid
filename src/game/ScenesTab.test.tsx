import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PopoverGroup } from '../library/Popover'
import { createGame, createScene, type Game } from './model'
import { ScenesTab, type SceneActions } from './ScenesTab'

function game(): Game {
  const g = createGame({ id: 'g' })
  const done = { ...createScene({ id: 'done', name: 'Bank job', state: 'done' }), summary: 'Ended after round 4.' }
  return { ...g, scenes: [done, ...g.scenes, createScene({ id: 'a', name: 'Foundry' }), createScene({ id: 'b', name: 'Throne' })] }
}

function setup(sheets: boolean) {
  const actions: SceneActions = { start: vi.fn(), edit: vi.fn(), plan: vi.fn(), move: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), record: vi.fn(), addAside: vi.fn(), removeAside: vi.fn() }
  render(
    <PopoverGroup>
      <ScenesTab game={game()} actions={actions} sheets={sheets} />
    </PopoverGroup>,
  )
  return actions
}

const items = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name: `More for ${name}` }))
  const labels = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
  await userEvent.keyboard('{Escape}')
  return labels
}

describe('the Scenes tab on a phone', () => {
  it('uses Move up and Move down instead of the handle, within the planned scenes', async () => {
    const actions = setup(true)
    expect(screen.queryByRole('button', { name: 'Move Foundry' })).not.toBeInTheDocument()
    expect(await items('Foundry')).toEqual(['Move down', 'Duplicate', 'Delete…'])
    expect(await items('Throne')).toEqual(['Move up', 'Duplicate', 'Delete…'])
    await userEvent.click(screen.getByRole('button', { name: 'More for Throne' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }))
    expect(actions.move).toHaveBeenCalledWith('b', 2)
    await userEvent.click(screen.getByRole('button', { name: 'More for Foundry' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }))
    expect(actions.move).toHaveBeenCalledWith('a', 3)
  })

  it('offers no menu on a done or current scene', () => {
    setup(true)
    expect(screen.queryByRole('button', { name: 'More for Bank job' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More for Unnamed scene' })).not.toBeInTheDocument()
  })
})

describe('Reference sheet… in the Scenes tab', () => {
  it('is in the current and planned scenes\' menus, not a done one\'s', async () => {
    const referenceSheet = vi.fn()
    const actions: SceneActions = { start: vi.fn(), edit: vi.fn(), plan: vi.fn(), move: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), record: vi.fn(), addAside: vi.fn(), removeAside: vi.fn(), referenceSheet }
    render(
      <PopoverGroup>
        <ScenesTab game={game()} actions={actions} sheets={false} />
      </PopoverGroup>,
    )
    expect(await items('Foundry')).toEqual(['Reference sheet…', 'Duplicate', 'Delete…'])
    expect(await items('Unnamed scene')).toEqual(['Reference sheet…'])
    expect(screen.queryByRole('button', { name: 'More for Bank job' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'More for Throne' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reference sheet…' }))
    expect(referenceSheet).toHaveBeenCalledWith('b')
  })
})

describe('the Scenes tab', () => {
  it('marks rows and offers the handle on planned scenes only, on a desktop', async () => {
    const actions = setup(false)
    expect(screen.getByRole('button', { name: 'Move Foundry' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move Bank job' })).not.toBeInTheDocument()
    expect(await items('Foundry')).toEqual(['Duplicate', 'Delete…'])
    expect(within(screen.getByRole('article', { name: 'Scene 3: Foundry' })).getByText('Next')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Scene 4: Throne' })).queryByText('Next')).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Scene 4: Throne' })).queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start Foundry' }))
    expect(actions.start).toHaveBeenCalledWith('a')
    const done = within(screen.getByRole('article', { name: 'Scene 1: Bank job' }))
    expect(done.getByText('Ended after round 4.')).toBeInTheDocument()
    await userEvent.click(done.getByRole('button', { name: 'Edit the summary of Bank job' }))
    expect(actions.record).toHaveBeenCalledWith('done')
  })
})
