import { afterEach, describe, expect, it, vi } from 'vitest'
import { cssString, defaultPageSize, pageRules, printSheet } from './print'

afterEach(() => document.head.querySelectorAll('style[data-print]').forEach((s) => s.remove()))

describe('printSheet', () => {
  it('prints with the paper size and the name in the footer, then removes them', () => {
    let during = ''
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      during = document.head.querySelector('style[data-print]')?.textContent ?? ''
    })
    printSheet('Maya Reyes', 'a4')
    expect(print).toHaveBeenCalledOnce()
    expect(during).toBe('@page { size: A4; @bottom-left { content: "Maya Reyes"; } }')
    window.dispatchEvent(new Event('afterprint'))
    expect(document.head.querySelector('style[data-print]')).toBeNull()
    print.mockRestore()
  })

  it('clears rules left by a print that never finished', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    printSheet('A', 'letter')
    printSheet('B', 'a4')
    const left = document.head.querySelectorAll('style[data-print]')
    expect(left).toHaveLength(1)
    expect(left[0]!.textContent).toContain('"B"')
    print.mockRestore()
  })

  it('writes Letter, and keeps a name from breaking out of its CSS string', () => {
    expect(pageRules('x', 'letter')).toContain('size: letter;')
    expect(cssString('Dr. "Q" \\ the\nGreat')).toBe('"Dr. \\"Q\\" \\\\ the Great"')
    expect(cssString('</style>')).toBe('"\\3c /style>"')
  })

  it('picks the usual paper for the locale', () => {
    expect(defaultPageSize('en-US')).toBe('letter')
    expect(defaultPageSize('en-GB')).toBe('a4')
    expect(defaultPageSize(undefined)).toBe('letter')
  })
})
