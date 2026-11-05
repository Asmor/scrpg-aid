import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { logByline } from './model'
import { AddChallengeDialog, EditStepsDialog } from './dialogs'
import { DangerResultDialog } from './VillainDialogs'

const button = (name: RegExp) => screen.getByRole('button', { name })

describe('the tracker Overcome result', () => {
  it('suggests failure when the result would need a major twist', async () => {
    const onResult = vi.fn()
    render(<DangerResultDialog name="Gravelord" total={2} onResult={onResult} onClose={vi.fn()} />)
    expect(screen.getByText('Failure, or success with a major twist.')).toBeInTheDocument()
    expect(screen.getByText(/Villains don't take major twists/)).toBeInTheDocument()
    expect(button(/^Failure/)).toHaveClass('button--primary')
    expect(button(/^Failure/)).toHaveFocus()
    expect(button(/^Success/)).not.toHaveClass('button--primary')
    // Still the GM's call.
    await userEvent.click(button(/^Success/))
    expect(onResult).toHaveBeenCalledWith(true)
  })

  it('suggests success otherwise, with the outcome', () => {
    render(<DangerResultDialog name="Gravelord" total={6} onResult={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Success with a minor twist.')).toBeInTheDocument()
    expect(screen.queryByText(/Villains don't take major twists/)).toBeNull()
    expect(button(/^Success/)).toHaveClass('button--primary')
    expect(button(/^Success/)).toHaveFocus()
  })

  it('a spectacular failure suggests failure, with no talk of twists', () => {
    render(<DangerResultDialog name="Gravelord" total={0} onResult={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Spectacular failure.')).toBeInTheDocument()
    expect(screen.queryByText(/major twists/)).toBeNull()
    expect(button(/^Failure/)).toHaveClass('button--primary')
  })

  it('with no total, just asks', () => {
    render(<DangerResultDialog name="Gravelord" total={undefined} onResult={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Gravelord rolled an Overcome.')).toBeInTheDocument()
  })
})

describe('Edit steps', () => {
  it('edits the optional description and "when it\'s done" text along with the steps', async () => {
    const onSave = vi.fn()
    render(<EditStepsDialog name="Furnace" labels={['Step 1']} onSave={onSave} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'It will blow.')
    await userEvent.type(screen.getByLabelText("When it's done (optional)"), 'It sputters out.')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ labels: ['Step 1'], description: 'It will blow.', whenDone: 'It sputters out.' })
  })
})

describe('quick-adding a challenge', () => {
  const add = async (onAdd: ReturnType<typeof vi.fn>) => {
    await userEvent.click(screen.getByRole('button', { name: 'Add to table' }))
    expect(onAdd.mock.calls[0]![0].owner).toBeDefined()
    return onAdd.mock.calls[0]![0].owner
  }

  it('has no owner choice without an environment', async () => {
    const onAdd = vi.fn()
    render(<AddChallengeDialog onAdd={onAdd} onClose={vi.fn()} />)
    expect(screen.queryByRole('checkbox', { name: /Belongs to/ })).toBeNull()
    expect(await add(onAdd)).toEqual({ kind: 'gm' })
  })

  it("with one, belongs to the GM unless it's checked", async () => {
    const onAdd = vi.fn()
    render(<AddChallengeDialog environment="Rooftop Heist" onAdd={onAdd} onClose={vi.fn()} />)
    const box = screen.getByRole('checkbox', { name: 'Belongs to Rooftop Heist' })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(await add(onAdd)).toEqual({ kind: 'environment' })
  })

  it("from the environment's panel, starts checked", () => {
    render(<AddChallengeDialog environment="Rooftop Heist" owned onAdd={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Belongs to Rooftop Heist' })).toBeChecked()
  })
})

describe('logByline', () => {
  it('drops the name when the line opens with it', () => {
    expect(logByline({ by: 'Maya Swift', text: 'Maya Swift rolled 6 to Overcome.' })).toBeUndefined()
    expect(logByline({ by: 'Gravelord', text: "Gravelord's reaction is ready." })).toBeUndefined()
  })
  it('keeps it otherwise', () => {
    expect(logByline({ by: 'GM', text: 'The GM added a challenge.' })).toBe('GM')
    expect(logByline({ by: 'Maya', text: 'Mayanne arrived.' })).toBe('Maya')
  })
})
