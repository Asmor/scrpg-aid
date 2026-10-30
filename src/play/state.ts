/**
 * The game aid's state for a hero (Phase 3): current Health and zone, the scene zone, hero
 * points, the reaction, mods, twists, and a timestamped history. Every change returns the
 * new state with a history entry describing it ("Lost 4 HP (17 → 13). Entered Yellow
 * status."). Pure: the caller supplies the time and new ids.
 */
import type { HeroSheet } from '../creation/sheet'
import type { PlayHistoryEntry, PlayMod, PlayState, PlayTwist } from '../hero/model'
import type { Die, Zone } from '../rules/types'

/** A hero's zone, including Out (p. 14). */
export type PlayZone = Zone | 'out'

const ORDER: readonly PlayZone[] = ['green', 'yellow', 'red', 'out']
const ZONE_NAME: Record<PlayZone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red', out: 'Out' }

/** Hero points earned per issue at most (p. 31). */
export const MAX_HERO_POINTS = 5

export function emptyPlay(): PlayState {
  return { heroPoints: 0, reactionUsed: false, mods: [], twists: [], history: [] }
}

/** Current Health: the recorded value, or the max until one is recorded. */
export function currentHealth(sheet: Pick<HeroSheet, 'maxHealth'>, play: Pick<PlayState, 'health'> | undefined): number | undefined {
  const max = sheet.maxHealth
  const health = play?.health
  // A stored value above a max that has since dropped (the hero was edited) shows as the max.
  return health === undefined ? max : max === undefined ? health : Math.min(health, max)
}

/** The zone a Health value falls in on the hero's ranges; 0 or less is Out. */
export function healthZone(sheet: Pick<HeroSheet, 'healthRanges'>, health: number): PlayZone | undefined {
  const ranges = sheet.healthRanges
  if (!ranges) return undefined
  if (health <= 0) return 'out'
  if (health >= ranges.green[1]) return 'green'
  if (health >= ranges.yellow[1]) return 'yellow'
  return 'red'
}

/** The hero's zone: whichever of their Health's zone and the scene's is further along (p. 14). */
export function effectiveZone(sheet: Pick<HeroSheet, 'healthRanges' | 'maxHealth'>, play: PlayState | undefined): PlayZone | undefined {
  const health = currentHealth(sheet, play)
  const own = health === undefined ? undefined : healthZone(sheet, health)
  const scene = play?.sceneZone
  if (!own) return scene
  return scene && ORDER.indexOf(scene) > ORDER.indexOf(own) ? scene : own
}

/** The status die for a zone (none when Out). */
export function statusDieFor(sheet: Pick<HeroSheet, 'statusDice'>, zone: PlayZone | undefined): Die | undefined {
  return zone && zone !== 'out' ? sheet.statusDice?.[zone] : undefined
}

/**
 * Whether an ability from a zone can be used in the hero's zone (p. 14): Green always,
 * Yellow in Yellow or Red, Red only in Red; when Out, only the Out ability.
 */
export function abilityAvailable(from: Zone | 'out', zone: PlayZone | undefined): boolean {
  const current = zone ?? 'green'
  if (from === 'out' || current === 'out') return from === current
  return ORDER.indexOf(current) >= ORDER.indexOf(from)
}

/** What each change needs: the time, and a source of new ids. */
export interface Clock {
  now: Date
  newId: () => string
}

const entry = (clock: Clock, text: string, details?: string[]): PlayHistoryEntry => ({
  id: clock.newId(),
  at: clock.now.toISOString(),
  text,
  ...(details?.length ? { details } : {}),
})

const withEntry = <P extends { history: PlayHistoryEntry[] }>(play: P, e: PlayHistoryEntry): P => ({ ...play, history: [...play.history, e] })

/** The play state a hero and a villain (Phase 5) share: Health, the reaction, mods, twists, and history. */
export type PlayCore = Pick<PlayState, 'health' | 'reactionUsed' | 'mods' | 'twists' | 'history'>

/** Sets current Health (kept between 0 and the max), noting a change of zone. */
export function setHealth<P extends PlayCore>(play: P, sheet: Pick<HeroSheet, 'healthRanges' | 'maxHealth'>, value: number, clock: Clock): P {
  const max = sheet.maxHealth
  const before = currentHealth(sheet, play)
  const next = Math.max(0, max === undefined ? Math.round(value) : Math.min(max, Math.round(value)))
  if (before === undefined || next === before) return { ...play, health: next }
  const delta = next - before
  const parts = [`${delta < 0 ? 'Lost' : 'Gained'} ${Math.abs(delta)} HP (${before} → ${next}).`]
  const was = healthZone(sheet, before)
  const now = healthZone(sheet, next)
  if (now && now !== was) parts.push(now === 'out' ? 'Out!' : ORDER.indexOf(now) > ORDER.indexOf(was ?? 'green') ? `Entered ${ZONE_NAME[now]} status.` : `Back to ${ZONE_NAME[now]} status.`)
  return withEntry({ ...play, health: next }, entry(clock, parts.join(' ')))
}

/** The history entry for a scene change the GM made in a game session (./session). */
export const sceneByGmText = (zone: Zone) => `The GM set the scene to ${ZONE_NAME[zone]}.`

/** Sets the scene zone; `byGm` when the GM of a game session changed it. */
export function setSceneZone(play: PlayState, zone: Zone, clock: Clock, byGm = false): PlayState {
  const current = play.sceneZone ?? 'green'
  if (zone === current) return play
  const { sceneZone: _, ...rest } = play
  return withEntry(zone === 'green' ? rest : { ...rest, sceneZone: zone }, entry(clock, byGm ? sceneByGmText(zone) : `The scene is now ${ZONE_NAME[zone]}.`))
}

/** Changes to a Form-Changer form or Modular mode (`key` unset for the base one), named in the history. */
export function setForm(play: PlayState, key: string | undefined, name: string, clock: Clock): PlayState {
  if (key === play.form) return play
  const { form: _, ...rest } = play
  return withEntry(key ? { ...rest, form: key } : rest, entry(clock, `Changed to ${name}.`))
}

/** Switches a Divided hero between their civilian and heroic forms. */
export function setDividedForm(play: PlayState, form: 'civilian' | 'heroic', clock: Clock): PlayState {
  if (form === (play.dividedForm ?? 'civilian')) return play
  const { dividedForm: _, ...rest } = play
  return withEntry(form === 'heroic' ? { ...rest, dividedForm: 'heroic' } : rest, entry(clock, `Changed to ${form} form.`))
}

/** A mod's name, or "Bonus"/"Penalty" for one without (older saves allowed an empty name). */
export const modName = (m: Pick<PlayMod, 'label' | 'value'>) => m.label.trim() || (m.value > 0 ? 'Bonus' : 'Penalty')

/** "+2 high ground" or "-3 tied up", with its kind: "'-3 tied up' penalty (persistent)". */
export function describeMod(mod: Pick<PlayMod, 'label' | 'value' | 'persistent' | 'exclusive'>): string {
  const sign = mod.value > 0 ? `+${mod.value}` : `${mod.value}`
  const label = mod.label.trim()
  const flags = [mod.persistent && 'persistent', mod.exclusive && 'exclusive'].filter(Boolean)
  return `'${label ? `${sign} ${label}` : sign}' ${mod.value > 0 ? 'bonus' : 'penalty'}${flags.length ? ` (${flags.join(', ')})` : ''}`
}

/** Adds a bonus or penalty; `from` names who gave it, and `id` sets its id (both from a game session). */
export function addMod<P extends PlayCore>(play: P, mod: Omit<PlayMod, 'id'>, clock: Clock, given: { id?: string; from?: string } = {}): P {
  if (!Number.isInteger(mod.value) || mod.value === 0) return play
  const added: PlayMod = { id: given.id ?? clock.newId(), label: mod.label.trim(), value: mod.value, ...(mod.persistent ? { persistent: true } : {}), ...(mod.exclusive ? { exclusive: true } : {}) }
  return withEntry({ ...play, mods: [...play.mods, added] }, entry(clock, `Gained ${describeMod(added)}${given.from ? ` from ${given.from}` : ''}.`))
}

/** Notes in the history a bonus or penalty given to another hero in a game session. */
export function noteGivenMod<P extends PlayCore>(play: P, mod: Omit<PlayMod, 'id'>, to: string, clock: Clock): P {
  return withEntry(play, entry(clock, `Gave ${describeMod(mod)} to ${to}.`))
}

/** Removes a mod; `why` says how in the history ("Used up", default "Removed"). */
export function removeMod<P extends PlayCore>(play: P, id: string, clock: Clock, why = 'Removed'): P {
  const mod = play.mods.find((m) => m.id === id)
  if (!mod) return play
  return withEntry({ ...play, mods: play.mods.filter((m) => m.id !== id) }, entry(clock, `${why} ${describeMod(mod)}.`))
}

export function setHeroPoints(play: PlayState, value: number, clock: Clock): PlayState {
  const next = Math.max(0, Math.min(MAX_HERO_POINTS, Math.round(value)))
  if (next === play.heroPoints) return play
  const text = next > play.heroPoints ? `Gained ${next - play.heroPoints === 1 ? 'a hero point' : `${next - play.heroPoints} hero points`} (now ${next}).` : `Spent ${play.heroPoints - next === 1 ? 'a hero point' : `${play.heroPoints - next} hero points`} (now ${next}).`
  return withEntry({ ...play, heroPoints: next }, entry(clock, text))
}

export function setReactionUsed<P extends PlayCore>(play: P, used: boolean, clock: Clock): P {
  if (used === play.reactionUsed) return play
  return withEntry({ ...play, reactionUsed: used }, entry(clock, used ? 'Used this round’s reaction.' : 'Reaction ready again.'))
}

export function addTwist<P extends PlayCore>(play: P, twist: Omit<PlayTwist, 'id'>, clock: Clock): P {
  const text = twist.text.trim()
  if (!text) return play
  return withEntry({ ...play, twists: [...play.twists, { id: clock.newId(), kind: twist.kind, text }] }, entry(clock, `Took a ${twist.kind} twist: ${text}.`))
}

export function removeTwist<P extends PlayCore>(play: P, id: string, clock: Clock): P {
  const twist = play.twists.find((t) => t.id === id)
  if (!twist) return play
  return withEntry({ ...play, twists: play.twists.filter((t) => t.id !== id) }, entry(clock, `Cleared the ${twist.kind} twist: ${twist.text}.`))
}

/**
 * A fresh start for a new issue: full Health, no mods, twists, or hero points; the history
 * keeps a marker. The hero stays in the form or mode they're in.
 */
export function newIssue(play: PlayState, clock: Clock): PlayState {
  const { form, dividedForm } = play
  return { ...emptyPlay(), ...(form ? { form } : {}), ...(dividedForm ? { dividedForm } : {}), history: [...play.history, entry(clock, 'Started a new issue: Health restored; mods, twists, and hero points cleared.')] }
}
