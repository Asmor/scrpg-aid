/**
 * Choosing a defense against a hit (ruling 65): the hit waits until the hero's owner picks one
 * of its defenses. The default (the largest that doesn't exceed the damage, or else the
 * smallest) starts selected; each choice says how much it blocks.
 */
import { useId, useState } from 'react'
import { blockWith, defaultDefense, defenseText, type Defense } from '../play/defense'
import type { PendingHit } from './model'

export function ChooseDefense({ hit, heroName, defenses, onChoose, disabled = false, describedBy }: { hit: Pick<PendingHit, 'id' | 'by' | 'amount'>; heroName: string; defenses: readonly Defense[]; onChoose: (defenseId: string) => void; disabled?: boolean; describedBy?: string }) {
  const id = useId()
  const [picked, setPicked] = useState<string | undefined>()
  const chosen = defenses.find((d) => d.id === picked) ?? defaultDefense(defenses, hit.amount)
  return (
    <fieldset className="gt-choose-defense">
      <legend>
        {hit.by} hits {heroName} for {hit.amount}. Choose a defense:
      </legend>
      {defenses.map((d) => {
        const { taken, blocked } = blockWith(hit.amount, d)
        return (
          <label key={d.id} className="checkbox" htmlFor={`${id}-${d.id}`}>
            <input id={`${id}-${d.id}`} type="radio" name={id} checked={chosen?.id === d.id} onChange={() => setPicked(d.id)} />
            {defenseText(d)}: blocks {blocked}, {taken} taken
          </label>
        )
      })}
      <button type="button" className="button button--primary button--small" disabled={disabled || !chosen} aria-describedby={describedBy} onClick={() => chosen && onChoose(chosen.id)}>
        Use this defense
      </button>
    </fieldset>
  )
}
