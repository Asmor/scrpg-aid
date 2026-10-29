/**
 * Structural checks for a villain read from storage or an imported file, which are untrusted.
 * Shape only, like ../hero/validate.ts: rule problems are warnings (./sheet.ts).
 */
import { arrayOf, boolean, integer, nonEmptyString, nullable, object, oneOf, recordOf, string } from '../shape'
import { assignment, blanks, die, traitRef } from '../hero/validate'
import { VILLAIN_DETAIL_FIELDS } from './model'

// Sources accept any text, so villains saved by a newer app with new sources still open.
const pick = object({ source: nonEmptyString, name: nonEmptyString, 'uses?': arrayOf(traitRef), 'blanks?': blanks, 'customName?': string })
const heroCount = (v: unknown, path: string) => integer(v, path) ?? ((v as number) < 1 ? `${path} should be at least 1` : undefined)

const villainShape = object({
  id: nonEmptyString,
  createdAt: string,
  updatedAt: string,
  details: object(Object.fromEntries(VILLAIN_DETAIL_FIELDS.map((f) => [f, string]))),
  traitNames: recordOf(string),
  approach: nullable(object({ id: nonEmptyString, traits: arrayOf(assignment), abilities: arrayOf(pick) })),
  archetype: nullable(object({ id: nonEmptyString, abilities: arrayOf(pick) })),
  upgrades: arrayOf(object({ id: nonEmptyString, abilities: arrayOf(pick), 'vehicle?': object({ 'die?': die, abilities: arrayOf(pick) }) })),
  mastery: nullable(pick),
  heroCount,
  'notes?': string,
  'play?': object({
    'health?': integer,
    'heroCount?': heroCount,
    reactionUsed: boolean,
    'sceneAdvanced?': oneOf(true),
    mods: arrayOf(object({ id: nonEmptyString, label: string, value: integer, 'persistent?': oneOf(true), 'exclusive?': oneOf(true) })),
    // Villains take minor twists only (the page adds no others), but the shared twist shape is read as is.
    twists: arrayOf(object({ id: nonEmptyString, kind: oneOf('minor', 'major'), text: string })),
    history: arrayOf(object({ id: nonEmptyString, at: nonEmptyString, text: string, 'details?': arrayOf(string), 'roll?': oneOf(true) })),
    'statusCount?': integer,
    'weaknessTier?': integer,
    'challengeParts?': integer,
  }),
})

/** Returns a description of the first structural problem, or undefined if the villain is well formed. */
export function villainProblem(value: unknown): string | undefined {
  return villainShape(value, 'villain')
}
