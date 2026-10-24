/** Small text formatters for the sheet. */
import type { BasicAction } from '../rules/types'

const capitalized = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`

/** What a Modular mode rules out, e.g. "Can't Boost, Defend, or Overcome. Can't move." */
export function modeLimits(cannot: readonly BasicAction[], immobile: boolean): string {
  const actions = cannot.map(capitalized)
  const list = actions.length > 2 ? `${actions.slice(0, -1).join(', ')}, or ${actions.at(-1)}` : actions.join(' or ')
  return [actions.length ? `Can't ${list}.` : '', immobile ? "Can't move." : ''].filter(Boolean).join(' ')
}
