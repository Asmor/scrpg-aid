import booksData from '../../data/books.json'
import type { PageRef } from './types'

export interface Book {
  id: string
  title: string
  shortTitle: string
}

export const books: readonly Book[] = booksData.books

/** Looks up a source book by id. Returns undefined for an unknown id. */
export function findBook(id: string): Book | undefined {
  return books.find((b) => b.id === id)
}

/** A page reference as players see it, e.g. "Core Rules, p. 72". */
export function formatPageRef(bookId: string, page: number | readonly [number, ...number[]]): string {
  const short = findBook(bookId)?.shortTitle ?? bookId
  const list = typeof page === 'number' ? [page] : page
  const pages = list.length === 1 ? `p. ${list[0]}` : `pp. ${list.join(', ')}`
  return `${short}, ${pages}`
}

/** Formats a data entry's page reference, preferring its full `pages` list when it has one. */
export function formatEntryRef(ref: PageRef): string {
  const [first, ...rest] = ref.pages?.length ? ref.pages : ref.page !== undefined ? [ref.page] : []
  if (first === undefined) return findBook(ref.book)?.shortTitle ?? ref.book
  return formatPageRef(ref.book, [first, ...rest])
}
