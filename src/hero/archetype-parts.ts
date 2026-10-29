/**
 * The parts that Divided, Form-Changer, Modular and Minion-Maker add to the Archetype step
 * (the hero wizard spec, "Special archetypes"). Each part is a card in the step and an item
 * in the step rail, with its own issues and mark.
 *
 * Every Archetype issue belongs to exactly one part, so the parts' counts add up to the
 * step's: an issue marked with a part (see ../creation/warnings.ts) goes there, a principle
 * issue goes to Principle, and anything else goes to the first part, the base build.
 */
import { takesSplitForm } from '../creation/divided'
import { findMode } from '../creation/modular'
import type { RuleWarning } from '../creation/warnings'
import { archetypesById } from '../rules/data'
import type { Archetype, Zone } from '../rules/types'
import type { Hero } from './model'
import type { StepMark } from './wizard-steps'

export interface ArchetypePart {
  /** Used in the address: #/hero/<id>/edit/archetype/<part id>. */
  id: string
  label: string
  issues: RuleWarning[]
  mark: StepMark
}

interface PartSpec {
  id: string
  label: string
  started: boolean
}

const ZONE_NAME: Record<Zone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

/** "Green form", or "Green form 1" and "Green form 2" when there are several. */
const numbered = (name: string, count: number, i: number) => (count > 1 ? `${name} ${i + 1}` : name)

function partSpecs(hero: Hero, ar: Archetype): PartSpec[] {
  const choice = hero.archetype!
  const principle: PartSpec = { id: 'principle', label: 'Principle', started: Boolean(choice.principle) }
  const baseStarted = choice.traits.length > 0 || choice.abilities.length > 0 || choice.bonus.length > 0
  if (ar.transitionMethods) {
    return [
      { id: 'second', label: 'Second archetype', started: Boolean(choice.secondary) },
      { id: 'transition', label: 'Transition', started: Boolean(choice.divided?.transitionMethod) },
      { id: 'own', label: `${ar.name} ability`, started: choice.abilities.some((p) => p.source === 'archetype.green') },
      ...(takesSplitForm(choice) ? [{ id: 'split', label: 'Form split', started: Boolean(choice.divided?.split) }] : []),
      principle,
    ]
  }
  if (ar.modes) {
    const modes = choice.modular?.modes ?? []
    const inZone = (zone: Zone) => modes.filter((m) => findMode(hero, m.id)?.zone === zone)
    return [
      { id: 'base', label: 'Base archetype', started: Boolean(choice.secondary) },
      // Its fixed switching abilities come with it; only their blanks are chosen.
      { id: 'own', label: 'Switch abilities', started: true },
      ...(['green', 'yellow', 'red'] as const).flatMap((zone) =>
        Array.from({ length: ar.modes![zone].count }, (_, i) => ({ id: `mode:${zone}:${i}`, label: numbered(`${ZONE_NAME[zone]} mode`, ar.modes![zone].count, i), started: inZone(zone).length > i })),
      ),
      { id: 'powerless', label: 'Powerless mode (optional)', started: Boolean(choice.modular?.powerless) },
      principle,
    ]
  }
  if (ar.forms) {
    const forms = choice.forms ?? []
    const spec = ar.forms
    return [
      { id: 'base', label: 'Base build', started: baseStarted },
      ...Array.from({ length: spec.greenFormCount }, (_, i) => ({ id: `form:green:${i}`, label: numbered('Green form', spec.greenFormCount, i), started: forms.filter((f) => f.zone === 'green').length > i })),
      ...Array.from({ length: spec.yellowFormCount }, (_, i) => ({ id: `form:yellow:${i}`, label: numbered('Yellow form', spec.yellowFormCount, i), started: forms.filter((f) => f.zone === 'yellow').length > i })),
      principle,
    ]
  }
  if (ar.minionForms) {
    return [
      { id: 'base', label: 'Base build', started: baseStarted },
      { id: 'minion-forms', label: 'Minion forms', started: Boolean(choice.minionForms) },
      principle,
    ]
  }
  return []
}

const isPrinciple = (code: string) => code.startsWith('principle-') || code === 'secondary-principle'

/** The chosen archetype's parts, or none for an archetype that doesn't split the step. */
export function archetypeParts(hero: Hero, warnings: readonly RuleWarning[]): ArchetypePart[] {
  const ar = hero.archetype ? archetypesById.get(hero.archetype.id) : undefined
  if (!ar) return []
  const specs = partSpecs(hero, ar)
  if (!specs.length) return []
  const ids = new Set(specs.map((p) => p.id))
  const partOf = (w: RuleWarning) => (w.part && ids.has(w.part) ? w.part : isPrinciple(w.code) ? 'principle' : specs[0]!.id)
  const issues = warnings.filter((w) => w.step === 'archetype')
  return specs.map(({ id, label, started }) => {
    const mine = issues.filter((w) => partOf(w) === id)
    return { id, label, issues: mine, mark: mine.length > 0 ? 'issues' : started ? 'done' : 'todo' }
  })
}
