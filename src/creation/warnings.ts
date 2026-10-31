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

/**
 * Every kind of rule issue the checks produce. The wizard needs each one placed at a field or a
 * part of a step (../editor/issue-targets.ts), so a new kind of issue goes here first.
 */
export const ISSUE_CODES = [
  'ability-count',
  'ability-twice',
  'advancement-ability-source',
  'advancement-ability-use',
  'advancement-already-have',
  'advancement-duplicate-principle',
  'advancement-kind',
  'advancement-no-change',
  'advancement-not-held',
  'advancement-roleplaying',
  'already-have',
  'already-max',
  'assigned-twice',
  'back-issues',
  'blank-empty',
  'blank-invalid',
  'bonus-count',
  'bonus-die',
  'bonus-kind',
  'bonus-needs-existing',
  'bonus-not-new',
  'bonus-not-on-list',
  'bonus-not-taken',
  'bonus-shift',
  'bonus-wrong-die',
  'collection-name',
  'complex-traits',
  'dice-mismatch',
  'filler-count',
  'filler-die',
  'fixed-unfilled',
  'health-out-of-range',
  'health-roll-invalid',
  'health-roll-missing',
  'health-trait-missing',
  'health-trait-not-allowed',
  'health-trait-not-held',
  'form-ability-missing',
  'form-ability-source',
  'form-count',
  'form-dice',
  'form-not-power',
  'form-upgrades',
  'minion-form-twice',
  'minion-forms-count',
  'minion-forms-quality',
  'missing-required',
  'mode-ability-missing',
  'mode-ability-source',
  'mode-count',
  'mode-dice',
  'mode-not-held',
  'mode-row-empty',
  'mode-row-misfit',
  'mode-twice',
  'name-roleplaying-quality',
  'not-an-upgrade',
  'not-different',
  'not-on-list',
  'not-rolled',
  'nothing-to-upgrade',
  'out-from-missing',
  'power-count',
  'powerless-dice',
  'principle-blank',
  'principle-category',
  'principle-custom-incomplete',
  'principle-missing',
  'red-category-missing',
  'red-category-needed',
  'requirement-unmet',
  'retcon-ability-missing',
  'retcon-form',
  'retcon-form-missing',
  'retcon-no-change',
  'retcon-not-allowed',
  'same-as-green',
  'same-personality',
  'secondary-excluded',
  'secondary-missing',
  'secondary-principle',
  'skipped-abilities',
  'slot-empty',
  'slot-extra',
  'slot-not-held',
  'slot-wrong-trait',
  'split-always',
  'split-form-only',
  'split-missing',
  'split-roleplaying',
  'split-twice',
  'split-unplaced',
  'swap-needs-two',
  'too-few-powers',
  'transition-ability-missing',
  'transition-ability-source',
  'transition-missing',
  'unexpected-bonus',
  'unexpected-divided',
  'unexpected-forms',
  'unexpected-modular',
  'unexpected-secondary',
  'unexpected-split',
  'unknown-ability',
  'unknown-entry',
  'unknown-minion-form',
  'unknown-trait',
  'uses-at-least',
  'uses-not-from-list',
  'wrong-kind',
  'wrong-retcon-kind',
] as const

export type IssueCode = (typeof ISSUE_CODES)[number]

export interface RuleWarning {
  step: StepId
  /** A stable identifier for the kind of problem, for tests and UI grouping. */
  code: IssueCode
  message: string
  /**
   * For a complex archetype's step (Divided, Form-Changer, Modular, Minion-Maker), the part
   * of it the problem is in, e.g. "transition", "form:green:1", "mode:yellow:0". See
   * ../hero/archetype-parts.ts for the parts.
   */
  part?: string
  /**
   * The one field the problem is about, when it's about one: "trait:power:speed" for an assign
   * row, "ability:Inflict" for an ability, "roleplaying-quality". The wizard shows the issue
   * under that field (../editor/inline-issues.tsx).
   */
  field?: string
}

export function warning(step: StepId, code: IssueCode, message: string, field?: string): RuleWarning {
  return field ? { step, code, message, field } : { step, code, message }
}

/** Marks the warnings from index `from` on as being about one part of a step. Changes `warnings` in place. */
export function markPart(warnings: RuleWarning[], from: number, part: string): void {
  for (let i = from; i < warnings.length; i++) warnings[i] = { ...warnings[i]!, part }
}
