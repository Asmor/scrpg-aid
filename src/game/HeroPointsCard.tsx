/**
 * Spending hero points between issues (scrpg-aid-designs/issues/spec.md, section 4a): buy generic,
 * exclusive bonuses for the next issue, each costing its size (ruling 70), and take them back until
 * it starts. On a player's panel: the GM's own heroes are NPCs, with no hero points.
 */
import { HelpTip } from '../help/HelpTip'
import type { PlayState } from '../hero/model'
import { heroPointsLeft } from '../play/state'

/** Where a reminder sends focus. */
export const HERO_POINTS_ID = 'gt-hero-points'

interface Props {
  /** The game's hero points. */
  total: number
  play: Pick<PlayState, 'heroPointBuys'>
  /** The issue they're for. */
  issue: number
  /** Who starts it: "Sam", "you". */
  gmName: string
  disabled?: boolean
  onBuy: (size: number) => void
  onReturn: (buyId: string) => void
}

export function HeroPointsCard({ total, play, issue, gmName, disabled = false, onBuy, onReturn }: Props) {
  const buys = play.heroPointBuys ?? []
  const left = heroPointsLeft(total, play)
  const heading = (
    <>
      <h3 id={HERO_POINTS_ID} tabIndex={-1} className="gt-grow gt-points__head">
        Hero points
      </h3>
      <HelpTip tip="heroPoints" />
    </>
  )
  if (total === 0) {
    return (
      <section className="gt-points" aria-labelledby={HERO_POINTS_ID}>
        {heading}
        <p className="gt-sub">No hero points to spend.</p>
      </section>
    )
  }
  return (
    <section className="gt-points" aria-labelledby={HERO_POINTS_ID}>
      <div className="gt-row">
        {heading}
        <span className="gt-points__left" role="img" aria-label={`${left} of ${total} hero points left`}>
          {left}
        </span>
      </div>
      <p className="gt-sub">
        Buy bonuses for issue {issue}. A bonus costs its size. Each one is exclusive and used up when you use it. Points you don't spend are lost when {gmName} {gmName === 'you' ? 'start' : 'starts'} issue {issue}.
      </p>
      <div className="gt-row" role="group" aria-label="Buy a bonus">
        {Array.from({ length: total }, (_, i) => i + 1).map((size) => (
          <button key={size} type="button" className="button button--small gt-points__buy" disabled={disabled || size > left} aria-label={`Buy a +${size} bonus for ${size} ${size === 1 ? 'point' : 'points'}`} onClick={() => onBuy(size)}>
            +{size}
          </button>
        ))}
      </div>
      <div className="gt-row">
        <span className="gt-sub">For issue {issue}:</span>
        {buys.length === 0 ? (
          <span className="gt-sub">nothing yet</span>
        ) : (
          <ul className="gt-chips">
            {buys.map((b) => (
              <li key={b.id} className="gt-mod">
                +{b.size}
                <button type="button" className="gt-chip-x" disabled={disabled} aria-label={`Return the +${b.size} bonus`} onClick={() => onReturn(b.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="gt-sub">You can change these until the issue starts.</p>
    </section>
  )
}
