/** A hero's six back issue pips: the count now, and the one about to be added dotted (scrpg-aid-designs/issues/spec.md, sections 2 and 3). */
import { BACK_ISSUES_PER_COLLECTION } from '../creation/advancement'

export function BackIssuePips({ count, adding }: { count: number; adding: boolean }) {
  const adds = adding && count < BACK_ISSUES_PER_COLLECTION
  const label = adds ? `${count} of ${BACK_ISSUES_PER_COLLECTION} back issues, ${count + 1} after this` : `${count} of ${BACK_ISSUES_PER_COLLECTION} back issues`
  return (
    <span className="pips" role="img" aria-label={label}>
      {Array.from({ length: BACK_ISSUES_PER_COLLECTION }, (_, i) => (
        <span key={i} className={`pip${i < count ? ' pip--on' : ''}${adds && i === count ? ' pip--new' : ''}`} />
      ))}
    </span>
  )
}
