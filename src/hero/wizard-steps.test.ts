import { describe, expect, it } from 'vitest'
import { continueStep, NUMBERED_STEPS, progressText, WIZARD_STEPS, wizardStepIndex } from './wizard-steps'

describe('wizard steps', () => {
  it('has Start, then eight numbered steps', () => {
    expect(WIZARD_STEPS[0].id).toBe('start')
    expect(NUMBERED_STEPS).toBe(8)
    expect(wizardStepIndex('archetype')).toBe(3)
    expect(wizardStepIndex('advancement')).toBe(-1)
    expect(wizardStepIndex(undefined)).toBe(-1)
  })

  it('continues a draft at its furthest step, kept within the wizard', () => {
    expect(continueStep(undefined)).toBe('start')
    expect(continueStep(3)).toBe('archetype')
    expect(continueStep(99)).toBe('details')
    expect(continueStep(-2)).toBe('start')
  })

  it("says how far a draft got", () => {
    expect(progressText(undefined)).toBe('At Start')
    expect(progressText(5)).toBe('Step 5 of 8')
  })
})
