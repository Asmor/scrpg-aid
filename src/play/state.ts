/**
 * The game aid's state for a hero (Phase 3): current Health and zone, the scene zone, the
 * reaction, mods, twists, and a timestamped history. Every change returns the
 * new state with a history entry describing it ("Lost 4 HP (17 → 13). Entered Yellow
 * status."). Pure: the caller supplies the time and new ids.
 */
import type { HeroSheet } from '../creation/sheet'
import type { PlayHistoryEntry, PlayMod, PlayState, PlayTwist } from '../hero/model'
import type { Die, Zone } from '../rules/types'
import { addDefense, blockText, blockWith, clearDefenses, defensesOf, pickDefense, removeDefense } from './defense'

/** A hero's zone, including Out (p. 14). */
export type PlayZone = Zone | 'out'

const ORDER: readonly PlayZone[] = ['green', 'yellow', 'red', 'out']
const ZONE_NAME: Record<PlayZone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red', out: 'Out' }

/** Hero points earned per issue at most (p. 31). */
export const MAX_HERO_POINTS = 5

export function emptyPlay(): PlayState {
  return { reactionUsed: false, mods: [], twists: [], history: [] }
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
  const added: PlayMod = { id: given.id ?? clock.newId(), label: mod.label.trim(), value: mod.value, ...(mod.persistent ? { persistent: true } : {}), ...(mod.exclusive ? { exclusive: true } : {}), ...(mod.source ? { source: mod.source } : {}) }
  return withEntry({ ...play, mods: [...play.mods, added] }, entry(clock, `Gained ${describeMod(added)}${given.from ? ` from ${given.from}` : ''}.`))
}

/** "+2, −1": mods' sizes, for a line in the log. */
export const modSizes = (mods: readonly Pick<PlayMod, 'value'>[]) => mods.map((m) => (m.value > 0 ? `+${m.value}` : `−${-m.value}`)).join(', ')

/** Drops every bonus and penalty on the hero and their minions, noted in the history (the end of an issue, ruling 69). */
export function clearHeroMods(play: PlayState, text: string, clock: Clock): PlayState {
  if (!play.mods.length && !play.minions?.some((m) => m.mods.length)) return play
  return withEntry({ ...play, mods: [], ...(play.minions ? { minions: play.minions.map((m) => ({ ...m, mods: [] })) } : {}) }, entry(clock, text))
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

/** Notes in a solo hero's history a change to the solo game's hero points. */
export function noteHeroPoints(play: PlayState, before: number, after: number, clock: Clock): PlayState {
  return withEntry(play, entry(clock, `${after > before ? 'Gained' : 'Spent'} a hero point (now ${after}).`))
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
 * Start over (standalone Play, scrpg-aid-designs/game-table/spec.md section 12): fresh play state, so
 * Health at max with no mods, twists, minions, form or mode, and an empty history.
 */
export function startOver(): PlayState {
  return emptyPlay()
}

/**
 * Heroes recover for a new issue (scrpg-aid-designs/issues/spec.md, section 5): full Health, no mods,
 * twists, minions or defenses, the base form or default mode, and the reaction ready. What hero
 * points bought is the issue's own business.
 */
export function heroRecovers(play: PlayState, clock: Clock): PlayState {
  const { heroPointBuys, history } = play
  return { ...emptyPlay(), ...(heroPointBuys ? { heroPointBuys } : {}), history: [...history, entry(clock, 'Recovered for the new issue: Health restored; mods, twists and minions cleared.')] }
}

/** "3 hero points". */
export const heroPointCount = (n: number) => `${n} hero ${n === 1 ? 'point' : 'points'}`

/** What a hero has left to spend: the game's count less what they've bought. */
export function heroPointsLeft(count: number, play: Pick<PlayState, 'heroPointBuys'>): number {
  return Math.max(0, count - (play.heroPointBuys ?? []).reduce((n, b) => n + b.size, 0))
}

/** Buys a bonus for the next issue: it costs its size. Unchanged if there aren't the points. */
export function buyHeroPointBonus(play: PlayState, count: number, size: number, issue: number, clock: Clock): PlayState {
  if (!Number.isInteger(size) || size < 1 || size > heroPointsLeft(count, play)) return play
  return withEntry({ ...play, heroPointBuys: [...(play.heroPointBuys ?? []), { id: clock.newId(), size }] }, entry(clock, `Bought a +${size} bonus for issue ${issue}.`))
}

/** Takes back a bought bonus. */
export function returnHeroPointBonus(play: PlayState, buyId: string, issue: number, clock: Clock): PlayState {
  const buy = play.heroPointBuys?.find((b) => b.id === buyId)
  if (!buy) return play
  return withEntry({ ...play, heroPointBuys: play.heroPointBuys!.filter((b) => b !== buy) }, entry(clock, `Returned a +${buy.size} bonus for issue ${issue}.`))
}

/** Turns what was bought into exclusive, used-up-when-used bonuses, and any points left (`lost`) go. */
export function spendHeroPoints(play: PlayState, lost: number, clock: Clock): PlayState {
  const { heroPointBuys = [], ...rest } = play
  let next: PlayState = rest
  for (const buy of heroPointBuys) next = addMod(next, { label: 'Hero point', value: buy.size, exclusive: true, source: 'heroPoint' }, clock)
  return lost > 0 ? withEntry(next, entry(clock, `Lost ${lost === 1 ? 'an unspent hero point' : `${lost} unspent hero points`}.`)) : next
}

// ---- Defenses in solo play (ruling 65; the table's are in ../game/hits.ts) ----

/** A Defend's result on the hero: a defense of `value` from `from` (none for 0), noted in the history. */
export function gainDefense(play: PlayState, value: number, from: string, clock: Clock): PlayState {
  const after = addDefense(play, value, from, clock)
  return after === play ? play : withEntry(after, entry(clock, `Gained a defense: Defend ${value}.`))
}

/**
 * The hero takes a hit of `amount`: one defense blocks what it can (the one chosen, or the
 * default) and is used up, and the rest comes off Health. "Took 8 damage (Defend 5 blocked 5, 3 taken)."
 */
export function takeDamage(play: PlayState, sheet: Pick<HeroSheet, 'healthRanges' | 'maxHealth'>, amount: number, clock: Clock, defenseId?: string): PlayState {
  if (!Number.isInteger(amount) || amount <= 0) return play
  const defense = pickDefense(defensesOf(play), amount, defenseId)
  const { taken } = blockWith(amount, defense)
  const after = withEntry(defense ? removeDefense(play, defense.id) : play, entry(clock, `Took ${amount} damage${blockText(amount, defense)}.`))
  const now = currentHealth(sheet, after)
  return now === undefined || taken === 0 ? after : setHealth(after, sheet, now - taken, clock)
}

/** Drops one defense by hand, noted in the history. */
export function dropDefense(play: PlayState, id: string, clock: Clock): PlayState {
  const d = defensesOf(play).find((x) => x.id === id)
  return d ? withEntry(removeDefense(play, id), entry(clock, `Removed a defense: Defend ${d.value}.`)) : play
}

/** Drops every defense (the hero's next turn starts: solo play has no turns, so the player says when). */
export function clearHeroDefenses(play: PlayState, clock: Clock): PlayState {
  return play.defenses?.length ? withEntry(clearDefenses(play), entry(clock, 'Defenses cleared.')) : play
}
