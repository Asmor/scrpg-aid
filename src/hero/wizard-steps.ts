/**
 * The hero wizard's steps, in order: Start, then the eight numbered steps (the hero wizard
 * spec, "Wizard shell"). A step's index is its number, so Start is 0 and Details is 8.
 * Each step shows the rule issues of its warning steps, and has a state for the step rail.
 */
import type { RuleWarning, StepId } from '../creation/warnings'
import type { Hero } from './model'

export const WIZARD_STEPS = [
  { id: 'start', label: 'Start' },
  { id: 'background', label: 'Background' },
  { id: 'power-source', label: 'Power source' },
  { id: 'archetype', label: 'Archetype' },
  { id: 'personality', label: 'Personality' },
  { id: 'red-abilities', label: 'Red abilities' },
  { id: 'retcon', label: 'Retcon' },
  { id: 'health', label: 'Health' },
  { id: 'details', label: 'Details' },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

/** The rule issues each step shows. Health also shows the principle checks, as the last step with rules. */
export const STEP_WARNINGS: Record<WizardStepId, readonly StepId[]> = {
  start: [],
  background: ['background'],
  'power-source': ['powerSource'],
  archetype: ['archetype'],
  personality: ['personality'],
  'red-abilities': ['redAbilities'],
  retcon: ['retcon'],
  health: ['health', 'principles'],
  details: [],
}

/** Whether the player has made any choice in a step yet. Start always has one (the method). */
const STARTED: Record<WizardStepId, (hero: Hero) => boolean> = {
  start: () => true,
  background: (h) => h.background !== null,
  'power-source': (h) => h.powerSource !== null,
  archetype: (h) => h.archetype !== null,
  personality: (h) => h.personality !== null,
  'red-abilities': (h) => h.redAbilities.length > 0,
  retcon: (h) => h.retcon !== null,
  health: (h) => h.health !== null,
  details: (h) => Object.values(h.details).some((v) => v.trim() !== ''),
}

/** A step's mark in the rail: no choice yet, done (chosen and no issues), or issues. */
export type StepMark = 'todo' | 'done' | 'issues'

export interface StepState {
  id: WizardStepId
  label: string
  /** 0 for Start, then 1–8. */
  index: number
  issues: RuleWarning[]
  mark: StepMark
}

/** The rule issues a step shows. */
export function stepIssues(id: WizardStepId, warnings: readonly RuleWarning[]): RuleWarning[] {
  return warnings.filter((w) => STEP_WARNINGS[id].includes(w.step))
}

/** Every step's issues and mark. A step with issues shows them whatever else is filled in. */
export function stepStates(hero: Hero, warnings: readonly RuleWarning[]): StepState[] {
  return WIZARD_STEPS.map((step, index) => {
    const issues = stepIssues(step.id, warnings)
    const mark: StepMark = issues.length > 0 ? 'issues' : STARTED[step.id](hero) ? 'done' : 'todo'
    return { id: step.id, label: step.label, index, issues, mark }
  })
}

/** How many numbered steps there are (Start isn't one). */
export const NUMBERED_STEPS = WIZARD_STEPS.length - 1

/** A step's index, or -1 if there's no such step. */
export function wizardStepIndex(id: string | undefined): number {
  return WIZARD_STEPS.findIndex((s) => s.id === id)
}

/** The step to continue a draft at: the furthest one reached, kept within the wizard. */
export function continueStep(furthest: number | undefined): WizardStepId {
  const index = Math.min(Math.max(0, Math.trunc(furthest ?? 0)), NUMBERED_STEPS)
  return WIZARD_STEPS[index]!.id
}
