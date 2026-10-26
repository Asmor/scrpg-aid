/**
 * The sheet's one dice table: powers, qualities, and status dice side by side (six columns:
 * Power and die, Quality and die, Status and die), with Green, Yellow, and Red status in the
 * first three rows. Shared by the on-screen sheet and every export.
 */
import type { Die, Zone } from '../rules/types'
import type { HeroSheet } from './sheet'
import type { HeroTrait } from './traits'

export interface DiceTableRow {
  power?: HeroTrait
  quality?: HeroTrait
  /** Set on the first three rows; `die` is missing until the hero has a personality. */
  status?: { zone: Zone; die?: Die }
}

const ZONES: readonly Zone[] = ['green', 'yellow', 'red']

export function diceTableRows(sheet: Pick<HeroSheet, 'powers' | 'qualities' | 'statusDice'>): DiceTableRow[] {
  const count = Math.max(sheet.powers.length, sheet.qualities.length, ZONES.length)
  return Array.from({ length: count }, (_, i) => {
    const zone = ZONES[i]
    return {
      ...(sheet.powers[i] ? { power: sheet.powers[i] } : {}),
      ...(sheet.qualities[i] ? { quality: sheet.qualities[i] } : {}),
      ...(zone ? { status: sheet.statusDice ? { zone, die: sheet.statusDice[zone] } : { zone } } : {}),
    }
  })
}
