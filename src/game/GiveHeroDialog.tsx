/**
 * Give to… (scrpg-aid-designs/game-table/spec.md, section 7): the GM hands a hero to a connected
 * player who has none (theirs was taken over), or back to the GM, to undo a mistaken takeover.
 */
import { Modal } from '../components/Modal'
import type { Unseated } from '../session/host'

export interface GiveHeroDialogProps {
  hero: string
  /** Connected players without a hero. */
  players: readonly Unseated[]
  /** Whether the GM is a choice: not when the GM already runs the hero. */
  toGm: boolean
  onGive: (clientId: string | undefined) => void
  onClose: () => void
}

export function GiveHeroDialog({ hero, players, toGm, onGive, onClose }: GiveHeroDialogProps) {
  const give = (clientId: string | undefined) => {
    onGive(clientId)
    onClose()
  }
  return (
    <Modal title={`Give ${hero} to…`} onClose={onClose}>
      {players.length === 0 && !toGm ? (
        <p>No one to give {hero} to: every connected player has a hero.</p>
      ) : (
        <ul className="give-list">
          {players.map((p) => (
            <li key={p.clientId}>
              <button type="button" className="button" onClick={() => give(p.clientId)}>
                {p.name}
              </button>
            </li>
          ))}
          {toGm && (
            <li>
              <button type="button" className="button" onClick={() => give(undefined)}>
                The GM
              </button>
            </li>
          )}
        </ul>
      )}
      <p className="hint">Whoever has {hero} now is told. Only connected players without a hero are listed.</p>
      <div className="button-row">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
