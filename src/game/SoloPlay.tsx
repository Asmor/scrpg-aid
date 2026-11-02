/**
 * The parts of a standalone Play page that come from its solo game
 * (docs/design/game-table/spec.md, section 12): the "Solo play" chip and the ⋯ menu with Start
 * over…, and the line naming the other games the character is in.
 */
import { useState } from 'react'
import { gamePath } from '../app/route'
import { Modal } from '../components/Modal'
import { gameDisplayName, type Game } from './model'
import { MenuButton } from './TableCenter'

/** "Solo play" and the Play page's ⋯ menu. */
export function SoloPlayActions({ name, onStartOver, clears = 'mods, twists, hero points, minions, form and the play log are cleared' }: { name: string; onStartOver: () => void; clears?: string }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <span className="gt-pill solo-chip">Solo play</span>
      <MenuButton label={`More for ${name}'s Play page`} items={[{ label: 'Start over…', onSelect: () => setConfirm(true) }]} sheets={false} />
      {confirm && (
        <Modal title="Start over?" onClose={() => setConfirm(false)}>
          <p>Health goes back to max, and {clears}. The sheet isn't touched.</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                onStartOver()
                setConfirm(false)
              }}
            >
              Yes, start over
            </button>
            <button type="button" className="button" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

/** "Maya Reyes is also in Thursday game. What happens here doesn't affect that game." */
export function AlsoIn({ name, games }: { name: string; games: readonly Game[] }) {
  if (!games.length) return null
  const links = games.map((g, i) => (
    <span key={g.id}>
      {i > 0 && (i === games.length - 1 ? ' and ' : ', ')}
      <a href={gamePath(g.id)}>{gameDisplayName(g)}</a>
    </span>
  ))
  return (
    <p className="hint solo-also">
      {name} is also in {links}. What happens here doesn't affect {games.length === 1 ? 'that game' : 'those games'}.
    </p>
  )
}
