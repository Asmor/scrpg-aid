import booksData from '../../data/books.json'

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
