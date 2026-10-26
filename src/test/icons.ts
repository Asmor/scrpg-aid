/**
 * Stand-in embedded icons for export tests: each icon's name as a data URI. Built without
 * ../transfer/icons so tests that mock that module can use it.
 */
import { DICE, type IconName } from '../components/icon-source'
import { ACTIONS } from '../creation/effects'

export const TEST_ICONS = Object.fromEntries(
  [...DICE.map((d) => `die/${d}`), ...ACTIONS.map((a) => `action/${a}`)].map((n) => [n, `data:image/png;base64,${btoa(n)}`]),
) as Record<IconName, string>
