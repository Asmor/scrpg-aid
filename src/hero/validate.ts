/**
 * Structural checks for a hero read from storage or an imported file, which are
 * untrusted. This checks shape only (types and required fields), not game rules:
 * rule problems are warnings, but a malformed document can't be opened at all.
 */
import { DETAIL_FIELDS } from './model'

type Check = (value: unknown, path: string) => string | undefined

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const string: Check = (v, path) => (typeof v === 'string' ? undefined : `${path} should be text`)
const nonEmptyString: Check = (v, path) => (typeof v === 'string' && v !== '' ? undefined : `${path} is missing`)
const boolean: Check = (v, path) => (typeof v === 'boolean' ? undefined : `${path} should be true or false`)
const integer: Check = (v, path) => (Number.isInteger(v) ? undefined : `${path} should be a whole number`)
const oneOf =
  (...values: readonly unknown[]): Check =>
  (v, path) =>
    values.includes(v) ? undefined : `${path} has an unknown value`
const die = oneOf('d4', 'd6', 'd8', 'd10', 'd12')

const arrayOf =
  (item: Check): Check =>
  (v, path) => {
    if (!Array.isArray(v)) return `${path} should be a list`
    for (const [i, x] of v.entries()) {
      const problem = item(x, `${path}[${i}]`)
      if (problem) return problem
    }
    return undefined
  }

const recordOf =
  (item: Check): Check =>
  (v, path) => {
    if (!isRecord(v)) return `${path} should be an object`
    for (const [k, x] of Object.entries(v)) {
      const problem = item(x, `${path}.${k}`)
      if (problem) return problem
    }
    return undefined
  }

/** An object with these fields; keys ending in "?" are optional. Unknown fields are allowed. */
const object =
  (fields: Record<string, Check>): Check =>
  (v, path) => {
    if (!isRecord(v)) return `${path} should be an object`
    for (const [rawKey, check] of Object.entries(fields)) {
      const optional = rawKey.endsWith('?')
      const key = optional ? rawKey.slice(0, -1) : rawKey
      if (optional && v[key] === undefined) continue
      const problem = check(v[key], `${path}.${key}`)
      if (problem) return problem
    }
    return undefined
  }

const nullable =
  (check: Check): Check =>
  (v, path) =>
    v === null ? undefined : check(v, path)

const either =
  (...checks: Check[]): Check =>
  (v, path) =>
    checks.some((c) => c(v, path) === undefined) ? undefined : `${path} is malformed`

const traitRef = object({ kind: oneOf('power', 'quality'), id: nonEmptyString })
const rollRecord = object({ dice: arrayOf(die), results: arrayOf(integer), manual: boolean, 'rerolled?': boolean })
const assignment = object({ trait: traitRef, die, 'upgrades?': oneOf(true) })
const blanks = recordOf(either(string, arrayOf(string)))
// Ability sources accept any text, not just today's AbilitySource values, so heroes
// saved by a newer app with new sources still open; unknown sources show as warnings.
const abilityId = object({ source: nonEmptyString, name: nonEmptyString })
const abilityPick = object({
  source: nonEmptyString,
  name: nonEmptyString,
  'uses?': arrayOf(traitRef),
  'blanks?': blanks,
  'customName?': string,
  'category?': string,
})
const customPrinciple = object({
  category: oneOf('esoteric', 'expertise', 'ideals', 'identity', 'responsibility'),
  name: string,
  roleplaying: string,
  minorTwist: string,
  majorTwist: string,
  greenAbility: object({ name: string, text: string }),
})
const principle = object({ id: nonEmptyString, 'customization?': string, 'custom?': customPrinciple })

const advancementByKind: Record<string, Check> = {
  swapPower: object({ from: traitRef, to: traitRef }),
  swapQuality: object({ from: traitRef, to: traitRef }),
  swapPrinciple: object({ replace: oneOf('background', 'archetype'), with: principle }),
  swapAbility: object({ from: abilityId, to: abilityPick }),
}

const retconByKind: Record<string, Check> = {
  swapDice: object({
    traits: (v, path) => arrayOf(traitRef)(v, path) ?? ((v as unknown[]).length === 2 ? undefined : `${path} should name exactly two traits`),
  }),
  changeAbilityTrait: object({ ability: abilityId, uses: arrayOf(traitRef) }),
  gainPowerOrQuality: object({ gained: assignment }),
  upgradeStatusDie: object({ 'form?': oneOf('civilian', 'heroic') }),
  changePrinciple: object({ replace: oneOf('background', 'archetype'), with: principle }),
  gainRedAbility: object({ ability: abilityPick }),
}

const retcon: Check = (v, path) => {
  const base = object({ id: nonEmptyString, kind: oneOf(...Object.keys(retconByKind)) })(v, path)
  if (base) return base
  return retconByKind[(v as { kind: string }).kind]!(v, path)
}

const advancementChange: Check = (v, path) => {
  const base = object({ kind: oneOf(...Object.keys(advancementByKind)) })(v, path)
  if (base) return base
  return advancementByKind[(v as { kind: string }).kind]!(v, path)
}

const personalityChoice = object({ id: nonEmptyString, 'roll?': rollRecord, 'outUses?': arrayOf(traitRef), 'outBlanks?': blanks, bonus: arrayOf(assignment) })

const dividedChoice = object({
  'transitionMethod?': nonEmptyString,
  'transitionAbility?': abilityPick,
  'heroicPersonality?': personalityChoice,
  'outFrom?': oneOf('civilian', 'heroic'),
  'split?': object({ always: arrayOf(traitRef), civilian: arrayOf(traitRef), heroic: arrayOf(traitRef) }),
})

const modularChoice = object({
  modes: arrayOf(object({ id: nonEmptyString, 'name?': string, powers: arrayOf(assignment), 'ability?': abilityPick })),
  'powerless?': arrayOf(assignment),
})

/** An archetype choice; Divided and Modular nest a second one in `secondary`. */
const archetypeChoice: Check = (v, path) =>
  object({
    id: nonEmptyString,
    'roll?': rollRecord,
    traits: arrayOf(assignment),
    abilities: arrayOf(abilityPick),
    bonus: arrayOf(assignment),
    'principle?': principle,
    'forms?': arrayOf(
      object({ zone: oneOf('green', 'yellow'), 'name?': string, powers: arrayOf(assignment), 'upgrades?': arrayOf(traitRef), 'ability?': abilityPick }),
    ),
    'minionForms?': object({ 'quality?': traitRef, forms: arrayOf(nonEmptyString) }),
    'secondary?': archetypeChoice,
    'divided?': dividedChoice,
    'modular?': modularChoice,
  })(v, path)

const heroShape = object({
  id: nonEmptyString,
  createdAt: nonEmptyString,
  updatedAt: nonEmptyString,
  method: oneOf('guided', 'constructed'),
  details: object(Object.fromEntries(DETAIL_FIELDS.map((f) => [f, string]))),
  traitNames: recordOf(string),
  background: nullable(object({ id: nonEmptyString, 'roll?': rollRecord, qualities: arrayOf(assignment), 'principle?': principle })),
  powerSource: nullable(
    object({ id: nonEmptyString, 'roll?': rollRecord, powers: arrayOf(assignment), abilities: arrayOf(abilityPick), bonus: arrayOf(assignment) }),
  ),
  archetype: nullable(archetypeChoice),
  personality: nullable(personalityChoice),
  redAbilities: arrayOf(abilityPick),
  retcon: nullable(retcon),
  health: nullable(
    object({ 'trait?': traitRef, mode: oneOf('roll', 'fixed'), 'rollResult?': integer, 'manual?': boolean }),
  ),
  'pendingRolls?': object({ 'background?': rollRecord, 'powerSource?': rollRecord, 'archetype?': rollRecord, 'personality?': rollRecord, 'secondaryArchetype?': rollRecord }),
  'advancement?': object({
    backIssues: integer,
    collections: arrayOf(object({ name: string, 'notes?': string })),
    changes: arrayOf(advancementChange),
  }),
  'currentHealth?': integer,
  'notes?': string,
})

/** Returns a description of the first structural problem, or undefined if the hero is well formed. */
export function heroProblem(value: unknown): string | undefined {
  return heroShape(value, 'hero')
}
