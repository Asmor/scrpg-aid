import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { villainArchetypesById } from '../rules/villain-data'
import type { VillainStatusRule } from '../rules/villain-types'
import { statusDetailLines, statusSummary } from './status'
import { StatusRuleText } from './StatusRule'

const rule = (id: string) => villainArchetypesById.get(id)!.status

describe('a villain’s status rule', () => {
  it('sums each kind of rule up in a line', () => {
    expect(statusSummary(rule('bruiser'))).toBe('Status follows its Health zone.')
    expect(statusSummary(rule('domain'))).toMatch(/^Status depends on the number of /)
    expect(statusSummary(rule('indomitable'))).toBe('Status: d8, always.')
    expect(statusSummary(rule('formidable'))).toBe('Status depends on penalties related to its weakness.')
    expect(statusSummary(rule('titan'))).toBe('Status starts at d12 and drops as its challenge is completed.')
  })

  it('lists count tiers: or more, a single number, and a range', () => {
    const counted: VillainStatusRule = { basis: 'count', counts: 'minions', tiers: [{ min: 4, die: 'd12' }, { min: 2, max: 3, die: 'd10' }, { min: 1, max: 1, die: 'd8' }] }
    render(<StatusRuleText rule={counted} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['4 or more: ', '2–3: ', '1: '])
    expect(screen.getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['d12', 'd10', 'd8'])
  })

  it('lists weakness tiers and the Titan’s challenge', () => {
    const { unmount } = render(<StatusRuleText rule={rule('formidable')} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    unmount()
    render(<StatusRuleText rule={rule('titan')} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringMatching(/\(2 successes\)$/), expect.stringMatching(/\(1 success\)$/)])
  })

  it('shows a fixed die', () => {
    render(<StatusRuleText rule={rule('indomitable')} />)
    expect(screen.getByRole('img', { name: 'd8' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('statusDetailLines', () => {
  it('gives each rule’s details as text, for the sheet and the exports', () => {
    expect(statusDetailLines(rule('bruiser'))).toEqual(['Green d6, Yellow d8, Red d10'])
    expect(statusDetailLines(rule('indomitable'))).toEqual([])
    expect(statusDetailLines(rule('titan'))[1]).toMatch(/\(1 success\)$/)
    expect(statusDetailLines(rule('formidable'))).toHaveLength(3)
  })
})
