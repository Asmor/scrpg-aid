/**
 * The "Comes with" block (the villain wizard spec, sections 2 and 5): the templates attached to a
 * villain, each linking to its template in the library. One deleted from the library says so.
 */
import type { MouseEvent } from 'react'
import { templatePath } from '../app/route'
import { DiceText } from '../components/icons'
import type { AttachedInfo } from './useAttached'

export function ComesWithList({ items, onFollow }: { items: readonly AttachedInfo[]; onFollow?: (path: string) => (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <ul className="vw-comes-with">
      {items.map((a) => {
        const path = templatePath(a.attachment.kind, a.attachment.templateId)
        return (
          <li key={`${a.attachment.role}:${a.attachment.templateId}`} className={a.missing ? 'placeholder' : undefined}>
            {a.missing ? (
              <>
                <strong>{a.label}</strong> <span className="hint">{a.line}</span>
              </>
            ) : (
              <a href={path} {...(onFollow ? { onClick: onFollow(path) } : {})}>
                <DiceText text={a.label} />
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
