/**
 * An option's source and page, in italics right after its name: "Anachronistic *Core Rules, p. 53*"
 * (scrpg-aid-designs/hero-wizard/spec.md, "Step anatomy", item 2). Built from the entry's own
 * book and page in data/, so another book's entries name that book.
 */
import { formatEntryRef } from '../rules/books'
import type { PageRef } from '../rules/types'

export function SourceRef({ of }: { of: PageRef | undefined }) {
  if (!of) return null
  return (
    <>
      {' '}
      <cite className="source-ref">{formatEntryRef(of)}</cite>
    </>
  )
}
