import { describe, expect, it } from 'vitest'
import { books, findBook, formatPageRef } from './books'

describe('books', () => {
  it('loads the book registry from data/', () => {
    expect(books.map((b) => b.id)).toContain('core-rules')
  })

  it('finds a book by id', () => {
    expect(findBook('core-rules')?.title).toMatch(/Core Rules/)
    expect(findBook('nope')).toBeUndefined()
  })

  it('formats page references with the book name', () => {
    expect(formatPageRef('core-rules', 72)).toBe('Core Rules, p. 72')
    expect(formatPageRef('core-rules', [157, 158])).toBe('Core Rules, pp. 157, 158')
    expect(formatPageRef('core-rules', [157])).toBe('Core Rules, p. 157')
  })

  it('falls back to the id for an unknown book', () => {
    expect(formatPageRef('mystery', 3)).toBe('mystery, p. 3')
  })
})
