/**
 * Fitting play state to a new sheet (docs/design/game-table/spec.md, section 8, "Adjustments"):
 * when a character's copy in a game gets a newer sheet, its play state is kept except where it
 * no longer fits. Pure. Each function returns the new play state and a human-readable line for
 * every adjustment, shown before an update is approved, in the toast and in the log.
 *
 * The table's rows, in order:
 * - Health above the new max is lowered to it. A higher max never raises current Health, so a
 *   character at full Health stays at the old max (`oldSheet` gives it).
 * - A Form-Changer form or Modular mode that's gone switches to the base form or Green mode. A
 *   form that's still there, under a new key because others moved, is followed.
 * - The Divided form always exists, so it's kept; traits the form lost follow the new sheet.
 * - A player-made minion whose minion form is gone stays, with its die and mods, marked to pick
 *   a new form (`needsForm`). It can't act until it has one; removing it stays possible.
 * - Minion counts: the app sets no limit on how many minions a hero has, so there's nothing to
 *   lower; minions over a limit are kept.
 * - Used-up abilities and once-per-scene uses: hero play state records none per ability, so
 *   nothing is dropped. (A villain's scene advance isn't tied to an ability, so it stays too.)
 * - Mods, twists, the reaction and the history are never affected.
 *
 * Villains follow the same rules: Health above the new max is lowered, and a chosen weakness
 * tier the new status rule doesn't have is dropped (back to the rule's default).
 */
import { buildSheet } from '../creation/sheet'
import type { Hero, PlayState } from '../hero/model'
import { playForms } from '../play/forms'
import { currentHealth } from '../play/state'
import type { Villain, VillainPlayState } from '../villain/model'
import { villainHealth } from '../villain/play'
import { buildVillainSheet } from '../villain/sheet'

export interface Reconciled<P> {
  play: P
  /** One line per adjustment, e.g. "Health lowered to 24, the new max." */
  adjustments: string[]
}

/** Health lowered to a new max, or held at the old max when the max went up. */
function fitHealth<P extends { health?: number }>(play: P, oldMax: number | undefined, newMax: number | undefined, adjustments: string[]): P {
  const current = currentHealth({ maxHealth: oldMax }, play) ?? play.health
  if (current === undefined || newMax === undefined) return play
  if (current > newMax) {
    adjustments.push(`Health lowered to ${newMax}, the new max.`)
    return { ...play, health: newMax }
  }
  // At full Health (no value recorded), a higher max would raise it: record the old max instead.
  return play.health === undefined && current < newMax ? { ...play, health: current } : play
}

/** Fits a hero's play state to `newSheet` (`oldSheet` is the copy being replaced, for its forms and max Health). */
export function reconcile(play: PlayState, newSheet: Hero, oldSheet?: Hero): Reconciled<PlayState> {
  const adjustments: string[] = []
  const after = buildSheet(newSheet)
  const before = oldSheet ? buildSheet(oldSheet) : undefined
  let next = fitHealth(play, before ? before.maxHealth : undefined, after.maxHealth, adjustments)

  if (play.form !== undefined) {
    const forms = playForms(after)
    const name = before ? playForms(before).find((f) => f.key === play.form)?.name : forms.find((f) => f.key === play.form)?.name
    const same = name === undefined ? undefined : forms.find((f) => f.key !== undefined && f.name === name)
    const kept = same ?? (before ? undefined : forms.find((f) => f.key === play.form))
    if (!kept) {
      const { form: _, ...rest } = next
      next = rest
      const base = forms[0]?.name ?? (after.modes.length ? 'Default mode' : 'base form')
      adjustments.push(`${name ?? 'The form or mode in use'} is no longer on the sheet, so you're back in ${base === 'Base form' ? 'your base form' : base === 'Default mode' ? 'your Green (default) mode' : base}.`)
    } else if (kept.key !== play.form) {
      next = { ...next, form: kept.key! }
    }
  }

  const minionForms = new Set(after.minionForms.map((f) => f.name))
  if (next.minions?.some((m) => m.form && !m.needsForm && !minionForms.has(m.form))) {
    next = {
      ...next,
      minions: next.minions.map((m) => {
        if (!m.form || m.needsForm || minionForms.has(m.form)) return m
        adjustments.push(`${m.name} (${m.die}) needs a new form: ${m.form} is no longer on the sheet. Pick a new form before it acts.`)
        return { ...m, needsForm: true as const }
      }),
    }
  }
  return { play: next, adjustments }
}

/** Fits a villain's play state to `newSheet` (`oldSheet` is the copy being replaced). */
export function reconcileVillain(play: VillainPlayState, newSheet: Villain, oldSheet?: Villain): Reconciled<VillainPlayState> {
  const adjustments: string[] = []
  const oldMax = oldSheet ? villainHealth(oldSheet, play).maxHealth : undefined
  let next = fitHealth(play, oldMax, villainHealth(newSheet, play).maxHealth, adjustments)
  const rule = buildVillainSheet(newSheet).status
  if (next.weaknessTier !== undefined && (rule?.basis !== 'weakness' || next.weaknessTier >= rule.tiers.length)) {
    const { weaknessTier: _, ...rest } = next
    next = rest
    adjustments.push('The weakness chosen for its status die is no longer on the sheet, so it uses the default.')
  }
  return { play: next, adjustments }
}

/** The one line on Health for an update's dialog: "Health stays at 18", unless an adjustment changes it. */
export function healthLine(before: { health?: number }, maxBefore: number | undefined, adjustments: readonly string[]): string | undefined {
  if (adjustments.some((a) => a.startsWith('Health '))) return undefined
  const health = currentHealth({ maxHealth: maxBefore }, before) ?? before.health
  return health === undefined ? undefined : `Health stays at ${health}.`
}
