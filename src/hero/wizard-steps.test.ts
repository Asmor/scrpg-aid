import { describe, expect, it } from 'vitest'
import type { RuleWarning } from '../creation/warnings'
import { createHero } from './model'
import { continueStep, NUMBERED_STEPS, progressText, stepIssues, stepStates, WIZARD_STEPS, wizardStepIndex } from './wizard-steps'

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

describe('step states', () => {
  const warning = (step: RuleWarning['step']): RuleWarning => ({ step, code: 'dice-mismatch', message: 'x' })

  it('marks steps not started, done, or with issues, whatever else is filled in', () => {
    const hero = createHero('guided')
    hero.background = { id: 'upper-class', qualities: [] }
    hero.powerSource = { id: 'accident', powers: [], abilities: [], bonus: [] }
    const states = stepStates(hero, [warning('background'), warning('background'), warning('principles')])
    const mark = (id: string) => states.find((s) => s.id === id)!
    expect(mark('start').mark).toBe('done')
    expect(mark('background')).toMatchObject({ mark: 'issues', index: 1 })
    expect(mark('background').issues).toHaveLength(2)
    expect(mark('power-source').mark).toBe('done')
    expect(mark('archetype').mark).toBe('todo')
    // Health shows the principle checks too, even before a Health choice.
    expect(mark('health')).toMatchObject({ mark: 'issues', issues: [warning('principles')] })
    expect(mark('details').mark).toBe('todo')
    hero.details.alias = 'Nova'
    expect(stepStates(hero, []).find((s) => s.id === 'details')!.mark).toBe('done')
  })

  it('lists a step’s issues', () => {
    expect(stepIssues('health', [warning('health'), warning('retcon'), warning('principles')])).toHaveLength(2)
    expect(stepIssues('start', [warning('background')])).toEqual([])
  })
})
