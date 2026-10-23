/**
 * Rule problems found in a hero. The app never blocks on these (the user's
 * "warn only" decision); it shows them next to the step they belong to.
 */

export type StepId =
  | 'background'
  | 'powerSource'
  | 'archetype'
  | 'personality'
  | 'redAbilities'
  | 'retcon'
  | 'health'
  | 'principles'

export interface RuleWarning {
  step: StepId
  /** A stable identifier for the kind of problem, for tests and UI grouping. */
  code: string
  message: string
}

export function warning(step: StepId, code: string, message: string): RuleWarning {
  return { step, code, message }
}
