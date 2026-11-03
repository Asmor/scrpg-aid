/**
 * Defenses (ruling 65; Core Rules p. 19, 24–29). Each Defend gives its target a single-use
 * defense that blocks up to its value of one instance of damage. A target can hold several:
 * exactly one is used against each hit, never optional. The target's owner picks which; by
 * default, the largest that doesn't exceed the damage, or else the smallest. A defense blocks
 * only damage, not an attack's other effects. Unused ones are lost when the defended
 * character's next turn starts. Pure.
 */
import type { Clock } from './state'

export interface Defense {
  id: string
  /** How much damage it blocks. */
  value: number
  /** Who gave it ("Maya Reyes", or the target itself). */
  from: string
}

/** Anything that can hold defenses: a hero's or villain's play state, or a group member. */
export interface Defended {
  defenses?: Defense[]
}

export const defensesOf = (d: Defended): Defense[] => d.defenses ?? []

/** The default defense against `damage`: the largest that doesn't exceed it, or else the smallest. */
export function defaultDefense(defenses: readonly Defense[], damage: number): Defense | undefined {
  const fits = defenses.filter((d) => d.value <= damage)
  if (fits.length) return fits.reduce((a, d) => (d.value > a.value ? d : a))
  return defenses.length ? defenses.reduce((a, d) => (d.value < a.value ? d : a)) : undefined
}

/** The defense used against `damage`: the one chosen if it's still there, or else the default. */
export function pickDefense(defenses: readonly Defense[], damage: number, chosenId?: string): Defense | undefined {
  return defenses.find((d) => d.id === chosenId) ?? defaultDefense(defenses, damage)
}

/** A hit after its defense: the damage that gets through, and how much was blocked. */
export function blockWith(damage: number, defense: Defense | undefined): { taken: number; blocked: number } {
  const blocked = defense ? Math.min(defense.value, damage) : 0
  return { taken: damage - blocked, blocked }
}

/** " (Defend 5 blocked 5, 3 taken)", or "" without a defense: for a hit's log line. */
export function blockText(damage: number, defense: Defense | undefined): string {
  if (!defense) return ''
  const { taken, blocked } = blockWith(damage, defense)
  return ` (Defend ${defense.value} blocked ${blocked}, ${taken} taken)`
}

/** Adds a defense; a value of 0 or less blocks nothing, so none is added. */
export function addDefense<D extends Defended>(d: D, value: number, from: string, clock: Clock): D {
  if (!Number.isInteger(value) || value <= 0) return d
  return { ...d, defenses: [...defensesOf(d), { id: clock.newId(), value, from }] }
}

/** Uses up (or removes) one defense. */
export function removeDefense<D extends Defended>(d: D, id: string): D {
  if (!defensesOf(d).some((x) => x.id === id)) return d
  const rest = defensesOf(d).filter((x) => x.id !== id)
  if (rest.length) return { ...d, defenses: rest }
  const { defenses: _, ...without } = d
  return without as D
}

/** Drops every defense (the defended character's turn starts). */
export function clearDefenses<D extends Defended>(d: D): D {
  if (!d.defenses) return d
  const { defenses: _, ...without } = d
  return without as D
}

/** "Defend 5", "Defend 5 from Maya Reyes". */
export const defenseText = (d: Defense, self?: string) => `Defend ${d.value}${d.from && d.from !== self ? ` from ${d.from}` : ''}`
