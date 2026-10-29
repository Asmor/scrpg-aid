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
  | 'advancement'

export interface RuleWarning {
  step: StepId
  /** A stable identifier for the kind of problem, for tests and UI grouping. */
  code: string
  message: string
  /**
   * For a complex archetype's step (Divided, Form-Changer, Modular, Minion-Maker), the part
   * of it the problem is in, e.g. "transition", "form:green:1", "mode:yellow:0". See
   * ../hero/archetype-parts.ts for the parts.
   */
  part?: string
}

export function warning(step: StepId, code: string, message: string): RuleWarning {
  return { step, code, message }
}

/** Marks the warnings from index `from` on as being about one part of a step. Changes `warnings` in place. */
export function markPart(warnings: RuleWarning[], from: number, part: string): void {
  for (let i = from; i < warnings.length; i++) warnings[i] = { ...warnings[i]!, part }
}
