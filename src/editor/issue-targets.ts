/**
 * Which part of a step a rule issue is about, so the issue's link can take the player there.
 * Each step marks its sections with data-section (choose, assign, abilities, bonus,
 * principle, parts); an issue goes to the first section of its kind on the step, or to the
 * step's own choice when there's no closer match.
 */
export type IssueSection = 'choose' | 'assign' | 'abilities' | 'bonus' | 'principle' | 'parts'

const BY_PREFIX: readonly [string, IssueSection][] = [
  ['principle-', 'principle'],
  ['secondary-principle', 'principle'],
  ['bonus-', 'bonus'],
  ['transition-', 'parts'],
  ['split-', 'parts'],
  ['form-', 'parts'],
  ['mode-', 'parts'],
  ['minion-', 'parts'],
  ['powerless-', 'parts'],
  ['unexpected-forms', 'parts'],
  ['slot-', 'abilities'],
  ['blank-', 'abilities'],
  ['uses-', 'abilities'],
  ['ability-', 'abilities'],
  ['red-category-', 'abilities'],
]

const EXACT: Readonly<Record<string, IssueSection>> = {
  'dice-mismatch': 'assign',
  'assigned-twice': 'assign',
  'not-on-list': 'assign',
  'not-an-upgrade': 'assign',
  'unknown-trait': 'assign',
  'requirement-unmet': 'assign',
  'too-few-powers': 'assign',
  'already-max': 'assign',
  'nothing-to-upgrade': 'assign',
  'not-different': 'assign',
  'power-count': 'assign',
  'filler-count': 'assign',
  'filler-die': 'assign',
  'complex-traits': 'assign',
  'missing-required': 'assign',
  'already-have': 'assign',
  'swap-needs-two': 'assign',
  'wrong-kind': 'assign',
  'unknown-ability': 'abilities',
  'fixed-unfilled': 'abilities',
  'skipped-abilities': 'abilities',
  'same-as-green': 'abilities',
}

export function issueSection(code: string): IssueSection {
  return EXACT[code] ?? BY_PREFIX.find(([prefix]) => code.startsWith(prefix))?.[1] ?? 'choose'
}

/**
 * Takes the player to an issue's section inside `step` (a step, or one part of it): scrolls
 * it into view and focuses its first control (or the section itself). Falls back to the
 * first section, then to `step` itself.
 */
export function focusIssue(step: HTMLElement, code: string): void {
  const target = step.querySelector<HTMLElement>(`[data-section="${issueSection(code)}"]`) ?? step.querySelector<HTMLElement>('[data-section]') ?? step
  const control = target.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
  const focusable = control ?? target
  if (!control) target.tabIndex = -1
  focusable.scrollIntoView?.({ block: 'center' })
  focusable.focus()
}
