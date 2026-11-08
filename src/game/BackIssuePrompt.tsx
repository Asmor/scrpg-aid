/**
 * The back issue prompt (scrpg-aid-designs/issues/spec.md, section 3): add a finished issue to a library
 * hero, in its three situations. It changes the library hero, never the game. The Advancement
 * page's Add uses it too, for a hero at five or six.
 */
import { useId, useRef, useState } from 'react'
import { backIssueOffer } from '../advancement/records'
import { BackIssuePips } from '../components/BackIssuePips'
import { Modal } from '../components/Modal'
import { useMediaQuery } from '../components/useMediaQuery'
import { MAX_NAME } from '../session/protocol'
import type { Hero } from '../hero/model'

interface Props {
  number: number
  title: string
  hero: Hero
  issueId: string
  /** Who finished it: the GM's name, or "You". */
  who: string
  gameName: string
  /** Later, unless it's something else here. */
  laterLabel?: string
  /** Adds the back issue; `collection` names a collection to record. */
  onAdd: (collection?: string) => void
  onLater: () => void
}

export function BackIssuePrompt({ number, title, hero, issueId, who, gameName, laterLabel = 'Later', onAdd, onLater }: Props) {
  const id = useId()
  const name = hero.details.name.trim() || 'Your hero'
  const [collection, setCollection] = useState('')
  const { situation, count } = backIssueOffer(hero, issueId)
  const primary = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const six = situation === 'alreadySix' || situation === 'reachesSix'
  const named = collection.trim()
  const heading = situation === 'alreadySix' ? `${name} already has six back issues` : `Add "${title}" to ${name}'s back issues?`
  const finished = who === 'You' ? 'You finished' : `${who} finished`
  const body = situation === 'alreadySix' ? `${finished} "${title}". Record the six as a collection first, then this issue becomes back issue 1 of the next one.` : situation === 'reachesSix' ? `${finished} the issue. It becomes ${name}'s sixth back issue, from ${gameName}.` : `${finished} the issue. It becomes back issue ${count + 1}, from ${gameName}.`
  // On phones a bottom sheet with its buttons stacked, the primary last, by the thumb (scrpg-aid-designs/issues/spec.md, section 8a).
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  return (
    <Modal title={heading} onClose={onLater} initialFocus={six ? field : primary} variant={phone ? 'sheet' : 'dialog'}>
      <div className="gt-end__over">END OF ISSUE {number}</div>
      <p>{body}</p>
      <BackIssuePips count={count} adding />
      {six && (
        <div className="gt-issue-box">
          <strong>{situation === 'alreadySix' ? 'Record a collection first.' : 'That makes six.'}</strong>
          <p className="gt-sub">Name a collection with your group. The six back issues move into it and the count starts again.</p>
          <label className="field" htmlFor={`${id}-collection`}>
            <span>Collection name</span>
            <input ref={field} id={`${id}-collection`} type="text" maxLength={MAX_NAME} value={collection} onChange={(e) => setCollection(e.target.value)} />
          </label>
        </div>
      )}
      <p className="gt-sub">This changes {name} in your library, not the game. You can edit or remove it on the Advancement page.</p>
      <div className={phone ? 'gt-dialog-actions gt-dialog-actions--stack' : 'button-row gt-dialog-actions'}>
        <button type="button" className="button" onClick={onLater}>
          {laterLabel}
        </button>
        {situation === 'reachesSix' && (
          <button type="button" className="button" onClick={() => onAdd()}>
            Just add it
          </button>
        )}
        {six && !named && (
          <span id={`${id}-needs`} className="visually-hidden">
            Needs a collection name
          </span>
        )}
        <button ref={primary} type="button" className="button button--primary" disabled={six && !named} aria-describedby={six && !named ? `${id}-needs` : undefined} onClick={() => onAdd(six ? named : undefined)}>
          {situation === 'alreadySix' ? 'Record collection and add' : situation === 'reachesSix' ? 'Add and record collection' : 'Add back issue'}
        </button>
      </div>
    </Modal>
  )
}
