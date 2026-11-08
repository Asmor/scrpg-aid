/**
 * A dialog section that folds on phones (scrpg-aid-designs/issues/spec.md, section 8a): there it's a
 * <details> with the heading and a count in its summary; elsewhere a plain section with its heading.
 */
import type { ReactNode } from 'react'

interface Props {
  fold: boolean
  id: string
  title: string
  /** Shown after the title when folded: "3", "5 on". */
  count?: string
  /** Folded, whether it starts open. */
  open?: boolean
  className?: string
  children: ReactNode
}

export function Fold({ fold, id, title, count, open = false, className = '', children }: Props) {
  if (!fold) {
    return (
      <section className={className} aria-labelledby={id}>
        <h3 id={id}>{title}</h3>
        {children}
      </section>
    )
  }
  return (
    <details className={`fold ${className}`} {...(open ? { open: true } : {})}>
      <summary>
        <h3 id={id}>{title}</h3>
        {count !== undefined && <span className="gt-sub">{count}</span>}
      </summary>
      <div className="fold__body">{children}</div>
    </details>
  )
}
