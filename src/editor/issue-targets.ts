/**
 * Where each rule issue shows in its step (the hero wizard spec, Step anatomy, item 6). Every
 * issue belongs to a section of the step (choose, assign, abilities, bonus, principle, parts),
 * which steps mark with data-section; an issue that also names a field (`field` on the
 * warning: one assign row, one ability) shows under that field when it's on screen. The step's
 * summary box links to each one.
 */
import type { IssueCode, RuleWarning } from '../creation/warnings'

export type IssueSection = 'choose' | 'assign' | 'abilities' | 'bonus' | 'principle' | 'parts'

/** Every kind of issue's section. Typed against the full list, so a new kind of issue can't be left out. */
export const ISSUE_SECTION: Readonly<Record<IssueCode, IssueSection>> = {
  // Choosing the entry itself (and steps that are one choice: Retcon, Health, advancement).
  'not-rolled': 'choose',
  'unknown-entry': 'choose',
  'retcon-ability-missing': 'choose',
  'retcon-form': 'choose',
  'retcon-form-missing': 'choose',
  'retcon-no-change': 'choose',
  'retcon-not-allowed': 'choose',
  'wrong-retcon-kind': 'choose',
  'swap-needs-two': 'choose',
  'health-out-of-range': 'choose',
  'health-roll-invalid': 'choose',
  'health-roll-missing': 'choose',
  'health-trait-missing': 'choose',
  'health-trait-not-allowed': 'choose',
  'health-trait-not-held': 'choose',
  'advancement-ability-source': 'choose',
  'advancement-ability-use': 'choose',
  'advancement-already-have': 'choose',
  'advancement-duplicate-principle': 'choose',
  'advancement-kind': 'choose',
  'advancement-no-change': 'choose',
  'advancement-not-held': 'choose',
  'advancement-roleplaying': 'choose',
  // Villains: choosing the approach, archetype, upgrades and mastery, and the hero count.
  'approach-missing': 'choose',
  'archetype-missing': 'choose',
  'upgrade-twice': 'choose',
  'vehicle-die': 'choose',
  'not-a-vehicle': 'choose',
  'mastery-missing': 'choose',
  'mastery-minor': 'choose',
  'hero-count': 'choose',
  'overflow-count': 'choose',
  // Putting dice on powers and qualities.
  'dice-mismatch': 'assign',
  'assigned-twice': 'assign',
  'not-on-list': 'assign',
  'not-an-upgrade': 'assign',
  'unknown-trait': 'assign',
  'already-max': 'assign',
  'already-have': 'assign',
  'nothing-to-upgrade': 'assign',
  'power-count': 'assign',
  'filler-count': 'assign',
  'filler-die': 'assign',
  'complex-traits': 'assign',
  'missing-required': 'assign',
  'wrong-kind': 'assign',
  'name-roleplaying-quality': 'assign',
  'roleplaying-assigned': 'assign',
  // Abilities.
  'ability-count': 'abilities',
  'ability-twice': 'abilities',
  'blank-empty': 'abilities',
  'blank-invalid': 'abilities',
  'fixed-unfilled': 'abilities',
  'not-different': 'abilities',
  'out-from-missing': 'abilities',
  'red-category-missing': 'abilities',
  'red-category-needed': 'abilities',
  'requirement-unmet': 'abilities',
  'same-as-green': 'abilities',
  'skipped-abilities': 'abilities',
  'slot-empty': 'abilities',
  'slot-extra': 'abilities',
  'slot-not-held': 'abilities',
  'slot-wrong-trait': 'abilities',
  'too-few-powers': 'abilities',
  'unknown-ability': 'abilities',
  'uses-at-least': 'abilities',
  'uses-not-from-list': 'abilities',
  'use-pattern': 'abilities',
  'misplaced-ability': 'abilities',
  // Bonuses.
  'bonus-count': 'bonus',
  'bonus-die': 'bonus',
  'bonus-kind': 'bonus',
  'bonus-needs-existing': 'bonus',
  'bonus-not-new': 'bonus',
  'bonus-not-on-list': 'bonus',
  'bonus-not-taken': 'bonus',
  'bonus-shift': 'bonus',
  'bonus-wrong-die': 'bonus',
  'unexpected-bonus': 'bonus',
  // Principles.
  'principle-blank': 'principle',
  'principle-category': 'principle',
  'principle-custom-incomplete': 'principle',
  'principle-missing': 'principle',
  'secondary-principle': 'principle',
  // A special archetype's parts.
  'form-ability-missing': 'parts',
  'form-ability-source': 'parts',
  'form-count': 'parts',
  'form-dice': 'parts',
  'form-not-power': 'parts',
  'form-upgrades': 'parts',
  'minion-form-twice': 'parts',
  'minion-forms-count': 'parts',
  'minion-forms-quality': 'parts',
  'mode-ability-missing': 'parts',
  'mode-ability-source': 'parts',
  'mode-count': 'parts',
  'mode-dice': 'parts',
  'mode-not-held': 'parts',
  'mode-row-empty': 'parts',
  'mode-row-misfit': 'parts',
  'mode-twice': 'parts',
  'powerless-dice': 'parts',
  'same-personality': 'parts',
  'secondary-excluded': 'parts',
  'secondary-missing': 'parts',
  'split-always': 'parts',
  'split-form-only': 'parts',
  'split-missing': 'parts',
  'split-roleplaying': 'parts',
  'split-twice': 'parts',
  'split-unplaced': 'parts',
  'transition-ability-missing': 'parts',
  'transition-ability-source': 'parts',
  'transition-missing': 'parts',
  'unexpected-divided': 'parts',
  'unexpected-forms': 'parts',
  'unexpected-modular': 'parts',
  'unexpected-secondary': 'parts',
  'unexpected-split': 'parts',
  'unknown-minion-form': 'parts',
}

export function issueSection(code: IssueCode): IssueSection {
  return ISSUE_SECTION[code]
}

/** An issue's identity on the page, so a summary link can find where it's shown. */
export function issueKey(w: Pick<RuleWarning, 'code' | 'message' | 'part' | 'field'>): string {
  return [w.part ?? '', w.code, w.field ?? '', w.message].join('|')
}

/** A field or section on the page that shows issues: what it is (`key`) and who it is (`owner`). */
export interface Claim {
  key: string
  owner: string
}

export const fieldKey = (field: string) => `field:${field}`
export const sectionKey = (section: IssueSection) => `section:${section}`

/**
 * Who shows each issue, given what's claimed (in page order): the first field that names it,
 * else the first section of its kind, else the top of the scope ("").
 */
export function placeIssues<W extends IssueRef>(issues: readonly W[], claims: readonly Claim[]): Map<string, W[]> {
  const owner = (key: string) => claims.find((c) => c.key === key)?.owner
  const placed = new Map<string, W[]>()
  for (const w of issues) {
    const at = (w.field ? owner(fieldKey(w.field)) : undefined) ?? owner(sectionKey(issueSection(w.code))) ?? ''
    placed.set(at, [...(placed.get(at) ?? []), w])
  }
  return placed
}

/** What an issue's link needs: its section, and (when it has one) the issue itself, to find its field. */
export type IssueRef = Pick<RuleWarning, 'code' | 'message' | 'part' | 'field'>

const CONTROLS = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'

/**
 * Takes the player to an issue inside `step` (a step, or one part of it): the field it's shown
 * under when there is one, otherwise the first control of its section (or the section
 * itself), falling back to the first section, then to `step` itself. Scrolls it into view.
 */
export function focusIssue(step: HTMLElement, issue: IssueRef): void {
  const shown = step.querySelector<HTMLElement>(`[data-issue="${CSS.escape(issueKey(issue))}"]`)
  const list = shown?.closest<HTMLElement>('.inline-issues[id]')
  const field = list ? step.querySelector<HTMLElement>(`[aria-describedby~="${CSS.escape(list.id)}"]`) : null
  // A group (an ability card) isn't focusable itself: its first control is.
  const fieldControl = field?.matches(CONTROLS) ? field : field?.querySelector<HTMLElement>(CONTROLS)
  if (fieldControl) {
    fieldControl.scrollIntoView?.({ block: 'center' })
    fieldControl.focus()
    return
  }
  const target = step.querySelector<HTMLElement>(`[data-section="${issueSection(issue.code)}"]`) ?? step.querySelector<HTMLElement>('[data-section]') ?? step
  const control = target.querySelector<HTMLElement>(CONTROLS)
  const focusable = control ?? target
  if (!control) target.tabIndex = -1
  focusable.scrollIntoView?.({ block: 'center' })
  focusable.focus()
}
