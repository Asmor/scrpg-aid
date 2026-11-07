/**
 * New code… (scrpg-aid-designs/game-table/game-table-spec-addendum-game-codes.md): the GM gets a new
 * code for the game so someone with the old code, link or QR code can't get back in. While
 * hosting, the GM picks who comes along (connected players and screens, all checked to start);
 * the others are removed. Players who are away keep their place and need the new code.
 */
import { useId, useRef, useState } from 'react'
import { Modal } from '../components/Modal'
import { awayLine } from './new-code-text'

/** A connected player or screen the GM can keep. */
export interface Keepable {
  clientId: string
  /** "Alex · Maya Reyes", or a screen's name. */
  label: string
}

interface Props {
  code: string
  /** Connected players and screens; undefined when not hosting. */
  people?: readonly Keepable[]
  /** Names of players who are away. */
  away?: readonly string[]
  onConfirm: (keep: ReadonlySet<string>) => void
  onClose: () => void
}

export function NewCodeDialog({ code, people, away = [], onConfirm, onClose }: Props) {
  const id = useId()
  const [keep, setKeep] = useState(() => new Set((people ?? []).map((p) => p.clientId)))
  const first = useRef<HTMLInputElement>(null)
  return (
    <Modal title="Get a new code?" onClose={onClose} {...(people?.length ? { initialFocus: first } : {})}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(keep)
          onClose()
        }}
      >
        <p>
          The old code <span className="gt-code">{code}</span> stops working, and links and QR codes made with it stop too.
        </p>
        {people === undefined ? (
          <p className="hint">You're not hosting this game, so everyone will need the new code from you.</p>
        ) : (
          <>
            {people.length > 0 && (
              <fieldset className="gt-keep">
                <legend className="gt-label">Keep these players</legend>
                {people.map((p, i) => (
                  <label key={p.clientId} className="gt-row" htmlFor={`${id}-${i}`}>
                    <input
                      id={`${id}-${i}`}
                      ref={i === 0 ? first : undefined}
                      type="checkbox"
                      checked={keep.has(p.clientId)}
                      onChange={(e) =>
                        setKeep((k) => {
                          const next = new Set(k)
                          if (e.target.checked) next.add(p.clientId)
                          else next.delete(p.clientId)
                          return next
                        })
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </fieldset>
            )}
            <p className="hint">
              {people.length > 0 && 'Checked players are moved to the new code without noticing. Unchecked ones are removed. '}
              {awayLine(away)}
            </p>
          </>
        )}
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary">
            Get new code
          </button>
        </div>
      </form>
    </Modal>
  )
}
