/**
 * The villain wizard's seven steps, in order (the villain wizard spec, section 3). A step's index
 * is its number, from 1. Each step shows its own rule issues and has a mark for the rail, as in
 * the hero wizard (../hero/wizard-steps.ts). Mastery is "not needed" while the villain is minor.
 */
import type { StepMark } from '../hero/wizard-steps'
import type { Villain } from './model'
import { isMajorVillain, type VillainStepId, type VillainWarning } from './sheet'

export const VILLAIN_STEPS = [
  { id: 'concept', label: 'Concept' },
  { id: 'approach', label: 'Approach' },
  { id: 'archetype', label: 'Archetype' },
  { id: 'upgrades', label: 'Upgrades' },
  { id: 'mastery', label: 'Mastery' },
  { id: 'health', label: 'Health' },
  { id: 'details', label: 'Finishing touches' },
] as const satisfies readonly { id: VillainStepId; label: string }[]

export const VILLAIN_STEP_COUNT = VILLAIN_STEPS.length

/** How far the GM has got: a draft's furthest step, or every step for a finished villain. */
const reached = (v: Villain) => (v.status === 'complete' ? VILLAIN_STEP_COUNT : (v.furthestStep ?? 1))

/** Whether the GM has made any choice in a step yet. Upgrades are optional, so going past them counts. */
const STARTED: Record<VillainStepId, (v: Villain) => boolean> = {
  concept: (v) => [v.details.name, v.details.alias, v.details.concept].some((t) => t.trim() !== ''),
  approach: (v) => v.approach !== null,
  archetype: (v) => v.archetype !== null,
  upgrades: (v) => v.upgrades.length > 0 || reached(v) > 4,
  mastery: (v) => v.mastery !== null,
  health: (v) => v.approach !== null && v.archetype !== null,
  details: (v) => (['appearance', 'costume', 'mannerisms', 'motivation', 'ties'] as const).some((f) => v.details[f].trim() !== ''),
}

export interface VillainStepState {
  id: VillainStepId
  label: string
  /** 1–7. */
  index: number
  issues: VillainWarning[]
  mark: StepMark
  /** Mastery while the villain is minor: greyed out, "Not needed". */
  skipped: boolean
}

/** Every step's issues and mark. A step with issues shows them whatever else is filled in. */
export function villainStepStates(villain: Villain, warnings: readonly VillainWarning[]): VillainStepState[] {
  const major = isMajorVillain(villain)
  return VILLAIN_STEPS.map((step, i) => {
    const issues = warnings.filter((w) => w.step === step.id)
    const mark: StepMark = issues.length > 0 ? 'issues' : STARTED[step.id](villain) ? 'done' : 'todo'
    return { id: step.id, label: step.label, index: i + 1, issues, mark, skipped: step.id === 'mastery' && !major && issues.length === 0 }
  })
}

/** A step's number (1–7), or 0 if there's no such step. */
export function villainStepNumber(id: string | undefined): number {
  return VILLAIN_STEPS.findIndex((s) => s.id === id) + 1
}

/** The step to continue a draft at: the furthest one reached, kept within the wizard. */
export function continueVillainStep(furthest: number | undefined): VillainStepId {
  const n = Math.min(Math.max(1, Math.trunc(furthest ?? 1) || 1), VILLAIN_STEP_COUNT)
  return VILLAIN_STEPS[n - 1]!.id
}

/** "Step 3 of 7 · Archetype", for a draft's library row. */
export function villainDraftText(furthest: number | undefined): string {
  const id = continueVillainStep(furthest)
  const n = villainStepNumber(id)
  return `Step ${n} of ${VILLAIN_STEP_COUNT} · ${VILLAIN_STEPS[n - 1]!.label}`
}
