/** What the Games page's cards say about a game (docs/design/game-table/spec.md, section 3). Pure. */
import type { Game } from './model'
import { itemName } from './table'

/** "Round 2 · Maya Reyes is acting", or "Set up, no rounds yet". */
export function sceneLine(game: Game): string {
  if (game.round === 0) return 'Set up, no rounds yet'
  const current = game.turn.current
  return [`Round ${game.round}`, current ? `${itemName(game, current)} is acting` : ''].filter(Boolean).join(' · ')
}

/** The opposition by name, and how much of it is hidden: "Gravelord, Scrap drones, a challenge", "· 1 hidden". */
export function oppositionText(game: Game): { names: string; hidden?: string } | undefined {
  const items = [...game.villains.map((v) => ({ name: itemName(game, { kind: 'villain', id: v.id }), hidden: v.hidden })), ...game.groups.map((g) => ({ name: g.name, hidden: g.hidden })), ...game.challenges.map((c) => ({ name: c.name, hidden: c.hidden }))]
  if (!items.length) return undefined
  const hidden = items.filter((i) => i.hidden).length
  return { names: items.map((i) => i.name).join(', '), ...(hidden ? { hidden: hidden === items.length ? 'all hidden' : `${hidden} hidden` } : {}) }
}
