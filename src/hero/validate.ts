/**
 * Structural checks for a hero read from storage or an imported file, which are
 * untrusted. This checks shape only (types and required fields), not game rules:
 * rule problems are warnings, but a malformed document can't be opened at all.
 */
import { DETAIL_FIELDS } from './model'
import { type Check, arrayOf, boolean, either, integer, nonEmptyString, nullable, object, oneOf, recordOf, string } from '../shape'

const die = oneOf('d4', 'd6', 'd8', 'd10', 'd12')

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
const action = oneOf('attack', 'defend', 'boost', 'hinder', 'overcome', 'recover')
const oneAction: Check = (v, path) => (Array.isArray(v) && v.length === 1 ? action(v[0], `${path}[0]`) : `${path} should name one action`)
const customPrinciple = object({
  category: oneOf('esoteric', 'expertise', 'ideals', 'identity', 'responsibility'),
  name: string,
  roleplaying: string,
  minorTwist: string,
  majorTwist: string,
  greenAbility: object({
    name: string,
    text: string,
    // Each effect from the editor names exactly one action.
    'effects?': arrayOf(object({ actions: oneAction, use: oneOf('max', 'mid', 'min', 'max+mid', 'max+min', 'mid+min', 'max+mid+min') })),
  }),
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
  'play?': object({
    'health?': integer,
    'sceneZone?': oneOf('yellow', 'red'),
    'form?': nonEmptyString,
    'dividedForm?': oneOf('heroic'),
    heroPoints: integer,
    reactionUsed: boolean,
    mods: arrayOf(object({ id: nonEmptyString, label: string, value: integer, 'persistent?': oneOf(true), 'exclusive?': oneOf(true) })),
    twists: arrayOf(object({ id: nonEmptyString, kind: oneOf('minor', 'major'), text: string })),
    history: arrayOf(object({ id: nonEmptyString, at: nonEmptyString, text: string, 'details?': arrayOf(string) })),
  }),
})

/** Returns a description of the first structural problem, or undefined if the hero is well formed. */
export function heroProblem(value: unknown): string | undefined {
  return heroShape(value, 'hero')
}
