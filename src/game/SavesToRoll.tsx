/**
 * Saves to roll (scrpg-aid-designs/settings/spec.md, "Minion and lieutenant saves"): at the top of
 * the GM's table, each save from an Attack waiting for the GM, oldest first. Under Ask each time a
 * row has Roll for me and Enter my roll; with Use my physical dice, only Enter my roll (the pad's
 * own Roll for me is still there).
 */
import { useState } from 'react'
import { DicePad } from '../components/DicePad'
import type { Die } from '../rules/types'
import type { Settings } from '../settings/model'

export interface SaveToRoll {
  id: string
  /** "Burglar 2 (d6, −1 Dazed) saves against 5". */
  text: string
  /** Who saves ("Burglar 2"), and with what die, for the pad. */
  name: string
  die: Die
}

export function SavesToRoll({ saves, mode, onRoll, onEnter }: { saves: readonly SaveToRoll[]; mode: Settings['npcSaves']; onRoll: (id: string) => void; onEnter: (id: string, value: number) => void }) {
  const [entering, setEntering] = useState<string | null>(null)
  if (!saves.length) return null
  return (
    <section className="card gt-saves" aria-labelledby="gt-saves-title">
      <h2 id="gt-saves-title" className="gt-label">
        Saves to roll
      </h2>
      <ol className="gt-saves__list">
        {saves.map((s) => (
          <li key={s.id}>
            {entering === s.id ? (
              <DicePad
                dice={[{ die: s.die, label: s.name }]}
                autoFocus
                onCancel={() => setEntering(null)}
                onRollForMe={() => {
                  setEntering(null)
                  onRoll(s.id)
                }}
                onAccept={([value]) => {
                  setEntering(null)
                  if (value !== undefined) onEnter(s.id, value)
                }}
              />
            ) : (
              <div className="gt-row">
                <span className="gt-grow">{s.text}</span>
                {mode !== 'physical' && (
                  <button type="button" className="button button--small" onClick={() => onRoll(s.id)} aria-label={`Roll for me: ${s.name}`}>
                    Roll for me
                  </button>
                )}
                <button type="button" className="button button--small button--primary" onClick={() => setEntering(s.id)} aria-label={`Enter my roll: ${s.name}`}>
                  Enter my roll
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
