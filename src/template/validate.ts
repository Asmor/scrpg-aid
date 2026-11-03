/**
 * Structural checks for templates read from storage or an imported file, which are untrusted.
 * Shape only, like ../hero/validate.ts.
 */
import { die } from '../hero/validate'
import { groupActions } from '../game/validate'
import { arrayOf, integer, nonEmptyString, object, oneOf, string, type Check } from '../shape'
import { MAX_GROUP_SIZE, MAX_STEPS } from './model'

const base = { id: nonEmptyString, createdAt: string, updatedAt: string, tags: arrayOf(string), name: string }
const size: Check = (v, path) => integer(v, path) ?? ((v as number) < 1 || (v as number) > MAX_GROUP_SIZE ? `${path} should be 1–${MAX_GROUP_SIZE}` : undefined)
const minion = { ...base, die, groupSize: size, actions: groupActions, notes: string }

const minionShape = object(minion)
const lieutenantShape = object({ ...minion, abilities: arrayOf(object({ name: string, type: oneOf('A', 'R', 'I'), text: string })) })
const steps: Check = (v, path) => arrayOf(object({ label: string }))(v, path) ?? ((v as unknown[]).length > MAX_STEPS ? `${path} has more than ${MAX_STEPS} steps` : undefined)
const challengeShape = object({ ...base, description: string, steps, done: string })

export const minionTemplateProblem = (value: unknown) => minionShape(value, 'minion')
export const lieutenantTemplateProblem = (value: unknown) => lieutenantShape(value, 'lieutenant')
export const challengeTemplateProblem = (value: unknown) => challengeShape(value, 'challenge')
