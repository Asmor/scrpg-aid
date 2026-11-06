import { describe, expect, it } from 'vitest'
import { adaptiveBruiser, bullyOverlord } from '../test/villains'
import { createVillain } from './model'
import { buildVillainSheet } from './sheet'
import { continueVillainStep, villainDraftText, villainStepNumber, villainStepStates } from './wizard-steps'

const states = (v: ReturnType<typeof createVillain>) => villainStepStates(v, buildVillainSheet(v).warnings)
const marks = (v: ReturnType<typeof createVillain>) => Object.fromEntries(states(v).map((s) => [s.id, s.skipped ? `${s.mark} (skipped)` : s.mark]))

describe('the villain wizard’s steps', () => {
  it('number from 1, and 0 for an unknown step', () => {
    expect(villainStepNumber('archetype')).toBe(3)
    expect(villainStepNumber('nope')).toBe(0)
  })

  it('mark a new draft not started, though its steps have issues, with Mastery not needed', () => {
    const v = { ...createVillain(), status: 'draft' as const }
    expect(marks(v)).toEqual({ concept: 'todo', approach: 'todo', archetype: 'todo', upgrades: 'todo', mastery: 'todo (skipped)', health: 'todo', details: 'todo' })
    expect(states(v)[1]!.issues.map((w) => w.code)).toEqual(['approach-missing'])
  })

  it('show a step’s issues on its mark once the GM has gone past it', () => {
    const v = { ...createVillain(), status: 'draft' as const, furthestStep: 3 }
    expect(marks(v)).toMatchObject({ approach: 'issues', archetype: 'todo' })
  })

  it('mark a finished minor villain done, with Mastery still not needed', () => {
    const v = adaptiveBruiser()
    v.details.appearance = 'Riveted plates'
    expect(marks(v)).toEqual({ concept: 'done', approach: 'done', archetype: 'done', upgrades: 'done', mastery: 'todo (skipped)', health: 'done', details: 'done' })
  })

  it('count a draft past Upgrades as having visited it', () => {
    const v = { ...adaptiveBruiser(), status: 'draft' as const, furthestStep: 3 }
    expect(marks(v).upgrades).toBe('todo')
    expect(marks({ ...v, furthestStep: 5 }).upgrades).toBe('done')
  })

  it('need a mastery once the villain is major', () => {
    const v = bullyOverlord()
    expect(marks(v).mastery).toBe('done')
    v.mastery = null
    const mastery = states(v).find((s) => s.id === 'mastery')!
    expect(mastery).toMatchObject({ mark: 'issues', skipped: false })
    expect(mastery.issues).toEqual([{ step: 'mastery', code: 'mastery-missing', message: 'Choose a mastery (a major villain has one).', field: 'mastery' }])
  })

  it('continue a draft at its furthest step', () => {
    expect(continueVillainStep(undefined)).toBe('concept')
    expect(continueVillainStep(0)).toBe('concept')
    expect(continueVillainStep(4)).toBe('upgrades')
    expect(continueVillainStep(12)).toBe('details')
    expect(villainDraftText(6)).toBe('Step 6 of 7 · Health')
  })
})
