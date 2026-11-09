/**
 * A hero that's already in the game (scrpg-aid-designs/game-table/spec.md, section 7): someone else
 * holds the hero this player joined with, so they choose to take it over, join with their own
 * copy (the primary choice, which changes nothing for anyone else), or choose a different hero.
 */
import { useRef } from 'react'
import { Modal } from '../components/Modal'
import type { HeldBy } from './protocol'
import { heldText } from './refused'

export interface HeldHeroDialogProps {
  hero: string
  held: HeldBy
  onTakeOver: () => void
  onOwnCopy: () => void
  onChooseAnother: () => void
  onCancel: () => void
}

/** "Alex" or "The GM", for the descriptions. */
const holder = (held: HeldBy) => (held.by === 'gm' ? 'The GM' : held.name || 'Another player')

export function HeldHeroDialog({ hero, held, onTakeOver, onOwnCopy, onChooseAnother, onCancel }: HeldHeroDialogProps) {
  const primary = useRef<HTMLButtonElement>(null)
  const choice = (title: string, detail: string, onClick: () => void, ref?: typeof primary) => (
    <button ref={ref} type="button" className={ref ? 'held-choice held-choice--primary' : 'held-choice'} onClick={onClick}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </button>
  )
  return (
    <Modal title={`${hero} is already in ${held.game}`} onClose={onCancel} initialFocus={primary}>
      <p>{heldText(held, hero)}</p>
      <div className="held-choices">
        {choice(`Take over ${hero}`, `You play ${hero} from now on, as they are in this game. ${holder(held)} will be told.`, onTakeOver)}
        {choice('Join with my own copy', `Adds a separate copy of ${hero} to your library and joins with it. You'll both have a ${hero}.`, onOwnCopy, primary)}
        {choice('Choose a different hero', 'Back to your heroes.', onChooseAnother)}
      </div>
      <div className="button-row">
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
