/**
 * What the villain wizard's steps share that isn't a component: the props every step gets, how
 * the villain's traits fill ability slots, and the changes that clear choices (a new approach or
 * archetype).
 */
import { candidatesFor } from '../../creation/abilities'
import type { SlotFilling } from '../../editor/AbilityPicker'
import type { TraitRef } from '../../rules/catalog'
import type { TraitSlot } from '../../rules/slots'
import type { Villain, VillainAbilityPick, VillainAbilitySource } from '../model'
import { villainTraitLabel, villainTraits } from '../sheet'

export type VillainUpdate = (change: (draft: Villain) => void) => void

/** Asks before a change that clears choices (changing the approach, say), then makes it. */
export type Confirm = (ask: { title: string; body: string; confirm: string; onConfirm: () => void }) => void

export interface StepProps {
  villain: Villain
  update: VillainUpdate
  confirm: Confirm
}

/** The villain's traits filling ability slots. Villains never limit a slot (that's heroes' Red abilities). */
export function villainFilling(villain: Villain): SlotFilling {
  const traits = villainTraits(villain).traits
  return {
    candidates: (slot: TraitSlot) => candidatesFor(traits, slot),
    label: (t: TraitRef) => villainTraitLabel(villain, t),
  }
}

/** Replaces the picks from one source, keeping the rest. */
export const withPicks = <P extends VillainAbilityPick>(all: readonly P[], source: VillainAbilitySource, picks: readonly P[]) => [...all.filter((p) => p.source !== source), ...picks]

/** "Choose 2 · 1 chosen" */
export function chosenCount(count: number, chosen: number): string {
  return `Choose ${count} · ${chosen} chosen`
}

/** Whether choosing another approach would clear anything. */
export function approachHasChoices(villain: Villain): boolean {
  const a = villain.approach
  return Boolean(a && (a.traits.length || a.abilities.length || villain.upgrades.some((u) => u.extra?.some((p) => p.source === 'approach'))))
}

/** Sets the approach, clearing the old one's dice and abilities (and abilities taken from its list for an upgrade). The roleplaying name stays. */
export function setApproach(v: Villain, id: string): void {
  v.approach = { id, traits: [], abilities: [] }
  for (const u of v.upgrades) if (u.extra) u.extra = u.extra.filter((p) => p.source !== 'approach')
}

/** Whether choosing another archetype would clear anything. */
export function archetypeHasChoices(villain: Villain): boolean {
  return Boolean(villain.archetype?.abilities.length || villain.upgrades.some((u) => u.extra?.some((p) => p.source === 'archetype')))
}

/** Sets the archetype, clearing the old one's abilities (and abilities taken from its list for an upgrade). */
export function setArchetype(v: Villain, id: string): void {
  v.archetype = { id, abilities: [] }
  for (const u of v.upgrades) if (u.extra) u.extra = u.extra.filter((p) => p.source !== 'archetype')
}
