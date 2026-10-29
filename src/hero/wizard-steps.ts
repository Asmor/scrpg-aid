/**
 * The hero wizard's steps, in order: Start, then the eight numbered steps (the hero wizard
 * spec, "Wizard shell"). A step's index is its number, so Start is 0 and Details is 8.
 */

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

/** "Step 3 of 8" for a draft's furthest step; Start reads as "At Start". */
export function progressText(furthest: number | undefined): string {
  const index = wizardStepIndex(continueStep(furthest))
  return index === 0 ? 'At Start' : `Step ${index} of ${NUMBERED_STEPS}`
}
