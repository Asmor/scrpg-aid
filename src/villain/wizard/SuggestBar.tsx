/**
 * Suggest 3 on a step's Choose list (the villain wizard spec, section 4): off, a Suggest 3 button
 * beside the heading; on, a dashed bar saying it's unofficial, with Re-roll and Show all N. The bar
 * is a status region; a re-roll keeps focus on Re-roll and announces the new suggestions.
 */
import { useState } from 'react'
import type { SuggestStep } from '../model'
import { drawSuggestions, rerollAnnouncement, SUGGEST_NOUN, type Random } from '../suggest'

/** Each step's Suggest 3 state: its three ids while on. A draft saves them; editing a finished villain keeps them for the visit. */
export interface SuggestState {
  ids: (step: SuggestStep) => readonly string[] | undefined
  set: (step: SuggestStep, ids: string[] | undefined) => void
  random: Random
}

function DiceGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="16" cy="16" r="1.3" fill="currentColor" />
    </svg>
  )
}

interface Props {
  step: SuggestStep
  suggest: SuggestState
  /** Every option on the list, in order. */
  all: readonly { id: string; name: string }[]
  /** What's chosen (every checked upgrade in step 4): kept visible, and not drawn in step 4. */
  picked: readonly string[]
}

/** The button that turns Suggest 3 on, for beside the Choose heading. */
export function SuggestButton({ step, suggest, all, picked }: Props) {
  if (suggest.ids(step)) return null
  return (
    <button type="button" className="button button--small vw-suggest-button" onClick={() => suggest.set(step, drawSuggestions(all.map((o) => o.id), suggest.random, step === 'upgrades' ? picked : []))}>
      <DiceGlyph />
      Suggest 3
    </button>
  )
}

/** The bar shown while Suggest 3 is on. */
export function SuggestBar({ step, suggest, all, picked }: Props) {
  const [announced, setAnnounced] = useState('')
  const ids = suggest.ids(step)
  if (!ids) return null
  const noun = SUGGEST_NOUN[step]
  const reroll = () => {
    const next = drawSuggestions(
      all.map((o) => o.id),
      suggest.random,
      step === 'upgrades' ? picked : [],
    )
    suggest.set(step, next)
    setAnnounced(rerollAnnouncement(next.map((id) => all.find((o) => o.id === id)?.name ?? id)))
  }
  return (
    <div className="vw-suggestbar" role="status">
      <span>
        Showing 3 random {noun}
        {step === 'upgrades' ? ", plus any you've already checked" : ''}. Not official, just for inspiration.
      </span>
      <span className="visually-hidden">{announced}</span>
      <span className="vw-suggestbar__actions">
        <button type="button" className="button button--small" onClick={reroll}>
          Re-roll
        </button>
        <button type="button" className="button button--small" onClick={() => suggest.set(step, undefined)}>
          Show all {all.length}
        </button>
      </span>
    </div>
  )
}
